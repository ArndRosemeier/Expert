/**
 * Node Chat Editor Modal
 * 
 * WORKSPACE RULES ENFORCED:
 * - NO defensive programming - errors must be loud and visible
 * - Strong typing everywhere - no 'any' types  
 * - Functions exist and are called without fallbacks
 * - NO silent error handling or optional chaining where not needed
 * 
 * Provides collaborative content editing interface with AI assistance
 * for improving and refining existing project nodes.
 */

import { BaseModal } from './core/BaseModal';
import type { ModalConfig, ModalHooks } from './types/ModalTypes';
import { SettingsManager } from '../../SettingsManager';
import { OpenRouterClient } from '../../OpenRouterClient';
import { createXMLStorySystem } from '../../xml-story-creation';
import type { StoryElement, StoryElementType, XMLStoryEvent } from '../../xml-story-creation';
import { DEFAULT_XML_STORY_CONFIG } from '../../xml-story-creation/types/XMLStoryTypes';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { ModelSelector } from '../../ModelSelector';
import { StorageService } from '../../StorageService';
import { UniversalTextEditor } from '../components/UniversalTextEditor';
import { DocumentNode } from '../../DocumentNode';
import { 
    getActiveProject
} from '../../state';

const XML_STORY_MODEL_STORAGE_KEY = 'xml-story-selected-model';
const XML_STORY_FULL_UPDATE_MODE_KEY = 'xml-story-full-update-mode';

interface XMLStoryCommand {
    type: string;
    content?: string;
    markerId?: string;
    parameters?: unknown;
    searchText?: string;
    replaceText?: string;
    [key: string]: unknown;
}

