/**
 * XML Story Creation Modal
 * 
 * Provides a collaborative story creation interface with XML-enabled chat
 * and visual story whiteboard following the existing modal patterns.
 */

import { BaseModal } from './core/BaseModal';
import type { ModalConfig, ModalHooks } from './types/ModalTypes';
import { SettingsManager } from '../../SettingsManager';
import { OpenRouterClient } from '../../OpenRouterClient';
import { createXMLStorySystem } from '../../xml-story-creation';
import type { StoryElement, StoryElementType, XMLStoryEvent } from '../../xml-story-creation';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { ModelSelector } from '../../ModelSelector';
import { StorageService } from '../../StorageService';
import { UniversalTextEditor } from '../components/UniversalTextEditor';
import { ProjectManager } from '../../ProjectManager';
import { 
    getOrchestrator, 
    getSettingsManager, 
    getOpenRouterClient, 
    getTemplateManager,
    addProject,
    setActiveProject
} from '../../state';

const XML_STORY_MODEL_STORAGE_KEY = 'xml-story-selected-model';
const XML_STORY_CONVERSATION_STORAGE_KEY = 'xml-story-conversation-history';
const XML_STORY_WHITEBOARD_STORAGE_KEY = 'xml-story-whiteboard-state';

export interface XMLStoryModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    modelSelector: ModelSelector;
}

export class XMLStoryModal extends BaseModal {
    private settingsManager: SettingsManager;
    private openRouterClient: OpenRouterClient;
    private storySystem: ReturnType<typeof createXMLStorySystem>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    
    // UI elements
    private whiteboardContainer: HTMLElement | null = null;
    private messageInput: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private modelSelector: HTMLSelectElement | null = null;
    private messagesContainer: HTMLElement | null = null;
    private titleInput: HTMLInputElement | null = null;
    private templateSelector: HTMLSelectElement | null = null;
    
    // State
    private isGenerating = false;
    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
    private isEditing = false;
    
    // Story element editors
    private elementEditors = new Map<string, UniversalTextEditor>();

    constructor(config: XMLStoryModalConfig, hooks: ModalHooks = {}) {
        console.log('🏗️ XMLStoryModal constructor called with config:', config);
        super({
            width: '95vw',
            height: '95vh',
            maxWidth: 'none',
            maxHeight: 'none',
            closable: true,
            backdrop: true,
            ...config
        }, hooks);
        
        this.settingsManager = config.settingsManager;
        this.openRouterClient = config.openRouterClient;
        
        // Initialize the XML story system
        this.storySystem = createXMLStorySystem({
            maxElementsPerSection: 20,
            autoSaveDelay: 2000,
            batchEditNotifications: true
        });
        
        // Listen for story system events
        this.storySystem.addEventListener(this.handleStoryEvent.bind(this));
    }

