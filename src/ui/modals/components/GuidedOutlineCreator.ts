/**
 * Guided Outline Creator Component
 * 
 * Provides a chat-based interface for creating project outlines
 * with AI assistance using a structured conversation approach.
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import { SettingsManager } from '../../../SettingsManager';
import { ChatInterface } from '../../chat-interface';
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

export class GuidedOutlineCreator {
    private onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
    private settingsManager: SettingsManager;
    private chatInterface: ChatInterface | null = null;
    private isProcessingResult = false;
    private modalOverlay: HTMLElement | null = null;
    private templateSelector: TemplateSelector | null = null;
    private selectedTemplate: ProjectTemplate | null = null;

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
        // Initialize template selector
        this.initializeTemplateSelector();
        
        const startBtn = container.querySelector('.guided-start-btn') as HTMLButtonElement;
        const cancelBtn = container.querySelector('.guided-cancel-btn') as HTMLButtonElement;

        if (startBtn) {
            startBtn.addEventListener('click', () => this.openGuidedChat());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCancel(container));
        }
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

    public async openGuidedChat(): Promise<void> {
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
            
            // Create chat interface with guided outline prompt
            this.chatInterface = new ChatInterface(
                openRouterClient, 
                this.settingsManager, 
                guidedOutlinePrompt, 
                'Guided Outline Creation',
                undefined // No node structure needed for guided outline
            );
            await this.chatInterface.initialize(modalContainer);

            // Set up message monitoring to detect structured results
            this.monitorChatMessages();
            
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

    private monitorChatMessages(): void {
        // We need to monitor the chat for messages that contain the structured result format
        // This is a bit tricky since ChatInterface doesn't have built-in hooks for this
        // We'll poll the chat messages periodically
        const checkInterval = setInterval(() => {
            if (this.isProcessingResult) {
                clearInterval(checkInterval);
                return;
            }

            // Get the last assistant message - access messages directly since we know the structure
            const messages = (this.chatInterface as unknown as { messages: Array<{ role: string; content: string; isStreaming?: boolean }> }).messages;
            
            const lastMessage = messages[messages.length - 1]!;
            if (lastMessage.role === 'assistant' && !lastMessage.isStreaming) {
                const content = lastMessage.content;
                
                // Check if this message contains the structured result format
                if (this.isStructuredResult(content)) {
                    this.isProcessingResult = true;
                    clearInterval(checkInterval);
                    this.processStructuredResult(content);
                }
            }
        }, 1000); // Check every second
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

            // Create the project
            this.onCreate(result.title, this.selectedTemplate, aiData);

        } catch (error) {
            console.error('Error processing structured result:', error);
            alert('Failed to process outline result. Please try again.');
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

    public cleanup(): void {
        // Clean up modal overlay if it exists
        if (this.modalOverlay && document.body.contains(this.modalOverlay)) {
            document.body.removeChild(this.modalOverlay);
        }
        this.modalOverlay = null;
        
        // Clean up chat interface if it exists
        if (this.chatInterface) {
            // ChatInterface doesn't have a cleanup method, but we can clear our reference
            this.chatInterface = null;
        }
        
        // Clean up template selector
        if (this.templateSelector) {
            this.templateSelector.cleanup();
            this.templateSelector = null;
        }
        
        this.isProcessingResult = false;
        this.selectedTemplate = null;
    }
}
