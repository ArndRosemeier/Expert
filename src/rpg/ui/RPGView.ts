/**
 * RPG View - Main container for the RPG Mode interface
 * 
 * Contains:
 * - Conversation Panel (chat with Game LLM)
 * - World Inspector (Scene/World toggle, tree view)
 * - Checkpoints are attached to assistant messages (restore from answer boxes)
 */

import { RPGGameSession, RPGGameSessionSerialized, RPGConversationMessage, deserializeSession } from '../types/RPGTypes';
import { WorldStateService } from '../services/WorldStateService';
import { RPGContextBuilder } from '../services/RPGContextBuilder';
import { RPGStateParser } from '../services/RPGStateParser';
import { RPGInteractionService } from '../services/RPGInteractionService';
import { RPGConversationPanel } from './RPGConversationPanel';
import { RPGWorldInspector } from './RPGWorldInspector';
import { StorageService } from '../../StorageService';
import { getActiveProject } from '../../state';
import { getPromptText } from '../../PromptManager';
import { createRPGPromptExpansionService } from '../services/RPGPlaceholderService';
import { OpenRouterClient } from '../../OpenRouterClient';

export class RPGView {
    private container: HTMLElement;
    private currentSession: RPGGameSession | null = null;
    
    // Services
    private worldStateService: WorldStateService;
    private contextBuilder: RPGContextBuilder;
    private stateParser: RPGStateParser;
    private interactionService: RPGInteractionService;
    
    // UI Components
    private worldInspector: RPGWorldInspector | null = null;
    private conversationPanel: RPGConversationPanel | null = null;
    
    // Additional services needed for start setting parsing
    private openRouterClient: OpenRouterClient;

    private readonly MODEL_PURPOSES: Array<{ key: string; label: string }> = [
        { key: 'creator', label: 'Creator' },
        { key: 'prose', label: 'Prose' },
        { key: 'editor', label: 'Editor' },
        { key: 'rater', label: 'Rater' },
    ];
    
    constructor(container: HTMLElement) {
        this.container = container;
        
        // Initialize services
        this.worldStateService = new WorldStateService();
        this.contextBuilder = new RPGContextBuilder(this.worldStateService);
        this.stateParser = new RPGStateParser();
        this.openRouterClient = OpenRouterClient.getInstance();
        this.interactionService = new RPGInteractionService(
            this.worldStateService,
            this.contextBuilder,
            this.stateParser
        );
    }

    private setCreateSessionStatus(text: string, isBusy: boolean): void {
        const statusEl = this.container.querySelector('#rpg-create-session-status') as HTMLElement;
        const createBtn = this.container.querySelector('#rpg-create-session-btn') as HTMLButtonElement;
        const cancelBtn = this.container.querySelector('#rpg-cancel-new-session-btn') as HTMLButtonElement;

        statusEl.innerHTML = isBusy
            ? `<span class="rpg-spinner" aria-hidden="true"></span><span>${text}</span>`
            : text;

        createBtn.disabled = isBusy;
        cancelBtn.disabled = isBusy;
    }
    
    /**
     * Open the RPG view
     */
    async open(): Promise<void> {
        // Check if we have an active session, otherwise show session selector
        const sessions = await this.loadSessions();
        
        if (sessions.length === 0) {
            // No sessions, show "New Session" dialog
            await this.showNewSessionDialog();
        } else {
            // Show session selector
            await this.showSessionSelector(sessions);
        }
    }
    
    /**
     * Load all RPG sessions from storage
     */
    private async loadSessions(): Promise<RPGGameSession[]> {
        try {
            const storage = await StorageService.getInstance();
            const serializedSessions = await storage.listRPGSessions<RPGGameSessionSerialized>();
            return serializedSessions.map((s: RPGGameSessionSerialized) => deserializeSession(s));
        } catch (error) {
            console.error('Failed to load RPG sessions:', error);
            return [];
        }
    }
    
