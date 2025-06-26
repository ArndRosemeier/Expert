/**
 * Service for managing AI prompt templates
 */

import { SettingsManager } from '../../../SettingsManager';
import { OrchestratorPrompts, defaultPrompts } from '../../../PromptManager';
import { createElement, autoResizeTextarea } from '../core/modal-utils';

export interface PromptManagementConfig {
    autoSave?: boolean;
    showDescriptions?: boolean;
    showPlaceholders?: boolean;
}

export interface PromptChangeEvent {
    promptKey: keyof OrchestratorPrompts;
    oldValue: string;
    newValue: string;
}

export class PromptManagementService {
    private settingsManager: SettingsManager;
    private prompts: OrchestratorPrompts;
    private config: PromptManagementConfig;
    private changeHandlers: ((event: PromptChangeEvent) => void)[] = [];
    private saveHandlers: (() => void)[] = [];

    constructor(settingsManager: SettingsManager, config: PromptManagementConfig = {}) {
        this.settingsManager = settingsManager;
        this.config = {
            autoSave: true,
            showDescriptions: true,
            showPlaceholders: true,
            ...config
        };
        this.prompts = { ...this.settingsManager.getPrompts() };
    }

    /**
     * Gets the current prompts
     */
    public getPrompts(): OrchestratorPrompts {
        return { ...this.prompts };
    }

    /**
     * Updates a specific prompt
     */
    public updatePrompt(key: keyof OrchestratorPrompts, value: string): void {
        const oldValue = this.prompts[key];
        this.prompts[key] = value;
        
        // Emit change event
        this.changeHandlers.forEach(handler => {
            handler({ promptKey: key, oldValue, newValue: value });
        });

        // Auto-save if enabled
        if (this.config.autoSave) {
            this.saveToStorage();
        }
    }

    /**
     * Reverts all prompts to defaults
     */
    public async revertToDefaults(): Promise<void> {
        const confirmed = confirm('Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.');
        if (!confirmed) {
            return;
        }

        this.prompts = { ...defaultPrompts };
        await this.saveToStorage();
        
        // Emit save event to trigger UI refresh
        this.saveHandlers.forEach(handler => handler());
    }

    /**
     * Saves prompts to storage
     */
    public async saveToStorage(): Promise<void> {
        await this.settingsManager.savePrompts(this.prompts);
        this.saveHandlers.forEach(handler => handler());
    }

    /**
     * Reloads prompts from storage
     */
    public reloadFromStorage(): void {
        this.prompts = { ...this.settingsManager.getPrompts() };
    }

    /**
     * Registers a change handler
     */
    public onPromptChange(handler: (event: PromptChangeEvent) => void): void {
        this.changeHandlers.push(handler);
    }

    /**
     * Registers a save handler
     */
    public onSave(handler: () => void): void {
        this.saveHandlers.push(handler);
    }

    /**
     * Renders the prompt editor UI
     */
    public renderEditor(container: HTMLElement): void {
        container.innerHTML = '';
        
        // Add styles
        this.addStyles(container);
        
        // Add header
        const header = createElement('p', {
            content: 'Configure the templates used by AI agents. Changes are saved automatically.',
            attributes: {
                style: 'color: #6b7280; font-size: 0.875rem; margin-bottom: 1rem;'
            }
        });
        container.appendChild(header);

        // Add prompt editors
        Object.keys(this.prompts).forEach(key => {
            const promptKey = key as keyof OrchestratorPrompts;
            const editorElement = this.createPromptEditor(promptKey);
            container.appendChild(editorElement);
        });

        // Add actions
        const actionsContainer = this.createActionsContainer();
        container.appendChild(actionsContainer);
    }

    /**
     * Creates a prompt editor for a specific prompt
     */
    private createPromptEditor(promptKey: keyof OrchestratorPrompts): HTMLElement {
        const editorDiv = createElement('div', {
            classes: ['prompt-editor']
        });

        // Label
        const label = createElement('label', {
            content: this.formatPromptName(promptKey),
            attributes: {
                for: `prompt-${promptKey}`
            }
        });
        editorDiv.appendChild(label);

        // Description
        if (this.config.showDescriptions) {
            const description = this.getPromptDescription(promptKey);
            if (description) {
                const descriptionEl = createElement('p', {
                    classes: ['prompt-description'],
                    content: description
                });
                editorDiv.appendChild(descriptionEl);
            }
        }

        // Placeholders
        if (this.config.showPlaceholders) {
            const placeholders = this.getPromptPlaceholders(promptKey);
            if (placeholders.length > 0) {
                const placeholderText = createElement('div', {
                    classes: ['placeholders'],
                    innerHTML: `Available placeholders: ${placeholders.map(p => `<code>{{${p}}}</code>`).join(', ')}`
                });
                editorDiv.appendChild(placeholderText);
            }
        }

        // Textarea
        const textarea = createElement('textarea', {
            attributes: {
                id: `prompt-${promptKey}`,
                value: this.prompts[promptKey]
            }
        }) as HTMLTextAreaElement;

        textarea.value = this.prompts[promptKey];
        
        textarea.addEventListener('input', () => {
            this.updatePrompt(promptKey, textarea.value);
            autoResizeTextarea(textarea);
        });

        // Auto-resize on load
        setTimeout(() => autoResizeTextarea(textarea), 0);

        editorDiv.appendChild(textarea);
        return editorDiv;
    }

