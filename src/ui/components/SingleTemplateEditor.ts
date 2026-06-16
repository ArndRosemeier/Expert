import { getElementById } from "../dom-elements";
import { ProjectTemplate } from "../../ProjectTemplate";

interface SingleTemplateEditorOptions {
    containerId: string;
    template: ProjectTemplate;
    onTemplateChange?: (template: ProjectTemplate) => void;
    readonly?: boolean;
    showNameField?: boolean;
}

/**
 * Parsed representation of a single hierarchy layer for editing.
 * The on-disk format keeps the count embedded in the level name string
 * (e.g. "Act 3"); this struct splits it out so the UI can present name and
 * count as separate, transparent fields.
 */
interface ParsedLayer {
    /** Clean level name without any trailing count (e.g. "Act"). */
    name: string;
    /** Number of this level under its parent, or null when unspecified. */
    count: number | null;
    /** Fuzzy target output length in paragraphs, or null when unspecified. */
    paragraphs: number | null;
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
        this.readonly = options.readonly ?? false;
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
                       value="${this.escapeAttr(this.template.name)}" 
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
                .template-field input:read-only { background-color: #f5f5f5; color: #666; }
                .hierarchy-section { display: flex; flex-direction: column; gap: 0.5rem; }
                .hierarchy-section h4 { margin: 0; color: #333; }
                .hierarchy-help { font-size: 0.82em; color: #555; background: #eef4ff; border: 1px solid #cfe0ff; border-radius: 6px; padding: 0.5rem 0.75rem; line-height: 1.45; }
                .hierarchy-help b { color: #1e3a8a; }
                .hierarchy-editor { display: flex; flex-direction: column; gap: 0.4rem; }
                .hierarchy-head, .hierarchy-layer { display: grid; grid-template-columns: 1fr 6.5rem 6.5rem 2rem; gap: 0.5rem; align-items: center; }
                .hierarchy-head { font-size: 0.72em; font-weight: bold; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; padding: 0 0.1rem; }
                .hierarchy-layer input { width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                .hierarchy-layer input:read-only { background-color: #f5f5f5; color: #666; }
                .hierarchy-layer .count-na { color: #bbb; text-align: center; user-select: none; }
                .remove-layer-btn { 
                    background: #dc3545; color: white; border: none; border-radius: 4px; 
                    padding: 0.35rem 0; cursor: pointer; font-size: 0.9em; width: 100%;
                }
                .remove-layer-btn:hover:not(:disabled) { background: #c82333; }
                .remove-layer-btn:disabled { opacity: 0.4; cursor: not-allowed; }
                .add-layer-btn { 
                    background: #28a745; color: white; border: none; border-radius: 4px; 
                    padding: 0.5rem 1rem; cursor: pointer; margin-top: 0.5rem; align-self: flex-start;
                }
                .add-layer-btn:hover:not(:disabled) { background: #218838; }
                .add-layer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>
            <div class="single-template-editor">
                ${nameFieldHtml}
                <div class="hierarchy-section">
                    <h4>Hierarchy Levels</h4>
                    <div class="hierarchy-help">
                        Each row is one level of the structure, from the top (whole work) down to the leaf (where prose is written).
                        <br><b>Count</b>: how many of this level to create under its parent (optional; leave blank to let the AI decide). Not applicable to the top level.
                        <br><b>Length</b>: a fuzzy target output length in <b>paragraphs</b> for this level (optional). A value of 5 asks the model for roughly 4&ndash;6 paragraphs.
                        <b>This is only a hint &mdash; the model cannot strictly enforce length.</b>
                    </div>
                    <div class="hierarchy-head">
                        <span>Level name</span>
                        <span>Count</span>
                        <span>Length (¶)</span>
                        <span></span>
                    </div>
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

        const levels = this.template.hierarchyLevels;
        const lengths = this.template.layerLengths ?? [];
        levels.forEach((level, index) => {
            const parsed = this.parseLayer(level, lengths[index] ?? null);
            const layerElement = this.createLayerElement(parsed, index, levels.length);
            editor.appendChild(layerElement);
        });

        this.isPopulating = false;
        this.isDirty = false;
    }

    /**
     * Splits a stored level string ("Act 3") into a clean name and count, and
     * pairs it with the configured paragraph length for that index.
     */
    private parseLayer(level: string, paragraphs: number | null): ParsedLayer {
        const match = level.match(/^(.*?)\s+(\d+)\s*$/);
        const namePart = match?.[1];
        const countPart = match?.[2];
        if (namePart !== undefined && countPart !== undefined) {
            return { name: namePart.trim(), count: parseInt(countPart, 10), paragraphs };
        }
        return { name: level.trim(), count: null, paragraphs };
    }

    private createLayerElement(parsed: ParsedLayer, index: number, totalLevels: number): HTMLElement {
        const div = document.createElement('div');
        div.className = 'hierarchy-layer';
        const isRoot = index === 0;
        const ro = this.readonly ? 'readonly' : '';
        const countValue = parsed.count !== null ? String(parsed.count) : '';
        const paragraphsValue = parsed.paragraphs !== null ? String(parsed.paragraphs) : '';
        // The top level (root) always has exactly one instance, so a count is
        // meaningless there; show a placeholder instead of a count input so it is
        // simply absent from the collected data.
        const countCell = isRoot
            ? `<span class="count-na" title="The top level has a single instance; count does not apply.">—</span>`
            : `<input type="number" min="1" max="20" step="1" value="${this.escapeAttr(countValue)}" placeholder="auto" data-field="count" data-index="${index}" ${ro} />`;

        div.innerHTML = `
            <input type="text" 
                   value="${this.escapeAttr(parsed.name)}" 
                   data-field="name"
                   data-index="${index}" 
                   placeholder="e.g., Chapter" 
                   ${ro} />
            ${countCell}
            <input type="number" min="1" step="1" value="${this.escapeAttr(paragraphsValue)}" placeholder="hint" data-field="paragraphs" data-index="${index}" ${ro} />
            ${!this.readonly ? `<button class="remove-layer-btn" data-index="${index}" ${totalLevels <= 1 ? 'disabled title="A template needs at least one level"' : ''}>−</button>` : ''}
        `;
        return div;
    }

    private setupEventListeners(): void {
        const container = getElementById(this.containerId);
        if (!container || this.readonly) return;

        // Add layer button
        const addBtn = getElementById(`${this.containerId}-add-layer-btn`);
        if (addBtn) {
            addBtn.addEventListener('click', () => { this.handleAddLayer(); });
        }

        // Remove layer buttons (delegated)
        container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('remove-layer-btn')) {
                const index = parseInt(target.dataset['index'] ?? '0');
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
        // Capture current edits, then append a fresh, empty leaf level.
        this.updateTemplateFromInputs();
        this.template.hierarchyLevels.push('');
        this.template.layerLengths.push(null);
        this.renderHierarchyLevels();
        this.isDirty = true;
        this.notifyChange();
    }

    private handleRemoveLayer(index: number): void {
        // Capture current edits, then drop the chosen level (keep arrays aligned).
        this.updateTemplateFromInputs();
        this.template.hierarchyLevels.splice(index, 1);
        this.template.layerLengths.splice(index, 1);
        this.renderHierarchyLevels();
        this.isDirty = true;
        this.notifyChange();
    }

    private notifyChange(): void {
        if (this.onTemplateChange) {
            this.updateTemplateFromInputs();
            const updatedTemplate = this.getTemplateFromUI();
            this.onTemplateChange(updatedTemplate);
        }
    }

    /** Reads the current UI state back into this.template (names+counts merged). */
    private updateTemplateFromInputs(): void {
        const nameInput = this.showNameField ? getElementById<HTMLInputElement>(`${this.containerId}-name`) : null;
        if (nameInput?.value.trim()) {
            this.template.name = nameInput.value.trim();
        }

        const { levels, lengths } = this.collectLayers();
        this.template.hierarchyLevels = levels;
        this.template.layerLengths = lengths;
    }

    /** Builds a fresh ProjectTemplate from the current UI state. */
    public getTemplateFromUI(): ProjectTemplate {
        const nameInput = this.showNameField ? getElementById<HTMLInputElement>(`${this.containerId}-name`) : null;
        const name = nameInput ? nameInput.value.trim() : this.template.name;
        const { levels, lengths } = this.collectLayers();
        return new ProjectTemplate(name, levels, lengths);
    }

    /**
     * Gathers all layer rows from the DOM, recombining name + count into the
     * stored "Name N" string format and collecting the paragraph length per row.
     */
    private collectLayers(): { levels: string[]; lengths: (number | null)[] } {
        const editor = getElementById(`${this.containerId}-hierarchy-editor`);
        const levels: string[] = [];
        const lengths: (number | null)[] = [];
        if (!editor) {
            return { levels, lengths };
        }

        editor.querySelectorAll<HTMLElement>('.hierarchy-layer').forEach(row => {
            const nameInput = row.querySelector<HTMLInputElement>('input[data-field="name"]');
            const countInput = row.querySelector<HTMLInputElement>('input[data-field="count"]');
            const paragraphsInput = row.querySelector<HTMLInputElement>('input[data-field="paragraphs"]');

            const name = nameInput ? nameInput.value.trim() : '';
            const count = this.parsePositiveInt(countInput ? countInput.value : '');
            const paragraphs = this.parsePositiveInt(paragraphsInput ? paragraphsInput.value : '');

            levels.push(count !== null ? `${name} ${count}` : name);
            lengths.push(paragraphs);
        });

        return { levels, lengths };
    }

    private parsePositiveInt(raw: string): number | null {
        const trimmed = raw.trim();
        if (trimmed === '') {
            return null;
        }
        const value = parseInt(trimmed, 10);
        if (!Number.isFinite(value) || value <= 0) {
            return null;
        }
        return value;
    }

    private escapeAttr(value: string): string {
        return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
