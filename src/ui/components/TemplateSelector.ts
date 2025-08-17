/**
 * Reusable Template Selector Component
 * 
 * Provides a dropdown for selecting project templates with optional management features
 */

import { ProjectTemplate } from '../../ProjectTemplate';
import * as state from '../../state';

export interface TemplateSelectorConfig {
    containerId: string;
    onSelectionChange?: (template: ProjectTemplate | null, templateName: string) => void;
    selectedTemplate?: string;
    showManagement?: boolean;
    label?: string;
    helpText?: string;
    placeholder?: string;
    required?: boolean;
}

export class TemplateSelector {
    private config: TemplateSelectorConfig;
    private container: HTMLElement | null = null;
    private cleanupHandlers: (() => void)[] = [];
    private currentSelection: string = '';

    constructor(config: TemplateSelectorConfig) {
        this.config = {
            label: 'Project Template',
            helpText: 'Choose a template that matches your project structure',
            placeholder: 'Select a template...',
            required: true,
            showManagement: false,
            ...config
        };
        this.currentSelection = config.selectedTemplate || '';
    }

    public render(): void {
        this.container = document.getElementById(this.config.containerId);
        if (!this.container) {
            console.error(`TemplateSelector: Container with id '${this.config.containerId}' not found`);
            return;
        }

        const templateManager = state.getTemplateManager();
        if (!templateManager) {
            this.container.innerHTML = `<p class="error-message">Error: Template Manager not found.</p>`;
            return;
        }

        const templateNames = templateManager.getTemplateNames().sort();
        
        // Default to "Short Story" if available and no current selection
        if (!this.currentSelection && templateNames.includes('Short Story')) {
            this.currentSelection = 'Short Story';
        }
        
        const optionsHtml = templateNames.map(name => 
            `<option value="${name}" ${name === this.currentSelection ? 'selected' : ''}>${name}</option>`
        ).join('');

        const managementButtons = this.config.showManagement ? `
            <div class="template-management" style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button type="button" class="template-manage-btn" data-action="edit" style="
                    padding: 0.5rem 1rem;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    cursor: pointer;
                ">Edit Template</button>
                <button type="button" class="template-manage-btn" data-action="duplicate" style="
                    padding: 0.5rem 1rem;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    cursor: pointer;
                ">Duplicate</button>
            </div>
        ` : '';

        this.container.innerHTML = `
            <div class="template-selector-wrapper">
                <div class="form-group">
                    <label for="template-selector-${this.config.containerId}" class="template-selector-label">
                        ${this.config.label}${this.config.required ? ' *' : ''}
                    </label>
                    <select id="template-selector-${this.config.containerId}" 
                            class="template-selector-dropdown form-control"
                            ${this.config.required ? 'required' : ''}>
                        ${!this.config.required ? `<option value="">${this.config.placeholder}</option>` : ''}
                        ${optionsHtml}
                    </select>
                    ${this.config.helpText ? `<small class="form-text text-muted">${this.config.helpText}</small>` : ''}
                </div>
                ${managementButtons}
            </div>
        `;

        this.setupEventListeners();
        
        // Trigger initial selection if template is pre-selected
        if (this.currentSelection) {
            this.handleSelectionChange();
        }
    }

    private setupEventListeners(): void {
        if (!this.container) return;

        const select = this.container.querySelector('.template-selector-dropdown') as HTMLSelectElement;
        if (select) {
            const changeHandler = () => this.handleSelectionChange();
            select.addEventListener('change', changeHandler);
            this.cleanupHandlers.push(() => select.removeEventListener('change', changeHandler));
        }

        // Management button handlers
        if (this.config.showManagement) {
            const manageButtons = this.container.querySelectorAll('.template-manage-btn');
            manageButtons.forEach(button => {
                const clickHandler = (e: Event) => this.handleManagementAction(e);
                button.addEventListener('click', clickHandler);
                this.cleanupHandlers.push(() => button.removeEventListener('click', clickHandler));
            });
        }
    }

    private handleSelectionChange(): void {
        if (!this.container) return;

        const select = this.container.querySelector('.template-selector-dropdown') as HTMLSelectElement;
        const selectedName = select?.value || '';
        this.currentSelection = selectedName;

        if (this.config.onSelectionChange) {
            const templateManager = state.getTemplateManager();
            const template = selectedName ? templateManager?.getTemplate(selectedName) || null : null;
            this.config.onSelectionChange(template, selectedName);
        }

        // Update management button states
        if (this.config.showManagement) {
            const manageButtons = this.container.querySelectorAll('.template-manage-btn') as NodeListOf<HTMLButtonElement>;
            manageButtons.forEach(button => {
                button.disabled = !selectedName;
            });
        }
    }

    private handleManagementAction(e: Event): void {
        const button = e.target as HTMLButtonElement;
        const action = button.getAttribute('data-action');
        
        if (!this.currentSelection) {
            alert('Please select a template first.');
            return;
        }

        switch (action) {
            case 'edit':
                this.openTemplateEditor();
                break;
            case 'duplicate':
                void this.duplicateTemplate();
                break;
        }
    }

    private openTemplateEditor(): void {
        // Import and open template editor
        import('../template-editor').then(({ openTemplateEditor }) => {
            openTemplateEditor();
        }).catch(error => {
            console.error('Failed to open template editor:', error);
            alert('Failed to open template editor.');
        });
    }

    private async duplicateTemplate(): Promise<void> {
        const templateManager = state.getTemplateManager();
        if (!templateManager || !this.currentSelection) return;

        const newName = prompt(`Enter name for duplicate of "${this.currentSelection}":`);
        if (!newName || !newName.trim()) return;

        try {
            const template = templateManager.getTemplate(this.currentSelection);
            if (!template) {
                alert('Selected template not found.');
                return;
            }

            const duplicatedTemplate = new ProjectTemplate(
                newName.trim(), 
                [...template.hierarchyLevels]
            );
            await templateManager.saveTemplate(newName.trim(), duplicatedTemplate);
            
            // Refresh the dropdown and select the new template
            this.refresh();
            this.setSelection(newName.trim());
            
            alert(`Template "${newName.trim()}" created successfully.`);
        } catch (error) {
            console.error('Failed to duplicate template:', error);
            alert('Failed to duplicate template.');
        }
    }

    public getSelectedTemplate(): ProjectTemplate | null {
        if (!this.currentSelection) return null;
        
        const templateManager = state.getTemplateManager();
        return templateManager?.getTemplate(this.currentSelection) || null;
    }

    public getSelectedTemplateName(): string {
        return this.currentSelection;
    }

    public setSelection(templateName: string): void {
        this.currentSelection = templateName;
        
        if (this.container) {
            const select = this.container.querySelector('.template-selector-dropdown') as HTMLSelectElement;
            if (select) {
                select.value = templateName;
                this.handleSelectionChange();
            }
        }
    }

    public refresh(): void {
        if (this.container) {
            const currentSelection = this.currentSelection;
            this.render();
            if (currentSelection) {
                this.setSelection(currentSelection);
            }
        }
    }

    public validate(): { isValid: boolean; error?: string } {
        if (this.config.required && !this.currentSelection) {
            return {
                isValid: false,
                error: `${this.config.label} is required`
            };
        }

        return { isValid: true };
    }

    public cleanup(): void {
        this.cleanupHandlers.forEach(cleanup => cleanup());
        this.cleanupHandlers = [];
        this.container = null;
    }
}
