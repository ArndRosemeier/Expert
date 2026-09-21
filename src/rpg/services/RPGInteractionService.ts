/**
 * RPG Interaction Service
 * 
 * Orchestrates the dual-LLM workflow:
 * 1. Game LLM (Narrator) generates narrative response
 * 2. State Parser LLM extracts world state changes (async, in background)
 * 3. User can type while analysis runs, but submission waits for completion
 * 4. State updates are applied and snapshot is created
 */

import { RPGEntityType, RPGGameSession, RPGConversationMessage, RPGGoal, RPGStateUpdateXML, RPGLocation, RPGCharacter, RPGLore, RPGRelationship, RPGDistance, RPGManualSave, RPGSuspiciousEntityFlag } from '../types/RPGTypes';
import { WorldStateService } from './WorldStateService';
import { RPGContextBuilder } from './RPGContextBuilder';
import { RPGStateParser } from './RPGStateParser';
import { OpenRouterClient } from '../../OpenRouterClient';
import { getPromptText } from '../../PromptManager';
import { createRPGPromptExpansionService } from './RPGPlaceholderService';
import { SettingsManager } from '../../SettingsManager';
import { StorageService } from '../../StorageService';
import { RPGSnapshotSerialized, deserializeSnapshot } from '../types/RPGTypes';

export class RPGInteractionService {
    private worldStateService: WorldStateService;
    private contextBuilder: RPGContextBuilder;
    private stateParser: RPGStateParser;
    private openRouterClient: OpenRouterClient;
    
    // Analysis state tracking
    private analysisInProgress: boolean = false;
    private analysisPromise: Promise<void> | null = null;
    private lastPlayerAction: string = '';
    private lastGMResponse: string = '';
    private onAnalysisComplete?: () => void;

    private rollbackPoints: Map<string, ReturnType<WorldStateService['cloneWorldStateForUndo']>> = new Map();
    private autoConsolidateEnabled: boolean = true;
    
    constructor(
        worldStateService: WorldStateService,
        contextBuilder: RPGContextBuilder,
        stateParser: RPGStateParser
    ) {
        this.worldStateService = worldStateService;
        this.contextBuilder = contextBuilder;
        this.stateParser = stateParser;
        this.openRouterClient = OpenRouterClient.getInstance();
    }
    
    /**
     * Set callback for when analysis completes
     */
    setOnAnalysisComplete(callback: () => void): void {
        this.onAnalysisComplete = callback;
    }

    setAutoConsolidateEnabled(enabled: boolean): void {
        this.autoConsolidateEnabled = enabled;
        console.log(`🧽 Auto-consolidation ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Send a player action and get narrative response from Game LLM
     * This method returns immediately with the narrative response
     * State analysis runs in the background
     */
    async sendPlayerAction(
        session: RPGGameSession,
        settingsManager: SettingsManager,
        playerAction: string,
        debugMode: boolean = false,
        onStreamChunk?: (chunk: string) => void,
        onAnalysisComplete?: () => void
    ): Promise<string> {
        // Capture an in-memory rollback point so we can "Retry" without creating an extra persisted snapshot.
        const rollbackId = `rollback_${session.id}_${Date.now()}`;
        this.rollbackPoints.set(rollbackId, this.worldStateService.cloneWorldStateForUndo(session.worldState));

        // Fix corrupted state early: located_at must always be Character -> Location.
        // If a parser bug ever created Location -> Location located_at edges, later bookkeeping will crash.
        this.cleanupInvalidLocatedAtRelationships(session);

        // Lock state during LLM interaction
        this.worldStateService.lockState('Game LLM generating response');
        
        // Store the callback for this interaction (only if provided)
        if (onAnalysisComplete) {
            this.onAnalysisComplete = onAnalysisComplete;
        }
        
        // We want to be able to show a stable UI state (and offer Retry) even when the narrator request fails.
        // So we keep these diagnostics available for the error path as well.
        let narratorPromptCharCount = 0;
        let narratorWorldItemsSentCount = 0;
        let narratorWorldItemsTotalCount = 0;

        try {
            // Build context for Game LLM
            const gameContext = this.contextBuilder.buildGameNarrationContext(session);
            const used = this.collectNarratorUsedWorldItems(session);
            
            // Get prompt template (use custom if provided)
            const systemPromptTemplate = session.customSystemPrompt ?? getPromptText('rpg_game_narration_system');
            
            // Expand prompt with context
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPromptBase = expansionService.expandPrompt(systemPromptTemplate, gameContext);

            const playerControlOverride =
                `\n\n## Player Control (HARD RULE)\n` +
                `- The player-controlled character is the one defined in the "Player Character" section above.\n` +
                `- Its internal id is: ${session.worldState.playerCharacterId}\n` +
                `- The player acts and speaks ONLY via the user's messages.\n` +
                `- Do NOT write dialogue or decisions for the player-controlled character.\n` +
                `- All other characters are NPCs controlled by you (the GM).\n`;

            const systemPrompt = systemPromptBase + playerControlOverride;
            
            // Build messages array (last 2 messages + current action)
            const messages: Array<{role: string, content: string}> = [];
            
            // Add system prompt
            messages.push({role: 'system', content: systemPrompt});

            // One-shot re-anchoring note (e.g. after take-over). This is NOT part of the visible chat history.
            if (session.pendingNarratorSystemNote) {
                messages.push({ role: 'system', content: session.pendingNarratorSystemNote });
                delete session.pendingNarratorSystemNote;
                session.updatedAt = Date.now();
                await this.worldStateService.saveSession(session);
            }
            
            // Add last 2 messages from conversation history
            for (const msg of session.last2Messages) {
                messages.push({role: msg.role, content: msg.content});
            }
            
            // Add current player action
            messages.push({role: 'user', content: playerAction});

            // Diagnostics (for UI): how much we send to the narrator LLM this turn
            narratorPromptCharCount = messages.reduce((sum, m) => sum + m.content.length, 0);
            narratorWorldItemsSentCount = this.countWorldItemsSentToNarrator(session);
            narratorWorldItemsTotalCount = this.countWorldItemsTotal(session);
            
            console.log(`🎮 Sending player action to Game LLM (purpose: ${session.narratorPurpose})`);
            
            // Debug logging: show full message to Game LLM
            if (debugMode) {
                console.group('🐛 DEBUG: Full message to Game LLM');
                console.log('Messages array:', messages);
                console.log('System Prompt:', messages[0]?.content);
                console.log('Conversation History:', messages.slice(1, -1));
                console.log('Current Player Action:', messages[messages.length - 1]?.content);
                console.groupEnd();
            }
            
            // Call Game LLM (streaming)
            let fullResponse = '';
            
            await this.openRouterClient.streamingChat(
                session.narratorPurpose,
                messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
                {
                    onStart: () => {
                        console.log('🎮 Streaming started');
                    },
                    onChunk: (chunk: string) => {
                        fullResponse += chunk;
                        if (onStreamChunk) {
                            onStreamChunk(chunk);
                        }
                    },
                    onComplete: (response: string) => {
                        fullResponse = response;
                        console.log(`✅ Game LLM response received (${response.length} chars)`);
                    },
                    onError: (error: Error) => {
                        console.error('❌ Game LLM error:', error);
                        throw error;
                    }
                }
            );
            
            const response = fullResponse;
            
            // Store for state analysis
            this.lastPlayerAction = playerAction;
            this.lastGMResponse = response;
            
            // Update conversation history
            const userMessage: RPGConversationMessage = {
                role: 'user',
                content: playerAction,
                timestamp: Date.now()
            };
            
            const assistantMessage: RPGConversationMessage = {
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
                preTurnRollbackId: rollbackId,
                narratorPromptCharCount,
                narratorWorldItemsSentCount,
                narratorWorldItemsTotalCount
            };
            
            session.conversationHistory.push(userMessage);
            session.conversationHistory.push(assistantMessage);
            
            // Update last 2 messages
            const allMessages = [...session.conversationHistory];
            session.last2Messages = allMessages.slice(-2);
            
            // Unlock state before triggering analysis (LLM call is complete)
            this.worldStateService.unlockState();

            // Mark which world items were actually included in the narrator context for this turn.
            const turn = Math.floor(session.conversationHistory.length / 2);
            this.applyLastUsedTurn(session, turn, used);
            
            // Trigger async state analysis (non-blocking, state is now unlocked)
            this.triggerStateAnalysis(session, settingsManager);
            
            return response;
            
        } catch (error) {
            this.worldStateService.unlockState();
            console.error('Error in sendPlayerAction:', error);

            // Keep UI stable: record the attempted user action and a corresponding assistant error message,
            // carrying the rollbackId so "Retry" can resubmit the same action after restoring state.
            const errMsg = error instanceof Error ? error.message : String(error);
            const userMessage: RPGConversationMessage = {
                role: 'user',
                content: playerAction,
                timestamp: Date.now()
            };
            const assistantMessage: RPGConversationMessage = {
                role: 'assistant',
                content:
                    `⚠️ The Game Master response failed.\n\n` +
                    `Reason: ${errMsg}\n\n` +
                    `You can click "Retry" to resend the same action (after automatic rollback), or edit your action and send again.`,
                timestamp: Date.now(),
                preTurnRollbackId: rollbackId,
                narratorPromptCharCount,
                narratorWorldItemsSentCount,
                narratorWorldItemsTotalCount
            };
            session.conversationHistory.push(userMessage);
            session.conversationHistory.push(assistantMessage);
            session.last2Messages = session.conversationHistory.slice(-2);

            throw error;
        }
    }

