/**
 * Guided Outline Creator Component
 * 
 * Provides a chat-based interface for creating project outlines
 * with AI assistance using a structured conversation approach.
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import { SettingsManager } from '../../../SettingsManager';
import { ChatInterface, ChatMessage } from '../../chat-interface';
import { StorageService } from '../../../StorageService';
import { getContextItems } from '../../../ContextFormat';
import { getPromptText } from '../../../PromptManager';
import { TemplateSelector } from '../../components/TemplateSelector';
import { createPromptExpansionService } from '../../../services/PromptExpansionService';
import { PromptContextBuilder } from '../../../services/PromptContextBuilder';
import * as state from '../../../state';
import { attachModalCloseHandlers } from '../core/modal-utils';

export interface GuidedOutlineCreatorConfig {
    onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
    settingsManager: SettingsManager;
}

export interface GuidedOutlineResult {
    title: string;
    outline: string;
    context: string;
}

/**
 * Shape of the single persisted guided-outline chat. Only the most recent chat
 * is kept; each assistant reply overwrites it so the user can resume refining.
 */
interface StoredGuidedChat {
    messages: ChatMessage[];
    updatedAt: number;
}

export class GuidedOutlineCreator {
    /** IndexedDB key (keyValue store) for the single most-recent guided chat. */
    private static readonly LAST_CHAT_KEY = 'expert_app_guided_outline_last_chat';

    private onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
    private settingsManager: SettingsManager;
    private chatInterface: ChatInterface | null = null;
    private isProcessingResult = false;
    private modalOverlay: HTMLElement | null = null;
    private templateSelector: TemplateSelector | null = null;
    private selectedTemplate: ProjectTemplate | null = null;
    private setupContainer: HTMLElement | null = null;

    constructor(config: GuidedOutlineCreatorConfig) {
        this.onCreate = config.onCreate;
        this.settingsManager = config.settingsManager;
    }

    public render(): string {
        return `
            <div class="guided-outline-creator">
                <div class="guided-info">
                    <h3>🗣️ Guided Outline Creation</h3>
                    <p>Choose a template, then chat with AI to create your structured story outline.</p>
                    
                    <div class="template-selection-section" style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div id="guided-template-selector"></div>
                    </div>
                </div>

                <div class="guided-actions">
                    <button type="button" class="button button-secondary guided-cancel-btn">
                        Cancel
                    </button>
                    <button type="button" class="button button-secondary guided-load-btn" style="display: none;">
                        Load Last Chat
                    </button>
                    <button type="button" class="button button-primary guided-start-btn">
                        Start Guided Chat
                    </button>
                </div>

                <style>
                    .guided-outline-creator {
                        padding: 1rem;
                        text-align: center;
                        max-width: 90%;
                        margin: 0 auto;
                    }

                    .guided-info h3 {
                        margin: 0 0 0.5rem 0;
                        color: #333;
                        font-size: 1.5em;
                    }

                    .guided-info p {
                        color: #666;
                        margin: 0 0 1rem 0;
                        line-height: 1.4;
                        font-size: 1em;
                    }

                    .guided-process {
                        background: #f8f9fa;
                        padding: 4%;
                        border-radius: 8px;
                        margin-bottom: 4%;
                        border-left: 0.4% solid #007bff;
                        text-align: left;
                    }

                    .guided-process h4 {
                        margin: 0 0 3% 0;
                        color: #333;
                        font-size: 1.2em;
                    }

                    .guided-process ol {
                        margin: 0;
                        padding-left: 4%;
                    }

                    .guided-process li {
                        margin: 2% 0;
                        line-height: 1.5;
                    }

                    .guided-process strong {
                        color: #007bff;
                    }

                    .guided-actions {
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                        align-items: center;
                        margin-top: 1.5rem;
                    }

                    .guided-actions .button {
                        min-width: 120px;
                        padding: 0.75rem 1.5rem;
                        font-size: 1em;
                    }
                </style>
            </div>
        `;
    }