export interface XMLStoryModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    modelSelector: ModelSelector;
    initializationData?: {
        title: string;
        content: string;
        contextItems: string[];
        sourceNode: DocumentNode;
    };
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

    
    // State
    private isGenerating = false;
    
    // Persistent highlight state
    private persistentHighlight: {
        startPos: number;
        endPos: number;
        className: string;
        expiresAt: number;
    } | null = null;
    private highlightTimer: number | null = null;
    

    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
    private isEditing = false;
    private contextRefreshPending = false;
    private fullUpdateMode = false;
    private fullUpdateModeCheckbox: HTMLInputElement | null = null;
    
    // Retry mechanism for failed commands
    private retryCount = 0;
    private maxRetries = 3;
    private pendingRetry: { command: XMLStoryCommand; error: string } | null = null;
    
    // ARCHITECTURE NOTE: Outline content is stored here as text (outlineHistory),
    // while context items are stored as XML elements in XMLStoryService.
    // This separation is why outline operations are handled here, not in the service.
    
    // Story element editors
    private elementEditors = new Map<string, UniversalTextEditor>();
    
    // Unified outline editor and versioning
    private outlineEditor: UniversalTextEditor | null = null;
    private outlineHistory: Array<{content: string, timestamp: Date, source: 'user' | 'ai'}> = [];
    private currentOutlineVersion = -1;
    
    // Initialization data to apply after modal opens
    private pendingInitializationData?: {title: string, content: string, contextItems: string[], sourceNode: DocumentNode} | undefined;
    private sourceNode: DocumentNode | null = null;
    
    // Custom prompt buttons
    private customButtons: Array<{id: string, caption: string, prompt: string}> = [];
    private customButtonsContainer: HTMLElement | null = null;
    private createButtonBtn: HTMLButtonElement | null = null;

    constructor(config: XMLStoryModalConfig, hooks: ModalHooks = {}) {

        super({
            width: '95vw',
            height: '95vh',
            maxWidth: 'none',
            maxHeight: 'none',
            closable: false, // Disable default close handlers to properly handle unsaved changes
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
        
        // Store initialization data to apply after modal opens
        if (config.initializationData) {
            this.pendingInitializationData = config.initializationData;
            this.sourceNode = config.initializationData.sourceNode;
        }
    }

    public render(): HTMLElement {

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
                
                .create-button-btn {
                    padding: 0.5rem 1rem;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    width: 100%;
                }
                
                .create-button-btn:hover {
                    background: #218838;
                }
                
                .custom-buttons-section {
                    margin-bottom: 1rem;
                }
                
                .custom-buttons-section h4 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.9rem;
                    color: #ccc;
                }
                
                .custom-button {
                    position: relative;
                    display: block;
                    width: 100%;
                    padding: 0.5rem 2rem 0.5rem 0.75rem;
                    background: #333;
                    color: white;
                    border: 1px solid #555;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    margin-bottom: 0.25rem;
                    text-align: left;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }
                
                .custom-button:hover {
                    background: #444;
                }
                
                .custom-button-remove {
                    position: absolute;
                    right: 0.25rem;
                    top: 50%;
                    transform: translateY(-50%);
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 2px;
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    font-size: 10px;
                    line-height: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .custom-button-remove:hover {
                    background: #c82333;
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

                .outline-controls {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .outline-control-btn {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    color: #495057;
                    width: 2rem;
                    height: 2rem;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 1.1rem;
                    transition: all 0.2s ease;
                }

                .outline-control-btn:hover:not(:disabled) {
                    background: #e9ecef;
                    border-color: #adb5bd;
                }

                .outline-control-btn:disabled {
                    background: #f8f9fa;
                    color: #ced4da;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                .outline-version-info {
                    font-size: 0.8rem;
                    color: #6c757d;
                    font-weight: 500;
                    margin-left: 0.5rem;
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
                
                .sidebar-button.loading {
                    background: #6c757d !important;
                    cursor: not-allowed;
                    opacity: 0.8;
                }
                
                .sidebar-button.loading:hover {
                    background: #6c757d !important;
                }
                
                .sidebar-button.success {
                    background: #28a745 !important;
                    border-color: #1e7e34 !important;
                    animation: successPulse 0.6s ease;
                }
                
                .sidebar-button.error {
                    background: #dc3545 !important;
                    border-color: #c82333 !important;
                    animation: errorShake 0.5s ease;
                }
                
                @keyframes successPulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); background: #34ce57; }
                    100% { transform: scale(1); }
                }
                
                @keyframes errorShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-3px); }
                    75% { transform: translateX(3px); }
                }
                
                /* XML Command Highlighting in Chat */
                .xml-command-highlight {
                    background: rgba(0, 123, 255, 0.08);
                    border: 1px solid rgba(0, 123, 255, 0.2);
                    border-radius: 6px;
                    padding: 0.5rem;
                    margin: 0.5rem 0;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                    font-size: 0.85rem;
                    color: #2c3e50;
                    display: block;
                    isolation: isolate;
                }
                
                .xml-command-highlight strong {
                    color: #0056b3;
                    font-weight: 600;
                }
                
                .xml-command-highlight .command-content {
                    margin: 0.25rem 0;
                    padding-left: 1rem;
                    border-left: 2px solid rgba(0, 123, 255, 0.3);
                    background: rgba(0, 123, 255, 0.03);
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                
                /* Specific command type styling */
                .xml-command-highlight.outline-replace-command {
                    border-color: rgba(40, 167, 69, 0.3);
                    background: rgba(40, 167, 69, 0.05);
                }
                
                .xml-command-highlight.outline-replace-command strong {
                    color: #28a745;
                }
                
                .xml-command-highlight.outline-replace-command .command-content {
                    border-left-color: rgba(40, 167, 69, 0.4);
                    background: rgba(40, 167, 69, 0.03);
                }
                
                .xml-command-highlight.edit-command {
                    border-color: rgba(255, 193, 7, 0.3);
                    background: rgba(255, 193, 7, 0.05);
                }
                
                .xml-command-highlight.edit-command strong {
                    color: #ffc107;
                }
                
                .xml-command-highlight.edit-command .command-content {
                    border-left-color: rgba(255, 193, 7, 0.4);
                    background: rgba(255, 193, 7, 0.03);
                }
                
                .xml-command-highlight.append-command {
                    border-color: rgba(108, 117, 125, 0.3);
                    background: rgba(108, 117, 125, 0.05);
                }
                
                .xml-command-highlight.append-command strong {
                    color: #6c757d;
                }
                
                .xml-command-highlight.append-command .command-content {
                    border-left-color: rgba(108, 117, 125, 0.4);
                    background: rgba(108, 117, 125, 0.03);
                }
                
                .xml-command-highlight.replace-command {
                    border-color: rgba(220, 53, 69, 0.3);
                    background: rgba(220, 53, 69, 0.05);
                }
                
                .xml-command-highlight.replace-command strong {
                    color: #dc3545;
                }
                
                .xml-command-highlight.replace-command .command-content {
                    border-left-color: rgba(220, 53, 69, 0.4);
                    background: rgba(220, 53, 69, 0.03);
                }
                
                .xml-command-highlight.context-command {
                    border-color: rgba(102, 16, 242, 0.3);
                    background: rgba(102, 16, 242, 0.05);
                }
                
                .xml-command-highlight.context-command strong {
                    color: #6610f2;
                }
                
                .xml-command-highlight.context-command .command-content {
                    border-left-color: rgba(102, 16, 242, 0.4);
                    background: rgba(102, 16, 242, 0.03);
                }
                
                /* Add subtle hover effect for XML commands */
                .xml-command-highlight:hover {
                    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
                    transform: translateY(-1px);
                    transition: all 0.2s ease;
                }
                
                /* Inline command styling for simple commands */
                .xml-command-highlight:not(.outline-replace-command):not(.edit-command):not(.append-command):not(.replace-command):not(.context-command) {
                    display: inline-block;
                    padding: 0.2rem 0.4rem;
                    margin: 0 0.2rem;
                    font-size: 0.8rem;
                    border-radius: 4px;
                }
                
                /* Ensure content after XML highlights returns to normal styling */
                .xml-command-highlight + * {
                    background: initial !important;
                    color: initial !important;
                    border: initial !important;
                    font-family: initial !important;
                    font-size: initial !important;
                    padding: initial !important;
                    margin: initial !important;
                }
                
                /* Reset any potential bleeding from XML highlights */
                .message-content {
                    position: relative;
                    isolation: isolate;
                }
                
                .message-content > * {
                    isolation: isolate;
                }
                
                /* Clean XML command styling with proper separation */
                .xml-commands-container {
                    margin-bottom: 1rem;
                    border-bottom: 1px solid rgba(0, 123, 255, 0.1);
                    padding-bottom: 0.5rem;
                }
                
                .clean-content {
                    /* Ensure clean content has normal styling */
                    background: transparent;
                    color: inherit;
                    font-family: inherit;
                    font-size: inherit;
                    line-height: inherit;
                }
            </style>

            <!-- Sidebar -->
            <div class="xml-story-sidebar">
                <div class="sidebar-header">
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Node Chat Editor</h3>
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
                    
                    <div style="padding: 0.75rem; background: #2a2a2a; border-radius: 6px; border: 1px solid #444;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <input type="checkbox" id="full-update-mode-checkbox" style="margin: 0;">
                            <label for="full-update-mode-checkbox" style="font-size: 0.8rem; color: #ccc; cursor: pointer; line-height: 1.3;">
                                Full context mode<br>
                                <span style="color: #888; font-size: 0.7rem;">Uses more tokens, higher accuracy</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="custom-buttons-section">
                        <h4>Custom Buttons</h4>
                        <div id="xml-story-custom-buttons-container">
                            <!-- Custom buttons will be rendered here -->
                        </div>
                    </div>
                    
                    <button id="clear-story-btn" class="sidebar-button">
                        🗑️ Clear Chat
                    </button>
                    
                                                <button id="create-project-btn" class="sidebar-button primary">
                                🚀 Update Node
                    </button>
                    
                    <button id="close-modal-btn" class="sidebar-button">
                        ❌ Close
                    </button>

                    
                    <div style="font-size: 0.8rem; color: #888; line-height: 1.4; margin-top: auto;">
                        <p><strong>How it works:</strong></p>
                        <p>Chat naturally about your story. The AI can change your outline, add and edit context items. The AI also knows your outline and context and you can talk about it, ask for improvements.</p>
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

                        </div>

                    </div>
                    
                    <div id="xml-story-messages" class="chat-messages">
                        <div class="message message-assistant">
                            <div class="message-content" id="initial-chat-message">
                                Loading...
                            </div>
                        </div>
                    </div>
                    
                    <div class="chat-input-area">
                        <button id="xml-story-create-button-btn" class="create-button-btn">
                            ⇒ Create Button
                        </button>
                        <div class="input-wrapper">
                            <textarea 
                                id="xml-story-message-input" 
                                class="message-input" 
                                placeholder="How can I help improve this content?"
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
        this.customButtonsContainer = container.querySelector('#xml-story-custom-buttons-container');
        this.createButtonBtn = container.querySelector('#xml-story-create-button-btn');
        this.messagesContainer = container.querySelector('#xml-story-messages');
        this.titleInput = container.querySelector('#xml-story-title');


        // Set up event listeners and initialize
        void this.setupEventListeners(container);

        return container;
    }

    private async setupEventListeners(container: HTMLElement): Promise<void> {
        // Send message button
        this.sendButton?.addEventListener('click', () => {
            void this.sendMessage();
        });
        
        // Create custom button
        this.createButtonBtn?.addEventListener('click', () => {
            void this.createCustomButton();
        });

        // Enter key to send (Shift+Enter for new line)
        this.messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });

        // Clear chat button
        const clearBtn = container.querySelector('#clear-story-btn');
        clearBtn?.addEventListener('click', () => {
            this.clearChat();
        });

        // Update source node button
        const updateNodeBtn = container.querySelector('#create-project-btn');
        updateNodeBtn?.addEventListener('click', () => {
            void this.updateSourceNode();
        });

        // Close modal button
        const closeBtn = container.querySelector('#close-modal-btn');
        closeBtn?.addEventListener('click', () => {
            void this.closeWithUnsavedCheck();
        });
        
        // Setup custom ESC key handler since we disabled default closable behavior
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                void this.closeWithUnsavedCheck();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Store cleanup for ESC handler
        this.cleanupHandlers.push(() => {
            document.removeEventListener('keydown', escapeHandler);
        });

        // No template selector needed

        // Model selector with persistence
        void this.loadSavedModelSelection();
        this.modelSelector?.addEventListener('change', () => {
            void this.saveModelSelection();
        });

        // Full update mode checkbox with persistence
        this.fullUpdateModeCheckbox = container.querySelector('#full-update-mode-checkbox');
        void this.loadSavedFullUpdateMode();
        this.fullUpdateModeCheckbox!.addEventListener('change', () => {
            this.fullUpdateMode = this.fullUpdateModeCheckbox!.checked;
            void this.saveFullUpdateMode();
        });

        // No conversation persistence - each session starts fresh
        
        // Apply initialization data if provided, or set default message
        if (this.pendingInitializationData) {
            await this.applyInitializationData(this.pendingInitializationData);
            this.pendingInitializationData = undefined;
        }
        
        // Load custom buttons after initialization
        await this.loadCustomButtons();
        
        // Show initial message if no initialization data
        if (!this.pendingInitializationData) {
            const messageElement = document.getElementById('initial-chat-message');
            if (messageElement) {
                messageElement.innerHTML = `
                    Hi! I'm here to help you edit and improve your content.
                    
                    I can help you:
                    • <strong>Enhance outlines</strong> - Make them more detailed and compelling
                    • <strong>Improve context items</strong> - Add depth and fix inconsistencies
                    • <strong>Refine content</strong> - Polish language and improve flow
                    
                    <strong>💡 Pro tip:</strong> In the outline editor, you can select any sentence or paragraph and use the small edit buttons that appear to make focused improvements to just that part!
                    
                    What would you like to work on?
                `;
            }
        }
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

            // Create system prompt using PromptExpansionService
            const prompts = this.settingsManager.getPrompts();
            const expansionService = createPromptExpansionService(this.settingsManager);
            
            const systemPromptContext = {
                project: {
                    language: this.settingsManager.getLanguage()
                }
            };
            
            const systemPrompt = await expansionService.expandPromptAsync(
                prompts.node_chat_editor, 
                systemPromptContext
            );

            // Determine if we should include full context
            // Always include context for first message, or if in full mode, or if refresh requested
            const isFirstMessage = this.conversationHistory.length === 0;
            const shouldIncludeContext = isFirstMessage || this.fullUpdateMode || this.contextRefreshPending;
            let userMessage: string;

            if (shouldIncludeContext) {
                // Include current whiteboard state (first message, full mode, or AI requested refresh)
                const currentOutline = this.getCurrentOutlineContent() || 'No outline content yet.';
                const currentContextItems = this.formatContextItemsForAI();
                const humanEdits = this.formatHumanEditsForAI();
                
                const userPromptContext = {
                    custom: {
                        current_outline: currentOutline,
                        current_context_items: currentContextItems,
                        human_edits: humanEdits
                    }
                };
                
                const userPrompt = await expansionService.expandPromptAsync(
                    prompts.node_chat_editor_user, 
                    userPromptContext
                );
                
                userMessage = `${userPrompt}\n\nUser: ${message}`;
                
                // Reset refresh flag after using it
                if (this.contextRefreshPending) {
                    this.contextRefreshPending = false;
                    console.log('🔄 Context refresh provided to AI, flag reset');
                }
            } else {
                // Token-efficient mode - just send the user message (after first message)
                userMessage = `User: ${message}`;
            }

            // Add user message to conversation history BEFORE the AI call
            this.conversationHistory.push({ role: 'user', content: userMessage });
            
                            // No conversation persistence needed

            // Prepare conversation with persistent system prompt
            const conversation = [
                { role: 'system' as const, content: systemPrompt },
                ...this.conversationHistory
            ];

            // Get selected model
            const modelPurpose = this.modelSelector!.value;

            // Add placeholder AI message for streaming
            const placeholderMessage = this.addMessageToChat('assistant', '');
            
            // Send to AI with real-time streaming
            let response = '';
            await this.openRouterClient.streamingChat(modelPurpose, conversation, {
                onChunk: (chunk: string) => {
                    response += chunk;
                    // Update the message in real-time as chunks arrive
                    this.updateStreamingMessage(placeholderMessage, response);
                },
                onComplete: () => {
                    // Remove streaming cursor when complete
                    this.finalizeStreamingMessage(placeholderMessage);
                },
                onError: (error: Error) => {
                    // Remove streaming cursor on error
                    this.finalizeStreamingMessage(placeholderMessage);
                    throw error;
                }
            });

            if (response) {
                // Track context items before AI processing to detect newly added items
                // (This is only for AI chat responses, not initialization/loading)
                const contextCountBefore = this.storySystem.service.getElementsForContext()
                    .filter(el => el.type === 'context').length;

                // Process AI response through XML system
                const parseResult = await this.storySystem.processAIResponse(response);

                // Handle outline_replace commands
                for (const command of parseResult.systemCommands) {
                    if (command.type === 'outline_replace' && command.content) {
                        this.setOutlineContentFromAI(command.content);
                    }
                }

                // Update the streaming message with cleaned text and XML highlighting
                const formattedContent = this.applyXMLHighlighting(
                    this.parseMarkdownForChat(parseResult.cleanedText), 
                    parseResult.systemCommands as unknown as XMLStoryCommand[]
                );
                this.updateStreamingMessageWithHTML(placeholderMessage, formattedContent);
                this.finalizeStreamingMessage(placeholderMessage);

                // Add AI response to conversation history
                this.conversationHistory.push({ role: 'assistant', content: parseResult.cleanedText });

                // Reset retry state on successful manual message
                this.resetRetryState();

                // Update whiteboard
                this.updateWhiteboard();
                
                // Check for pending retries after generation completes
                await this.processPendingRetry();

                // Check if AI actually added new context items during this chat response
                const contextCountAfter = this.storySystem.service.getElementsForContext()
                    .filter(el => el.type === 'context').length;
                
                if (contextCountAfter > contextCountBefore) {
                    this.scrollToNewContextItems();
                }

                // Show any errors
                if (parseResult.errors.length > 0) {
                    console.warn('XML parsing errors:', parseResult.errors);
                }
            }

        } finally {
            this.setGenerating(false);
            // Process any pending retries after generation completes
            await this.processPendingRetry();
        }
    }

    private addMessageToChat(role: 'user' | 'assistant', content: string): HTMLElement {
        if (!this.messagesContainer) {
            // Return a dummy element if no container
            return document.createElement('div');
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Use markdown formatting for non-empty content
        if (content && content.trim()) {
            contentDiv.innerHTML = this.parseMarkdownForChat(content);
        } else {
            contentDiv.textContent = content;
        }
        
        // Add streaming cursor for empty assistant messages (streaming placeholder)
        if (role === 'assistant' && content === '') {
            const streamingCursor = document.createElement('span');
            streamingCursor.className = 'streaming-cursor';
            streamingCursor.textContent = '▋';
            streamingCursor.style.cssText = `
                animation: blink 1s infinite;
                margin-left: 2px;
                color: #888;
            `;
            contentDiv.appendChild(streamingCursor);
            
            // Add CSS animation if not already present
            if (!document.querySelector('#xml-story-streaming-animation')) {
                const style = document.createElement('style');
                style.id = 'xml-story-streaming-animation';
                style.textContent = `
                    @keyframes blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        messageDiv.appendChild(contentDiv);

        // Add timestamp
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = new Date().toLocaleTimeString();
        messageDiv.appendChild(timestampDiv);
        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        
        return messageDiv;
    }

    /**
     * Update streaming message content in real-time with markdown formatting
     */
    private updateStreamingMessage(messageElement: HTMLElement, content: string): void {
        const contentDiv = messageElement.querySelector('.message-content');
        if (!contentDiv) return;
        
        // Preserve streaming cursor
        const streamingCursor = contentDiv.querySelector('.streaming-cursor');
        
        // Convert markdown to HTML for proper formatting
        const formattedContent = this.parseMarkdownForChat(content);
        contentDiv.innerHTML = formattedContent;
        
        // Re-add streaming cursor
        if (streamingCursor) {
            contentDiv.appendChild(streamingCursor);
        }
        
        // Auto scroll to bottom to follow the streaming content
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * Update streaming message with pre-formatted HTML content
     */
    private updateStreamingMessageWithHTML(messageElement: HTMLElement, htmlContent: string): void {
        const contentDiv = messageElement.querySelector('.message-content');
        if (!contentDiv) return;
        
        // Preserve streaming cursor
        const streamingCursor = contentDiv.querySelector('.streaming-cursor');
        
        // Set HTML content directly
        contentDiv.innerHTML = htmlContent;
        
        // Re-add streaming cursor
        if (streamingCursor) {
            contentDiv.appendChild(streamingCursor);
        }
        
        // Auto scroll to bottom to follow the streaming content
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * Simple markdown parser for chat messages
     * Handles basic formatting and applies XML highlighting cleanly
     */
    private parseMarkdownForChat(text: string): string {
        if (!text) return '';
        
        // Escape HTML to prevent XSS
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Convert line breaks to <br>
        html = html.replace(/\n/g, '<br>');
        
        // Bold text **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic text *text* (but not if it's part of **bold**)
        html = html.replace(/(?!\*\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
        
        // Inline code `text`
        html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
        
        return html;
    }

    /**
     * Apply XML command highlighting by replacing markers with highlighted commands
     */
    private applyXMLHighlighting(cleanContent: string, systemCommands?: XMLStoryCommand[]): string {
        if (!systemCommands || systemCommands.length === 0) {
            return cleanContent;
        }

        let result = cleanContent;

        // Replace each marker with its corresponding highlighted command
        systemCommands.forEach((cmd) => {
            if (cmd.markerId) {
                const highlightHtml = this.createSystemCommandHighlight(cmd);
                result = result.replace(cmd.markerId, highlightHtml);
            }
        });

        // If there are any commands without markers (shouldn't happen), add them at the end as fallback
        const unmarkedCommands = systemCommands.filter(cmd => !cmd.markerId || result.includes(cmd.markerId));
        if (unmarkedCommands.length > 0) {
            const fallbackSection = `
                <div class="xml-commands-container" style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.9em; color: #888; margin-bottom: 0.5rem; font-style: italic;">Additional executed XML-commands:</div>
                    ${unmarkedCommands.map(cmd => this.createSystemCommandHighlight(cmd)).join('')}
                </div>
            `;
            result += fallbackSection;
        }

        return `<div class="clean-content">${result}</div>`;
    }

    /**
     * Create HTML for a single system command highlight
     */
    private createSystemCommandHighlight(command: XMLStoryCommand): string {
        const escapeHtml = (text: string) => text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        switch (command.type) {
            case 'refresh':
            case 'delete':
            case 'rename':
                return `<div class="xml-command-highlight" title="Executed command">
                    &lt;/${command.type}&gt;
                </div>`;
                
            case 'outline_replace':
                const content = command.content || '';
                return `<div class="xml-command-highlight outline-replace-command" title="Outline replacement executed">
                    <strong>&lt;/outline_replace&gt;</strong>
                    <div class="command-content">${escapeHtml(content.trim())}</div>
                    <strong>&lt;/outline_replace&gt;</strong>
                </div>`;
                
            case 'edit':
                const params = command.parameters ? Object.entries(command.parameters).map(([k,v]) => `${k}="${v}"`).join(' ') : '';
                const editContent = command.content || '';
                return `<div class="xml-command-highlight edit-command" title="Edit command executed">
                    <strong>&lt;/edit ${escapeHtml(params)}&gt;</strong>
                    <div class="command-content">${escapeHtml(editContent.trim())}</div>
                    <strong>&lt;/edit&gt;</strong>
                </div>`;
                
            case 'append':
                const appendContent = command.content || '';
                return `<div class="xml-command-highlight append-command" title="Append command executed">
                    <strong>&lt;append&gt;</strong>
                    <div class="command-content">${escapeHtml(appendContent.trim())}</div>
                    <strong>&lt;/append&gt;</strong>
                </div>`;
                
            case 'replace_command':
                const searchText = command.searchText || '';
                const replaceText = command.replaceText || '';
                return `<div class="xml-command-highlight replace-command" title="Replace command executed">
                    <strong>&lt;replace_command&gt;</strong>
                    <div class="command-content">
                        <div><strong>&lt;search&gt;</strong> ${escapeHtml(searchText.trim())} <strong>&lt;/search&gt;</strong></div>
                        <div><strong>&lt;replace&gt;</strong> ${escapeHtml(replaceText.trim())} <strong>&lt;/replace&gt;</strong></div>
                    </div>
                    <strong>&lt;/replace_command&gt;</strong>
                </div>`;
                
            default:
                return `<div class="xml-command-highlight" title="Unknown command: ${command.type}">
                    &lt;/${command.type}&gt;
                </div>`;
        }
    }

    /**
     * Finalize streaming message by removing cursor
     */
    private finalizeStreamingMessage(messageElement: HTMLElement): void {
        const streamingCursor = messageElement.querySelector('.streaming-cursor');
        if (streamingCursor) {
            streamingCursor.remove();
        }
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

        // Get all elements for context items only (outline is now unified)
        const allElements = this.storySystem.service.getElementsForContext();
        const contextElements = allElements.filter((el: StoryElement) => el.type === 'context');
        
        // Clear existing context editors (outline editor is persistent)
        this.elementEditors.forEach(editor => editor.destroy());
        this.elementEditors.clear();

        let html = '';

        // Unified Outline section - always show
        const hasOutlineHistory = this.outlineHistory.length > 0;
        const canUndo = this.currentOutlineVersion > 0;
        const canRedo = this.currentOutlineVersion < this.outlineHistory.length - 1;
        
            html += `
                <div class="story-section">
                <div class="story-section-header">
                    <span>Outline</span>
                    <div class="outline-controls">
                        <button class="outline-control-btn" id="outline-reset-btn" ${!this.sourceNode ? 'disabled' : ''} title="Reset outline to original content">🔄</button>
                        <button class="outline-control-btn" id="outline-undo-btn" ${!canUndo ? 'disabled' : ''} title="Undo outline change">↶</button>
                        <button class="outline-control-btn" id="outline-redo-btn" ${!canRedo ? 'disabled' : ''} title="Redo outline change">↷</button>
                        <span class="outline-version-info">${hasOutlineHistory ? `v${this.currentOutlineVersion + 1}/${this.outlineHistory.length}` : 'v1'}</span>
                    </div>
                </div>
                    <div class="story-elements">
                    <div id="unified-outline-editor" style="min-height: 200px; border: 1px solid #ddd; border-radius: 8px; padding: 12px;">
                        ${!hasOutlineHistory ? '<div style="color: #999; font-style: italic;">Start writing your outline here or ask AI to create one...</div>' : ''}
                    </div>
                    </div>
                </div>
            `;

        // Context section (individual items as before)
            html += `
                <div class="story-section">
                <div class="story-section-header">
                    <span>Context</span>
                    <div class="outline-controls">
                        <button class="outline-control-btn" id="context-reset-btn" ${!this.sourceNode ? 'disabled' : ''} title="Reset context to original items">🔄</button>
                        <button class="add-element-btn" data-add-type="context" title="Add Context Item">+</button>
                    </div>
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

        // Initialize the unified outline editor
        this.initializeUnifiedOutlineEditor();
        
        // Initialize context element editors
        this.initializeElementEditors();
        
        // Add event listeners for context + buttons and outline controls
        this.addPlusButtonListeners();
        this.addOutlineControlListeners();

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

            // Changes applied (no persistence needed)
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

    }





    private formatContextItemsForAI(): string {
        const elements = this.storySystem.service.getElementsForContext();
        const contextElements = elements.filter((el: StoryElement) => el.type === 'context');
        
        if (contextElements.length === 0) {
            return 'No context items created yet.';
        }

        let formatted = 'CONTEXT ITEMS:\n\n';
        contextElements.forEach((element, index) => {
                const editFlag = element.isHumanEdited ? ' [HUMAN EDITED]' : '';
                formatted += `${index + 1}. [ID: ${element.id}] ${element.description}${editFlag}\n`;
            });

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
        
                break;
            case 'human_edit':
                // Human edits only change content, not structure - no need to rebuild DOM
                // Just save the state without destroying/recreating editors
        
                break;
            case 'highlight_cleared':
                this.updateWhiteboard();
                break;
            case 'context_refresh_requested':
                // AI has requested fresh context for the next message
                this.contextRefreshPending = true;
                console.log('🔄 Context refresh requested by AI for next message');
                break;
            case 'command_failed':
                // Handle failed commands with retry logic
                this.handleCommandFailure(event);
                break;
            case 'outline_append_requested':
                // Handle outline append - outline is stored here as text, not in service as XML elements
                this.handleOutlineAppend(event);
                break;
            case 'outline_replace_requested':
                // Handle outline replace - outline is stored here as text, not in service as XML elements  
                this.handleOutlineReplace(event);
                break;
        }
    }
    
    /**
     * Handle command failures with automatic retry logic
     */
    private async handleCommandFailure(event: XMLStoryEvent): Promise<void> {
        const { command, error } = event.payload as { command: XMLStoryCommand; error: string };
        
        console.warn(`⚠️ Command failed: ${command.type} - ${error}`);
        
        // If we're currently generating, queue the retry for after generation completes
        if (this.isGenerating) {
            this.pendingRetry = { command, error };
            console.log('📝 Command failure detected during generation, queueing retry...');
            return;
        }
        
        // Process the retry immediately
        await this.processCommandRetry(command, error);
    }
    
    /**
     * Process command retry logic
     */
    private async processCommandRetry(command: XMLStoryCommand, error: string): Promise<void> {
        // Check if we can retry
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            
            console.log(`🔄 Retrying failed command (attempt ${this.retryCount}/${this.maxRetries})`);
            
            // Send automatic feedback to AI with current state
            const feedbackMessage = this.generateRetryFeedback(command, error);
            
            // Add failure message to chat for transparency
            this.addMessageToChat('assistant', `❌ Command failed: ${error}. Retrying with updated context... (${this.retryCount}/${this.maxRetries})`);
            
            // Automatically retry with fresh context
            await this.sendAutomaticRetry(feedbackMessage);
        } else {
            // Max retries reached
            const finalMessage = `❌ Failed after ${this.maxRetries} attempts: ${error}. Please try a different approach.`;
            this.addMessageToChat('assistant', finalMessage);
            this.resetRetryState();
        }
    }
    
    /**
     * Generate feedback message for retry attempts
     */
    private generateRetryFeedback(command: XMLStoryCommand, error: string): string {
        const currentOutline = this.getCurrentOutlineContent() || 'No outline content';
        
        let feedback = `The ${command.type} command failed: ${error}\n\n`;
        feedback += 'CURRENT OUTLINE STATE:\n';
        feedback += currentOutline + '\n\n';
        
        if (command.type === 'replace_command') {
            feedback += `You tried to find: "${command.searchText || 'unknown'}"\n`;
            feedback += `To replace with: "${command.replaceText || 'unknown'}"\n\n`;
            feedback += 'Please use different search text that exists exactly in the outline, or use <append> to add content instead.';
        }
        
        return feedback;
    }
    
    /**
     * Send automatic retry with feedback
     */
    private async sendAutomaticRetry(feedbackMessage: string): Promise<void> {
        if (this.isGenerating) return;
        
        try {
            this.setGenerating(true);
            
            // Force context refresh for retry
            this.contextRefreshPending = true;
            
            // Create system prompt
            const prompts = this.settingsManager.getPrompts();
            const expansionService = createPromptExpansionService(this.settingsManager);
            
            const systemPromptContext = {
                project: {
                    language: this.settingsManager.getLanguage()
                }
            };
            
            const systemPrompt = await expansionService.expandPromptAsync(
                prompts.node_chat_editor, 
                systemPromptContext
            );
            
            // Include full context for retry
            const currentOutline = this.getCurrentOutlineContent() || 'No outline content yet.';
            const currentContextItems = this.formatContextItemsForAI();
            const humanEdits = this.formatHumanEditsForAI();
            
            const userPromptContext = {
                custom: {
                    current_outline: currentOutline,
                    current_context_items: currentContextItems,
                    human_edits: humanEdits
                }
            };
            
            const userPrompt = await expansionService.expandPromptAsync(
                prompts.node_chat_editor_user, 
                userPromptContext
            );
            
            const userMessage = `${userPrompt}\n\nSystem: ${feedbackMessage}`;
            
            // Add to conversation history
            this.conversationHistory.push({ role: 'user', content: userMessage });
            
            // Reset refresh flag
            this.contextRefreshPending = false;
            
            // Prepare conversation
            const conversation = [
                { role: 'system' as const, content: systemPrompt },
                ...this.conversationHistory
            ];
            
            // Get selected model
            const modelPurpose = this.modelSelector!.value;
            
            // Add placeholder for streaming
            const placeholderMessage = this.addMessageToChat('assistant', '');
            
            // Send to AI
            let response = '';
            await this.openRouterClient.streamingChat(modelPurpose, conversation, {
                onChunk: (chunk: string) => {
                    response += chunk;
                    this.updateStreamingMessage(placeholderMessage, response);
                },
                onComplete: () => {
                    this.finalizeStreamingMessage(placeholderMessage);
                },
                onError: (error: Error) => {
                    this.finalizeStreamingMessage(placeholderMessage);
                    throw error;
                }
            });
            
            if (response) {
                // Process AI response
                const parseResult = await this.storySystem.processAIResponse(response);
                
                // Handle outline_replace commands
                for (const command of parseResult.systemCommands) {
                    if (command.type === 'outline_replace' && command.content) {
                        this.setOutlineContentFromAI(command.content);
                    }
                }
                
                // Update message with cleaned text and XML highlighting
                const formattedContent = this.applyXMLHighlighting(
                    this.parseMarkdownForChat(parseResult.cleanedText), 
                    parseResult.systemCommands as unknown as XMLStoryCommand[]
                );
                this.updateStreamingMessageWithHTML(placeholderMessage, formattedContent);
                this.finalizeStreamingMessage(placeholderMessage);
                
                // Add to conversation history
                this.conversationHistory.push({ role: 'assistant', content: parseResult.cleanedText });
                
                // Update whiteboard
                this.updateWhiteboard();
                
                // If successful, reset retry state
                this.resetRetryState();
            }
            
        } catch (error) {
            console.error('Error in automatic retry:', error);
            this.addMessageToChat('assistant', 'Sorry, the automatic retry failed. Please try again manually.');
            this.resetRetryState();
        } finally {
            this.setGenerating(false);
        }
    }
    
    /**
     * Reset retry state
     */
    private resetRetryState(): void {
        this.retryCount = 0;
        this.pendingRetry = null;
    }
    
    /**
     * Handle outline append requests from the service
     * 
     * ARCHITECTURE NOTE: Outline content is stored as plain text in this.outlineHistory,
     * while context items are stored as XML elements in XMLStoryService.state.elements.
     * This is why outline operations (append, replace_command, outline_replace) are 
     * handled here in the modal, not in the service layer.
     */
    private handleOutlineAppend(event: XMLStoryEvent): void {
        const { command } = event.payload as { command: XMLStoryCommand };
        if (!command.content) {
            console.warn('Append command missing content');
            return;
        }

        const currentContent = this.getCurrentOutlineContent();
        const newContent = currentContent + '\n\n' + command.content;
        
        this.setOutlineContentFromAI(newContent);
        console.log('✅ AI appended content to outline');
    }

    /**
     * Trim trailing non-alphanumerical characters from replacement text to avoid double punctuation
     * 
     * When AI searches for text ignoring punctuation but includes punctuation in replacement,
     * this prevents double punctuation marks (e.g., "word.." instead of "word.")
     */
    private trimTrailingNonAlphanumeric(text: string): string {
        return text.replace(/[^a-zA-Z0-9]+$/, '');
    }

    /**
     * Handle outline replace requests from the service
     * 
     * ARCHITECTURE NOTE: This uses fuzzy search to find and replace text within
     * the outline content (stored as plain text), ignoring whitespace/punctuation
     * differences between AI search text and actual outline formatting.
     */
    private handleOutlineReplace(event: XMLStoryEvent): void {
        const { command } = event.payload as { command: XMLStoryCommand };
        if (!command.searchText || !command.replaceText) {
            this.emitCommandFailure(command, 'Replace command missing search text or replace text');
            return;
        }

        const currentContent = this.getCurrentOutlineContent();
        
        // Use fuzzy search that ignores non-alphanumeric characters
        const fuzzyMatches = this.findFuzzyMatches(currentContent, command.searchText);
        
        if (fuzzyMatches.length === 0) {
            this.emitCommandFailure(command, `Search text "${command.searchText}" not found in outline (ignoring punctuation/whitespace)`);
            return;
        }
        
        if (fuzzyMatches.length > 1) {
            this.emitCommandFailure(command, `Search text "${command.searchText}" appears ${fuzzyMatches.length} times. Must be unique for replacement.`);
            return;
        }
        
        // Perform the replacement using exact positions
        const match = fuzzyMatches[0];
        if (!match) {
            this.emitCommandFailure(command, 'Match not found despite array check');
            return;
        }
        
        // Trim trailing non-alphanumerical characters from replacement to avoid double punctuation
        const trimmedReplaceText = this.trimTrailingNonAlphanumeric(command.replaceText);
        
        const newContent = currentContent.substring(0, match.start) + 
                          trimmedReplaceText + 
                          currentContent.substring(match.end);
        
        // Set content and setup persistent highlighting
        if (this.outlineEditor) {
            this.outlineEditor.setText(newContent);
            this.saveOutlineVersion(newContent, 'ai');
        }
        
        // Setup persistent highlight that survives editor recreation (using trimmed length)
        this.setPersistentHighlight(
            match.start,
            match.start + trimmedReplaceText.length,
            'highlight-ai-replacement'
        );
        console.log(`✅ AI replaced "${command.searchText}" (positions ${match.start}-${match.end}) with "${trimmedReplaceText}" (trimmed from "${command.replaceText}")`);
    }

    /**
     * Find fuzzy matches ignoring non-alphanumeric characters but preserving original positions
     * 
     * This is the key to making AI replace commands work reliably. The AI might search for
     * "chapter 1 the discovery" but the actual text could be "Chapter 1:    The Discovery - "
     * This algorithm matches based only on letters/numbers while preserving exact positions
     * for replacement, avoiding the need to normalize text (which would lose position info).
     */
    private findFuzzyMatches(text: string, searchPattern: string): Array<{start: number, end: number}> {
        const matches: Array<{start: number, end: number}> = [];
        
        // Helper function to check if character is alphanumeric
        const isAlphaNumeric = (char: string): boolean => {
            return /[a-zA-Z0-9]/.test(char);
        };
        
        // Convert search pattern to lowercase alphanumeric only for comparison
        const normalizedPattern = searchPattern.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        if (normalizedPattern.length === 0) {
            return matches; // Empty pattern
        }
        
        let textIndex = 0;
        
        while (textIndex < text.length) {
            let matchStart = -1;
            let matchEnd = -1;
            let patternIndex = 0;
            let currentTextIndex = textIndex;
            
            // Try to match pattern starting from currentTextIndex
            while (currentTextIndex < text.length && patternIndex < normalizedPattern.length) {
                const textChar = text[currentTextIndex]?.toLowerCase();
                
                if (textChar && isAlphaNumeric(textChar)) {
                    if (textChar === normalizedPattern[patternIndex]) {
                        if (matchStart === -1) {
                            matchStart = currentTextIndex; // First alphanumeric match
                        }
                        patternIndex++;
                        matchEnd = currentTextIndex + 1; // End is exclusive
                    } else {
                        // Mismatch in alphanumeric characters, break
                        break;
                    }
                } else {
                    // Non-alphanumeric character in text
                    if (matchStart !== -1) {
                        // We're in the middle of a potential match, include this character
                        matchEnd = currentTextIndex + 1;
                    }
                }
                
                currentTextIndex++;
            }
            
            // Check if we found a complete match
            if (patternIndex === normalizedPattern.length && matchStart !== -1) {
                matches.push({start: matchStart, end: matchEnd});
                
                // Continue searching from after this match
                textIndex = matchEnd;
            } else {
                // No match starting at textIndex, move to next character
                textIndex++;
            }
        }
        
        return matches;
    }

    /**
     * Emit a command failure event for retry logic
     */
    private emitCommandFailure(command: XMLStoryCommand, error: string): void {
        this.storySystem.service.emitEvent({
            type: 'command_failed',
            payload: { command, error },
            timestamp: new Date()
        });
    }

    /**
     * Process any pending retry after generation completes
     */
    private async processPendingRetry(): Promise<void> {
        if (this.pendingRetry && !this.isGenerating) {
            const { command, error } = this.pendingRetry;
            this.pendingRetry = null; // Clear pending retry
            
            console.log('🔄 Processing queued retry after generation completed');
            await this.processCommandRetry(command, error);
        }
    }

    private clearChat(): void {
        if (confirm('Are you sure you want to clear the chat history? This will not affect your outline or context items.')) {
            // Only clear the conversation history, keep the whiteboard unchanged
            this.conversationHistory = [];
            
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = `
                    <div class="message message-assistant">
                        <div class="message-content">
                            Chat cleared! Your outline and context items remain unchanged. How can I help improve your content?
                        </div>
                    </div>
                `;
            }
            // Note: NOT calling this.updateWhiteboard() to keep outline and context items
        }
    }



    /**
     * Update the source node with current story elements using chat_edited versioning
     */
    private async updateSourceNode(): Promise<void> {
        try {
            // Start loading state
            this.setUpdateButtonState('loading');
            
            if (!this.sourceNode) {
                console.warn('No source node available to update');
                this.setUpdateButtonState('error', 'No source node available');
                return;
            }

            // Get unified outline content
            const outlineContent = this.getCurrentOutlineContent();

            // Get context items (individual elements as before)
            const storyElements = this.storySystem.service.getElementsForContext();
            const contextElements = storyElements.filter(el => el.type === 'context');
            const contextContent = contextElements
                .map(el => {
                    // Ensure each context item is a single paragraph by joining with spaces
                    const description = el.description.replace(/\n+/g, ' ').trim();
                    return description;
                })
                .join('\n\n'); // Separate context items by paragraphs

            if (!outlineContent && !contextContent) {
                console.warn('No content changes found. Please modify the outline or context items first.');
                this.setUpdateButtonState('error', 'No content changes found');
                return;
            }


            
            // Check if there's already a "chat_edited" version
            const existingChatVersions = this.sourceNode.getVersionsWithTag('chat_edited');
            
            if (existingChatVersions.length > 0) {
                // Update existing chat_edited version
                const chatEditedVersion = existingChatVersions[0]!;

                
                // Update the version directly (not the master)
                chatEditedVersion.content = outlineContent || chatEditedVersion.content;
                chatEditedVersion.context = contextContent || chatEditedVersion.context;
                chatEditedVersion.timestamp = new Date();
                
                // Promote this updated version to master
                this.sourceNode.promoteToMaster(chatEditedVersion.id);

                } else {
                // Create new version with chat_edited tag

                const newVersionId = this.sourceNode.addVersion(['chat_edited'], {
                    content: outlineContent || this.sourceNode.content,
                    context: contextContent || this.sourceNode.context
                });
                
                if (newVersionId) {
                    this.sourceNode.promoteToMaster(newVersionId);
    
                } else {
                    console.warn('Failed to create new chat_edited version - may already exist');
                }
            }
            


            // Save the project
            const activeProject = getActiveProject();
            if (activeProject) {
                await activeProject.saveToStorage();
                
                // Trigger UI update by emitting tree-update-needed event
                activeProject.emit('tree-update-needed', { 
                    nodeId: this.sourceNode.id, 
                    reason: 'chat-edited' 
                });
                console.log('🔄 Triggered main UI refresh for node:', this.sourceNode.id);
            }

            // Success feedback

            this.setUpdateButtonState('success');

            // Don't auto-close - let user decide when to close

        } catch (error) {
            console.error('Error updating source node:', error);
            this.setUpdateButtonState('error', 'Failed to update node');
        }
    }

    /**
     * Set visual feedback state for the update button
     */
    private setUpdateButtonState(state: 'loading' | 'success' | 'error' | 'normal', message?: string): void {
        const updateButton = document.getElementById('create-project-btn') as HTMLButtonElement;
        if (!updateButton) return;

        // Reset classes
        updateButton.classList.remove('loading', 'success', 'error');
        updateButton.disabled = false;

        switch (state) {
            case 'loading':
                updateButton.classList.add('loading');
                updateButton.disabled = true;
                updateButton.innerHTML = '⏳ Updating...';
                break;
                
            case 'success':
                updateButton.classList.add('success');
                updateButton.innerHTML = '✅ Updated!';
                // Reset to normal after 2 seconds
                setTimeout(() => {
                    this.setUpdateButtonState('normal');
                }, 2000);
                break;
                
            case 'error':
                updateButton.classList.add('error');
                updateButton.innerHTML = `❌ ${message || 'Error'}`;
                // Reset to normal after 3 seconds
                setTimeout(() => {
                    this.setUpdateButtonState('normal');
                }, 3000);
                break;
                
            case 'normal':
            default:
                this.updateButtonText(); // Use existing method to set correct text
                break;
        }
    }

    /**
     * Check if there are unsaved changes by comparing current content with source node
     */
    private hasUnsavedChanges(): boolean {
        if (!this.sourceNode) {
            return false;
        }

        try {
            // Get current outline content (same logic as updateSourceNode)
            const currentOutlineContent = this.getCurrentOutlineContent();

            // Get current context items (same logic as updateSourceNode)
            const storyElements = this.storySystem.service.getElementsForContext();
            const contextElements = storyElements.filter(el => el.type === 'context');
            const currentContextContent = contextElements
                .map(el => {
                    const description = el.description.replace(/\n+/g, ' ').trim();
                    return description;
                })
                .join('\n\n');

            // Compare with source node's current content
            const sourceOutlineContent = this.sourceNode.content || '';
            const sourceContextContent = this.sourceNode.context || '';

            // Normalize whitespace for comparison
            const normalizeContent = (content: string) => content.trim().replace(/\s+/g, ' ');

            const outlineChanged = normalizeContent(currentOutlineContent || '') !== normalizeContent(sourceOutlineContent);
            const contextChanged = normalizeContent(currentContextContent || '') !== normalizeContent(sourceContextContent);

            return outlineChanged || contextChanged;
        } catch (error) {
            console.error('Error checking for unsaved changes:', error);
            // If we can't determine during initialization, there are no changes yet
            throw error;
        }
    }



    /**
     * Close the modal with unsaved changes check (now just calls close())
     */
    private async closeWithUnsavedCheck(): Promise<void> {
        // Check for unsaved changes before closing
        if (this.hasUnsavedChanges()) {
            const confirmed = confirm(
                'You have unsaved changes. Are you sure you want to close without updating the source node?'
            );
            if (!confirmed) {
                return; // User clicked Cancel - DO NOT CLOSE
            }
        }
        
        // If we get here, it's safe to close
        await this.forceClose();
    }
    
    /**
     * Force close without unsaved changes check (for internal use)
     */
    private async forceClose(): Promise<void> {
        // Clean up text editors
        this.elementEditors.forEach(editor => editor.destroy());
        this.elementEditors.clear();
        
        // Clean up outline editor
        if (this.outlineEditor) {
            this.outlineEditor.destroy();
            this.outlineEditor = null;
        }
        
        // No state persistence needed
        
        // Call parent close
        await super.close();
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
            
            // Scroll to show newly added context items
            if (type === 'context') {
                this.scrollToNewContextItems();
            }
        } catch (error) {
            console.error(`Failed to add new ${type} element:`, error);
        }
    }

    /**
     * Initialize the unified outline editor
     */
    private initializeUnifiedOutlineEditor(): void {
        const outlineContainer = document.getElementById('unified-outline-editor');
        if (!outlineContainer) return;



        // Always recreate editor for now - persistent highlights will handle highlighting

        // Clear placeholder if it exists
        outlineContainer.innerHTML = '';

        // Get current outline content
        const currentContent = this.getCurrentOutlineContent();

        // Create a textarea for the UniversalTextEditor
        const textarea = document.createElement('textarea');
        textarea.id = 'outline-textarea';
        textarea.style.width = '100%';
        textarea.style.minHeight = '200px';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.resize = 'vertical';
        textarea.style.fontFamily = 'inherit';
        textarea.style.fontSize = 'inherit';
        textarea.placeholder = 'Start writing your outline here or ask AI to create one...';
        textarea.value = currentContent;

        outlineContainer.appendChild(textarea);

        // Initialize UniversalTextEditor
        this.outlineEditor = UniversalTextEditor.replace(textarea, {
            mode: 'enhanced'
        });

        // Listen for changes to save to history
        this.outlineEditor.addEventListener('input', () => {
            this.saveOutlineVersion(this.outlineEditor!.value, 'user');
        });
        
        // Apply any persistent highlights
        this.applyPersistentHighlights();
    }

    /**
     * Add event listeners for outline control buttons
     */
    private addOutlineControlListeners(): void {
        const resetOutlineBtn = document.getElementById('outline-reset-btn');
        const undoBtn = document.getElementById('outline-undo-btn');
        const redoBtn = document.getElementById('outline-redo-btn');
        const resetContextBtn = document.getElementById('context-reset-btn');

        if (resetOutlineBtn) {
            resetOutlineBtn.addEventListener('click', () => this.resetOutlineToOriginal());
        }

        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undoOutlineChange());
        }

        if (redoBtn) {
            redoBtn.addEventListener('click', () => this.redoOutlineChange());
        }

        if (resetContextBtn) {
            resetContextBtn.addEventListener('click', () => this.resetContextToOriginal());
        }
    }

    /**
     * Get current outline content from history or editor
     */
    private getCurrentOutlineContent(): string {
        if (this.outlineHistory.length > 0 && this.currentOutlineVersion >= 0 && this.currentOutlineVersion < this.outlineHistory.length) {
            const version = this.outlineHistory[this.currentOutlineVersion];
            return version ? version.content : '';
        }
        return '';
    }

    /**
     * Save a new outline version to history
     */
    private saveOutlineVersion(content: string, source: 'user' | 'ai'): void {
        // Don't save if content is unchanged
        if (this.outlineHistory.length > 0 && 
            this.currentOutlineVersion >= 0 && 
            this.currentOutlineVersion < this.outlineHistory.length) {
            const currentVersion = this.outlineHistory[this.currentOutlineVersion];
            if (currentVersion && currentVersion.content === content) {
                return;
            }
        }

        // Remove any versions after current (when adding new version after undo)
        if (this.currentOutlineVersion < this.outlineHistory.length - 1) {
            this.outlineHistory = this.outlineHistory.slice(0, this.currentOutlineVersion + 1);
        }

        // Add new version
        this.outlineHistory.push({
            content,
            timestamp: new Date(),
            source
        });

        this.currentOutlineVersion = this.outlineHistory.length - 1;

        // Limit history size
        const maxHistorySize = 50;
        if (this.outlineHistory.length > maxHistorySize) {
            this.outlineHistory = this.outlineHistory.slice(-maxHistorySize);
            this.currentOutlineVersion = this.outlineHistory.length - 1;
        }

        // Update UI to reflect new state
        this.updateOutlineControls();
    }

    /**
     * Undo outline change
     */
    private undoOutlineChange(): void {
        if (this.currentOutlineVersion > 0) {
            this.currentOutlineVersion--;
            this.restoreOutlineVersion();
        }
    }

    /**
     * Redo outline change
     */
    private redoOutlineChange(): void {
        if (this.currentOutlineVersion < this.outlineHistory.length - 1) {
            this.currentOutlineVersion++;
            this.restoreOutlineVersion();
        }
    }

    /**
     * Restore outline to specific version
     */
    private restoreOutlineVersion(): void {
        if (this.outlineEditor && this.currentOutlineVersion >= 0 && this.currentOutlineVersion < this.outlineHistory.length) {
            const version = this.outlineHistory[this.currentOutlineVersion];
            if (version) {
                this.outlineEditor.value = version.content;
            }
            this.updateOutlineControls();
        }
    }

    /**
     * Update outline control button states
     */
    private updateOutlineControls(): void {
        const undoBtn = document.getElementById('outline-undo-btn') as HTMLButtonElement;
        const redoBtn = document.getElementById('outline-redo-btn') as HTMLButtonElement;
        const versionInfo = document.querySelector('.outline-version-info');

        if (undoBtn) {
            undoBtn.disabled = this.currentOutlineVersion <= 0;
        }

        if (redoBtn) {
            redoBtn.disabled = this.currentOutlineVersion >= this.outlineHistory.length - 1;
        }

        if (versionInfo) {
            const hasHistory = this.outlineHistory.length > 0;
            versionInfo.textContent = hasHistory ? 
                `v${this.currentOutlineVersion + 1}/${this.outlineHistory.length}` : 
                'v1';
        }
    }

    /**
     * Set outline content from AI (creates new version)
     */
    public setOutlineContentFromAI(content: string): void {
        this.saveOutlineVersion(content, 'ai');
        if (this.outlineEditor) {
            this.outlineEditor.value = content;
        }
    }

    /**
     * Update the button text based on the source node's template level
     */
    private updateButtonText(): void {
        const button = document.getElementById('create-project-btn');
        if (!button || !this.sourceNode) return;
        
        const templateLevel = this.sourceNode.template[this.sourceNode.level] || 'node';
        button.innerHTML = `🚀 Update ${templateLevel}`;
    }

    /**
     * Update the initial chat message based on the source node's template level
     */
    private updateInitialChatMessage(): void {
        const messageElement = document.getElementById('initial-chat-message');
        if (!messageElement || !this.sourceNode) return;
        
        const templateLevel = this.sourceNode.template[this.sourceNode.level] || 'content';
        const title = this.titleInput?.value || this.sourceNode.title || 'this content';
        
        messageElement.innerHTML = `
            Hi! I'm here to help you refine and improve your <strong>${templateLevel.toLowerCase()}</strong> "${title}".
            
            I can help you:
            • <strong>Enhance the outline</strong> - Make it more detailed, compelling, or well-structured
            • <strong>Improve context items</strong> - Add depth, fix inconsistencies, or expand on details
            • <strong>Refine content</strong> - Polish language, improve flow, or add missing elements
            
            <strong>💡 Pro tip:</strong> In the outline editor, you can select any sentence or paragraph and use the small edit buttons that appear to make focused improvements to just that part!
            
            The current content and context are loaded in the editor on the right. What would you like to work on?
        `;
    }

    /**
     * Scroll to show newly added context items (only call when items are actually added, not loaded)
     */
    private scrollToNewContextItems(): void {
        setTimeout(() => {
            // Find the whiteboard container and scroll to the bottom to show new context items
            if (this.whiteboardContainer) {
                // Smooth scroll to the bottom of the whiteboard to show context items
                this.whiteboardContainer.scrollTo({
                    top: this.whiteboardContainer.scrollHeight,
                    behavior: 'smooth'
                });
                
    
            }
        }, 150); // Small delay to ensure DOM has fully updated after whiteboard refresh
    }

    /**
     * Reset outline to original content from source node
     */
    private resetOutlineToOriginal(): void {
        if (!this.sourceNode) {
            console.warn('No source node available for outline reset');
            return;
        }

        if (confirm('Reset outline to original content? This will lose any changes made in the editor.')) {
            const originalContent = this.sourceNode.content || '';
            
            // Clear outline history and set original content
            this.outlineHistory = [];
            this.currentOutlineVersion = -1;
            this.saveOutlineVersion(originalContent, 'user');
            
            // Update the outline editor
            if (this.outlineEditor) {
                this.outlineEditor.value = originalContent;
            }
            
            // Update controls
            this.updateOutlineControls();
            
            // Note: Reset doesn't change the source node, just the editor state
            console.log('🔄 Reset outline to original content');
        }
    }

    /**
     * Reset context items to original items from source node
     */
    private async resetContextToOriginal(): Promise<void> {
        if (!this.sourceNode) {
            console.warn('No source node available for context reset');
            return;
        }

        if (confirm('Reset context items to original? This will remove any added or modified context items.')) {
            try {
                // Clear all existing context items
                const existingContextElements = this.storySystem.service.getElementsForContext()
                    .filter(el => el.type === 'context');
                for (const element of existingContextElements) {
                    await this.storySystem.service.deleteElement(element.id);
                }
                
                // Reload original context items
                const originalContext = this.sourceNode.context || '';
                const contextItems = originalContext.split('\n\n').filter(item => item.trim());
                
                if (contextItems.length > 0) {
                    for (const contextItem of contextItems) {
                        if (contextItem.trim()) {
                            await this.storySystem.service.addNewEmptyElement('context');
                            
                            // Find the newly created empty element and update it
                            const createdElements = this.storySystem.service.getElementsForContext()
                                .filter(el => el.type === 'context' && el.description === '');
                            if (createdElements.length > 0) {
                                const newElement = createdElements[createdElements.length - 1];
                                if (newElement) {
                                    await this.storySystem.service.handleHumanEdit(newElement.id, contextItem.trim());
                                }
                            }
                        }
                    }
                }
                
                // Update the whiteboard
                this.updateWhiteboard();
                
                console.log('🔄 Reset context items to original');
        } catch (error) {
                console.error('Error resetting context items:', error);
                alert('Failed to reset context items. Please try again.');
            }
        }
    }

    /**
     * Apply initialization data from an existing node
     */
    private async applyInitializationData(data: {title: string, content: string, contextItems: string[], sourceNode: DocumentNode}): Promise<void> {

        
        // Set title if provided and element exists
        if (data.title) {
            if (!this.titleInput) {
                this.titleInput = document.getElementById('project-title-input') as HTMLInputElement;
            }
            if (this.titleInput) {
                this.titleInput.value = data.title;
            }
        }

        // Initialize outline with content if provided
        if (data.content) {
            // Clear any existing outline history and set new content
            this.outlineHistory = [];
            this.currentOutlineVersion = -1;
            this.saveOutlineVersion(data.content, 'user');
            
            // Update the outline editor if it exists
            if (this.outlineEditor) {
                this.outlineEditor.value = data.content;
            }
        }

        // Add context items if provided
        if (data.contextItems && data.contextItems.length > 0) {
            // Clear existing context items first
            const existingContextElements = this.storySystem.service.getElementsForContext()
                .filter(el => el.type === 'context');
            for (const element of existingContextElements) {
                await this.storySystem.service.deleteElement(element.id);
            }
            
            // Add new context items
            for (let index = 0; index < data.contextItems.length; index++) {
                const contextItem = data.contextItems[index];
                if (contextItem && contextItem.trim()) { // Only add non-empty items
                    await this.storySystem.service.addNewEmptyElement('context');
                    
                    // Update the empty element with content - need to find the actual element that was created
                    const createdElements = this.storySystem.service.getElementsForContext()
                        .filter(el => el.type === 'context' && el.description === '');
                    if (createdElements.length > 0) {
                        const newElement = createdElements[createdElements.length - 1]; // Get the last created empty element
                        if (newElement) {
                            await this.storySystem.service.handleHumanEdit(newElement.id, contextItem.trim());
                        }
                    }
                }
            }
        }

        // Update the whiteboard to reflect changes
        this.updateWhiteboard();
        
        // Update button text to reflect the source node's template level
        this.updateButtonText();
        
        // Update initial chat message to reflect the editing context
        this.updateInitialChatMessage();
        

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
        
                } else {
        
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
        if (this.modelSelector?.value) {
            const storage = await StorageService.getInstance();
            await storage.set(XML_STORY_MODEL_STORAGE_KEY, this.modelSelector.value);
        }
    }

    /**
     * Load saved full update mode preference from StorageService
     */
    private async loadSavedFullUpdateMode(): Promise<void> {
        const storage = await StorageService.getInstance();
        const savedMode = await storage.get(XML_STORY_FULL_UPDATE_MODE_KEY);
        
        if (savedMode !== null && this.fullUpdateModeCheckbox) {
            this.fullUpdateMode = savedMode as boolean;
            this.fullUpdateModeCheckbox.checked = this.fullUpdateMode;
        }
    }

    /**
     * Save current full update mode preference to StorageService
     */
    private async saveFullUpdateMode(): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.set(XML_STORY_FULL_UPDATE_MODE_KEY, this.fullUpdateMode);
    }
    
    /**
     * Load custom buttons from storage
     */
    private async loadCustomButtons(): Promise<void> {
        console.log('loadCustomButtons called');
        console.log('sourceNode:', this.sourceNode);
        const storageKey = `xml-story-custom-buttons-${this.sourceNode!.id}`;
        console.log('Storage key:', storageKey);
        
        const storage = await StorageService.getInstance();
        const stored = await storage.get(storageKey);
        console.log('Stored data:', stored);
        if (stored) {
            this.customButtons = stored as Array<{id: string, caption: string, prompt: string}>;
            console.log('Loaded custom buttons:', this.customButtons);
            this.renderCustomButtons();
        } else {
            console.log('No stored custom buttons found');
            this.customButtons = [];
            this.renderCustomButtons();
        }
    }
    
    /**
     * Save custom buttons to storage
     */
    private async saveCustomButtons(): Promise<void> {
        const storageKey = `xml-story-custom-buttons-${this.sourceNode!.id}`;
        const storage = await StorageService.getInstance();
        await storage.set(storageKey, this.customButtons);
        console.log('Custom buttons saved successfully');
    }
    
    /**
     * Create a new custom button from current prompt
     */
    private async createCustomButton(): Promise<void> {
        console.log('createCustomButton called');
        if (!this.messageInput) {
            console.log('No messageInput found');
            return;
        }
        
        const currentPrompt = this.messageInput.value.trim();
        console.log('Current prompt:', currentPrompt);
        if (!currentPrompt) {
            alert('Please enter a prompt in the message input first.');
            return;
        }
        
        const caption = prompt('Enter a caption for this button:');
        console.log('Caption entered:', caption);
        if (!caption) return;
        
        const buttonId = `custom-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newButton = {
            id: buttonId,
            caption: caption.trim(),
            prompt: currentPrompt
        };
        
        console.log('Adding new button:', newButton);
        this.customButtons.push(newButton);
        console.log('Custom buttons array:', this.customButtons);
        await this.saveCustomButtons();
        this.renderCustomButtons();
    }
    
    /**
     * Render custom buttons in the sidebar
     */
    private renderCustomButtons(): void {
        console.log('renderCustomButtons called');
        console.log('customButtonsContainer:', this.customButtonsContainer);
        if (!this.customButtonsContainer) {
            console.log('customButtonsContainer not found!');
            return;
        }
        
        if (this.customButtons.length === 0) {
            this.customButtonsContainer.innerHTML = '<div style="color: #888; font-size: 0.8rem; font-style: italic;">No custom buttons yet</div>';
            return;
        }
        
        this.customButtonsContainer.innerHTML = this.customButtons.map(button => `
            <button class="custom-button" data-button-id="${button.id}" title="${button.prompt}">
                ${button.caption}
                <button class="custom-button-remove" data-remove-id="${button.id}" title="Remove button">×</button>
            </button>
        `).join('');
        
        // Add event listeners for custom buttons
        this.customButtonsContainer.querySelectorAll('.custom-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('custom-button-remove')) return; // Don't trigger on remove button
                
                const buttonId = (btn as HTMLElement).dataset['buttonId'];
                if (buttonId) {
                    this.useCustomButton(buttonId);
                }
            });
        });
        
        // Add event listeners for remove buttons
        this.customButtonsContainer.querySelectorAll('.custom-button-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the parent button
                const removeId = (btn as HTMLElement).dataset['removeId'];
                if (removeId) {
                    void this.removeCustomButton(removeId);
                }
            });
        });
    }
    
    /**
     * Use a custom button (populate message input with its prompt and send)
     */
    private useCustomButton(buttonId: string): void {
        const button = this.customButtons.find(b => b.id === buttonId);
        if (button && this.messageInput) {
            this.messageInput.value = button.prompt;
            this.messageInput.focus();
            // Automatically send the message
            void this.sendMessage();
        }
    }
    
    /**
     * Remove a custom button
     */
    private async removeCustomButton(buttonId: string): Promise<void> {
        const buttonIndex = this.customButtons.findIndex(b => b.id === buttonId);
        if (buttonIndex !== -1) {
            this.customButtons.splice(buttonIndex, 1);
            await this.saveCustomButtons();
            this.renderCustomButtons();
        }
    }

    /**
     * Set up persistent highlight that survives editor recreation
     */
    private setPersistentHighlight(startPos: number, endPos: number, className: string): void {
        // Clear any existing timer
        if (this.highlightTimer) {
            clearTimeout(this.highlightTimer);
        }
        
        // Set up new persistent highlight
        this.persistentHighlight = {
            startPos,
            endPos,
            className,
            expiresAt: Date.now() + DEFAULT_XML_STORY_CONFIG.highlightDuration
        };
        
        // Apply highlight immediately if editor exists
        this.applyPersistentHighlights();
        
        // Set timer to clear highlight
        this.highlightTimer = window.setTimeout(() => {
            this.clearPersistentHighlight();
        }, DEFAULT_XML_STORY_CONFIG.highlightDuration);
    }
    
    /**
     * Apply persistent highlights to the current editor (if any and not expired)
     */
    private applyPersistentHighlights(): void {
        if (!this.persistentHighlight || !this.outlineEditor) {
            return;
        }
        
        // Check if highlight has expired
        if (Date.now() > this.persistentHighlight.expiresAt) {
            this.clearPersistentHighlight();
            return;
        }
        
        // Apply the highlight
        const highlightId = `persistent-highlight-${Date.now()}`;
        this.outlineEditor.addHighlight(
            highlightId,
            this.persistentHighlight.startPos,
            this.persistentHighlight.endPos,
            this.persistentHighlight.className
        );
    }
    
    /**
     * Clear persistent highlight
     */
    private clearPersistentHighlight(): void {
        this.persistentHighlight = null;
        if (this.highlightTimer) {
            clearTimeout(this.highlightTimer);
            this.highlightTimer = null;
        }
    }
    


    public override async close(): Promise<void> {
        // Clean up persistent highlights
        this.clearPersistentHighlight();
        
        // Always redirect to closeWithUnsavedCheck to ensure proper handling
        await this.closeWithUnsavedCheck();
    }
}