    /**
     * Mark all world items that are currently included in the narrator context as "used"
     * for the current conversation turn. Useful after loading older sessions where we
     * cannot reconstruct historical usage.
     */
    markNarratorContextAsUsed(session: RPGGameSession): void {
        const turn = Math.floor(session.conversationHistory.length / 2);
        const used = this.collectNarratorUsedWorldItems(session);
        this.applyLastUsedTurn(session, turn, used);
    }

    async consolidateEntity(
        session: RPGGameSession,
        entityType: Exclude<RPGEntityType, 'relationship' | 'distance'>,
        entityId: string
    ): Promise<void> {
        const worldState = session.worldState;

        const entityXml = this.buildEntityXmlForConsolidation(session, entityType, entityId);

        const prompt = `You are an RPG entity state consolidator.\n\n` +
            `Your task: given a single entity (with canonical description and a possibly bloated/contradictory JSON state), output a CLEAN, CONSOLIDATED JSON state.\n\n` +
            `Rules:\n` +
            `- Do NOT rewrite or summarize the entity description. Only output consolidated JSON state.\n` +
            `- Remove stale / scene-specific facts that no longer make sense globally.\n` +
            `- If there are contradictions, choose the most recent, most plausible interpretation.\n` +
            `- Use a small, canonical set of keys. Prefer fewer keys.\n` +
            `- Output ONLY valid XML in the schema below.\n\n` +
            `Output schema:\n` +
            `<rpg_entity_consolidation>\n` +
            `  <entity_id>${entityId}</entity_id>\n` +
            `  <state>{...valid JSON...}</state>\n` +
            `</rpg_entity_consolidation>\n\n` +
            `Input entity:\n` +
            `${entityXml}`;

        const response = await this.openRouterClient.chat(session.parserPurpose, prompt);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response, 'text/xml');
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error(`Failed to parse consolidation XML: ${parseError.textContent}`);
        }

        const root = xmlDoc.querySelector('rpg_entity_consolidation');
        if (!root) {
            throw new Error('Consolidation response missing <rpg_entity_consolidation> root element.');
        }

        const idEl = root.querySelector('entity_id');
        const stateEl = root.querySelector('state');
        const idText = idEl?.textContent.trim();
        const stateText = stateEl?.textContent.trim();
        if (!idText) throw new Error('Consolidation response missing <entity_id>.');
        if (idText !== entityId) throw new Error(`Consolidation response entity_id mismatch: expected '${entityId}', got '${idText}'.`);
        if (!stateText) throw new Error('Consolidation response missing <state>.');

        const stateObj = JSON.parse(stateText) as Record<string, unknown>;

        const existingTurn = Math.floor(session.conversationHistory.length / 2);

        if (entityType === 'character') {
            const ch = this.worldStateService.getCharacter(worldState, entityId);
            if (!ch) throw new Error(`Character not found: ${entityId}`);
            this.worldStateService.updateCharacter(worldState, entityId, { state: stateObj, lastUsedTurn: Math.max(ch.lastUsedTurn, existingTurn) });
        } else if (entityType === 'location') {
            const loc = this.worldStateService.getLocation(worldState, entityId);
            if (!loc) throw new Error(`Location not found: ${entityId}`);
            this.worldStateService.updateLocation(worldState, entityId, { state: stateObj, lastUsedTurn: Math.max(loc.lastUsedTurn, existingTurn) });
        } else {
            const lore = this.worldStateService.getLore(worldState, entityId);
            if (!lore) throw new Error(`Lore not found: ${entityId}`);
            throw new Error('Consolidation for lore is not supported (lore has no state).');
        }

        // After a successful consolidation, clear the flag for this entity (it was addressed).
        session.suspiciousEntities = session.suspiciousEntities.filter(f => f.entityId !== entityId);

        session.updatedAt = Date.now();
        await this.worldStateService.saveSession(session);
    }

    private buildEntityXmlForConsolidation(
        session: RPGGameSession,
        entityType: Exclude<RPGEntityType, 'relationship' | 'distance'>,
        entityId: string
    ): string {
        const worldState = session.worldState;

        if (entityType === 'character') {
            const ch = this.worldStateService.getCharacter(worldState, entityId);
            if (!ch) throw new Error(`Character not found: ${entityId}`);
            return (
                `<entity kind="character">\n` +
                `  <id>${ch.id}</id>\n` +
                `  <name>${ch.name}</name>\n` +
                `  <description><![CDATA[${ch.description}]]></description>\n` +
                `  <state_json><![CDATA[${JSON.stringify(ch.state, null, 2)}]]></state_json>\n` +
                `</entity>`
            );
        }

        if (entityType === 'location') {
            const loc = this.worldStateService.getLocation(worldState, entityId);
            if (!loc) throw new Error(`Location not found: ${entityId}`);
            return (
                `<entity kind="location">\n` +
                `  <id>${loc.id}</id>\n` +
                `  <name>${loc.name}</name>\n` +
                `  <description><![CDATA[${loc.description}]]></description>\n` +
                `  <state_json><![CDATA[${JSON.stringify(loc.state, null, 2)}]]></state_json>\n` +
                `</entity>`
            );
        }

        const lore = this.worldStateService.getLore(worldState, entityId);
        if (!lore) throw new Error(`Lore not found: ${entityId}`);
        return (
            `<entity kind="lore">\n` +
            `  <id>${lore.id}</id>\n` +
            `  <title>${lore.title}</title>\n` +
            `  <content><![CDATA[${lore.content}]]></content>\n` +
            `  <tags>${lore.tags.join(',')}</tags>\n` +
            `</entity>`
        );
    }

    private resolveDiagnosticEntityType(
        worldState: RPGGameSession['worldState'],
        entityId: string
    ): RPGEntityType {
        if (worldState.locations.has(entityId)) return 'location';
        if (worldState.characters.has(entityId)) return 'character';
        if (worldState.lore.has(entityId)) return 'lore';
        if (worldState.relationships.has(entityId)) return 'relationship';
        if (worldState.distances.some(x => x.fromLocationId === entityId || x.toLocationId === entityId)) {
            return 'distance';
        }
        return 'lore';
    }

    private collectNarratorUsedWorldItems(session: RPGGameSession): {
        locationIds: string[];
        characterIds: string[];
        loreIds: string[];
        relationshipIds: string[];
        distances: Array<{ fromLocationId: string; toLocationId: string }>;
    } {
        const worldState = session.worldState;

        const currentLocationId = worldState.currentLocationId;
        const playerCharacterId = worldState.playerCharacterId;
        const characterIdsAtLocation = this.worldStateService.getEntitiesAtLocation(worldState, currentLocationId);

        const startingEntities = [
            currentLocationId,
            playerCharacterId,
            ...characterIdsAtLocation
        ];

        const relatedEntityIds = new Set<string>();
        for (const entityId of startingEntities) {
            const related = this.worldStateService.getRelatedEntities(worldState, entityId, 2);
            related.forEach(id => relatedEntityIds.add(id));
        }

        const loreIds: string[] = [];
        for (const entityId of relatedEntityIds) {
            const lore = this.worldStateService.getLore(worldState, entityId);
            if (lore) loreIds.push(lore.id);
        }

        const relationshipIdsSet = new Set<string>();
        const touchedEntityIds = new Set<string>([
            currentLocationId,
            playerCharacterId,
            ...characterIdsAtLocation,
            ...loreIds
        ]);
        for (const entityId of touchedEntityIds) {
            const rels = this.worldStateService.getRelationshipsForEntity(worldState, entityId);
            for (const rel of rels) {
                relationshipIdsSet.add(rel.id);
            }
        }

        const distances = this.worldStateService.getKnownDistances(worldState, currentLocationId).map(d => ({
            fromLocationId: d.fromLocationId,
            toLocationId: d.toLocationId
        }));

        return {
            locationIds: [currentLocationId],
            characterIds: [playerCharacterId, ...characterIdsAtLocation],
            loreIds,
            relationshipIds: [...relationshipIdsSet],
            distances
        };
    }

    private applyLastUsedTurn(
        session: RPGGameSession,
        turn: number,
        used: {
            locationIds: string[];
            characterIds: string[];
            loreIds: string[];
            relationshipIds: string[];
            distances: Array<{ fromLocationId: string; toLocationId: string }>;
        }
    ): void {
        const worldState = session.worldState;

        for (const id of used.locationIds) {
            const loc = this.worldStateService.getLocation(worldState, id);
            if (!loc) throw new Error(`Narrator used location '${id}' but it does not exist.`);
            this.worldStateService.updateLocation(worldState, id, { lastUsedTurn: turn });
        }

        for (const id of used.characterIds) {
            const ch = this.worldStateService.getCharacter(worldState, id);
            if (!ch) throw new Error(`Narrator used character '${id}' but it does not exist.`);
            this.worldStateService.updateCharacter(worldState, id, { lastUsedTurn: turn });
        }

        for (const id of used.loreIds) {
            const lore = this.worldStateService.getLore(worldState, id);
            if (!lore) throw new Error(`Narrator used lore '${id}' but it does not exist.`);
            this.worldStateService.updateLore(worldState, id, { lastUsedTurn: turn });
        }

        for (const id of used.relationshipIds) {
            const rel = this.worldStateService.getRelationship(worldState, id);
            if (!rel) throw new Error(`Narrator used relationship '${id}' but it does not exist.`);
            worldState.relationships.set(id, { ...rel, lastUsedTurn: turn });
        }

        for (const d of used.distances) {
            const idx = worldState.distances.findIndex(
                x => x.fromLocationId === d.fromLocationId && x.toLocationId === d.toLocationId
            );
            if (idx === -1) {
                throw new Error(`Narrator used distance '${d.fromLocationId}' -> '${d.toLocationId}' but it does not exist.`);
            }
            const existing = worldState.distances[idx];
            if (!existing) {
                throw new Error(`Distance entry missing at index ${idx} for '${d.fromLocationId}' -> '${d.toLocationId}'.`);
            }
            worldState.distances[idx] = { ...existing, lastUsedTurn: turn };
        }

    }

    private countWorldItemsSentToNarrator(session: RPGGameSession): number {
        const worldState = session.worldState;

        const currentLocationCount = worldState.currentLocationId ? 1 : 0;
        const playerCharacterCount = worldState.playerCharacterId ? 1 : 0;

        const presentCharacterIds = this.worldStateService.getEntitiesAtLocation(worldState, worldState.currentLocationId)
            .filter(id => id !== worldState.playerCharacterId);
        const presentCharactersCount = presentCharacterIds.length;

        // Lore: depth-2 traversal same as RPGContextBuilder
        const relatedEntityIds = new Set<string>();
        for (const entityId of [worldState.currentLocationId, worldState.playerCharacterId, ...presentCharacterIds]) {
            const related = this.worldStateService.getRelatedEntities(worldState, entityId, 2);
            related.forEach(id => relatedEntityIds.add(id));
        }
        let relevantLoreCount = 0;
        for (const id of relatedEntityIds) {
            if (this.worldStateService.getLore(worldState, id)) {
                relevantLoreCount += 1;
            }
        }

        const knownDistancesCount = this.worldStateService.getKnownDistances(worldState, worldState.currentLocationId).length;

        return currentLocationCount + playerCharacterCount + presentCharactersCount + relevantLoreCount + knownDistancesCount;
    }

    private countWorldItemsTotal(session: RPGGameSession): number {
        const worldState = session.worldState;
        return (
            worldState.locations.size +
            worldState.characters.size +
            worldState.lore.size +
            worldState.relationships.size +
            worldState.distances.length
        );
    }
    
    /**
     * Trigger state analysis in the background (non-blocking)
     */
    private triggerStateAnalysis(session: RPGGameSession, settingsManager: SettingsManager): void {
        this.analysisInProgress = true;
        
        this.analysisPromise = this.runStateAnalysis(session, settingsManager)
            .then(() => {
                this.analysisInProgress = false;
                this.analysisPromise = null;
                console.log('✅ State analysis complete');
                // Notify UI
                if (this.onAnalysisComplete) {
                    this.onAnalysisComplete();
                }
            })
            .catch(error => {
                this.analysisInProgress = false;
                this.analysisPromise = null;
                console.error('❌ State analysis failed:', error);
                // Notify UI even on error
                if (this.onAnalysisComplete) {
                    this.onAnalysisComplete();
                }
                // Don't rethrow - analysis failure shouldn't break the game
            });
    }
    
    /**
     * Run state analysis (State Parser LLM)
     */
    private async runStateAnalysis(session: RPGGameSession, settingsManager: SettingsManager): Promise<void> {
        try {
            console.log(`🔍 Starting state analysis (purpose: ${session.parserPurpose})`);
            
            // Build context for State Parser
            const parserContext = this.contextBuilder.buildStateParserContext(
                session,
                this.lastPlayerAction,
                this.lastGMResponse
            );
            
            // Get prompts
            const systemPromptTemplate = getPromptText('rpg_state_parser_system');
            const userPromptTemplate = getPromptText('rpg_state_parser_user');
            
            // Expand prompts
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPrompt = expansionService.expandPrompt(systemPromptTemplate, {});
            const userPrompt = expansionService.expandPrompt(userPromptTemplate, parserContext);
            
            // Call State Parser LLM
            // Format as a single message with system + user content
            const fullMessage = `${systemPrompt}\n\n---\n\n${userPrompt}`;
            
            const xmlResponse = await this.openRouterClient.chat(session.parserPurpose, fullMessage);
            
            console.log(`📄 State Parser response received (${xmlResponse.length} chars)`);
            
            // Parse XML
            const stateUpdate = this.stateParser.parseStateUpdate(xmlResponse);

            // Store diagnostics (suspicious entities) on the session for UI display
            const turn = Math.floor(session.conversationHistory.length / 2);
            session.suspiciousEntities = this.mapDiagnosticsToSessionFlags(session, stateUpdate.diagnostics, turn);
            
            // Apply state updates (state is already unlocked at this point)
            this.applyStateUpdates(session, stateUpdate);

            // Automatic consolidation pass (optional, default ON)
            if (this.autoConsolidateEnabled && session.suspiciousEntities.length > 0) {
                console.log(`🧽 Auto-consolidating ${session.suspiciousEntities.length} flagged entities...`);
                for (const flag of session.suspiciousEntities) {
                    // Keep it strict + simple: only consolidate locations/characters for now.
                    if (flag.entityType === 'location' || flag.entityType === 'character') {
                        await this.consolidateEntity(session, flag.entityType, flag.entityId);
                    }
                }
            }
            
            // Create snapshot
            const snapshot = await this.worldStateService.createSnapshot(session, turn);

            // Attach checkpoint to the assistant message for this turn
            const lastMessage = session.conversationHistory[session.conversationHistory.length - 1];
            if (lastMessage?.role !== 'assistant') {
                throw new Error('Expected last conversation message to be an assistant message when creating a checkpoint.');
            }
            lastMessage.checkpointSnapshotId = snapshot.id;

            // Rebuild snapshot list from checkpoints (plus prune old ones)
            await this.pruneCheckpoints(session, 10);
            
            // Save session
            await this.worldStateService.saveSession(session);
            
        } catch (error) {
            console.error('❌ State analysis error:', error);
            throw error;
        }
    }

    private mapDiagnosticsToSessionFlags(
        session: RPGGameSession,
        diagnostics: RPGStateUpdateXML['diagnostics'] | undefined,
        conversationTurn: number
    ): RPGSuspiciousEntityFlag[] {
        if (!diagnostics) return [];

        const worldState = session.worldState;

        const flags: RPGSuspiciousEntityFlag[] = [];
        for (const d of diagnostics) {
            const entityType = this.resolveDiagnosticEntityType(worldState, d.entityId);

            flags.push({
                entityId: d.entityId,
                entityType,
                reason: d.reason,
                conversationTurn,
                createdAt: Date.now()
            });
        }
        return flags;
    }

    private rebuildSnapshotsFromCheckpoints(session: RPGGameSession): void {
        const ids: string[] = [];
        for (const msg of session.conversationHistory) {
            if (msg.role === 'assistant' && msg.checkpointSnapshotId) {
                ids.push(msg.checkpointSnapshotId);
            }
        }
        // De-duplicate while preserving order
        const seen = new Set<string>();
        session.snapshots = ids.filter(id => (seen.has(id) ? false : (seen.add(id), true)));
    }

    /**
     * Keep at most maxCheckpoints checkpoints attached to assistant messages.
     * Always keeps the initial checkpoint (first assistant message's checkpoint).
     */
    private async pruneCheckpoints(session: RPGGameSession, maxCheckpoints: number): Promise<void> {
        this.rebuildSnapshotsFromCheckpoints(session);

        const assistantMessages = session.conversationHistory.filter(m => m.role === 'assistant');
        const checkpointMessages = assistantMessages.filter(m => Boolean(m.checkpointSnapshotId));

        if (checkpointMessages.length <= maxCheckpoints) {
            return;
        }

        const initialCheckpointId = checkpointMessages[0]?.checkpointSnapshotId;
        if (!initialCheckpointId) {
            throw new Error('Checkpoint pruning requires an initial checkpoint snapshot id.');
        }

        const nonInitial = checkpointMessages.slice(1);
        const keepCount = maxCheckpoints - 1;
        const toDelete = nonInitial.slice(0, Math.max(0, nonInitial.length - keepCount));

        for (const msg of toDelete) {
            const snapshotId = msg.checkpointSnapshotId;
            if (!snapshotId || snapshotId === initialCheckpointId) continue;

            await this.worldStateService.deleteSnapshot(snapshotId);
            delete msg.checkpointSnapshotId;
        }

        this.rebuildSnapshotsFromCheckpoints(session);
    }

    async restoreCheckpointIntoSession(session: RPGGameSession, snapshotId: string): Promise<void> {
        // Load snapshot (need conversationTurn as well)
        const storage = await StorageService.getInstance();
        const serialized = await storage.loadRPGSnapshot<RPGSnapshotSerialized>(snapshotId);
        if (!serialized) {
            throw new Error(`Snapshot not found: ${snapshotId}`);
        }

        const snapshot = deserializeSnapshot(serialized);

        session.worldState = snapshot.worldState;

        // conversationHistory shape is:
        // - 1 initial assistant message
        // - then for each turn: user+assistant (2 messages)
        const messagesToKeep = 1 + (snapshot.conversationTurn * 2);
        session.conversationHistory = session.conversationHistory.slice(0, messagesToKeep);
        session.last2Messages = session.conversationHistory.slice(-2);

        // Delete any checkpoint snapshots no longer referenced (keeps storage clean and enforces cap again)
        const referenced = new Set<string>();
        for (const msg of session.conversationHistory) {
            if (msg.role === 'assistant' && msg.checkpointSnapshotId) {
                referenced.add(msg.checkpointSnapshotId);
            }
        }
        for (const id of session.snapshots) {
            if (!referenced.has(id)) {
                await this.worldStateService.deleteSnapshot(id);
            }
        }

        this.rebuildSnapshotsFromCheckpoints(session);
        await this.pruneCheckpoints(session, 10);
        await this.worldStateService.saveSession(session);
    }

    async createManualSave(session: RPGGameSession): Promise<RPGManualSave> {
        const turn = Math.floor(session.conversationHistory.length / 2);
        const snapshot = await this.worldStateService.createSnapshot(session, turn);

        const worldState = session.worldState;
        const currentLocation = this.worldStateService.getLocation(worldState, worldState.currentLocationId);
        if (!currentLocation) {
            throw new Error(`Cannot save: current location not found (${worldState.currentLocationId}).`);
        }

        const save: RPGManualSave = {
            id: `save_${session.id}_${Date.now()}`,
            snapshotId: snapshot.id,
            conversationTurn: turn,
            locationId: currentLocation.id,
            locationName: currentLocation.name,
            createdAt: Date.now()
        };

        session.manualSaves.push(save);
        session.updatedAt = Date.now();
        await this.worldStateService.saveSession(session);

        return save;
    }

    async takeOverCharacter(session: RPGGameSession, newPlayerCharacterId: string): Promise<void> {
        const worldState = session.worldState;

        if (this.worldStateService.isLocked()) {
            throw new Error(`Cannot take over character while world state is locked: ${this.worldStateService.getLockReason()}`);
        }

        const newPlayer = this.worldStateService.getCharacter(worldState, newPlayerCharacterId);
        if (!newPlayer) {
            throw new Error(`Take over failed: character not found (${newPlayerCharacterId}).`);
        }

        const oldPlayerId = worldState.playerCharacterId;
        worldState.playerCharacterId = newPlayerCharacterId;

        const oldPlayerName = this.worldStateService.getCharacter(worldState, oldPlayerId)?.name ?? oldPlayerId;
        session.pendingNarratorSystemNote =
            `PLAYER CHARACTER SWITCH:\n` +
            `- The player used to control: ${oldPlayerName} (id=${oldPlayerId})\n` +
            `- The player now controls: ${newPlayer.name} (id=${newPlayerCharacterId})\n` +
            `- Treat the new player character as "you" in narration and follow the Player Control rules.\n`;

        // Move the "current location" to wherever the new player character is located (if known).
        const locatedAt = this.worldStateService
            .listRelationships(worldState)
            .find(r => r.kind === 'located_at' && r.fromId === newPlayerCharacterId);

        if (locatedAt && worldState.locations.has(locatedAt.toId)) {
            worldState.currentLocationId = locatedAt.toId;
        } else {
            // Ensure the new player character is at the current location.
            const currentLoc = worldState.currentLocationId;
            if (!worldState.locations.has(currentLoc)) {
                throw new Error(`Take over failed: currentLocationId '${currentLoc}' does not exist.`);
            }

            // Delete any existing located_at edges for this character and set it to current location.
            const existingLocatedAt = this.worldStateService
                .listRelationships(worldState)
                .filter(r => r.kind === 'located_at' && r.fromId === newPlayerCharacterId);
            for (const rel of existingLocatedAt) {
                this.worldStateService.deleteRelationship(worldState, rel.id);
            }

            this.worldStateService.createRelationship(worldState, {
                id: `rel_${newPlayerCharacterId}_${currentLoc}_located_at_${Date.now()}`,
                fromId: newPlayerCharacterId,
                toId: currentLoc,
                kind: 'located_at',
                createdTurn: Math.floor(session.conversationHistory.length / 2),
                lastUsedTurn: Math.floor(session.conversationHistory.length / 2),
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        session.updatedAt = Date.now();
        await this.worldStateService.saveSession(session);

        console.log(`🎭 Player character switched: '${oldPlayerId}' -> '${newPlayerCharacterId}'`);
    }

    async restoreManualSaveIntoSession(session: RPGGameSession, saveId: string): Promise<void> {
        const save = session.manualSaves.find(s => s.id === saveId);
        if (!save) {
            throw new Error(`Save not found: ${saveId}`);
        }

        // Reuse snapshot restore mechanics (restore world state + truncate conversation).
        const storage = await StorageService.getInstance();
        const serialized = await storage.loadRPGSnapshot<RPGSnapshotSerialized>(save.snapshotId);
        if (!serialized) {
            throw new Error(`Snapshot not found for save: ${save.snapshotId}`);
        }

        const snapshot = deserializeSnapshot(serialized);
        session.worldState = snapshot.worldState;

        const messagesToKeep = 1 + (snapshot.conversationTurn * 2);
        session.conversationHistory = session.conversationHistory.slice(0, messagesToKeep);
        session.last2Messages = session.conversationHistory.slice(-2);

        session.updatedAt = Date.now();
        await this.worldStateService.saveSession(session);
    }
    
    /**
     * Apply state updates extracted from State Parser
     */
    public applyStateUpdates(session: RPGGameSession, update: RPGStateUpdateXML): void {
        const worldState = session.worldState;
        
        console.log('🔄 Applying state updates...');

        const warnedCanonicalDescription = new Set<string>();
        const turn = Math.floor(session.conversationHistory.length / 2);

        const mergeJsonWithDeletions = (
            existing: Record<string, unknown>,
            incoming: Record<string, unknown>
        ): Record<string, unknown> => {
            const merged: Record<string, unknown> = { ...existing };
            for (const [key, value] of Object.entries(incoming)) {
                if (value === null) {
                    delete merged[key];
                } else {
                    merged[key] = value;
                }
            }
            return merged;
        };

        const normalizeGoals = (existingGoals: RPGGoal[], incomingGoals: RPGGoal[], turn: number): RPGGoal[] => {
            const existingById = new Map<string, RPGGoal>();
            for (const g of existingGoals) existingById.set(g.id, g);

            const normalized: RPGGoal[] = [];
            for (const g of incomingGoals) {
                if (typeof g.id !== 'string') throw new Error('Goal.id must be a string.');
                if (typeof g.text !== 'string') throw new Error('Goal.text must be a string.');

                const prev = existingById.get(g.id);
                let createdTurn = turn;
                if (prev) {
                    createdTurn = prev.createdTurn;
                } else if (typeof g.createdTurn === 'number' && g.createdTurn >= 0) {
                    createdTurn = g.createdTurn;
                }
                normalized.push({
                    id: g.id,
                    text: g.text,
                    status: g.status,
                    priority: g.priority,
                    createdTurn,
                    updatedTurn: turn
                });
            }

            // Cap goals to 3 by removing the oldest (simulates goal evolution).
            // Oldest = smallest createdTurn, tie-break by smallest updatedTurn.
            if (normalized.length <= 3) {
                return normalized;
            }

            const sortedOldestFirst = [...normalized].sort((a, b) => {
                if (a.createdTurn !== b.createdTurn) return a.createdTurn - b.createdTurn;
                return a.updatedTurn - b.updatedTurn;
            });
            const keep = sortedOldestFirst.slice(sortedOldestFirst.length - 3);
            return keep;
        };
        
        // Apply location updates
        if (update.locations) {
            for (const locationUpdate of update.locations) {
                if (locationUpdate.action === 'create') {
                    const descriptionParts: string[] = [];
                    if (locationUpdate.verbatimEvidence) {
                        descriptionParts.push('## First mention (verbatim from GM)');
                        descriptionParts.push(locationUpdate.verbatimEvidence);
                        descriptionParts.push('');
                    } else {
                        console.error(
                            `❌ Missing verbatim evidence for newly created location '${locationUpdate.id}'. ` +
                            `This can cause loss of important details.`
                        );
                    }
                    if (locationUpdate.description) {
                        descriptionParts.push('## Location description');
                        descriptionParts.push(locationUpdate.description);
                    }

                    const combinedDescription = descriptionParts.join('\n').trim();

                    const location: RPGLocation = {
                        id: locationUpdate.id,
                        name: locationUpdate.name ?? locationUpdate.id,
                        description: combinedDescription,
                        state: locationUpdate.state ?? {},
                        sceneState: locationUpdate.sceneState ?? {},
                        createdTurn: turn,
                        lastUsedTurn: turn,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createLocation(worldState, location);
                    console.log(`  ✅ Created location: ${location.name}`);
                } else {
                    const updates: Partial<RPGLocation> = {};
                    if (locationUpdate.name) updates.name = locationUpdate.name;
                    if (locationUpdate.description) {
                        const key = `location:${locationUpdate.id}`;
                        if (!warnedCanonicalDescription.has(key)) {
                            warnedCanonicalDescription.add(key);
                            console.warn(
                                `⚠️ Ignoring location.description update for '${locationUpdate.id}' (descriptions are canonical). ` +
                                `Parser should output <state> / lore instead.`
                            );
                        }
                    }
                    if (locationUpdate.state) {
                        const existing = this.worldStateService.getLocation(worldState, locationUpdate.id);
                        updates.state = mergeJsonWithDeletions(existing?.state ?? {}, locationUpdate.state);
                    }
                    if (locationUpdate.sceneState) {
                        const existing = this.worldStateService.getLocation(worldState, locationUpdate.id);
                        updates.sceneState = mergeJsonWithDeletions(existing?.sceneState ?? {}, locationUpdate.sceneState);
                    }
                    updates.createdTurn = turn;
                    
                    this.worldStateService.updateLocation(worldState, locationUpdate.id, updates);
                    console.log(`  ✅ Updated location: ${locationUpdate.id}`);
                }
            }
        }
        
        // Apply character updates
        if (update.characters) {
            for (const characterUpdate of update.characters) {
                if (characterUpdate.action === 'create') {
                    const descriptionParts: string[] = [];
                    if (characterUpdate.verbatimEvidence) {
                        descriptionParts.push('## First appearance (verbatim from GM)');
                        descriptionParts.push(characterUpdate.verbatimEvidence);
                        descriptionParts.push('');
                    } else {
                        console.error(
                            `❌ Missing verbatim evidence for newly created character '${characterUpdate.id}'. ` +
                            `This can cause loss of important details.`
                        );
                    }
                    if (characterUpdate.description) {
                        descriptionParts.push('## Character profile');
                        descriptionParts.push(characterUpdate.description);
                    }

                    const combinedDescription = descriptionParts.join('\n').trim();

                    const character: RPGCharacter = {
                        id: characterUpdate.id,
                        name: characterUpdate.name ?? characterUpdate.id,
                        description: combinedDescription,
                        state: characterUpdate.state ?? {},
                        sceneState: characterUpdate.sceneState ?? {},
                        goals: normalizeGoals([], characterUpdate.goals ?? [], turn),
                        createdTurn: turn,
                        lastUsedTurn: turn,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createCharacter(worldState, character);
                    console.log(`  ✅ Created character: ${character.name}`);
                } else {
                    const updates: Partial<RPGCharacter> = {};
                    if (characterUpdate.name) updates.name = characterUpdate.name;
                    if (characterUpdate.description) {
                        const key = `character:${characterUpdate.id}`;
                        if (!warnedCanonicalDescription.has(key)) {
                            warnedCanonicalDescription.add(key);
                            console.warn(
                                `⚠️ Ignoring character.description update for '${characterUpdate.id}' (descriptions are canonical). ` +
                                `Parser should output <state> / lore instead.`
                            );
                        }
                    }
                    if (characterUpdate.state) {
                        const existing = this.worldStateService.getCharacter(worldState, characterUpdate.id);
                        updates.state = mergeJsonWithDeletions(existing?.state ?? {}, characterUpdate.state);
                    }
                    if (characterUpdate.sceneState) {
                        const existing = this.worldStateService.getCharacter(worldState, characterUpdate.id);
                        updates.sceneState = mergeJsonWithDeletions(existing?.sceneState ?? {}, characterUpdate.sceneState);
                    }
                    if (characterUpdate.goals) {
                        const existing = this.worldStateService.getCharacter(worldState, characterUpdate.id);
                        updates.goals = normalizeGoals(existing?.goals ?? [], characterUpdate.goals, turn);
                    }
                    updates.createdTurn = turn;
                    
                    this.worldStateService.updateCharacter(worldState, characterUpdate.id, updates);
                    console.log(`  ✅ Updated character: ${characterUpdate.id}`);
                }
            }
        }
        
        // Apply lore updates
        if (update.lore) {
            for (const loreUpdate of update.lore) {
                if (loreUpdate.action === 'create') {
                    const lore: RPGLore = {
                        id: loreUpdate.id,
                        title: loreUpdate.title ?? loreUpdate.id,
                        content: loreUpdate.content ?? '',
                        tags: loreUpdate.tags ?? [],
                        createdTurn: turn,
                        lastUsedTurn: turn,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createLore(worldState, lore);
                    console.log(`  ✅ Created lore: ${lore.title}`);
                } else {
                    const updates: Partial<RPGLore> = {};
                    if (loreUpdate.title) updates.title = loreUpdate.title;
                    if (loreUpdate.content) updates.content = loreUpdate.content;
                    if (loreUpdate.tags) updates.tags = loreUpdate.tags;
                    updates.createdTurn = turn;
                    
                    this.worldStateService.updateLore(worldState, loreUpdate.id, updates);
                    console.log(`  ✅ Updated lore: ${loreUpdate.id}`);
                }
            }
        }
        
        // Apply relationship updates
        if (update.relationships) {
            for (const relationshipUpdate of update.relationships) {
                if (relationshipUpdate.action === 'create') {
                    // Enforce invariant: one active located_at per character (prevents missing/duplicate scene membership)
                    if (relationshipUpdate.kind === 'located_at') {
                        const fromIsCharacter = worldState.characters.has(relationshipUpdate.fromId);
                        const toIsLocation = worldState.locations.has(relationshipUpdate.toId);
                        if (!fromIsCharacter || !toIsLocation) {
                            console.error(
                                `❌ Invalid located_at relationship ignored: fromId='${relationshipUpdate.fromId}' toId='${relationshipUpdate.toId}'. ` +
                                `located_at must be Character -> Location.`
                            );
                            continue;
                        }

                        const existingLocatedAt = this.worldStateService
                            .listRelationships(worldState)
                            .filter(r => r.kind === 'located_at' && r.fromId === relationshipUpdate.fromId);
                        for (const rel of existingLocatedAt) {
                            this.worldStateService.deleteRelationship(worldState, rel.id);
                        }
                    }

                    const base = {
                        id: `rel_${relationshipUpdate.fromId}_${relationshipUpdate.toId}_${Date.now()}`,
                        fromId: relationshipUpdate.fromId,
                        toId: relationshipUpdate.toId,
                        createdTurn: turn,
                        lastUsedTurn: turn,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };

                    let relationship: RPGRelationship;
                    if (relationshipUpdate.kind === 'attitude_towards') {
                        if (relationshipUpdate.stance === undefined) {
                            throw new Error('Missing stance for attitude_towards relationship');
                        }
                        if (relationshipUpdate.intensity === undefined) {
                            throw new Error('Missing intensity for attitude_towards relationship');
                        }
                        relationship = {
                            ...base,
                            kind: 'attitude_towards',
                            stance: relationshipUpdate.stance,
                            intensity: relationshipUpdate.intensity,
                            ...(relationshipUpdate.reason !== undefined && { reason: relationshipUpdate.reason }),
                            ...(relationshipUpdate.note !== undefined && { note: relationshipUpdate.note })
                        };
                    } else {
                        relationship = {
                            ...base,
                            kind: relationshipUpdate.kind,
                            ...(relationshipUpdate.note !== undefined && { note: relationshipUpdate.note })
                        };
                    }

                    this.worldStateService.createRelationship(worldState, relationship);
                    console.log(`  ✅ Created relationship: ${relationship.fromId} -${relationship.kind}-> ${relationship.toId}`);
                } else if (relationshipUpdate.action === 'update') {
                    // For updates, we need to find the existing relationship
                    const existing = this.worldStateService.listRelationships(worldState).find(
                        r => r.fromId === relationshipUpdate.fromId && r.toId === relationshipUpdate.toId && r.kind === relationshipUpdate.kind
                    );
                    if (existing) {
                        if (relationshipUpdate.kind === 'attitude_towards') {
                            this.worldStateService.updateRelationship(worldState, existing.id, {
                                ...(relationshipUpdate.note !== undefined && { note: relationshipUpdate.note }),
                                ...(relationshipUpdate.stance !== undefined && { stance: relationshipUpdate.stance }),
                                ...(relationshipUpdate.intensity !== undefined && { intensity: relationshipUpdate.intensity }),
                                ...(relationshipUpdate.reason !== undefined && { reason: relationshipUpdate.reason })
                            });
                        } else {
                            this.worldStateService.updateRelationship(worldState, existing.id, {
                                ...(relationshipUpdate.note !== undefined && { note: relationshipUpdate.note })
                            });
                        }
                        console.log(`  ✅ Updated relationship: ${existing.id}`);
                    }
                } else {
                    const existing = this.worldStateService.listRelationships(worldState).find(
                        r => r.fromId === relationshipUpdate.fromId && r.toId === relationshipUpdate.toId && r.kind === relationshipUpdate.kind
                    );
                    if (existing) {
                        this.worldStateService.deleteRelationship(worldState, existing.id);
                        console.log(`  ✅ Deleted relationship: ${existing.id}`);
                    }
                }
            }
        }
        
        // Apply distance updates
        if (update.distances) {
            for (const distanceUpdate of update.distances) {
                const distance: RPGDistance = {
                    fromLocationId: distanceUpdate.fromLocationId,
                    toLocationId: distanceUpdate.toLocationId,
                    distance: distanceUpdate.distance,
                    unit: distanceUpdate.unit,
                    createdTurn: turn,
                    lastUsedTurn: turn,
                    createdAt: Date.now()
                };
                this.worldStateService.addDistance(worldState, distance);
                console.log(`  ✅ Added distance: ${distance.fromLocationId} -> ${distance.toLocationId} (${distance.distance} ${distance.unit})`);
            }
        }
        
        // Update recent events summary
        if (update.recentEventsSummary) {
            this.worldStateService.updateRecentEvents(worldState, update.recentEventsSummary);
            console.log(`  ✅ Updated recent events summary`);
        }
        
        // Update player location
        if (update.playerLocation) {
            this.worldStateService.updateCurrentLocation(worldState, update.playerLocation.currentLocationId);
            console.log(`  ✅ Updated player location: ${update.playerLocation.currentLocationId}`);
        }

        // Enforce scene roster -> located_at (robust against parser missing individual located_at edges)
        if (update.scene) {
            const currentLocationId = worldState.currentLocationId;
            const roster = update.scene.presentCharacterIds;

            for (const characterId of roster) {
                if (characterId === worldState.playerCharacterId) continue;

                const exists = this.worldStateService.getCharacter(worldState, characterId);
                if (!exists) {
                    if (worldState.locations.has(characterId)) {
                        console.error(`❌ Scene roster referenced a location id as a character id: '${characterId}'. Ignoring.`);
                    } else {
                        console.warn(`⚠️ Scene roster referenced unknown character '${characterId}'.`);
                    }
                    continue;
                }

                // Delete any existing located_at for this character (invariant: one location per character)
                const existingLocatedAt = this.worldStateService
                    .listRelationships(worldState)
                    .filter(r => r.kind === 'located_at' && r.fromId === characterId);
                for (const rel of existingLocatedAt) {
                    this.worldStateService.deleteRelationship(worldState, rel.id);
                }

                this.worldStateService.createRelationship(worldState, {
                    id: `rel_${characterId}_${currentLocationId}_located_at_${Date.now()}`,
                    fromId: characterId,
                    toId: currentLocationId,
                    kind: 'located_at',
                    createdTurn: turn,
                    lastUsedTurn: turn,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            }

            console.log(`  ✅ Applied scene roster (${roster.length} ids) to location ${currentLocationId}`);

            // Option 3: Scene-state clearing.
            // - Characters not present: clear their sceneState.
            // - Locations not current: clear their sceneState.
            const present = new Set<string>([worldState.playerCharacterId, ...roster]);

            for (const ch of worldState.characters.values()) {
                if (!present.has(ch.id) && Object.keys(ch.sceneState).length > 0) {
                    this.worldStateService.updateCharacter(worldState, ch.id, { sceneState: {} });
                }
            }

            for (const loc of worldState.locations.values()) {
                if (loc.id !== currentLocationId && Object.keys(loc.sceneState).length > 0) {
                    this.worldStateService.updateLocation(worldState, loc.id, { sceneState: {} });
                }
            }

            // Option 2: Ensure continuity memory shell exists for present NPCs.
            for (const npcId of roster) {
                if (npcId === worldState.playerCharacterId) continue;
                if (!worldState.characters.has(npcId)) continue;
                this.ensureNpcMemoryLore(session, npcId, worldState.playerCharacterId, turn);
            }
        } else {
            // Loud signal when roster is missing (helps diagnose LLM failures)
            console.warn('⚠️ No <scene> roster found in state update; scene membership may be incomplete.');
        }

        // Final invariant enforcement for this turn: remove any invalid located_at edges that slipped in.
        this.cleanupInvalidLocatedAtRelationships(session);
    }

    private cleanupInvalidLocatedAtRelationships(session: RPGGameSession): void {
        const worldState = session.worldState;
        const relationships = this.worldStateService.listRelationships(worldState);

        const invalidLocatedAt = relationships.filter(rel => {
            if (rel.kind !== 'located_at') return false;
            const fromIsCharacter = worldState.characters.has(rel.fromId);
            const toIsLocation = worldState.locations.has(rel.toId);
            return !fromIsCharacter || !toIsLocation;
        });

        if (invalidLocatedAt.length === 0) return;

        console.error(`❌ Found ${invalidLocatedAt.length} invalid located_at relationship(s). Deleting to restore invariants.`);
        for (const rel of invalidLocatedAt) {
            console.error(
                `  - deleting rel '${rel.id}': fromId='${rel.fromId}' toId='${rel.toId}' (must be Character -> Location)`
            );
            this.worldStateService.deleteRelationship(worldState, rel.id);
        }
    }

    private ensureNpcMemoryLore(
        session: RPGGameSession,
        npcId: string,
        playerId: string,
        turn: number
    ): void {
        const worldState = session.worldState;
        const npc = this.worldStateService.getCharacter(worldState, npcId);
        if (!npc) throw new Error(`Cannot ensure NPC memory lore: character not found (${npcId}).`);

        const memoryId = `mem_${npcId}_about_${playerId}`;
        const existing = this.worldStateService.getLore(worldState, memoryId);

        if (!existing) {
            // Create an empty memory shell; parser is expected to fill/update the content.
            this.worldStateService.createLore(worldState, {
                id: memoryId,
                title: `Memory: ${npc.name} about you`,
                content: '[empty memory — waiting for parser updates]',
                tags: ['memory', 'npc_memory'],
                createdTurn: turn,
                lastUsedTurn: turn,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        const alreadyLinked = this.worldStateService
            .getRelationshipsForEntity(worldState, npcId)
            .some(r => r.kind === 'knows_fact' && r.fromId === npcId && r.toId === memoryId);

        if (!alreadyLinked) {
            this.worldStateService.createRelationship(worldState, {
                id: `rel_${npcId}_${memoryId}_knows_fact_${Date.now()}`,
                fromId: npcId,
                toId: memoryId,
                kind: 'knows_fact',
                createdTurn: turn,
                lastUsedTurn: turn,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }
    }
    
    /**
     * Wait for state analysis to complete
     * This is called before allowing the next user input submission
     */
    async waitForAnalysisCompletion(): Promise<void> {
        if (this.analysisPromise) {
            console.log('⏳ Waiting for state analysis to complete...');
            await this.analysisPromise;
        }
    }
    
    /**
     * Check if state analysis is currently running
     */
    isAnalyzing(): boolean {
        return this.analysisInProgress;
    }
    
    /**
     * Get analysis state for UI
     */
    getAnalysisState(): { isAnalyzing: boolean, canSubmit: boolean } {
        return {
            isAnalyzing: this.analysisInProgress,
            canSubmit: !this.analysisInProgress
        };
    }

    restoreRollbackPointIntoSession(session: RPGGameSession, rollbackId: string): void {
        const state = this.rollbackPoints.get(rollbackId);
        if (!state) {
            throw new Error(`Rollback point not found: ${rollbackId}`);
        }
        // Restore a fresh clone so the stored rollback point remains immutable.
        session.worldState = this.worldStateService.cloneWorldStateForUndo(state);
    }

    hasRollbackPoint(rollbackId: string): boolean {
        return this.rollbackPoints.has(rollbackId);
    }

    dropRollbackPoint(rollbackId: string): void {
        this.rollbackPoints.delete(rollbackId);
    }

    async deleteSnapshotById(snapshotId: string): Promise<void> {
        await this.worldStateService.deleteSnapshot(snapshotId);
    }
}

