/**
 * Service for managing AI prompt templates
 */

import { SettingsManager } from '../../../SettingsManager';
import { OrchestratorPrompts, defaultPrompts, getPromptPlaceholders, getPromptDescription } from '../../../PromptManager';
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
            void this.saveToStorage();
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
            content: 'Configure the templates used by AI agents. Click on any prompt title to expand it. Changes are saved automatically.',
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

        // Create collapsible header
        const header = createElement('div', {
            classes: ['prompt-header'],
            attributes: {
                'data-prompt': promptKey
            }
        });

        const title = createElement('span', {
            content: this.formatPromptName(promptKey)
        });

        const toggle = createElement('span', {
            classes: ['prompt-toggle'],
            content: '▶'
        });

        header.appendChild(title);
        header.appendChild(toggle);

        // Create collapsible content
        const content = createElement('div', {
            classes: ['prompt-content'],
            attributes: {
                'data-prompt': promptKey
            }
        });
        
        // Ensure it's hidden by default
        content.style.display = 'none';

        // Description
        if (this.config.showDescriptions) {
            const description = getPromptDescription(promptKey);
            if (description) {
                const descriptionEl = createElement('p', {
                    classes: ['prompt-description'],
                    content: description
                });
                content.appendChild(descriptionEl);
            }
        }

        // Placeholders
        if (this.config.showPlaceholders) {
            const placeholders = getPromptPlaceholders(promptKey);
            if (placeholders.length > 0) {
                const placeholderText = createElement('div', {
                    classes: ['placeholders'],
                    innerHTML: `Available placeholders: ${placeholders.map(p => `<code>{{${p}}}</code>`).join(', ')}`
                });
                content.appendChild(placeholderText);
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

        content.appendChild(textarea);

        // Add click handler to header
        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            
            if (isExpanded) {
                // Collapse
                content.style.display = 'none';
                header.classList.remove('expanded');
                toggle.classList.remove('expanded');
                toggle.textContent = '▶';
            } else {
                // Expand
                content.style.display = 'block';
                header.classList.add('expanded');
                toggle.classList.add('expanded');
                toggle.textContent = '▼';
            }
        });

        editorDiv.appendChild(header);
        editorDiv.appendChild(content);
        return editorDiv;
    }

    /**
     * Creates the actions container
     */
    private createActionsContainer(): HTMLElement {
        const container = createElement('div', {
            classes: ['prompt-actions']
        });

        // Show Modified Prompts button
        const showModifiedButton = createElement('button', {
            classes: ['btn-outline'],
            content: 'Show Modified Prompts'
        });

        showModifiedButton.addEventListener('click', () => {
            this.showModifiedPromptsDialog();
        });

        const resetButton = createElement('button', {
            classes: ['btn-outline'],
            content: 'Reset All Prompts to Defaults'
        });

        resetButton.addEventListener('click', () => {
            this.revertToDefaults();
        });

        container.appendChild(showModifiedButton);
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
                    margin-bottom: 1rem; 
                    border: 1px solid #d1d5db; 
                    border-radius: 8px; 
                    overflow: hidden;
                }
                .prompt-header { 
                    background-color: #f9fafb; 
                    border-bottom: 1px solid #e5e7eb; 
                    padding: 1rem; 
                    cursor: pointer; 
                    user-select: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 500;
                    transition: background-color 0.2s;
                    color: #374151;
                }
                .prompt-header:hover { 
                    background-color: #f3f4f6; 
                }
                .prompt-header.expanded { 
                    background-color: #eff6ff; 
                    border-color: #3b82f6;
                }
                .prompt-toggle { 
                    font-size: 1.2rem; 
                    transition: transform 0.2s; 
                }
                .prompt-toggle.expanded { 
                    transform: rotate(90deg); 
                }
                .prompt-content { 
                    padding: 1rem; 
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
                    background-color: #ffffff;
                    transition: border-color 0.2s, background-color 0.2s;
                    margin-top: 0.5rem;
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
     * Shows a dialog with modified prompts
     */
    private showModifiedPromptsDialog(): void {
        const modifiedPrompts = this.settingsManager.getModifiedPrompts();
        const modifiedOnly = modifiedPrompts.filter(p => p.isModified);

        let message: string;
        if (modifiedOnly.length === 0) {
            message = 'No prompts have been modified from their default values.\n\nAll prompts are currently using the system defaults.';
        } else {
            const promptList = modifiedOnly.map(p => `• ${this.formatPromptName(p.key)}`).join('\n');
            message = `${modifiedOnly.length} prompt${modifiedOnly.length === 1 ? '' : 's'} modified from default:\n\n${promptList}\n\nOnly modified prompts are saved to prevent old defaults from overriding new system prompts in future updates.`;
        }

        alert(message);
    }

    /**
     * Formats a prompt key into a readable name
     */
    private formatPromptName(key: keyof OrchestratorPrompts): string {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    
} 