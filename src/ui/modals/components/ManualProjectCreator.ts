/**
 * Manual Project Creator Component
 * 
 * Extracts the existing project creation functionality into a reusable component
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import * as state from '../../../state';
// import { getElementById } from '../../dom-elements'; // Not used in this component

export interface ManualProjectCreatorConfig {
    onCreate: (title: string, template: ProjectTemplate) => void;
}

export class ManualProjectCreator {
    private config: ManualProjectCreatorConfig;
    private container: HTMLElement | null = null;
    private cleanupHandlers: (() => void)[] = [];

    constructor(config: ManualProjectCreatorConfig) {
        this.config = config;
    }

    public render(): string {
        const templateManager = state.getTemplateManager();
        
        if (!templateManager) {
            return `<p class="error-message">Error: Template Manager not found.</p>`;
        }
        
        const templateNames = templateManager.getTemplateNames();
        const optionsHtml = templateNames.map(name => 
            `<option value="${name}">${name}</option>`
        ).join('');

        return `
            <div class="manual-project-creator">
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="manual-project-title-input">Project Title</label>
                    <input type="text" 
                           id="manual-project-title-input" 
                           placeholder="e.g., 'My Sci-Fi Epic'"
                           class="form-control">
                </div>
                
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="manual-project-template-select">Project Template</label>
                    <select id="manual-project-template-select" class="form-control">
                        ${optionsHtml}
                    </select>
                    <small class="form-text">Choose a template that matches your project structure</small>
                </div>
                
                <div class="button-row" style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
                    <button id="manual-cancel-btn" class="button button-secondary">Cancel</button>
                    <button id="manual-create-btn" class="button button-primary">Create Project</button>
                </div>
            </div>
        `;
    }

    public setupEventListeners(container: HTMLElement): void {
        this.container = container;
        
        // Create project button
        const createBtn = container.querySelector('#manual-create-btn') as HTMLButtonElement;
        const cancelBtn = container.querySelector('#manual-cancel-btn') as HTMLButtonElement;
        
        const createHandler = () => { this.handleCreate(); };
        createBtn.addEventListener('click', createHandler);
        this.cleanupHandlers.push(() => { createBtn.removeEventListener('click', createHandler); });
        
        const cancelHandler = () => { this.handleCancel(); };
        cancelBtn.addEventListener('click', cancelHandler);
        this.cleanupHandlers.push(() => { cancelBtn.removeEventListener('click', cancelHandler); });

        // Enter key in title input
        const titleInput = container.querySelector('#manual-project-title-input') as HTMLInputElement;
        const enterHandler = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.handleCreate();
            }
        };
        titleInput.addEventListener('keydown', enterHandler);
        this.cleanupHandlers.push(() => { titleInput.removeEventListener('keydown', enterHandler); });
    }

    private handleCreate(): void {
        if (!this.container) return;
        
        const titleInput = this.container.querySelector('#manual-project-title-input') as HTMLInputElement;
        const templateSelect = this.container.querySelector('#manual-project-template-select') as HTMLSelectElement;
        
        const title = titleInput.value.trim();
        const templateName = templateSelect.value;
        
        if (!title) {
            alert('Project title is required.');
            titleInput.focus();
            return;
        }
        
        const templateManager = state.getTemplateManager();
        const template = templateManager?.getTemplate(templateName);
        
        if (!template) {
            alert('Please select a valid template.');
            templateSelect.focus();
            return;
        }
        
        this.config.onCreate(title, template);
    }

    private handleCancel(): void {
        // Cancel will be handled by the parent modal
        const event = new CustomEvent('manual-cancel');
        this.container?.dispatchEvent(event);
    }

    public cleanup(): void {
        this.cleanupHandlers.forEach(cleanup => { cleanup(); });
        this.cleanupHandlers = [];
        this.container = null;
    }

    public validateInput(): { isValid: boolean; errors: string[] } {
        if (!this.container) {
            return { isValid: false, errors: ['Component not initialized'] };
        }

        const errors: string[] = [];
        
        const titleInput = this.container.querySelector('#manual-project-title-input') as HTMLInputElement;
        const templateSelect = this.container.querySelector('#manual-project-template-select') as HTMLSelectElement;
        
        if (!titleInput.value.trim()) {
            errors.push('Project title is required');
        }
        
        if (!templateSelect.value) {
            errors.push('Project template must be selected');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
} 