    public setupEventListeners(container: HTMLElement): void {
        this.setupContainer = container;

        // Initialize template selector
        this.initializeTemplateSelector();
        
        const startBtn = container.querySelector('.guided-start-btn') as HTMLButtonElement;
        const cancelBtn = container.querySelector('.guided-cancel-btn') as HTMLButtonElement;
        const loadBtn = container.querySelector('.guided-load-btn') as HTMLButtonElement;

        if (startBtn) {
            startBtn.addEventListener('click', () => void this.openGuidedChat());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCancel(container));
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', () => void this.openGuidedChat({ restorePreviousChat: true }));
        }

        // Reveal the "Load Last Chat" button only when a saved chat exists.
        void this.refreshLoadButtonVisibility();
    }

    /**
     * Show/hide the "Load Last Chat" button depending on whether a saved chat
     * exists in storage. Safe to call multiple times.
     */
    private async refreshLoadButtonVisibility(): Promise<void> {
        const loadBtn = this.setupContainer?.querySelector('.guided-load-btn') as HTMLButtonElement | null;
        if (!loadBtn) {
            return;
        }
        const stored = await this.loadStoredChat();
        loadBtn.style.display = stored && stored.messages.length > 0 ? '' : 'none';
    }

    private initializeTemplateSelector(): void {
        this.templateSelector = new TemplateSelector({
            containerId: 'guided-template-selector',
            onSelectionChange: (template, _templateName) => {
                this.selectedTemplate = template;
                this.updateStartButtonState();
            },
            showManagement: true,
            label: 'Project Template',
            helpText: 'Choose a template that matches your story structure. This will determine the organization of your project.',
            required: true
        });

        this.templateSelector.render();
        
        // Get the auto-selected template after render
        this.selectedTemplate = this.templateSelector.getSelectedTemplate();
    }

    private updateStartButtonState(): void {
        const startBtn = document.querySelector('.guided-start-btn') as HTMLButtonElement;
        if (startBtn) {
            startBtn.disabled = !this.selectedTemplate;
            startBtn.title = this.selectedTemplate ? 'Start the guided chat' : 'Please select a template first';
        }
    }

    public async openGuidedChat(options: { restorePreviousChat?: boolean } = {}): Promise<void> {
        try {
            // Validate template selection
            if (!this.selectedTemplate) {
                alert('Please select a project template before starting the guided chat.');
                return;
            }

            const openRouterClient = state.getOpenRouterClient();
            if (!openRouterClient) {
                alert('OpenRouter client not available. Please check your settings.');
                return;
            }

            // Get the guided outline system prompt from PromptManager and expand placeholders
            const guidedOutlinePromptTemplate = getPromptText('guided_outline_system');
            const expansionService = createPromptExpansionService(this.settingsManager);
            
            // Create basic context for placeholder expansion (mainly for language)
            const promptContext = PromptContextBuilder.forAnalysis(this.settingsManager, {});
            
            // Expand the prompt with placeholders
            const guidedOutlinePrompt = expansionService.expandPrompt(
                guidedOutlinePromptTemplate, 
                promptContext
            );

            // Create modal overlay (same pattern as manual chat)
            this.modalOverlay = document.createElement('div');
            this.modalOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            const modalContainer = document.createElement('div');
            modalContainer.style.cssText = `
                width: 90%;
                height: 90%;
                max-width: 90vw;
                max-height: 90vh;
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            this.modalOverlay.appendChild(modalContainer);
            document.body.appendChild(this.modalOverlay);

            // The chat fills the available space; a fixed footer below it holds the
            // explicit "Create Project" action so finishing the outline is always a
            // deliberate user step (never auto-triggered by a chat message).
            const chatHost = document.createElement('div');
            chatHost.style.cssText = 'flex: 1; min-height: 0; display: flex;';
            modalContainer.appendChild(chatHost);
            modalContainer.appendChild(this.buildFooter());

            // Create chat interface with guided outline prompt
            this.chatInterface = new ChatInterface(
                openRouterClient, 
                this.settingsManager, 
                guidedOutlinePrompt, 
                'Guided Outline Creation',
                undefined // No node structure needed for guided outline
            );
            await this.chatInterface.initialize(chatHost);

            // Persist after every reply and keep the create button in sync. This
            // replaces the previous polling approach entirely.
            this.chatInterface.onConversationUpdated = () => {
                void this.handleConversationUpdated();
            };

            // Optionally restore the previously saved chat for further refinement.
            if (options.restorePreviousChat) {
                const stored = await this.loadStoredChat();
                if (stored && stored.messages.length > 0) {
                    this.chatInterface.restoreMessages(stored.messages);
                }
            }

            // Reflect the initial state of the create button (e.g. after restore).
            this.updateCreateButtonState();

            // Close modal functionality
            const closeModal = () => {
                this.cleanup();
            };
            
            attachModalCloseHandlers(this.modalOverlay, closeModal);
            
        } catch (error) {
            console.error('Error opening guided chat:', error);
            alert('Failed to open guided chat. Please try again.');
        }
    }

    /**
     * Builds the footer bar shown below the chat, containing the hint and the
     * explicit "Create Project from Outline" button.
     */
    private buildFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.75rem 1rem;
            border-top: 1px solid #e5e5e5;
            background: #f8f9fa;
        `;

        const hint = document.createElement('div');
        hint.className = 'guided-create-hint';
        hint.style.cssText = 'font-size: 0.85rem; color: #6c757d;';
        hint.textContent = 'Keep chatting to refine your outline. When the AI presents the final outline, the button activates.';

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'button button-primary guided-create-btn';
        createBtn.textContent = '✅ Create Project from Outline';
        createBtn.disabled = true;
        createBtn.style.whiteSpace = 'nowrap';
        createBtn.addEventListener('click', () => void this.handleCreateClicked());

        footer.appendChild(hint);
        footer.appendChild(createBtn);
        return footer;
    }

    /**
     * Returns the content of the latest non-streaming assistant message, or null
     * when there is none yet.
     */
    private getLatestAssistantContent(): string | null {
        if (!this.chatInterface) {
            return null;
        }
        const messages = this.chatInterface.getMessages();
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i]!;
            if (message.role === 'assistant' && !message.isStreaming) {
                return message.content;
            }
        }
        return null;
    }

    /**
     * Enable the create button only when the latest assistant message looks like a
     * complete structured outline result.
     */
    private updateCreateButtonState(): void {
        const createBtn = this.modalOverlay?.querySelector('.guided-create-btn') as HTMLButtonElement | null;
        if (!createBtn) {
            return;
        }
        const content = this.getLatestAssistantContent();
        const ready = content !== null && this.isStructuredResult(content);
        createBtn.disabled = !ready;
        createBtn.title = ready
            ? 'Review and create the project from this outline'
            : 'Waiting for the AI to produce the final structured outline';
    }

    /**
     * Called on every conversation change: persist the chat and refresh the
     * create button. Never creates a project on its own.
     */
    private async handleConversationUpdated(): Promise<void> {
        this.updateCreateButtonState();
        await this.saveCurrentChat();
    }

    /**
     * User explicitly asked to create the project. Parse the latest result, show a
     * confirmation preview, and only build the project once confirmed.
     */
    private async handleCreateClicked(): Promise<void> {
        // Guard against a second create attempt while one is already in flight.
        if (this.isProcessingResult) {
            return;
        }

        const content = this.getLatestAssistantContent();
        if (content === null || !this.isStructuredResult(content)) {
            alert('The latest AI message is not a finished outline yet. Keep refining until the AI presents the structured outline.');
            return;
        }

        const result = this.parseStructuredResult(content);
        if (!result) {
            alert('Could not parse the outline from the latest AI message. Ask the AI to present the final outline again.');
            return;
        }

        const confirmed = await this.showConfirmation(result);
        if (!confirmed) {
            return;
        }

        this.isProcessingResult = true;
        await this.processStructuredResult(content);
    }

    /**
     * Shows a preview of the parsed outline and asks the user to confirm creation.
     * Resolves true when the user confirms, false when they choose to keep refining.
     */
    private showConfirmation(result: GuidedOutlineResult): Promise<boolean> {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 21000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 1.5rem;
                max-width: 720px;
                width: 90%;
                max-height: 85vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            `;

            const title = document.createElement('h2');
            title.style.cssText = 'margin: 0 0 0.5rem 0; color: #333; font-size: 1.4rem;';
            title.textContent = 'Create project from this outline?';

            const subtitle = document.createElement('p');
            subtitle.style.cssText = 'margin: 0 0 1rem 0; color: #666; line-height: 1.5;';
            subtitle.textContent = 'Review the parsed result below. Creating the project will use this outline and context. You can keep refining the chat instead.';

            dialog.appendChild(title);
            dialog.appendChild(subtitle);
            dialog.appendChild(this.buildPreviewSection('Title', result.title));
            dialog.appendChild(this.buildPreviewSection('Outline', result.outline));
            dialog.appendChild(this.buildPreviewSection('Context', result.context));

            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.25rem;';

            const keepBtn = document.createElement('button');
            keepBtn.type = 'button';
            keepBtn.className = 'button button-secondary';
            keepBtn.textContent = 'Keep Refining';

            const createBtn = document.createElement('button');
            createBtn.type = 'button';
            createBtn.className = 'button button-primary';
            createBtn.textContent = '✅ Create Project';

            actions.appendChild(keepBtn);
            actions.appendChild(createBtn);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const finish = (confirmed: boolean): void => {
                if (document.body.contains(backdrop)) {
                    document.body.removeChild(backdrop);
                }
                resolve(confirmed);
            };

            keepBtn.addEventListener('click', () => finish(false));
            createBtn.addEventListener('click', () => finish(true));
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    finish(false);
                }
            });
        });
    }

    /**
     * Builds one labeled, read-only preview block for the confirmation dialog.
     */
    private buildPreviewSection(label: string, value: string): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-bottom: 1rem;';

        const heading = document.createElement('div');
        heading.style.cssText = 'font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 0.35rem;';
        heading.textContent = label;

        const body = document.createElement('div');
        body.style.cssText = `
            white-space: pre-wrap;
            word-break: break-word;
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 0.75rem;
            max-height: 220px;
            overflow-y: auto;
            font-size: 0.9rem;
            color: #333;
            line-height: 1.5;
        `;
        body.textContent = value.trim().length > 0 ? value : '(empty)';

        wrapper.appendChild(heading);
        wrapper.appendChild(body);
        return wrapper;
    }

    private isStructuredResult(content: string): boolean {
        // Check for the specific format: ===<title>=== ... ===context===
        const titleRegex = /===(.+)===/;
        const contextSeparator = '===context===';
        
        return titleRegex.test(content) && content.includes(contextSeparator);
    }

    private async processStructuredResult(content: string): Promise<void> {
        try {
            const result = this.parseStructuredResult(content);
            if (!result) {
                console.error('Failed to parse structured result');
                return;
            }

            // Use the selected template
            if (!this.selectedTemplate) {
                alert('No template selected');
                return;
            }

            // Process context to convert "Trigger: <word>." format to proper conditional context format
            const processedContext = this.processContextForConditionalParsing(result.context);

            // Create AI data structure for the guided outline result
            const aiData = {
                isAIGenerated: true,
                content: result.outline,
                context: processedContext,
                description: 'Generated by Guided Outline',
                projectType: 'guided-outline',
                options: {}
            };

            // Create the project. The host modal closes and calls cleanup() on us.
            this.onCreate(result.title, this.selectedTemplate, aiData);

        } catch (error) {
            console.error('Error processing structured result:', error);
            alert('Failed to process outline result. Please try again.');
            // Allow another attempt after a failure.
            this.isProcessingResult = false;
        }
    }

    private parseStructuredResult(content: string): GuidedOutlineResult | null {
        try {
            // Extract title using the === format
            const titleMatch = content.match(/===(.+)===/);
            if (!titleMatch) {
                console.error('No title found in structured result');
                return null;
            }
            const title = titleMatch[1]!.trim();

            // Split content at the context separator
            const contextSeparatorIndex = content.indexOf('===context===');
            if (contextSeparatorIndex === -1) {
                console.error('No context separator found in structured result');
                return null;
            }

            // Extract outline (everything between title and context separator)
            const outlineStart = content.indexOf('\n', titleMatch.index! + titleMatch[0].length) + 1;
            const outline = content.substring(outlineStart, contextSeparatorIndex).trim();

            // Extract context (everything after context separator)
            const context = content.substring(contextSeparatorIndex + '===context==='.length).trim();

            return {
                title,
                outline,
                context
            };

        } catch (error) {
            console.error('Error parsing structured result:', error);
            return null;
        }
    }

    private handleCancel(container: HTMLElement): void {
        // Emit cancel event
        const event = new CustomEvent('guided-cancel');
        container.dispatchEvent(event);
    }

    /**
     * Process context to convert "Trigger: <word>." format to the format expected by parseAIConditionalContext
     */
    private processContextForConditionalParsing(context: string): string {
        const contextItems = getContextItems(context);
        const processedItems: string[] = [];

        for (const item of contextItems) {
            const trimmed = item.trim();
            if (!trimmed) continue;

            // Check if this item starts with "Trigger: "
            const triggerMatch = trimmed.match(/^Trigger:\s*(.+?)\.\s*(.*)/s);
            
            if (triggerMatch && triggerMatch[1] && triggerMatch[2]) {
                // Convert "Trigger: word." format to "<trigger>word</trigger>" format
                const triggerWord = triggerMatch[1].trim();
                const contextText = triggerMatch[2].trim();
                
                // Use the format expected by parseAIConditionalContext
                processedItems.push(`<trigger>${triggerWord}</trigger>${contextText}`);
            } else {
                // This is a global context item (no trigger)
                processedItems.push(trimmed);
            }
        }

        // Join back with double newlines to maintain paragraph structure
        return processedItems.join('\n\n');
    }

    /**
     * Persist the current conversation as the single "last chat", overwriting any
     * previous one. Called after every reply (and other conversation changes).
     */
    private async saveCurrentChat(): Promise<void> {
        if (!this.chatInterface) {
            return;
        }
        // Only persist settled messages; a streaming placeholder is transient.
        const messages = this.chatInterface.getMessages().filter(m => !m.isStreaming);
        if (messages.length === 0) {
            return;
        }
        const payload: StoredGuidedChat = { messages, updatedAt: Date.now() };
        const storage = await StorageService.getInstance();
        await storage.set(GuidedOutlineCreator.LAST_CHAT_KEY, payload);
    }

    /**
     * Load the single most-recent guided chat, or null when none is stored.
     */
    private async loadStoredChat(): Promise<StoredGuidedChat | null> {
        const storage = await StorageService.getInstance();
        const stored = await storage.get<StoredGuidedChat>(GuidedOutlineCreator.LAST_CHAT_KEY);
        return stored ?? null;
    }

    public cleanup(): void {
        // Detach the conversation listener so nothing fires against a torn-down
        // creator, then drop the chat interface reference.
        if (this.chatInterface) {
            this.chatInterface.onConversationUpdated = null;
            this.chatInterface = null;
        }

        // Clean up modal overlay if it exists
        if (this.modalOverlay && document.body.contains(this.modalOverlay)) {
            document.body.removeChild(this.modalOverlay);
        }
        this.modalOverlay = null;
        
        // Clean up template selector
        if (this.templateSelector) {
            this.templateSelector.cleanup();
            this.templateSelector = null;
        }
        
        this.isProcessingResult = false;
        this.selectedTemplate = null;
        this.setupContainer = null;
    }
}