    public render(): HTMLElement {
        console.log('🎨 XMLStoryModal render() called');
        const container = document.createElement('div');
        container.className = 'xml-story-modal-container';
        container.innerHTML = `
            <style>
                .xml-story-modal-container {
                    display: flex;
                    height: 100%;
                    width: 100%;
                    font-family: system-ui, -apple-system, sans-serif;
                    background: #f7f7f8;
                    border-radius: 12px;
                    overflow: hidden;
                }
                
                .xml-story-sidebar {
                    width: 260px;
                    background: #171717;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid #333;
                    flex-shrink: 0;
                }
                
                .xml-story-main {
                    flex: 1;
                    display: flex;
                    min-width: 0;
                }
                
                .xml-story-chat {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: white;
                    border-right: 1px solid #e5e5e5;
                    min-width: 0;
                }
                
                .xml-story-whiteboard {
                    flex: 1;
                    background: #fafafa;
                    border-left: 1px solid #e5e5e5;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                
                .sidebar-header {
                    padding: 1rem;
                    border-bottom: 1px solid #333;
                }
                
                .sidebar-content {
                    flex: 1;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    overflow-y: auto;
                }
                
                .chat-header {
                    padding: 1rem;
                    border-bottom: 1px solid #e5e5e5;
                    background: white;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .project-info-row {
                    display: flex;
                    gap: 1rem;
                    align-items: end;
                }
                
                .title-section {
                    flex: 2;
                }
                
                .template-section {
                    flex: 1;
                }
                
                .title-input {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
                
                .title-input:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
                }
                
                .template-selector {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    background: white;
                }
                
                .chat-header-info {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .chat-input-area {
                    padding: 1rem;
                    border-top: 1px solid #e5e5e5;
                    background: white;
                }
                
                .whiteboard-header {
                    padding: 1rem;
                    border-bottom: 1px solid #e5e5e5;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .whiteboard-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                }
                
                .story-section {
                    margin-bottom: 1.5rem;
                }
                
                .story-section-header {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 0.5rem;
                    padding-bottom: 0.25rem;
                    border-bottom: 2px solid #e5e5e5;
                }
                
                .story-elements {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                
                .story-element {
                    border: 1px solid #e5e5e5;
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .story-element .universal-text-editor-wrapper {
                    border: none !important;
                    margin: 0 !important;
                    min-height: auto !important;
                    height: auto !important;
                }
                
                .story-element .universal-text-editor-wrapper textarea,
                .story-element .universal-text-editor-wrapper .text-editor-with-highlighting {
                    border: none !important;
                    border-radius: 0 !important;
                    padding: 8px 12px !important;
                    font-size: 13px !important;
                    line-height: 1.4 !important;
                    resize: vertical !important;
                    min-height: auto !important;
                    height: auto !important;
                    max-height: none !important;
                    flex-shrink: 0 !important;
                    overflow: visible !important;
                    display: block !important;
                }
                
                .story-element.highlight-new {
                    border-color: #4ade80;
                    background-color: #f0fdf4;
                }
                
                .story-element.highlight-updated {
                    border-color: #fbbf24;
                    background-color: #fffbeb;
                }
                
                .story-element.human-edited {
                    border-color: #06b6d4;
                    background-color: #f0f9ff;
                }
                
                .message {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .message-user {
                    align-items: flex-end;
                }
                
                .message-assistant {
                    align-items: flex-start;
                }
                
                .message-content {
                    max-width: 80%;
                    padding: 1rem;
                    border-radius: 12px;
                    line-height: 1.5;
                }
                
                .message-user .message-content {
                    background: #007bff;
                    color: white;
                }
                
                .message-assistant .message-content {
                    background: #f1f1f1;
                    color: #333;
                }
                
                .input-wrapper {
                    display: flex;
                    gap: 0.5rem;
                    align-items: flex-end;
                }
                
                .message-input {
                    flex: 1;
                    min-height: 60px;
                    max-height: 120px;
                    padding: 0.75rem;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    resize: none;
                    font-family: inherit;
                }
                
                .send-button {
                    padding: 0.75rem 1.5rem;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                }
                
                .send-button:hover:not(:disabled) {
                    background: #0056b3;
                }
                
                .send-button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .model-selector {
                    padding: 0.5rem;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    background: white;
                    font-size: 0.9rem;
                }
                
                .element-section {
                    margin-bottom: 1.5rem;
                }
                
                .element-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                    border-bottom: 1px solid #ddd;
                    margin-bottom: 0.75rem;
                    cursor: pointer;
                }
                
                .element-section-title {
                    font-weight: 600;
                    color: #333;
                }
                
                .element-count {
                    background: #007bff;
                    color: white;
                    padding: 0.25rem 0.5rem;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    min-width: 20px;
                    text-align: center;
                }
                
                .element-card {
                    background: white;
                    border: 1px solid #e5e5e5;
                    border-radius: 8px;
                    padding: 0.75rem;
                    margin-bottom: 0.5rem;
                    position: relative;
                    transition: all 0.2s ease;
                }
                
                .element-card:hover {
                    border-color: #007bff;
                    box-shadow: 0 2px 8px rgba(0,123,255,0.1);
                }
                
                .element-card.highlight-new {
                    border-color: #28a745;
                    box-shadow: 0 2px 8px rgba(40,167,69,0.2);
                }
                
                .element-card.highlight-updated {
                    border-color: #007bff;
                    box-shadow: 0 2px 8px rgba(0,123,255,0.2);
                }
                
                .element-card.human-edited {
                    border-color: #fd7e14;
                    box-shadow: 0 2px 8px rgba(253,126,20,0.2);
                }
                
                .element-name {
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 0.25rem;
                    cursor: pointer;
                }
                
                .element-description {
                    color: #666;
                    font-size: 0.9rem;
                    line-height: 1.4;
                    cursor: pointer;
                    /* Allow text to wrap naturally */
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    /* Show first few lines with clean truncation */
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                
                

                .element-content {
                    display: flex;
                    align-items: stretch;
                    position: relative;
                    width: 100%;
                }

                .element-content > div:first-child {
                    flex: 1;
                    min-width: 0;
                    margin-right: 4rem;
                }

                .element-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    position: absolute;
                    right: 2px;
                    top: 2px;
                    z-index: 10;
                }

                .element-actions .element-action-btn {
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    border: none !important;
                    border-radius: 3px !important;
                    cursor: pointer;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    font-family: system-ui, -apple-system, sans-serif !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.2s ease;
                    opacity: 0.6;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    line-height: 1 !important;
                    padding: 0 !important;
                    margin: 0 !important;
                }

                .story-element:hover .element-actions .element-action-btn {
                    opacity: 0.8;
                }

                .element-actions .element-action-btn:hover {
                    opacity: 1 !important;
                    transform: scale(1.15) !important;
                }

                .element-actions .delete-btn {
                    background: rgba(220, 53, 69, 0.9);
                    color: white;
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    border-radius: 3px !important;
                    padding: 0 !important;
                    border: none !important;
                }

                .element-actions .delete-btn:hover {
                    background: #dc3545 !important;
                    transform: scale(1.15) !important;
                }

                .element-actions .move-up-btn {
                    background: rgba(0, 123, 255, 0.9);
                    color: white;
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    border-radius: 3px !important;
                    padding: 0 !important;
                    border: none !important;
                }

                .element-actions .move-up-btn:hover {
                    background: #007bff !important;
                    transform: scale(1.15) !important;
                }

                .element-actions .move-down-btn {
                    background: rgba(0, 123, 255, 0.9);
                    color: white;
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    border-radius: 3px !important;
                    padding: 0 !important;
                    border: none !important;
                }

                .element-actions .move-down-btn:hover {
                    background: #007bff !important;
                    transform: scale(1.15) !important;
                }

                .story-section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: relative;
                }

                .add-element-btn {
                    background: rgba(40, 167, 69, 0.9);
                    color: white;
                    width: 1.4rem !important;
                    height: 1.4rem !important;
                    font-size: 1rem !important;
                    font-weight: bold !important;
                    border-radius: 50% !important;
                    padding: 0 !important;
                    border: none !important;
                    margin: 0 !important;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    opacity: 0.8;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }

                .add-element-btn:hover {
                    background: #28a745 !important;
                    opacity: 1 !important;
                    transform: scale(1.15) !important;
                }

                .element-badge {
                    position: absolute;
                    top: 0.5rem;
                    right: 2rem;
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                
                .badge-new {
                    background: #28a745;
                    color: white;
                }
                
                .badge-updated {
                    background: #007bff;
                    color: white;
                }
                
                .badge-edited {
                    background: #fd7e14;
                    color: white;
                }
                
                .loading-spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .sidebar-button {
                    width: 100%;
                    padding: 0.75rem;
                    background: #333;
                    color: white;
                    border: 1px solid #555;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    font-size: 0.9rem;
                }
                
                .sidebar-button:hover {
                    background: #444;
                }
                
                .sidebar-button.primary {
                    background: #007bff;
                    border-color: #0056b3;
                }
                
                .sidebar-button.primary:hover {
                    background: #0056b3;
                }
            </style>

            <!-- Sidebar -->
            <div class="xml-story-sidebar">
                <div class="sidebar-header">
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">XML Story Creator</h3>
                </div>
                <div class="sidebar-content">
                    <div>
                        <label style="display: block; font-size: 0.9rem; margin-bottom: 0.5rem; color: #ccc;">Model:</label>
                        <select id="xml-story-model-selector" class="model-selector" style="width: 100%; background: #333; color: white; border-color: #555;">
                            <option value="creator">Creator</option>
                            <option value="editor">Editor</option>
                            <option value="rater">Rater</option>
                            <option value="prose">Prose</option>
                        </select>
                    </div>
                    
                    <button id="clear-story-btn" class="sidebar-button">
                        🗑️ Clear Story
                    </button>
                    
                    <button id="export-story-btn" class="sidebar-button primary">
                        📤 Export Story
                    </button>
                    
                    <button id="create-project-btn" class="sidebar-button primary">
                        🚀 Create Project
                    </button>
                    
                    <div style="border-top: 1px solid #444; margin: 0.5rem 0; padding-top: 1rem;">
                        <div style="font-size: 0.8rem; color: #aaa; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">
                            XML Tags Available
                        </div>
                        <div style="font-size: 0.8rem; color: #ccc; line-height: 1.4;">
                            <div>&lt;character name="..." description="..." /&gt;</div>
                            <div>&lt;location name="..." description="..." /&gt;</div>
                            <div>&lt;item name="..." description="..." /&gt;</div>
                            <div>&lt;plot_point description="..." /&gt;</div>
                            <div>&lt;context description="..." /&gt;</div>
                            <div>&lt;/refresh&gt;</div>
                        </div>
                    </div>
                    
                    <div style="font-size: 0.8rem; color: #888; line-height: 1.4; margin-top: auto;">
                        <p><strong>How it works:</strong></p>
                        <p>Chat naturally about your story. The AI will use XML tags to create story elements that appear on the whiteboard. You can edit any element by clicking on it.</p>
                    </div>
                </div>
            </div>

            <!-- Main Content Area -->
            <div class="xml-story-main">
                <!-- Chat Area -->
                <div class="xml-story-chat">
                    <div class="chat-header">
                        <div class="project-info-row">
                            <div class="title-section">
                                <label style="display: block; font-size: 0.8rem; margin-bottom: 0.25rem; color: #666; font-weight: 500;">Project Title:</label>
                                <input 
                                    id="xml-story-title" 
                                    type="text" 
                                    value="New Project" 
                                    class="title-input"
                                    placeholder="Enter project title..."
                                />
                            </div>
                            <div class="template-section">
                                <label style="display: block; font-size: 0.8rem; margin-bottom: 0.25rem; color: #666; font-weight: 500;">Template:</label>
                                <select id="xml-story-template-selector" class="template-selector">
                                    <option value="">Loading templates...</option>
                                </select>
                            </div>
                        </div>
                        <div class="chat-header-info">
                            <h4 style="margin: 0; color: #333;">Story Development Chat</h4>
                            <div style="font-size: 0.9rem; color: #666;">
                                AI will create story elements as you chat
                            </div>
                        </div>
                    </div>
                    
                    <div id="xml-story-messages" class="chat-messages">
                        <div class="message message-assistant">
                            <div class="message-content">
                                Hi! I'm ready to help you create an amazing story. Just start telling me about your story idea, and I'll help you develop characters, locations, plot points, and more. 
                                
                                As we chat, I'll automatically create story elements that will appear on the whiteboard on the right. You can edit any of these elements by clicking on them.
                                
                                What kind of story would you like to create?
                            </div>
                        </div>
                    </div>
                    
                    <div class="chat-input-area">
                        <div class="input-wrapper">
                            <textarea 
                                id="xml-story-message-input" 
                                class="message-input" 
                                placeholder="Tell me about your story idea..."
                                rows="2"
                            ></textarea>
                            <button id="xml-story-send-btn" class="send-button">
                                Send
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Whiteboard Area -->
                <div class="xml-story-whiteboard">
                    <div class="whiteboard-header">
                        <h4 style="margin: 0; color: #333;">Story Elements</h4>
                        <div style="font-size: 0.9rem; color: #666;">
                            Click to edit
                        </div>
                    </div>
                    
                    <div id="xml-story-whiteboard-content" class="whiteboard-content">
                        <div style="text-align: center; color: #999; padding: 2rem; font-style: italic;">
                            Story elements will appear here as you chat with the AI
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Store references to key elements
        this.whiteboardContainer = container.querySelector('#xml-story-whiteboard-content');
        this.messageInput = container.querySelector('#xml-story-message-input');
        this.sendButton = container.querySelector('#xml-story-send-btn');
        this.modelSelector = container.querySelector('#xml-story-model-selector');
        this.messagesContainer = container.querySelector('#xml-story-messages');
        this.titleInput = container.querySelector('#xml-story-title');
        this.templateSelector = container.querySelector('#xml-story-template-selector');

        // Set up event listeners
        this.setupEventListeners(container);

        return container;
    }

    private setupEventListeners(container: HTMLElement): void {
        // Send message button
        this.sendButton?.addEventListener('click', () => {
            void this.sendMessage();
        });

        // Enter key to send (Shift+Enter for new line)
        this.messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });

        // Clear story button
        const clearBtn = container.querySelector('#clear-story-btn');
        clearBtn?.addEventListener('click', () => {
            this.clearStory();
        });

        // Export story button
        const exportBtn = container.querySelector('#export-story-btn');
        exportBtn?.addEventListener('click', () => {
            this.exportStory();
        });

        // Create project button
        const createProjectBtn = container.querySelector('#create-project-btn');
        createProjectBtn?.addEventListener('click', () => {
            void this.createProject();
        });

        // Template selector initialization and persistence
        void this.loadTemplates();

        // Model selector with persistence
        void this.loadSavedModelSelection();
        this.modelSelector?.addEventListener('change', () => {
            void this.saveModelSelection();
        });

        // Load saved conversation history and whiteboard state
        void this.loadSavedConversation();
        void this.loadSavedWhiteboard();
    }

    private async sendMessage(): Promise<void> {
        if (!this.messageInput || this.isGenerating) return;

        const message = this.messageInput.value.trim();
        if (!message) return;

        // Clear input and disable sending
        this.messageInput.value = '';
        this.setGenerating(true);

        // Add user message to chat
        this.addMessageToChat('user', message);

        try {
            // Clear AI highlights (simulates user interaction)
            this.storySystem.clearHighlights();

            // Get context for AI
            const currentWhiteboard = this.formatWhiteboardForAI();
            const humanEdits = this.formatHumanEditsForAI();

            // Create system and user prompts using PromptExpansionService
            const prompts = this.settingsManager.getPrompts();
            const expansionService = createPromptExpansionService(this.settingsManager);
            
            const systemPromptContext = {
                project: {
                    language: this.settingsManager.getLanguage()
                }
            };
            
            const userPromptContext = {
                custom: {
                    current_whiteboard: currentWhiteboard,
                    human_edits: humanEdits
                }
            };
            
            const systemPrompt = await expansionService.expandPromptAsync(
                prompts.xml_story_creation_system, 
                systemPromptContext
            );

            // Create user prompt with current context
            const userPrompt = await expansionService.expandPromptAsync(
                prompts.xml_story_creation_user, 
                userPromptContext
            );

            // Add user message to conversation history BEFORE the AI call
            this.conversationHistory.push({ role: 'user', content: `${userPrompt}\n\nUser: ${message}` });
            
            // Save conversation after adding user message
            void this.saveConversation();

            // Prepare conversation with persistent system prompt
            const conversation = [
                { role: 'system' as const, content: systemPrompt },
                ...this.conversationHistory
            ];

            // Get selected model
            const modelPurpose = this.modelSelector?.value || 'creator';

            // Send to AI
            let response = '';
            await this.openRouterClient.streamingChat(modelPurpose, conversation, {
                onChunk: (chunk: string) => {
                    response += chunk;
                },
                onComplete: () => {},
                onError: (error: Error) => {
                    throw error;
                }
            });

            if (response) {
                // Process AI response through XML system
                const parseResult = await this.storySystem.processAIResponse(response);

                // Add AI message to chat (cleaned text without XML)
                this.addMessageToChat('assistant', parseResult.cleanedText);

                // Add AI response to conversation history
                this.conversationHistory.push({ role: 'assistant', content: parseResult.cleanedText });
                
                // Save conversation after adding AI response
                void this.saveConversation();

                // Update whiteboard
                this.updateWhiteboard();

                // Show any errors
                if (parseResult.errors.length > 0) {
                    console.warn('XML parsing errors:', parseResult.errors);
                }
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessageToChat('assistant', 'Sorry, I encountered an error. Please try again.');
        } finally {
            this.setGenerating(false);
        }
    }

    private addMessageToChat(role: 'user' | 'assistant', content: string): void {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private setGenerating(generating: boolean): void {
        this.isGenerating = generating;
        
        if (this.sendButton) {
            this.sendButton.disabled = generating;
            this.sendButton.innerHTML = generating 
                ? '<span class="loading-spinner"></span> Generating...'
                : 'Send';
        }
        
        if (this.messageInput) {
            this.messageInput.disabled = generating;
        }
    }

    private updateWhiteboard(): void {
        if (!this.whiteboardContainer) return;

        // Always preserve message input focus state
        const shouldRestoreFocus = this.messageInput && document.activeElement === this.messageInput;
        const cursorPosition = shouldRestoreFocus ? this.messageInput?.selectionStart : null;

        // Get all elements and separate by type (no sorting - use natural list order)
        const allElements = this.storySystem.service.getElementsForContext();
        const outlineElements = allElements.filter((el: StoryElement) => el.type === 'outline');
        const contextElements = allElements.filter((el: StoryElement) => el.type === 'context');
        
        // Always show headers with + buttons, even if empty
        if (outlineElements.length === 0 && contextElements.length === 0) {
            this.whiteboardContainer.innerHTML = `
                <div class="story-section">
                    <div class="story-section-header">
                        <span>Outline</span>
                        <button class="add-element-btn" data-add-type="outline" title="Add Outline Item">+</button>
                    </div>
                    <div class="story-elements">
                        <div style="color: #999; padding: 1rem; font-style: italic; text-align: center;">
                            No outline items yet. Click + to add one or chat with AI.
                        </div>
                    </div>
                </div>
                <div class="story-section">
                    <div class="story-section-header">
                        <span>Context</span>
                        <button class="add-element-btn" data-add-type="context" title="Add Context Item">+</button>
                    </div>
                    <div class="story-elements">
                        <div style="color: #999; padding: 1rem; font-style: italic; text-align: center;">
                            No context items yet. Click + to add one or chat with AI.
                        </div>
                    </div>
                </div>
            `;
            
            // Add event listeners for the + buttons
            this.addPlusButtonListeners();
            return;
        }

        // Clear existing editors
        this.elementEditors.forEach(editor => editor.destroy());
        this.elementEditors.clear();

        let html = '';

        // Outline section (always show header)
        html += `
            <div class="story-section">
                <div class="story-section-header">
                    <span>Outline</span>
                    <button class="add-element-btn" data-add-type="outline" title="Add Outline Item">+</button>
                </div>
                <div class="story-elements">
        `;

        if (outlineElements.length > 0) {
            for (const element of outlineElements) {
                html += this.renderElementEditor(element);
            }
        } else {
            html += `
                <div style="color: #999; padding: 1rem; font-style: italic; text-align: center;">
                    No outline items yet. Click + to add one or chat with AI.
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        // Context section (always show header)
        html += `
            <div class="story-section">
                <div class="story-section-header">
                    <span>Context</span>
                    <button class="add-element-btn" data-add-type="context" title="Add Context Item">+</button>
                </div>
                <div class="story-elements">
        `;

        if (contextElements.length > 0) {
            for (const element of contextElements) {
                html += this.renderElementEditor(element);
            }
        } else {
            html += `
                <div style="color: #999; padding: 1rem; font-style: italic; text-align: center;">
                    No context items yet. Click + to add one or chat with AI.
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        this.whiteboardContainer.innerHTML = html;

        // Initialize UniversalTextEditor instances
        this.initializeElementEditors();
        
        // Add event listeners for + buttons
        this.addPlusButtonListeners();

        // Always restore focus to message input after whiteboard update
        setTimeout(() => {
            if (this.messageInput) {
                this.messageInput.focus();
                if (cursorPosition !== null) {
                    this.messageInput.setSelectionRange(cursorPosition ?? 0, cursorPosition ?? 0);
                }
            }
        }, 0);
    }



    private renderElementEditor(element: StoryElement): string {
        let elementClasses = 'story-element';

        if (element.isNewFromAI) {
            elementClasses += ' highlight-new';
        } else if (element.isUpdatedByAI) {
            elementClasses += ' highlight-updated';
        } else if (element.isHumanEdited) {
            elementClasses += ' human-edited';
        }

        return `
            <div class="${elementClasses}" data-element-id="${element.id}">
                <div class="element-content">
                    <div id="editor-${element.id}"></div>
                    <div class="element-actions">
                        <button class="element-action-btn delete-btn" data-action="delete" data-element-id="${element.id}" title="Delete">×</button>
                        <button class="element-action-btn move-up-btn" data-action="move-up" data-element-id="${element.id}" title="Move Up">↑</button>
                        <button class="element-action-btn move-down-btn" data-action="move-down" data-element-id="${element.id}" title="Move Down">↓</button>
                    </div>
                </div>
            </div>
        `;
    }

    private initializeElementEditors(): void {
        if (!this.whiteboardContainer) return;

        const editorContainers = this.whiteboardContainer.querySelectorAll('[data-element-id]');
        
        editorContainers.forEach(container => {
            const elementId = container.getAttribute('data-element-id');
            if (!elementId) return;

            const element = this.storySystem.service.getElement(elementId);
            if (!element) return;

            const editorContainer = container.querySelector(`#editor-${elementId}`) as HTMLElement;
            if (!editorContainer) return;

            // Use the description directly (it now contains everything including name/title)
            const content = element.description;

            const editor = new UniversalTextEditor(
                editorContainer,
                {
                    placeholder: element.type === 'outline' ? 'Outline part...' : 'Context item...',
                    mode: 'enhanced',
                    rows: 1,
                    autoResize: false
                }
            );

            // Set initial content
            editor.setText(content);

            // Handle changes
            editor.addEventListener('input', () => {
                this.handleElementEdit(elementId, editor.getText());
            });

            this.elementEditors.set(elementId, editor);

            // Add event listeners for action buttons
            const actionButtons = container.querySelectorAll('.element-action-btn');
            actionButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const action = button.getAttribute('data-action');
                    const targetElementId = button.getAttribute('data-element-id');
                    
                    if (!action || !targetElementId) return;
                    
                    this.handleElementAction(action, targetElementId);
                });
            });
        });
    }

    private async handleElementEdit(elementId: string, newContent: string): Promise<void> {
        const element = this.storySystem.service.getElement(elementId);
        if (!element || this.isEditing) return;

        this.isEditing = true;

        try {
            // Update description (which now contains everything)
            if (newContent !== element.description) {
                await this.storySystem.service.handleHumanEdit(elementId, newContent);
            }

            // Save changes
            await this.saveWhiteboard();
        } catch (error) {
            console.error('Error updating element:', error);
        } finally {
            this.isEditing = false;
        }
    }

    private async handleElementAction(action: string, elementId: string): Promise<void> {
        try {
            switch (action) {
                case 'delete':
                    await this.deleteElement(elementId);
                    break;
                case 'move-up':
                    await this.moveElementUp(elementId);
                    break;
                case 'move-down':
                    await this.moveElementDown(elementId);
                    break;
                default:
                    console.warn('Unknown element action:', action);
            }
        } catch (error) {
            console.error(`Error handling element action ${action}:`, error);
        }
    }

    private async deleteElement(elementId: string): Promise<void> {
        if (!confirm('Are you sure you want to delete this element?')) {
            return;
        }

        try {
            await this.storySystem.service.deleteElement(elementId);
            this.updateWhiteboard();
            await this.saveWhiteboard();
        } catch (error) {
            console.error('Error deleting element:', error);
        }
    }

    private async moveElementUp(elementId: string): Promise<void> {
        const element = this.storySystem.service.getElement(elementId);
        if (!element) return;

        // Get the element IDs array for this type
        const elementsByType = this.storySystem.service.getWhiteboardState().elementsByType;
        const elementIds = elementsByType.get(element.type);
        if (!elementIds) return;

        const currentIndex = elementIds.indexOf(elementId);
        if (currentIndex <= 0) {
            return; // Already at top or not found
        }

        // Swap with previous element in the array
        [elementIds[currentIndex - 1]!, elementIds[currentIndex]!] = [elementIds[currentIndex]!, elementIds[currentIndex - 1]!];

        // Update the service
        elementsByType.set(element.type, elementIds);

        this.updateWhiteboard();
        await this.saveWhiteboard();
    }

    private async moveElementDown(elementId: string): Promise<void> {
        const element = this.storySystem.service.getElement(elementId);
        if (!element) return;

        // Get the element IDs array for this type
        const elementsByType = this.storySystem.service.getWhiteboardState().elementsByType;
        const elementIds = elementsByType.get(element.type);
        if (!elementIds) return;

        const currentIndex = elementIds.indexOf(elementId);
        if (currentIndex >= elementIds.length - 1 || currentIndex === -1) {
            return; // Already at bottom or not found
        }

        // Swap with next element in the array
        [elementIds[currentIndex]!, elementIds[currentIndex + 1]!] = [elementIds[currentIndex + 1]!, elementIds[currentIndex]!];

        // Update the service
        elementsByType.set(element.type, elementIds);

        this.updateWhiteboard();
        await this.saveWhiteboard();
    }





    private formatWhiteboardForAI(): string {
        const elements = this.storySystem.service.getElementsForContext();
        if (elements.length === 0) {
            return 'No story elements created yet.';
        }

        const elementsByType = new Map<string, StoryElement[]>();
        elements.forEach((element: StoryElement) => {
            if (!elementsByType.has(element.type)) {
                elementsByType.set(element.type, []);
            }
            elementsByType.get(element.type)!.push(element);
        });

        let formatted = 'CURRENT STORY WHITEBOARD:\n\n';

        const typeNames = {
            'outline': 'OUTLINE',
            'context': 'CONTEXT'
        };

        for (const [type, typeName] of Object.entries(typeNames)) {
            const typeElements = elementsByType.get(type) || [];
            if (typeElements.length === 0) continue;

            formatted += `${typeName}:\n`;
            typeElements.forEach((element, index) => {
                const editFlag = element.isHumanEdited ? ' [HUMAN EDITED]' : '';
                formatted += `${index + 1}. [ID: ${element.id}] ${element.description}${editFlag}\n`;
            });
            formatted += '\n';
        }

        return formatted;
    }

    private formatHumanEditsForAI(): string {
        const pendingEdits = this.storySystem.service.getPendingHumanEdits();
        if (pendingEdits.length === 0) {
            return 'No recent human edits.';
        }

        let formatted = 'RECENT HUMAN EDITS:\n\n';
        pendingEdits.forEach((edit: any) => {
            formatted += `${edit.elementType.toUpperCase()} EDIT (${edit.elementId}):\n`;
            formatted += `- ${edit.field} changed from: "${edit.oldValue}"\n`;
            formatted += `- ${edit.field} changed to: "${edit.newValue}"\n\n`;
        });

        return formatted;
    }

    private handleStoryEvent(event: XMLStoryEvent): void {
        switch (event.type) {
            case 'element_created':
            case 'element_updated':
            case 'element_deleted':
                // These events require DOM rebuild (structural changes)
                this.updateWhiteboard();
                // Save whiteboard state after changes
                void this.saveWhiteboard();
                break;
            case 'human_edit':
                // Human edits only change content, not structure - no need to rebuild DOM
                // Just save the state without destroying/recreating editors
                void this.saveWhiteboard();
                break;
            case 'highlight_cleared':
                this.updateWhiteboard();
                break;
        }
    }

    private clearStory(): void {
        if (confirm('Are you sure you want to clear the entire story? This cannot be undone.')) {
            this.storySystem.reset();
            this.conversationHistory = [];
            
            // Clear saved data
            void this.clearSavedConversation();
            void this.clearSavedWhiteboard();
            
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = `
                    <div class="message message-assistant">
                        <div class="message-content">
                            Story cleared! Let's start creating a new story. What would you like to write about?
                        </div>
                    </div>
                `;
            }
            this.updateWhiteboard();
        }
    }

    private exportStory(): void {
        const state = this.storySystem.exportState();
        const exportData = {
            conversation: this.conversationHistory,
            storyElements: state,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `xml-story-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    /**
     * Load available templates into the template selector
     */
    private async loadTemplates(): Promise<void> {
        try {
            const templateManager = getTemplateManager();
            if (!templateManager) {
                console.warn('TemplateManager not available for template loading');
                return;
            }

            if (!this.templateSelector) return;

            const templateNames = templateManager.getTemplateNames();
            this.templateSelector.innerHTML = '';

            if (templateNames.length === 0) {
                this.templateSelector.innerHTML = '<option value="">No templates available</option>';
                return;
            }

            // Add default option
            this.templateSelector.innerHTML = '<option value="">Select a template...</option>';

            // Add template options
            for (const templateName of templateNames.sort()) {
                const option = document.createElement('option');
                option.value = templateName;
                option.textContent = templateName;
                this.templateSelector.appendChild(option);
            }

            // Select a good default (prioritize "Short Story")
            const defaultTemplate = templateNames.find((name: string) => 
                name.toLowerCase().includes('short story')
            ) || templateNames.find((name: string) => 
                name.toLowerCase().includes('story')
            ) || templateNames.find((name: string) => 
                name.toLowerCase().includes('novel') || 
                name.toLowerCase().includes('book')
            ) || templateNames[0];
            
            if (defaultTemplate) {
                this.templateSelector.value = defaultTemplate;
            }

        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    /**
     * Create a project from the current story elements
     */
    private async createProject(): Promise<void> {
        try {
            if (!this.titleInput || !this.templateSelector) {
                alert('Could not find title or template selector');
                return;
            }

            const title = this.titleInput.value.trim() || 'New Project';
            const templateName = this.templateSelector.value;

            if (!templateName) {
                alert('Please select a template for the project');
                return;
            }

            // Get template
            const templateManager = getTemplateManager();
            if (!templateManager) {
                alert('Template manager not available');
                return;
            }

            const template = templateManager.getTemplate(templateName);
            if (!template) {
                alert(`Template "${templateName}" not found`);
                return;
            }

            // Get story elements
            const storyElements = this.storySystem.service.getElementsForContext();
            
            // Aggregate outline items (in order)
            const outlineElements = storyElements.filter(el => el.type === 'outline');
            const outlineContent = outlineElements
                .map(el => el.description)
                .join('\n\n'); // Separate by paragraphs

            // Aggregate context items (ensure single paragraphs)
            const contextElements = storyElements.filter(el => el.type === 'context');
            const contextContent = contextElements
                .map(el => {
                    // Ensure each context item is a single paragraph by joining with spaces
                    const description = el.description.replace(/\n+/g, ' ').trim();
                    return description;
                })
                .join('\n\n'); // Separate context items by paragraphs

            if (!outlineContent && !contextContent) {
                alert('No story elements found. Please create some story elements first by chatting with the AI.');
                return;
            }

            // Create the project using the existing system
            const orchestrator = getOrchestrator();
            const settingsManager = getSettingsManager();
            const client = getOpenRouterClient();

            if (!orchestrator || !settingsManager || !client) {
                alert('Core services not initialized. Cannot create project.');
                return;
            }
            
            const project = new ProjectManager(title, template, orchestrator, settingsManager, client);
            
            // Set the project language to match current language setting
            try {
                const currentLanguage = settingsManager.getLanguage();
                project.setLanguage(currentLanguage);
                console.log(`🌐 New project language set to: ${currentLanguage}`);
            } catch (error) {
                console.warn('Could not set project language:', error);
            }
            
            // Apply content and context to root node
            const rootNode = project.rootNode;
            
            if (outlineContent) {
                rootNode.setContent(outlineContent, 'master');
                console.log('✅ Applied outline content to root node, length:', outlineContent.length);
            }
            
            if (contextContent) {
                rootNode.setContext(contextContent, 'master');
                console.log('✅ Applied context to root node, length:', contextContent.length);
            }
            
            addProject(project);
            
            // Set the new project as active and select its root node
            setActiveProject(project.rootNode.id);
            
            await project.saveToStorage();

            // Success feedback
            alert(`Project "${title}" created successfully!`);

            // Optionally close the modal
            this.close();

        } catch (error) {
            console.error('Error creating project:', error);
            alert('Failed to create project. Please try again.');
        }
    }

    private addPlusButtonListeners(): void {
        if (!this.whiteboardContainer) return;

        const addButtons = this.whiteboardContainer.querySelectorAll('.add-element-btn');
        addButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const addType = button.getAttribute('data-add-type') as StoryElementType;
                if (addType) {
                    this.addNewEmptyElement(addType);
                }
            });
        });
    }

    private async addNewEmptyElement(type: StoryElementType): Promise<void> {
        try {
            await this.storySystem.service.addNewEmptyElement(type);
            this.updateWhiteboard();
        } catch (error) {
            console.error(`Failed to add new ${type} element:`, error);
        }
    }

    /**
     * Load saved model selection from StorageService
     */
    private async loadSavedModelSelection(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const savedModel = await storage.get(XML_STORY_MODEL_STORAGE_KEY);
            
            if (savedModel && this.modelSelector) {
                // Verify the saved model is still valid
                const availableOptions = Array.from(this.modelSelector.options);
                const isValidOption = availableOptions.some(option => option.value === savedModel);
                
                if (isValidOption) {
                    this.modelSelector.value = savedModel as string;
                    console.log(`📝 Loaded saved XML Story model: ${savedModel}`);
                } else {
                    console.log(`📝 Saved model ${savedModel} no longer available, using default`);
                    // Clean up invalid saved selection
                    await storage.delete(XML_STORY_MODEL_STORAGE_KEY);
                }
            }
        } catch (error) {
            console.warn('📝 Error loading saved model selection:', error);
        }
    }

    /**
     * Save current model selection to StorageService
     */
    private async saveModelSelection(): Promise<void> {
        try {
            if (this.modelSelector?.value) {
                const storage = await StorageService.getInstance();
                await storage.set(XML_STORY_MODEL_STORAGE_KEY, this.modelSelector.value);
                console.log(`📝 Saved XML Story model selection: ${this.modelSelector.value}`);
            }
        } catch (error) {
            console.warn('📝 Error saving model selection:', error);
        }
    }

    /**
     * Load saved conversation history from StorageService
     */
    private async loadSavedConversation(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const savedConversation = await storage.get(XML_STORY_CONVERSATION_STORAGE_KEY);
            
            if (savedConversation && Array.isArray(savedConversation)) {
                this.conversationHistory = savedConversation;
                console.log(`💬 Loaded saved conversation history: ${savedConversation.length} messages`);
                
                // Rebuild the chat UI with loaded messages
                this.rebuildChatHistory();
            }
        } catch (error) {
            console.warn('💬 Error loading saved conversation history:', error);
        }
    }

    /**
     * Save current conversation history to StorageService
     */
    private async saveConversation(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            await storage.set(XML_STORY_CONVERSATION_STORAGE_KEY, this.conversationHistory);
            console.log(`💬 Saved conversation history: ${this.conversationHistory.length} messages`);
        } catch (error) {
            console.warn('💬 Error saving conversation history:', error);
        }
    }

    /**
     * Clear saved conversation history
     */
    private async clearSavedConversation(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            await storage.delete(XML_STORY_CONVERSATION_STORAGE_KEY);
            console.log('💬 Cleared saved conversation history');
        } catch (error) {
            console.warn('💬 Error clearing saved conversation history:', error);
        }
    }

    /**
     * Rebuild chat history UI from conversation history
     */
    private rebuildChatHistory(): void {
        if (!this.messagesContainer) return;

        // Clear existing messages
        this.messagesContainer.innerHTML = '';

        // Re-add all messages from history
        for (const message of this.conversationHistory) {
            // Extract just the user message for display (remove the user prompt context)
            let displayContent = message.content;
            if (message.role === 'user' && message.content.includes('\n\nUser: ')) {
                const userMessageStart = message.content.lastIndexOf('\n\nUser: ');
                if (userMessageStart !== -1) {
                    displayContent = message.content.substring(userMessageStart + 8); // 8 = length of '\n\nUser: '
                }
            }
            
            this.addMessageToChat(message.role, displayContent);
        }
    }

    /**
     * Load saved whiteboard state from StorageService
     */
    private async loadSavedWhiteboard(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const savedWhiteboard = await storage.get(XML_STORY_WHITEBOARD_STORAGE_KEY);
            
            if (savedWhiteboard && typeof savedWhiteboard === 'object') {
                this.storySystem.importState(savedWhiteboard as Record<string, unknown>);
                console.log('📋 Loaded saved whiteboard state');
                
                // Update the whiteboard UI
                this.updateWhiteboard();
            }
        } catch (error) {
            console.warn('📋 Error loading saved whiteboard state:', error);
        }
    }

    /**
     * Save current whiteboard state to StorageService
     */
    private async saveWhiteboard(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const whiteboardState = this.storySystem.exportState();
            await storage.set(XML_STORY_WHITEBOARD_STORAGE_KEY, whiteboardState);
            console.log('📋 Saved whiteboard state');
        } catch (error) {
            console.warn('📋 Error saving whiteboard state:', error);
        }
    }

    /**
     * Clear saved whiteboard state
     */
    private async clearSavedWhiteboard(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            await storage.delete(XML_STORY_WHITEBOARD_STORAGE_KEY);
            console.log('📋 Cleared saved whiteboard state');
        } catch (error) {
            console.warn('📋 Error clearing saved whiteboard state:', error);
        }
    }

    public override async close(): Promise<void> {
        // Clean up text editors
        this.elementEditors.forEach(editor => editor.destroy());
        this.elementEditors.clear();
        
        // Save state before closing
        await this.saveConversation();
        await this.saveWhiteboard();
        
        // Call parent close
        await super.close();
    }
} 