    /**
     * Show session selector dialog
     */
    private async showSessionSelector(sessions: RPGGameSession[]): Promise<void> {
        const html = `
            <div class="rpg-session-selector">
                <h2>RPG Sessions</h2>
                <div class="session-list">
                    ${sessions.map(s => `
                        <div class="session-item" data-session-id="${s.id}">
                            <div class="session-info">
                                <h3>${s.title}</h3>
                                <p>Last updated: ${new Date(s.updatedAt).toLocaleString()}</p>
                                <p>Messages: ${s.conversationHistory.length}</p>
                            </div>
                            <button class="session-delete-btn" data-session-id="${s.id}" title="Delete session">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                <button id="rpg-new-session-btn">New Session</button>
                <button id="rpg-close-selector-btn">Cancel</button>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.container.style.display = 'block';
        
        // Attach event listeners for session items
        const sessionItems = this.container.querySelectorAll('.session-item');
        sessionItems.forEach(item => {
            const sessionInfo = item.querySelector('.session-info');
            sessionInfo?.addEventListener('click', () => {
                const sessionId = item.getAttribute('data-session-id');
                if (sessionId) {
                    void this.loadSession(sessionId);
                }
            });
        });
        
        // Attach event listeners for delete buttons
        const deleteButtons = this.container.querySelectorAll('.session-delete-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent triggering session load
                const sessionId = btn.getAttribute('data-session-id');
                if (sessionId) {
                    await this.deleteSession(sessionId);
                }
            });
        });
        
        const newSessionBtn = this.container.querySelector('#rpg-new-session-btn');
        newSessionBtn?.addEventListener('click', () => {
            void this.showNewSessionDialog();
        });
        
        const closeBtn = this.container.querySelector('#rpg-close-selector-btn');
        closeBtn?.addEventListener('click', () => {
            this.close();
        });
    }
    
    /**
     * Show new session creation dialog
     */
    private async showNewSessionDialog(): Promise<void> {
        const activeProject = getActiveProject();
        if (!activeProject) {
            alert('Please open a project first');
            this.close();
            return;
        }
        
        const MODEL_PURPOSES = [
            { key: 'creator', label: 'Creator' },
            { key: 'prose', label: 'Prose' },
            { key: 'editor', label: 'Editor' },
            { key: 'rater', label: 'Rater' },
        ];
        
        const html = `
            <div class="rpg-new-session-dialog">
                <h2>Create New RPG Session</h2>
                <p class="rpg-setup-instructions">
                    Describe your adventure idea, and the AI will automatically generate the session setup including location, character, setting, and appropriate rules.
                </p>
                <div class="form-group">
                    <label for="rpg-adventure-description">Describe Your Adventure:</label>
                    <textarea id="rpg-adventure-description" rows="12" placeholder="Example: A noir detective story set in 1940s Los Angeles. The player is a hard-boiled private investigator investigating a mysterious disappearance. The game should be gritty, atmospheric, with emphasis on investigation and moral choices..."></textarea>
                </div>
                <div class="form-group rpg-advanced-section">
                    <details>
                        <summary>Advanced Options (optional)</summary>
                        <div class="rpg-advanced-content">
                            <div class="form-group">
                                <label for="rpg-narrator-purpose">Narrator Model:</label>
                                <select id="rpg-narrator-purpose">
                                    ${MODEL_PURPOSES.map(p => `
                                        <option value="${p.key}" ${p.key === 'prose' ? 'selected' : ''}>
                                            ${p.label}
                                        </option>
                                    `).join('')}
                                </select>
                                <small>Default: Prose (generates narrative)</small>
                            </div>
                            <div class="form-group">
                                <label for="rpg-parser-purpose">Parser Model:</label>
                                <select id="rpg-parser-purpose">
                                    ${MODEL_PURPOSES.map(p => `
                                        <option value="${p.key}" ${p.key === 'editor' ? 'selected' : ''}>
                                            ${p.label}
                                        </option>
                                    `).join('')}
                                </select>
                                <small>Default: Editor (extracts world state)</small>
                            </div>
                        </div>
                    </details>
                </div>
                <div id="rpg-create-session-status" class="rpg-create-session-status" aria-live="polite"></div>
                <button id="rpg-create-session-btn">Create Session</button>
                <button id="rpg-cancel-new-session-btn">Cancel</button>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.container.style.display = 'block';
        
        const createBtn = this.container.querySelector('#rpg-create-session-btn');
        createBtn?.addEventListener('click', () => {
            void this.createNewSession();
        });
        
        const cancelBtn = this.container.querySelector('#rpg-cancel-new-session-btn');
        cancelBtn?.addEventListener('click', () => {
            this.close();
        });
    }
    
    /**
     * Create a new RPG session
     */
    private async createNewSession(): Promise<void> {
        const adventureDescInput = this.container.querySelector('#rpg-adventure-description') as HTMLTextAreaElement;
        const narratorSelect = this.container.querySelector('#rpg-narrator-purpose') as HTMLSelectElement;
        const parserSelect = this.container.querySelector('#rpg-parser-purpose') as HTMLSelectElement;
        
        const adventureDescription = adventureDescInput.value.trim();
        
        if (!adventureDescription) {
            alert('Please describe your adventure idea.');
            return;
        }
        
        const narratorPurpose = narratorSelect.value;
        const parserPurpose = parserSelect.value;
        
        try {
            this.setCreateSessionStatus('Preparing session…', true);
            await new Promise<void>(resolve => requestAnimationFrame(() => { resolve(); }));

            console.log('🎲 Generating session setup from description...');
            this.setCreateSessionStatus('Generating session setup…', true);
            
            // Get the session setup from the LLM
            const setup = await this.generateSessionSetup(adventureDescription);
            
            this.setCreateSessionStatus('Building world state…', true);

            // Create initial world state
            const worldState = this.worldStateService.createEmptyWorldState();
            
            // Create starting location
            const locationId = 'loc_' + Date.now();
            this.worldStateService.createLocation(worldState, {
                id: locationId,
                name: setup.locationName,
                description: setup.locationDescription,
                state: {},
                sceneState: {},
                createdTurn: 0,
                lastUsedTurn: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            // Create player character
            const playerId = 'player_' + Date.now();
            const playerDescription =
                `## Verbatim (from your session description)\n` +
                `${setup.characterVerbatimUserDetails}\n\n` +
                `## Consolidated character profile\n` +
                `${setup.characterDescription}`.trim();

            this.worldStateService.createCharacter(worldState, {
                id: playerId,
                name: setup.characterName,
                description: playerDescription,
                state: {},
                sceneState: {},
                goals: [],
                createdTurn: 0,
                lastUsedTurn: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            // Create relationship: player located_at starting location
            this.worldStateService.createRelationship(worldState, {
                id: `rel_${playerId}_${locationId}`,
                fromId: playerId,
                toId: locationId,
                kind: 'located_at',
                createdTurn: 0,
                lastUsedTurn: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            worldState.currentLocationId = locationId;
            worldState.playerCharacterId = playerId;
            
            // Create session
            const session: RPGGameSession = {
                id: 'session_' + Date.now(),
                title: setup.title,
                worldState,
                conversationHistory: [],
                last2Messages: [],
                snapshots: [],
                manualSaves: [],
                suspiciousEntities: [],
                narratorPurpose,
                parserPurpose,
                ...(setup.systemPrompt && { customSystemPrompt: setup.systemPrompt }),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Intentionally NOT creating a dedicated "Session Brief" lore item anymore.
            
            // Parse setting description to extract additional entities
            if (setup.settingDescription) {
                this.setCreateSessionStatus('Parsing initial setting…', true);
                await this.parseSettingDescription(session, setup.settingDescription);
            }
            
            // Generate initial GM message
            this.setCreateSessionStatus('Generating Game Master intro…', true);
            const initialGMMessage = await this.generateInitialMessage(session, setup.settingDescription);

            // The initial GM intro can already introduce new entities (especially NPCs). Parse it once before snapshotting.
            this.setCreateSessionStatus('Analyzing GM intro…', true);
            await this.parseInitialGMIntro(session, initialGMMessage);

            // Create an initial snapshot at game start (turn 0)
            this.setCreateSessionStatus('Creating initial snapshot…', true);
            const initialSnapshot = await this.worldStateService.createSnapshot(session, 0);
            session.snapshots.push(initialSnapshot.id);
            const firstMsg = session.conversationHistory[0];
            if (!firstMsg || firstMsg.role !== 'assistant') {
                throw new Error('Expected initial GM message to be present before creating initial checkpoint.');
            }
            firstMsg.checkpointSnapshotId = initialSnapshot.id;
            
            // Save session
            this.setCreateSessionStatus('Saving session…', true);
            await this.worldStateService.saveSession(session);
            
            // Load session
            this.setCreateSessionStatus('Starting game…', true);
            await this.loadSession(session.id);
            
        } catch (error) {
            console.error('❌ Failed to create session:', error);
            alert(`Failed to create session: ${error instanceof Error ? error.message : error}`);
            this.setCreateSessionStatus('', false);
            throw error;
        }
    }
    
    /**
     * Generate session setup from adventure description using LLM
     */
    private async generateSessionSetup(adventureDescription: string): Promise<{
        title: string;
        locationName: string;
        locationDescription: string;
        characterName: string;
        characterVerbatimUserDetails: string;
        characterDescription: string;
        settingVerbatimUserDetails: string;
        settingDescription: string;
        systemPrompt: string;
    }> {
        console.log('🤖 Calling LLM for session setup...');
        console.log('📝 Adventure description:', adventureDescription);
        
        // Get the prompt template and directly replace the placeholder
        const promptTemplate = getPromptText('rpg_session_setup');
        const prompt = promptTemplate.replace('{{adventure_description}}', adventureDescription);
        
        console.log('📤 Full prompt being sent to creator LLM:');
        console.log(prompt);
        console.log('---');

        const maxAttempts = 3;
        let lastResponse = '';
        let lastError: unknown = undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) {
                this.setCreateSessionStatus(`Invalid XML received. Retrying session setup… (${attempt}/${maxAttempts})`, true);
            }

            try {
                // Call the creator model for session setup
                const response = await this.openRouterClient.chat('creator', prompt);
                lastResponse = response;
                
                console.log(`📄 Session setup response received (attempt ${attempt}/${maxAttempts})`);
                console.log('📄 Response:', response);
                
                // Parse XML response
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(response, 'text/xml');
                
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    console.error('❌ XML Parse Error:', parseError.textContent);
                    throw new Error(`Failed to parse setup XML: ${parseError.textContent}`);
                }
                
                const root = xmlDoc.querySelector('rpg_session_setup');
                if (!root) {
                    throw new Error('Invalid setup response: missing rpg_session_setup root');
                }
                
                const requireText = (selector: string): string => {
                    const el = root.querySelector(selector);
                    const text = el?.textContent?.trim();
                    if (!text) {
                        throw new Error(`Invalid setup response: missing required element '${selector}'`);
                    }
                    return text;
                };

                const setup = {
                    title: requireText('title'),
                    locationName: requireText('location > name'),
                    locationDescription: requireText('location > description'),
                    characterName: requireText('character > name'),
                    characterVerbatimUserDetails: requireText('character > verbatim_user_details'),
                    characterDescription: requireText('character > description'),
                    settingVerbatimUserDetails: requireText('setting > verbatim_user_details'),
                    settingDescription: requireText('setting > description'),
                    systemPrompt: requireText('system_prompt')
                };
                
                console.log('✅ Parsed setup:', setup);
                return setup;
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Session setup parse failed (attempt ${attempt}/${maxAttempts}):`, error);
                if (attempt === maxAttempts) {
                    console.error('Raw response (last attempt):', lastResponse);
                    throw error instanceof Error
                        ? error
                        : new Error(`Session setup failed: ${String(error)}`);
                }
            }
        }

        console.error('Raw response (last attempt):', lastResponse);
        throw new Error(`Session setup failed after ${maxAttempts} attempts: ${String(lastError)}`);
    }
    
    /**
     * Parse setting description to extract additional entities
     */
    private async parseSettingDescription(session: RPGGameSession, settingDescription: string): Promise<void> {
        if (!settingDescription) return;
        
        console.log('📝 Parsing setting description...');
        
        const activeProject = getActiveProject();
        if (!activeProject) return;
        
        const settingsManager = activeProject.getSettingsManager();
        
        try {
            // Build context to parse the setting
            const parserContext = this.contextBuilder.buildStateParserContext(
                session,
                `Parse the following setting description.\n\nIMPORTANT CONSTRAINTS:\n- Do NOT update or rewrite the existing PLAYER CHARACTER (${session.worldState.playerCharacterId}).\n- Do NOT update or rewrite the existing STARTING LOCATION (${session.worldState.currentLocationId}).\n- Only create additional entities/lore/relationships/distances that are clearly implied.\n- Do NOT abbreviate or summarize existing details.`,
                settingDescription
            );
            
            // Get prompt templates
            const systemPromptTemplate = getPromptText('rpg_state_parser_system');
            const userPromptTemplate = getPromptText('rpg_state_parser_user');
            
            // Expand prompts
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPrompt = expansionService.expandPrompt(systemPromptTemplate, parserContext);
            const userPrompt = expansionService.expandPrompt(userPromptTemplate, parserContext);
            
            // Combine prompts
            const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
            
            // Call State Parser LLM
            const response = await this.openRouterClient.chat(session.parserPurpose, combinedPrompt);
            
            console.log('📄 State Parser response received');
            
            // Parse XML response
            const stateUpdate = this.stateParser.parseStateUpdate(response);
            
            // Apply state updates
            await this.interactionService.applyStateUpdates(session, stateUpdate);
            
            console.log('✅ Setting parsed successfully');
            
        } catch (error) {
            console.error('❌ Failed to parse setting:', error);
            // Don't block session creation if parsing fails
        }
    }
    
    /**
     * Parse the initial GM intro message. The GM can introduce NPCs/objects already in the starting scene.
     */
    private async parseInitialGMIntro(session: RPGGameSession, gmIntro: string): Promise<void> {
        if (!gmIntro) return;
        
        console.log('📝 Parsing initial GM intro...');
        
        const activeProject = getActiveProject();
        if (!activeProject) return;
        
        const settingsManager = activeProject.getSettingsManager();
        
        try {
            const parserContext = this.contextBuilder.buildStateParserContext(
                session,
                `Parse the following Game Master intro message.\n\nIMPORTANT CONSTRAINTS:\n- Do NOT update or rewrite the existing PLAYER CHARACTER (${session.worldState.playerCharacterId}).\n- Do NOT update or rewrite the existing STARTING LOCATION (${session.worldState.currentLocationId}).\n- Only create additional entities/lore/relationships/distances that are clearly implied.\n- If the GM intro introduces characters present in the scene, ensure they are located_at the CURRENT LOCATION (${session.worldState.currentLocationId}).\n- Do NOT abbreviate or summarize existing details.`,
                gmIntro
            );
            
            // Get prompt templates
            const systemPromptTemplate = getPromptText('rpg_state_parser_system');
            const userPromptTemplate = getPromptText('rpg_state_parser_user');
            
            // Expand prompts
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPrompt = expansionService.expandPrompt(systemPromptTemplate, parserContext);
            const userPrompt = expansionService.expandPrompt(userPromptTemplate, parserContext);
            
            const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
            
            // Call State Parser LLM
            const response = await this.openRouterClient.chat(session.parserPurpose, combinedPrompt);
            console.log('📄 State Parser response received (intro)');
            
            const stateUpdate = this.stateParser.parseStateUpdate(response);
            await this.interactionService.applyStateUpdates(session, stateUpdate);
            
            console.log('✅ Initial GM intro parsed successfully');
        } catch (error) {
            console.error('❌ Failed to parse initial GM intro:', error);
            this.setCreateSessionStatus('⚠️ Failed to parse GM intro (world may be incomplete). Check console.', false);
        }
    }
    
    /**
     * Generate initial GM message to set the stage
     */
    private async generateInitialMessage(session: RPGGameSession, settingDescription?: string): Promise<string> {
        console.log('📝 Generating initial GM message...');
        
        const activeProject = getActiveProject();
        if (!activeProject) return '';
        
        const settingsManager = activeProject.getSettingsManager();
        
        try {
            // Build context for Game LLM
            const gameContext = this.contextBuilder.buildGameNarrationContext(session);
            
            // Get prompt template (use custom if provided)
            const systemPromptTemplate = session.customSystemPrompt ?? getPromptText('rpg_game_narration_system');
            
            // Expand prompt with context
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPrompt = expansionService.expandPrompt(systemPromptTemplate, gameContext);
            
            // Create an initial prompt for the GM
            const initialUserPrompt = settingDescription
                ? `The game is starting. Set the stage by describing the initial scene and situation. Use the following setting as context:\n\n${settingDescription}\n\nIMPORTANT: Address the player as "you" (do not use the player character's name in your narration or your final question). End with a question like "What do you do?"`
                : 'The game is starting. Set the stage by describing the initial scene and welcoming the player to the adventure. IMPORTANT: Address the player as "you" (do not use the player character\'s name). End with: "What do you do?"';
            
            // Build messages
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: initialUserPrompt }
            ];
            
            console.log(`🎮 Requesting initial message from Game LLM (purpose: ${session.narratorPurpose})`);
            
            // Call Game LLM (non-streaming for initial message)
            const response = await this.openRouterClient.chat(
                session.narratorPurpose,
                messages.map(m => `${m.role === 'system' ? 'System: ' : 'User: '}${m.content}`).join('\n\n')
            );
            
            console.log(`✅ Initial GM message received (${response.length} chars)`);
            
            // Add to conversation history
            const assistantMessage: RPGConversationMessage = {
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            };
            
            session.conversationHistory.push(assistantMessage);
            session.last2Messages = [assistantMessage];
            
            console.log('✅ Initial GM message added to conversation');
            return response;
            
        } catch (error) {
            console.error('❌ Failed to generate initial message:', error);
            // Add a fallback message so the session isn't empty
            const fallbackMessage: RPGConversationMessage = {
                role: 'assistant',
                content: 'Welcome to the adventure! The game is ready to begin. What would you like to do?',
                timestamp: Date.now()
            };
            session.conversationHistory.push(fallbackMessage);
            session.last2Messages = [fallbackMessage];
            return fallbackMessage.content;
        }
    }
    
    /**
     * Load an existing session
     */
    private async loadSession(sessionId: string): Promise<void> {
        const storage = await StorageService.getInstance();
        const serialized = await storage.loadRPGSession<RPGGameSessionSerialized>(sessionId);
        
        if (!serialized) {
            alert('Session not found');
            return;
        }
        
        this.currentSession = deserializeSession(serialized);

        // Migration: remove old "Session Brief (Initial Setup)" lore items
        this.removeSessionBriefLore(this.currentSession);
        // Migration: remove auto-generated verbatim "first appearance/mention" lore items (redundant with canonical descriptions)
        this.removeAutoFirstAppearanceLore(this.currentSession);
        await this.worldStateService.saveSession(this.currentSession);

        // Migration: attach checkpoint snapshot IDs to assistant messages (for older sessions)
        await this.attachCheckpointsFromSnapshots(this.currentSession);

        // Migration: preTurnRollbackId is in-memory only and becomes invalid after reload.
        this.removeStaleRollbackIds(this.currentSession);

        // Migration: initialize lastUsedTurn for items currently relevant to the narrator context.
        // We cannot reconstruct historical "usage" for old turns, so we at least make the current scene reflect "used now".
        this.interactionService.markNarratorContextAsUsed(this.currentSession);
        await this.worldStateService.saveSession(this.currentSession);
        
        // Render main RPG interface
        this.renderMainInterface();
    }

    private removeStaleRollbackIds(session: RPGGameSession): void {
        for (const msg of session.conversationHistory) {
            if (msg.role === 'assistant' && msg.preTurnRollbackId) {
                delete msg.preTurnRollbackId;
            }
        }
    }

    private removeSessionBriefLore(session: RPGGameSession): void {
        const worldState = session.worldState;
        for (const lore of this.worldStateService.listLore(worldState)) {
            if (lore.title === 'Session Brief (Initial Setup)' || lore.tags.includes('initial_setup')) {
                this.worldStateService.deleteLore(worldState, lore.id);
            }
        }
    }

    private removeAutoFirstAppearanceLore(session: RPGGameSession): void {
        const worldState = session.worldState;
        for (const lore of this.worldStateService.listLore(worldState)) {
            if (lore.tags.includes('first_appearance') || lore.tags.includes('first_mention')) {
                this.worldStateService.deleteLore(worldState, lore.id);
            }
        }
    }

    private async attachCheckpointsFromSnapshots(session: RPGGameSession): Promise<void> {
        const storage = await StorageService.getInstance();
        const allSnapshots = await storage.listRPGSnapshots<{ id: string; timestamp: number; conversationTurn: number }>();
        const sessionSnapshots = allSnapshots
            .filter(s => s.id.includes(session.id))
            .sort((a, b) => a.conversationTurn - b.conversationTurn);

        const byTurn = new Map<number, string>();
        for (const s of sessionSnapshots) {
            byTurn.set(s.conversationTurn, s.id);
        }

        // Initial (turn 0): assistant message at index 0
        const initialId = byTurn.get(0);
        if (initialId) {
            const msg0 = session.conversationHistory[0];
            if (msg0 && msg0.role === 'assistant') {
                msg0.checkpointSnapshotId = initialId;
            }
        }

        // Turn N assistant message is at index 1 + N*2
        for (const [turn, snapshotId] of byTurn.entries()) {
            if (turn === 0) continue;
            const idx = 1 + (turn * 2);
            const msg = session.conversationHistory[idx];
            if (msg && msg.role === 'assistant') {
                msg.checkpointSnapshotId = snapshotId;
            }
        }

        // Rebuild snapshot list from checkpoints
        const ids: string[] = [];
        for (const msg of session.conversationHistory) {
            if (msg.role === 'assistant' && msg.checkpointSnapshotId) {
                ids.push(msg.checkpointSnapshotId);
            }
        }
        const seen = new Set<string>();
        session.snapshots = ids.filter(id => (seen.has(id) ? false : (seen.add(id), true)));
    }
    
    /**
     * Render the main RPG interface
     */
    private renderMainInterface(): void {
        if (!this.currentSession) return;

        const narratorPurpose = this.currentSession.narratorPurpose;
        const parserPurpose = this.currentSession.parserPurpose;
        
        const html = `
            <div class="rpg-main-interface">
                <div class="rpg-header">
                    <h2>${this.currentSession.title}</h2>
                    <div class="rpg-header-actions">
                        <select id="rpg-header-narrator-purpose" class="rpg-header-select" title="Narrator model purpose">
                            ${this.MODEL_PURPOSES.map(p => `
                                <option value="${p.key}" ${p.key === narratorPurpose ? 'selected' : ''}>${p.label}</option>
                            `).join('')}
                        </select>
                        <select id="rpg-header-parser-purpose" class="rpg-header-select" title="Analyzer (parser) model purpose">
                            ${this.MODEL_PURPOSES.map(p => `
                                <option value="${p.key}" ${p.key === parserPurpose ? 'selected' : ''}>${p.label}</option>
                            `).join('')}
                        </select>
                        <button id="rpg-save-game-btn" type="button">Save</button>
                        <button id="rpg-restore-game-btn" type="button">Restore</button>
                        <button id="rpg-close-btn" type="button">Close</button>
                    </div>
                </div>
                <div class="rpg-content">
                    <div class="rpg-left-panel">
                        <div id="rpg-conversation-container"></div>
                    </div>
                    <div class="rpg-right-panel">
                        <div id="rpg-world-inspector-container"></div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.container.style.display = 'flex';
        
        // Initialize sub-components
        const conversationContainer = this.container.querySelector('#rpg-conversation-container') as HTMLElement;
        const worldInspectorContainer = this.container.querySelector('#rpg-world-inspector-container') as HTMLElement;
        
        // Create world inspector first (needed by conversation panel for debug mode)
        this.worldInspector = new RPGWorldInspector(
            worldInspectorContainer,
            this.currentSession,
            this.worldStateService,
            this.interactionService
        );
        
        this.conversationPanel = new RPGConversationPanel(
            conversationContainer,
            this.currentSession,
            this.interactionService,
            this.worldInspector,
            () => { this.onConversationUpdate(); }
        );
        
        // Save/Restore buttons
        const narratorSelect = this.container.querySelector('#rpg-header-narrator-purpose') as HTMLSelectElement | null;
        narratorSelect?.addEventListener('change', () => {
            if (!this.currentSession) return;
            this.currentSession.narratorPurpose = narratorSelect.value;
            this.currentSession.updatedAt = Date.now();
            void this.worldStateService.saveSession(this.currentSession);
            console.log(`🎭 Narrator purpose set to: ${this.currentSession.narratorPurpose}`);
        });

        const parserSelect = this.container.querySelector('#rpg-header-parser-purpose') as HTMLSelectElement | null;
        parserSelect?.addEventListener('change', () => {
            if (!this.currentSession) return;
            this.currentSession.parserPurpose = parserSelect.value;
            this.currentSession.updatedAt = Date.now();
            void this.worldStateService.saveSession(this.currentSession);
            console.log(`🧪 Parser purpose set to: ${this.currentSession.parserPurpose}`);
        });

        const saveBtn = this.container.querySelector('#rpg-save-game-btn');
        saveBtn?.addEventListener('click', () => {
            void this.saveGame();
        });

        const restoreBtn = this.container.querySelector('#rpg-restore-game-btn');
        restoreBtn?.addEventListener('click', () => {
            this.showRestoreOverlay();
        });

        // Close button
        const closeBtn = this.container.querySelector('#rpg-close-btn');
        closeBtn?.addEventListener('click', () => {
            this.close();
        });
    }

    private async saveGame(): Promise<void> {
        if (!this.currentSession) return;
        await this.interactionService.createManualSave(this.currentSession);
        alert('Game saved.');
    }

    private showRestoreOverlay(): void {
        if (!this.currentSession) return;

        const saves = [...this.currentSession.manualSaves].sort((a, b) => b.createdAt - a.createdAt);
        const itemsHtml = saves.length === 0
            ? '<div class="rpg-save-empty">No saved games yet.</div>'
            : saves.map(s => `
                <div class="rpg-save-item">
                    <div class="rpg-save-title">Turn ${s.conversationTurn} — ${this.escapeHtml(s.locationName)}</div>
                    <div class="rpg-save-meta">${new Date(s.createdAt).toLocaleString()}</div>
                    <button class="rpg-save-restore-btn" type="button" data-save-id="${s.id}">Restore</button>
                </div>
            `).join('');

        const overlay = document.createElement('div');
        overlay.className = 'rpg-save-overlay';
        overlay.innerHTML = `
            <div class="rpg-save-modal" role="dialog" aria-modal="true">
                <div class="rpg-save-modal-header">
                    <h3>Restore saved game</h3>
                    <button class="rpg-save-close-btn" type="button">Close</button>
                </div>
                <div class="rpg-save-list">
                    ${itemsHtml}
                </div>
            </div>
        `;

        const close = () => {
            overlay.remove();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const closeBtn = overlay.querySelector('.rpg-save-close-btn') as HTMLButtonElement | null;
        closeBtn?.addEventListener('click', close);

        const restoreButtons = overlay.querySelectorAll('.rpg-save-restore-btn');
        restoreButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const saveId = (btn as HTMLElement).getAttribute('data-save-id');
                if (!saveId) {
                    throw new Error('Restore clicked but save id missing.');
                }
                void this.restoreSavedGame(saveId, close);
            });
        });

        this.container.appendChild(overlay);
    }

    private async restoreSavedGame(saveId: string, onClose: () => void): Promise<void> {
        if (!this.currentSession) return;
        if (!confirm('Restore this saved game? Current progress after this point will be lost.')) return;

        await this.interactionService.restoreManualSaveIntoSession(this.currentSession, saveId);
        this.conversationPanel?.refresh();
        this.worldInspector?.refresh();
        onClose();
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    /**
     * Called when conversation is updated
     */
    private onConversationUpdate(): void {
        // Refresh world inspector
        this.worldInspector?.refresh();
    }
    
    /**
     * Delete a session (with confirmation)
     */
    private async deleteSession(sessionId: string): Promise<void> {
        // Find the session to get its title and snapshots
        const sessions = await this.loadSessions();
        const session = sessions.find(s => s.id === sessionId);
        const sessionTitle = session?.title ?? 'this session';
        
        // Confirm deletion
        const confirmed = confirm(`Are you sure you want to delete "${sessionTitle}"?\n\nThis action cannot be undone. All conversation history and snapshots will be deleted.`);
        
        if (!confirmed) {
            return;
        }
        
        try {
            const storage = await StorageService.getInstance();
            
            // Delete all snapshots for this session
            if (session && session.snapshots.length > 0) {
                for (const snapshotId of session.snapshots) {
                    await storage.deleteRPGSnapshot(snapshotId);
                }
                console.log(`🗑️ Deleted ${session.snapshots.length} snapshot(s) for session ${sessionId}`);
            }
            
            // Delete the session itself
            await storage.deleteRPGSession(sessionId);
            
            console.log(`🗑️ Deleted RPG session: ${sessionTitle} (${sessionId})`);
            
            // Reload the session selector
            const updatedSessions = await this.loadSessions();
            if (updatedSessions.length === 0) {
                // No sessions left, show new session dialog
                await this.showNewSessionDialog();
            } else {
                // Show updated session list
                await this.showSessionSelector(updatedSessions);
            }
            
        } catch (error) {
            console.error('Failed to delete session:', error);
            alert(`Failed to delete session: ${error instanceof Error ? error.message : error}`);
        }
    }
    
    /**
     * Close the RPG view
     */
    close(): void {
        this.container.innerHTML = '';
        this.container.style.display = 'none';
        this.currentSession = null;
        this.worldInspector = null;
        this.conversationPanel = null;
    }
}

/**
 * Open the RPG view in a modal
 */
export async function openRPGView(): Promise<void> {
    // Create modal container
    let container = document.getElementById('rpg-view-container') as HTMLElement;
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'rpg-view-container';
        container.className = 'rpg-modal-container';
        document.body.appendChild(container);
    }
    
    const view = new RPGView(container);
    await view.open();
}