    /**
     * Creates the actions container
     */
    private createActionsContainer(): HTMLElement {
        const container = createElement('div', {
            classes: ['prompt-actions']
        });

        const resetButton = createElement('button', {
            classes: ['btn-outline'],
            content: 'Reset All Prompts to Defaults'
        });

        resetButton.addEventListener('click', () => {
            this.revertToDefaults();
        });

        container.appendChild(resetButton);
        return container;
    }

    /**
     * Adds styles to the container
     */
    private addStyles(container: HTMLElement): void {
        const style = createElement('style', {
            innerHTML: `
                .prompt-editor { 
                    margin-bottom: 1.5rem; 
                }
                .prompt-editor label { 
                    font-weight: 500; 
                    display: block; 
                    margin-bottom: 0.5rem; 
                    color: #374151;
                }
                .prompt-editor textarea { 
                    width: 100%; 
                    min-height: 150px; 
                    font-family: 'Fira Code', 'Consolas', monospace;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    resize: vertical;
                    line-height: 1.4;
                    background-color: #f9fafb;
                    transition: border-color 0.2s, background-color 0.2s;
                }
                .prompt-editor textarea:focus {
                    outline: none;
                    border-color: #3b82f6;
                    background-color: white;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                .placeholders { 
                    font-size: 0.8rem; 
                    font-style: italic; 
                    margin-bottom: 0.5rem; 
                    color: #6b7280; 
                }
                .placeholders code { 
                    background-color: #f3f4f6; 
                    padding: 2px 4px; 
                    border-radius: 3px; 
                    font-family: 'Fira Code', 'Consolas', monospace;
                    color: #1f2937;
                    border: 1px solid #e5e7eb;
                }
                .prompt-description { 
                    font-size: 0.875rem; 
                    margin-bottom: 0.75rem; 
                    color: #4b5563; 
                    line-height: 1.5;
                    font-style: italic;
                }
                .prompt-actions {
                    margin-top: 1.5rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 0.75rem;
                }
                .btn-outline {
                    padding: 0.5rem 1rem;
                    border: 1px solid #d1d5db;
                    background: transparent;
                    color: #6b7280;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-outline:hover {
                    background-color: #f3f4f6;
                    color: #374151;
                    border-color: #9ca3af;
                }
            `
        });

        container.appendChild(style);
    }

    /**
     * Formats a prompt key into a readable name
     */
    private formatPromptName(key: keyof OrchestratorPrompts): string {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Gets the description for a prompt
     */
    private getPromptDescription(key: keyof OrchestratorPrompts): string | null {
        const descriptions: Partial<Record<keyof OrchestratorPrompts, string>> = {
            content_generation_initial: "Main system prompt for the iterative generation loop.",
            content_generation_iterative: "System prompt for subsequent iterations with feedback.",
            content_generation_user: "Template for generating content in leaf nodes.",
            branch_content_generation_user: "Template for generating content in branch nodes.",
            rater: "System prompt for the AI that scores generated content.",
            editor: "System prompt for the AI that provides improvement feedback.",
            summarize_system: "System prompt for summarizing generated content.",
            expand_list_user: "Prompt for generating bulleted lists of child titles.",
            create_children_from_outline_user: "Reads free-form text and generates structured child titles.",
            prompt_for_child_generation_prompt: "Creates generation prompts for new child nodes.",
            context_synthesis_user: "Combines parent context with node content to create focused context for child generation.",
            context_extraction_user: "Analyzes node content to extract specific information (characters, places, themes, etc.).",
            expand_text_user: "Simple prompt for expanding text with more detail.",
            node_chat_system: "System prompt for the chat interface when chatting about specific nodes."
        };

        return descriptions[key] || null;
    }

    /**
     * Gets the available placeholders for a prompt
     */
    private getPromptPlaceholders(key: keyof OrchestratorPrompts): string[] {
        const placeholders: Record<keyof OrchestratorPrompts, string[]> = {
            content_generation_initial: ['prompt', 'criteria'],
            content_generation_iterative: ['prompt', 'lastResponse', 'editorAdvice', 'criteria'],
            rater: ['originalPrompt', 'response', 'criteria'],
            editor: ['response', 'ratings'],
            summarize_system: ['content'],
            expand_list_user: ['path', 'context', 'child_level_name', 'count', 'parent_content', 'content'],
            content_generation_user: ['path', 'context', 'title', 'content', 'draftorfresh'],
            branch_content_generation_user: ['path', 'context', 'title', 'child_level_name', 'count', 'content', 'draftorfresh'],
            create_children_from_outline_user: ['outline_content', 'child_level_name', 'context', 'content'],
            prompt_for_child_generation_prompt: ['parent_content', 'context', 'child_title', 'content'],
            context_synthesis_user: ['parent_context', 'node_content'],
            context_extraction_user: ['extraction_request', 'node_title', 'content'],
            expand_text_user: ['content', 'path', 'context', 'title'],
            node_chat_system: ['node_data'],
        };

        return placeholders[key] || [];
    }
} 