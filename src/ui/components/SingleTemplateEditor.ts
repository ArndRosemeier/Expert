import { getElementById } from "../dom-elements";
import { ProjectTemplate } from "../../ProjectTemplate";

interface SingleTemplateEditorOptions {
    containerId: string;
    template: ProjectTemplate;
    onTemplateChange?: (template: ProjectTemplate) => void;
    readonly?: boolean;
    showNameField?: boolean;
}

export class SingleTemplateEditor {
    private containerId: string;
    private template: ProjectTemplate;
    private onTemplateChange: ((template: ProjectTemplate) => void) | undefined;
    private readonly: boolean;
    private showNameField: boolean;
    private isDirty = false;
    private isPopulating = false;

    constructor(options: SingleTemplateEditorOptions) {
        this.containerId = options.containerId;
        this.template = options.template;
        this.onTemplateChange = options.onTemplateChange;
        this.readonly = options.readonly || false;
        this.showNameField = options.showNameField !== false; // Default to true
    }

    public render(): void {
        const container = getElementById(this.containerId);
        if (!container) {
            console.error(`Container with id '${this.containerId}' not found`);
            return;
        }

        const nameFieldHtml = this.showNameField ? `
            <div class="template-field">
                <label for="${this.containerId}-name">Template Name:</label>
                <input type="text" 
                       id="${this.containerId}-name" 
                       value="${this.template.name}" 
                       placeholder="Enter template name..."
                       ${this.readonly ? 'readonly' : ''} />
            </div>
        ` : '';

        container.innerHTML = `
            <style>
                .single-template-editor { display: flex; flex-direction: column; gap: 1rem; }
                .template-field { display: flex; flex-direction: column; gap: 0.3rem; }
                .template-field label { font-weight: bold; font-size: 0.9em; color: #555; }
                .template-field input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
                .template-field input:readonly { background-color: #f5f5f5; color: #666; }
                .hierarchy-section { display: flex; flex-direction: column; gap: 0.5rem; }
                .hierarchy-section h4 { margin: 0; color: #333; }
                .hierarchy-editor { display: flex; flex-direction: column; gap: 0.5rem; }
                .hierarchy-layer { display: flex; align-items: center; gap: 0.5rem; }
                .hierarchy-layer input { flex-grow: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
                .hierarchy-layer input:readonly { background-color: #f5f5f5; color: #666; }
                .remove-layer-btn { 
                    background: #dc3545; color: white; border: none; border-radius: 4px; 
                    padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.9em; 
                }
                .remove-layer-btn:hover:not(:disabled) { background: #c82333; }
                .remove-layer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .add-layer-btn { 
                    background: #28a745; color: white; border: none; border-radius: 4px; 
                    padding: 0.5rem 1rem; cursor: pointer; margin-top: 0.5rem; 
                }
                .add-layer-btn:hover:not(:disabled) { background: #218838; }
                .add-layer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>
            <div class="single-template-editor">
                ${nameFieldHtml}
                <div class="hierarchy-section">
                    <h4>Hierarchy Levels</h4>
                    <div id="${this.containerId}-hierarchy-editor" class="hierarchy-editor"></div>
                    ${!this.readonly ? `<button id="${this.containerId}-add-layer-btn" class="add-layer-btn">➕ Add Level</button>` : ''}
                </div>
            </div>
        `;

        this.renderHierarchyLevels();
        this.setupEventListeners();
    }

    private renderHierarchyLevels(): void {
        const editor = getElementById(`${this.containerId}-hierarchy-editor`);
        if (!editor) return;

        this.isPopulating = true;
        editor.innerHTML = '';
        
        this.template.hierarchyLevels.forEach((level, index) => {
            const layerElement = this.createLayerElement(level, index);
            editor.appendChild(layerElement);
        });

        this.isPopulating = false;
        this.isDirty = false;
    }

    private createLayerElement(level: string, index: number): HTMLElement {
        const div = document.createElement('div');
        div.className = 'hierarchy-layer';
        div.innerHTML = `
            <input type="text" 
                   value="${level}" 
                   data-index="${index}" 
                   placeholder="e.g., Chapter" 
                   ${this.readonly ? 'readonly' : ''} />
            ${!this.readonly ? `<button class="remove-layer-btn" data-index="${index}">-</button>` : ''}
        `;
        return div;
    }

    private setupEventListeners(): void {
        const container = getElementById(this.containerId);
        if (!container || this.readonly) return;

        // Add layer button
        const addBtn = getElementById(`${this.containerId}-add-layer-btn`);
        if (addBtn) {
            addBtn.addEventListener('click', () => this.handleAddLayer());
        }

        // Remove layer buttons and input changes (delegated)
        container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('remove-layer-btn')) {
                const index = parseInt(target.dataset['index'] || '0');
                this.handleRemoveLayer(index);
            }
        });

        container.addEventListener('input', (_e) => {
            if (!this.isPopulating) {
                this.isDirty = true;
                this.notifyChange();
            }
        });
    }

    private handleAddLayer(): void {
        // Update template with current input values before adding
        this.updateTemplateFromInputs();
        this.template.hierarchyLevels.push('');
        this.renderHierarchyLevels();
        this.isDirty = true;
        this.notifyChange();
    }

    private handleRemoveLayer(index: number): void {
        // Update template with current input values before removing
        this.updateTemplateFromInputs();
        this.template.hierarchyLevels.splice(index, 1);
        this.renderHierarchyLevels();
        this.isDirty = true;
        this.notifyChange();
    }

    private notifyChange(): void {
        if (this.onTemplateChange) {
            // Update the internal template with current input values
            this.updateTemplateFromInputs();
            const updatedTemplate = this.getTemplateFromUI();
            this.onTemplateChange(updatedTemplate);
        }
    }

    private updateTemplateFromInputs(): void {
        const nameInput = this.showNameField ? getElementById<HTMLInputElement>(`${this.containerId}-name`) : null;
        const editor = getElementById(`${this.containerId}-hierarchy-editor`);
        
        if (nameInput && nameInput.value.trim()) {
            this.template.name = nameInput.value.trim();
        }
        
        if (editor) {
            const currentLevels: string[] = [];
            editor.querySelectorAll<HTMLInputElement>('.hierarchy-layer input').forEach(input => {
                currentLevels.push(input.value);
            });
            this.template.hierarchyLevels = currentLevels;
        }
    }

    public getTemplateFromUI(): ProjectTemplate {
        const nameInput = this.showNameField ? getElementById<HTMLInputElement>(`${this.containerId}-name`) : null;
        const editor = getElementById(`${this.containerId}-hierarchy-editor`);
        
        const name = nameInput ? nameInput.value.trim() : this.template.name;
        const levels: string[] = [];
        
        if (editor) {
            editor.querySelectorAll<HTMLInputElement>('.hierarchy-layer input').forEach(input => {
                levels.push(input.value);
            });
        }

        return new ProjectTemplate(name, levels);
    }

    public updateTemplate(template: ProjectTemplate): void {
        this.template = template;
        this.renderHierarchyLevels();
        
        if (this.showNameField) {
            const nameInput = getElementById<HTMLInputElement>(`${this.containerId}-name`);
            if (nameInput) {
                nameInput.value = template.name;
            }
        }
    }

    public isDirtyState(): boolean {
        return this.isDirty;
    }

    public markClean(): void {
        this.isDirty = false;
    }
} 