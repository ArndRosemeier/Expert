/**
 * RPG Interaction Service
 * 
 * Orchestrates the dual-LLM workflow:
 * 1. Game LLM (Narrator) generates narrative response
 * 2. State Parser LLM extracts world state changes (async, in background)
 * 3. User can type while analysis runs, but submission waits for completion
 * 4. State updates are applied and snapshot is created
 */

import { RPGGameSession, RPGConversationMessage, RPGStateUpdateXML, RPGLocation, RPGCharacter, RPGLore, RPGRelationship, RPGDistance } from '../types/RPGTypes';
import { WorldStateService } from './WorldStateService';
import { RPGContextBuilder } from './RPGContextBuilder';
import { RPGStateParser } from './RPGStateParser';
import { OpenRouterClient } from '../../OpenRouterClient';
import { getPromptText } from '../../PromptManager';
import { createRPGPromptExpansionService } from './RPGPlaceholderService';
import { SettingsManager } from '../../SettingsManager';

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
        // Create a pre-turn snapshot so we can "Retry" (rollback + resend) later.
        const currentTurn = Math.floor(session.conversationHistory.length / 2);
        const preTurnSnapshot = await this.worldStateService.createSnapshot(session, currentTurn);
        session.snapshots.push(preTurnSnapshot.id);

        // Lock state during LLM interaction
        this.worldStateService.lockState('Game LLM generating response');
        
        // Store the callback for this interaction (only if provided)
        if (onAnalysisComplete) {
            this.onAnalysisComplete = onAnalysisComplete;
        }
        
        try {
            // Build context for Game LLM
            const gameContext = this.contextBuilder.buildGameNarrationContext(session);
            
            // Get prompt template (use custom if provided)
            const systemPromptTemplate = session.customSystemPrompt || getPromptText('rpg_game_narration_system');
            
            // Expand prompt with context
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPrompt = expansionService.expandPrompt(systemPromptTemplate, gameContext);
            
            // Build messages array (last 2 messages + current action)
            const messages: Array<{role: string, content: string}> = [];
            
            // Add system prompt
            messages.push({role: 'system', content: systemPrompt});
            
            // Add last 2 messages from conversation history
            for (const msg of session.last2Messages) {
                messages.push({role: msg.role, content: msg.content});
            }
            
            // Add current player action
            messages.push({role: 'user', content: playerAction});
            
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
                preTurnSnapshotId: preTurnSnapshot.id
            };
            
            session.conversationHistory.push(userMessage);
            session.conversationHistory.push(assistantMessage);
            
            // Update last 2 messages
            const allMessages = [...session.conversationHistory];
            session.last2Messages = allMessages.slice(-2);
            
            // Unlock state before triggering analysis (LLM call is complete)
            this.worldStateService.unlockState();
            
            // Trigger async state analysis (non-blocking, state is now unlocked)
            this.triggerStateAnalysis(session, settingsManager);
            
            return response;
            
        } catch (error) {
            this.worldStateService.unlockState();
            console.error('Error in sendPlayerAction:', error);
            throw error;
        }
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
            
            // Apply state updates (state is already unlocked at this point)
            this.applyStateUpdates(session, stateUpdate);
            
            // Create snapshot
            const turn = Math.floor(session.conversationHistory.length / 2);
            const snapshot = await this.worldStateService.createSnapshot(session, turn);
            session.snapshots.push(snapshot.id);
            
            // Save session
            await this.worldStateService.saveSession(session);
            
        } catch (error) {
            console.error('❌ State analysis error:', error);
            throw error;
        }
    }
    
    /**
     * Apply state updates extracted from State Parser
     */
    public applyStateUpdates(session: RPGGameSession, update: RPGStateUpdateXML): void {
        const worldState = session.worldState;
        
        console.log('🔄 Applying state updates...');
        
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
                        name: locationUpdate.name || locationUpdate.id,
                        description: combinedDescription,
                        state: locationUpdate.state || {},
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createLocation(worldState, location);
                    console.log(`  ✅ Created location: ${location.name}`);

                    // Persist verbatim evidence as lore linked to the new location (visibility + future context)
                    if (locationUpdate.verbatimEvidence) {
                        const loreId = `lore_first_mention_${location.id}_${Date.now()}`;
                        this.worldStateService.createLore(worldState, {
                            id: loreId,
                            title: `First mention: ${location.name}`,
                            content: locationUpdate.verbatimEvidence,
                            tags: ['first_mention', 'verbatim', 'location'],
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });

                        this.worldStateService.createRelationship(worldState, {
                            id: `rel_${loreId}_${location.id}_describes_${Date.now()}`,
                            fromId: loreId,
                            toId: location.id,
                            type: 'describes',
                            description: 'Verbatim excerpt from GM introducing the location',
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });
                    }
                } else if (locationUpdate.action === 'update') {
                    const updates: Partial<RPGLocation> = {};
                    if (locationUpdate.name) updates.name = locationUpdate.name;
                    if (locationUpdate.description) {
                        console.warn(
                            `⚠️ Ignoring location.description update for '${locationUpdate.id}' (descriptions are canonical). ` +
                            `Parser attempted to overwrite description.`
                        );
                    }
                    if (locationUpdate.state) updates.state = locationUpdate.state;
                    
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
                        name: characterUpdate.name || characterUpdate.id,
                        description: combinedDescription,
                        state: characterUpdate.state || {},
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createCharacter(worldState, character);
                    console.log(`  ✅ Created character: ${character.name}`);

                    // Persist verbatim evidence as lore linked to character + current location (visibility + future context)
                    if (characterUpdate.verbatimEvidence) {
                        const loreId = `lore_first_appearance_${character.id}_${Date.now()}`;
                        this.worldStateService.createLore(worldState, {
                            id: loreId,
                            title: `First appearance: ${character.name}`,
                            content: characterUpdate.verbatimEvidence,
                            tags: ['first_appearance', 'verbatim', 'character'],
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });

                        this.worldStateService.createRelationship(worldState, {
                            id: `rel_${loreId}_${character.id}_describes_${Date.now()}`,
                            fromId: loreId,
                            toId: character.id,
                            type: 'describes',
                            description: 'Verbatim excerpt from GM introducing the character',
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });

                        this.worldStateService.createRelationship(worldState, {
                            id: `rel_${loreId}_${worldState.currentLocationId}_found_${Date.now()}`,
                            fromId: loreId,
                            toId: worldState.currentLocationId,
                            type: 'found_at',
                            description: 'Where the character was introduced',
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });
                    }
                } else if (characterUpdate.action === 'update') {
                    const updates: Partial<RPGCharacter> = {};
                    if (characterUpdate.name) updates.name = characterUpdate.name;
                    if (characterUpdate.description) {
                        console.warn(
                            `⚠️ Ignoring character.description update for '${characterUpdate.id}' (descriptions are canonical). ` +
                            `Parser attempted to overwrite description.`
                        );
                    }
                    if (characterUpdate.state) updates.state = characterUpdate.state;
                    
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
                        title: loreUpdate.title || loreUpdate.id,
                        content: loreUpdate.content || '',
                        tags: loreUpdate.tags || [],
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createLore(worldState, lore);
                    console.log(`  ✅ Created lore: ${lore.title}`);
                } else if (loreUpdate.action === 'update') {
                    const updates: Partial<RPGLore> = {};
                    if (loreUpdate.title) updates.title = loreUpdate.title;
                    if (loreUpdate.content) updates.content = loreUpdate.content;
                    if (loreUpdate.tags) updates.tags = loreUpdate.tags;
                    
                    this.worldStateService.updateLore(worldState, loreUpdate.id, updates);
                    console.log(`  ✅ Updated lore: ${loreUpdate.id}`);
                }
            }
        }
        
        // Apply relationship updates
        if (update.relationships) {
            for (const relationshipUpdate of update.relationships) {
                if (relationshipUpdate.action === 'create') {
                    const relationship: RPGRelationship = {
                        id: `rel_${relationshipUpdate.fromId}_${relationshipUpdate.toId}_${Date.now()}`,
                        fromId: relationshipUpdate.fromId,
                        toId: relationshipUpdate.toId,
                        type: relationshipUpdate.type,
                        description: relationshipUpdate.description,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    this.worldStateService.createRelationship(worldState, relationship);
                    console.log(`  ✅ Created relationship: ${relationship.fromId} -${relationship.type}-> ${relationship.toId}`);
                } else if (relationshipUpdate.action === 'update') {
                    // For updates, we need to find the existing relationship
                    const existing = this.worldStateService.listRelationships(worldState).find(
                        r => r.fromId === relationshipUpdate.fromId && r.toId === relationshipUpdate.toId && r.type === relationshipUpdate.type
                    );
                    if (existing) {
                        const updates: Partial<RPGRelationship> = {};
                        if (relationshipUpdate.description) updates.description = relationshipUpdate.description;
                        this.worldStateService.updateRelationship(worldState, existing.id, updates);
                        console.log(`  ✅ Updated relationship: ${existing.id}`);
                    }
                } else if (relationshipUpdate.action === 'delete') {
                    const existing = this.worldStateService.listRelationships(worldState).find(
                        r => r.fromId === relationshipUpdate.fromId && r.toId === relationshipUpdate.toId && r.type === relationshipUpdate.type
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

    async restoreSnapshotIntoSession(session: RPGGameSession, snapshotId: string): Promise<void> {
        const restored = await this.worldStateService.restoreSnapshot(snapshotId);
        session.worldState = restored;
    }
}

