/**
 * RPG View - Main container for the RPG Mode interface
 * 
 * Contains:
 * - Conversation Panel (chat with Game LLM)
 * - World Inspector (Scene/World toggle, tree view)
 * - Snapshot Manager (save/load/rollback)
 */

import { RPGGameSession, RPGGameSessionSerialized, RPGConversationMessage, deserializeSession } from '../types/RPGTypes';
import { WorldStateService } from '../services/WorldStateService';
import { RPGContextBuilder } from '../services/RPGContextBuilder';
import { RPGStateParser } from '../services/RPGStateParser';
import { RPGInteractionService } from '../services/RPGInteractionService';
import { RPGConversationPanel } from './RPGConversationPanel';
import { RPGWorldInspector } from './RPGWorldInspector';
import { RPGSnapshotManager } from './RPGSnapshotManager';
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
    private conversationPanel: RPGConversationPanel | null = null;
    private worldInspector: RPGWorldInspector | null = null;
    private snapshotManager: RPGSnapshotManager | null = null;
    
    // Additional services needed for start setting parsing
    private openRouterClient: OpenRouterClient;
    
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
            console.log('🎲 Generating session setup from description...');
            
            // Get the session setup from the LLM
            const setup = await this.generateSessionSetup(adventureDescription);
            
            // Create initial world state
            const worldState = this.worldStateService.createEmptyWorldState();
            
            // Create starting location
            const locationId = 'loc_' + Date.now();
            this.worldStateService.createLocation(worldState, {
                id: locationId,
                name: setup.locationName,
                description: setup.locationDescription,
                state: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            // Create player character
            const playerId = 'player_' + Date.now();
            this.worldStateService.createCharacter(worldState, {
                id: playerId,
                name: setup.characterName,
                description: setup.characterDescription,
                state: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            // Create relationship: player located_at starting location
            this.worldStateService.createRelationship(worldState, {
                id: `rel_${playerId}_${locationId}`,
                fromId: playerId,
                toId: locationId,
                type: 'located_at',
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
                narratorPurpose,
                parserPurpose,
                ...(setup.systemPrompt && { customSystemPrompt: setup.systemPrompt }),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            // Parse setting description to extract additional entities
            if (setup.settingDescription) {
                await this.parseSettingDescription(session, setup.settingDescription);
            }
            
            // Generate initial GM message
            await this.generateInitialMessage(session, setup.settingDescription);
            
            // Save session
            await this.worldStateService.saveSession(session);
            
            // Load session
            await this.loadSession(session.id);
            
        } catch (error) {
            console.error('❌ Failed to create session:', error);
            alert(`Failed to create session: ${error instanceof Error ? error.message : error}`);
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
        characterDescription: string;
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
        
        // Call the creator model for session setup
        const response = await this.openRouterClient.chat('creator', prompt);
        
        console.log('📄 Session setup response received');
        console.log('📄 Response:', response);
        
        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response, 'text/xml');
        
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            console.error('❌ XML Parse Error:', parseError.textContent);
            console.error('Raw response:', response);
            throw new Error(`Failed to parse setup XML: ${parseError.textContent}`);
        }
        
        const root = xmlDoc.querySelector('rpg_session_setup');
        if (!root) {
            console.error('❌ Missing rpg_session_setup root in response');
            console.error('Raw response:', response);
            throw new Error('Invalid setup response: missing rpg_session_setup root');
        }
        
        const setup = {
            title: root.querySelector('title')?.textContent?.trim() || 'RPG Adventure',
            locationName: root.querySelector('location > name')?.textContent?.trim() || 'Starting Location',
            locationDescription: root.querySelector('location > description')?.textContent?.trim() || 'The adventure begins here.',
            characterName: root.querySelector('character > name')?.textContent?.trim() || 'Adventurer',
            characterDescription: root.querySelector('character > description')?.textContent?.trim() || 'The player character.',
            settingDescription: root.querySelector('setting > description')?.textContent?.trim() || '',
            systemPrompt: root.querySelector('system_prompt')?.textContent?.trim() || ''
        };
        
        console.log('✅ Parsed setup:', setup);
        
        return setup;
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
                'Parse the following setting description',
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
     * Generate initial GM message to set the stage
     */
    private async generateInitialMessage(session: RPGGameSession, settingDescription?: string): Promise<void> {
        console.log('📝 Generating initial GM message...');
        
        const activeProject = getActiveProject();
        if (!activeProject) return;
        
        const settingsManager = activeProject.getSettingsManager();
        
        try {
            // Build context for Game LLM
            const gameContext = this.contextBuilder.buildGameNarrationContext(session);
            
            // Get prompt template (use custom if provided)
            const systemPromptTemplate = session.customSystemPrompt || getPromptText('rpg_game_narration_system');
            
            // Expand prompt with context
            const expansionService = createRPGPromptExpansionService(settingsManager);
            const systemPrompt = expansionService.expandPrompt(systemPromptTemplate, gameContext);
            
            // Create an initial prompt for the GM
            const initialUserPrompt = settingDescription 
                ? `The game is starting. Set the stage by describing the initial scene and situation. Use the following setting as context:\n\n${settingDescription}`
                : 'The game is starting. Set the stage by describing the initial scene and welcoming the player to the adventure.';
            
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
        
        // Render main RPG interface
        this.renderMainInterface();
    }
    
    /**
     * Render the main RPG interface
     */
    private renderMainInterface(): void {
        if (!this.currentSession) return;
        
        const html = `
            <div class="rpg-main-interface">
                <div class="rpg-header">
                    <h2>${this.currentSession.title}</h2>
                    <button id="rpg-close-btn">Close</button>
                </div>
                <div class="rpg-content">
                    <div class="rpg-left-panel">
                        <div id="rpg-conversation-container"></div>
                    </div>
                    <div class="rpg-right-panel">
                        <div id="rpg-world-inspector-container"></div>
                        <div id="rpg-snapshot-manager-container"></div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.container.style.display = 'flex';
        
        // Initialize sub-components
        const conversationContainer = this.container.querySelector('#rpg-conversation-container') as HTMLElement;
        const worldInspectorContainer = this.container.querySelector('#rpg-world-inspector-container') as HTMLElement;
        const snapshotManagerContainer = this.container.querySelector('#rpg-snapshot-manager-container') as HTMLElement;
        
        // Create world inspector first (needed by conversation panel for debug mode)
        this.worldInspector = new RPGWorldInspector(
            worldInspectorContainer,
            this.currentSession,
            this.worldStateService
        );
        
        this.conversationPanel = new RPGConversationPanel(
            conversationContainer,
            this.currentSession,
            this.interactionService,
            this.worldInspector,
            () => this.onConversationUpdate()
        );
        
        this.snapshotManager = new RPGSnapshotManager(
            snapshotManagerContainer,
            this.currentSession,
            this.worldStateService,
            () => this.onSnapshotRestore()
        );
        
        // Close button
        const closeBtn = this.container.querySelector('#rpg-close-btn');
        closeBtn?.addEventListener('click', () => {
            this.close();
        });
    }
    
    /**
     * Called when conversation is updated
     */
    private onConversationUpdate(): void {
        // Refresh world inspector
        this.worldInspector?.refresh();
        this.snapshotManager?.refresh();
    }
    
    /**
     * Called when a snapshot is restored
     */
    private onSnapshotRestore(): void {
        // Refresh all components
        this.conversationPanel?.refresh();
        this.worldInspector?.refresh();
        this.snapshotManager?.refresh();
    }
    
    /**
     * Delete a session (with confirmation)
     */
    private async deleteSession(sessionId: string): Promise<void> {
        // Find the session to get its title and snapshots
        const sessions = await this.loadSessions();
        const session = sessions.find(s => s.id === sessionId);
        const sessionTitle = session?.title || 'this session';
        
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
        this.conversationPanel = null;
        this.worldInspector = null;
        this.snapshotManager = null;
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

