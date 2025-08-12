import { createElement, addEventListenerWithCleanup, truncateText } from '../modals/core/modal-utils';
import { UniversalTextEditor } from './UniversalTextEditor';
import { DocumentNode, ConditionalContextCondition, ConditionalScope, ConditionLogicOperator } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';

export interface ConditionalContextEditorConfig {
    node: DocumentNode;
    projectManager: ProjectManager;
    showPreview?: boolean; // show matched items/node content/assembled context
    onNavigateToNodeId?: (nodeId: string) => void; // optional callback for ancestor source link behavior
    showInheritedByDefault?: boolean; // if true, inherited items are shown initially
    allowLegacyImport?: boolean; // if false, hide the legacy import control
}

/**
 * ConditionalContextEditor
 * Mountable editor that manages conditional context items for a node.
 * Can be embedded inside any container (panel) or used inside a modal wrapper.
 */
export class ConditionalContextEditor {
    private node: DocumentNode;
    private projectManager: ProjectManager;
    private showPreview: boolean;
    private onNavigateToNodeId: ((nodeId: string) => void) | undefined;
    private showInherited: boolean;
    private allowLegacyImport: boolean;

    private container: HTMLElement | null = null;
    private cleanupHandlers: Array<() => void> = [];
    private persistTimer: number | null = null;

    // UI refs
    private itemsList!: HTMLElement;
    private editorContainer!: HTMLElement;
    private conditionsContainer!: HTMLElement;
    private logicSelect!: HTMLSelectElement;
    private addConditionButton!: HTMLButtonElement;
    private addItemButton!: HTMLButtonElement;
    private toggleAllButton!: HTMLButtonElement;
    private importItemsButton!: HTMLButtonElement;
    private removeItemButton!: HTMLButtonElement;
    private previewAsSelect!: HTMLSelectElement;
    private evaluateButton!: HTMLButtonElement;
    private previewMatches!: HTMLElement;
    private previewText!: HTMLElement;
    private previewTabs!: HTMLElement;
    private assembledTabBtn!: HTMLButtonElement;
    private contentTabBtn!: HTMLButtonElement;
    private editor!: UniversalTextEditor;

    // State
    private selectedItemId: string | null = null;
    private selectedIds: Set<string> = new Set();
    private activePreviewTab: 'assembled' | 'content' = 'content';

    constructor(config: ConditionalContextEditorConfig) {
        this.node = config.node;
        this.projectManager = config.projectManager;
        this.showPreview = config.showPreview !== undefined ? config.showPreview : true;
        this.onNavigateToNodeId = config.onNavigateToNodeId;
        this.showInherited = !!config.showInheritedByDefault;
        this.allowLegacyImport = config.allowLegacyImport !== undefined ? config.allowLegacyImport : true;
    }

    public mount(container: HTMLElement): void {
        this.container = container;
        this.container.innerHTML = '';
        this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 1rem;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
        `;

        // Main split (top)
        const mainSplit = createElement('div');
        mainSplit.style.cssText = `
            display: flex;
            gap: 1rem;
            width: 100%;
            flex: 1 1 auto;
            min-height: 0;
        `;

        // Left pane
        const leftPane = createElement('div');
        leftPane.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            flex: 0 0 35%;
            max-width: 45%;
            min-width: 12rem;
        `;

        const leftHeader = createElement('div', { content: 'Conditional Context Items' });
        leftHeader.style.cssText = `font-weight: 600;`;

        // Action row for item buttons
        const itemButtonsRow = createElement('div');
        itemButtonsRow.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';

        this.addItemButton = createElement('button', { content: 'Add Item' });
        this.addItemButton.style.cssText = `
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            background: #f9fafb;
            cursor: pointer;
        `;

        if (this.allowLegacyImport) {
            this.importItemsButton = createElement('button', { content: 'Import items' });
            this.importItemsButton.title = 'Import paragraphs from legacy context';
            this.importItemsButton.style.cssText = `
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                border: 1px solid #d1d5db;
                background: #f3f4f6;
                cursor: pointer;
            `;
        }

        this.toggleAllButton = createElement('button', { content: 'Toggle all' });
        this.toggleAllButton.title = 'Toggle selection of all items';
        this.toggleAllButton.style.cssText = `
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            background: #eef2ff;
            cursor: pointer;
        `;

        this.removeItemButton = createElement('button', { content: 'Remove checked' });
        this.removeItemButton.title = 'Remove all checked items';
        this.removeItemButton.style.cssText = `
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            background: #fee2e2;
            cursor: pointer;
        `;

        itemButtonsRow.appendChild(this.addItemButton);
        itemButtonsRow.appendChild(this.toggleAllButton);
        if (this.allowLegacyImport) {
            itemButtonsRow.appendChild(this.importItemsButton);
        }
        itemButtonsRow.appendChild(this.removeItemButton);

        // Show inherited toggle
        const inheritedToggleWrap = createElement('label');
        inheritedToggleWrap.style.cssText = 'margin-left: auto; display: inline-flex; align-items: center; gap: 0.35rem; color: #374151;';
        const inheritedCheckbox = createElement('input') as HTMLInputElement;
        inheritedCheckbox.type = 'checkbox';
        inheritedCheckbox.checked = this.showInherited;
        inheritedCheckbox.addEventListener('change', () => {
            this.showInherited = inheritedCheckbox.checked;
            this.refreshItemsList();
        });
        const inheritedLbl = createElement('span', { content: 'Show inherited' });
        inheritedToggleWrap.appendChild(inheritedCheckbox);
        inheritedToggleWrap.appendChild(inheritedLbl);
        itemButtonsRow.appendChild(inheritedToggleWrap);

        this.itemsList = createElement('div');
        this.itemsList.style.cssText = `
            overflow: auto;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.5rem;
            min-height: 6rem;
            max-height: 50vh;
        `;

        leftPane.appendChild(leftHeader);
        leftPane.appendChild(itemButtonsRow);
        leftPane.appendChild(this.itemsList);

        // Right pane
        const rightPane = createElement('div');
        rightPane.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            flex: 1 1 65%;
            min-width: 0;
        `;

        const editorHeader = createElement('div', { content: 'Item Editor' });
        editorHeader.style.cssText = `font-weight: 600;`;

        // Editor area
        this.editorContainer = createElement('div');
        this.editorContainer.style.cssText = `
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.5rem;
            flex: 1 1 auto;
            min-height: 8rem;
            display: flex;
            align-items: stretch;
        `;

        // Instantiate UniversalTextEditor after DOM is attached
        setTimeout(() => {
            this.editor = new UniversalTextEditor(this.editorContainer, { mode: 'enhanced', autoResize: false }, {
                onTextChange: (text) => {
                    if (!this.selectedItemId) return;
                    this.node.updateConditionalContextItem(this.selectedItemId, { text });
                    this.refreshItemsList();
                    this.schedulePersist();
                }
            });
            try {
                const edEl = this.editor.getHTMLElement();
                edEl.style.width = '100%';
                edEl.style.height = '100%';
                (edEl.style as any).flex = '1 1 auto';
                edEl.style.minHeight = '0';
                edEl.style.boxSizing = 'border-box';
            } catch {}
            this.applySelectionToUI();
        }, 0);

        // Trigger words editor (above logic)
        const triggerRow = createElement('div');
        triggerRow.style.cssText = 'display:flex; flex-direction:column; gap:0.25rem;';
        const triggerLabel = createElement('div', { content: 'Trigger words (comma-separated, optional):' });
        triggerLabel.style.cssText = 'font-weight:600;';
        const triggerInputWrap = createElement('div');
        triggerInputWrap.style.cssText = 'border:1px solid #e5e7eb; border-radius:0.5rem; padding:0.25rem;';
        const triggerEditor = new UniversalTextEditor(triggerInputWrap, { mode: 'enhanced', autoResize: false }, {
            onBlur: () => {
                if (!this.selectedItemId) return;
                const raw = triggerEditor.getText().trim();
                const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
                const dedup = Array.from(new Set(parts));
                this.node.updateConditionalContextItem(this.selectedItemId, { keywords: dedup });
                this.refreshItemsList();
                this.schedulePersist();
            }
        });
        triggerRow.appendChild(triggerLabel);
        triggerRow.appendChild(triggerInputWrap);

        // Logic selector
        const logicRow = createElement('div');
        logicRow.style.cssText = `display: flex; gap: 0.5rem; align-items: center;`;
        const logicLabel = createElement('label', { content: 'Conditions logic:' });
        this.logicSelect = createElement('select') as HTMLSelectElement;
        ['AND', 'OR'].forEach(v => {
            const opt = createElement('option', { content: v }) as HTMLOptionElement;
            opt.value = v;
            this.logicSelect.appendChild(opt);
        });
        this.logicSelect.addEventListener('change', () => {
            if (!this.selectedItemId) return;
            this.node.updateConditionalContextItem(this.selectedItemId, { logic: this.logicSelect.value as ConditionLogicOperator });
            this.refreshItemsList();
            this.schedulePersist();
        });
        logicRow.appendChild(logicLabel);
        logicRow.appendChild(this.logicSelect);

        // Conditions list
        this.conditionsContainer = createElement('div');
        this.conditionsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            border: 1px dashed #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.5rem;
            max-height: 40vh;
            overflow: auto;
        `;

        this.addConditionButton = createElement('button', { content: 'Add Condition' }) as HTMLButtonElement;
        this.addConditionButton.style.cssText = `
            align-self: flex-start;
            padding: 0.4rem 0.8rem;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            background: #f9fafb;
            cursor: pointer;
        `;

        // Bulk apply actions
        const bulkRow = createElement('div');
        bulkRow.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';
        const bulkHint = createElement('span', { content: 'Bulk actions on checked items:' });
        bulkHint.style.cssText = 'color: #6b7280; font-size: 0.875rem;';
        const applyToSelectedBtn = createElement('button', { content: 'Apply current conditions' }) as HTMLButtonElement;
        applyToSelectedBtn.title = 'Set logic and conditions of the selected editor item to all checked items';
        applyToSelectedBtn.style.cssText = `
            padding: 0.4rem 0.8rem;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            background: #e5f6ff;
            cursor: pointer;
        `;
        addEventListenerWithCleanup(applyToSelectedBtn, 'click', () => this.handleApplyToSelected(), this.cleanupHandlers);
        bulkRow.appendChild(bulkHint);
        bulkRow.appendChild(applyToSelectedBtn);

        rightPane.appendChild(editorHeader);
        rightPane.appendChild(this.editorContainer);
        rightPane.appendChild(triggerRow);
        rightPane.appendChild(logicRow);
        rightPane.appendChild(this.conditionsContainer);
        rightPane.appendChild(this.addConditionButton);
        rightPane.appendChild(bulkRow);

        mainSplit.appendChild(leftPane);
        mainSplit.appendChild(rightPane);

        // Assemble top
        this.container.appendChild(mainSplit);

        // Bottom preview (optional)
        if (this.showPreview) {
            const previewBar = createElement('div');
            previewBar.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                width: 100%;
                min-height: 10rem;
            `;

            const previewControls = createElement('div');
            previewControls.style.cssText = `display: flex; gap: 0.5rem; align-items: center;`;
            const previewLabel = createElement('label', { content: 'Evaluate as:' });
            this.previewAsSelect = createElement('select') as HTMLSelectElement;
            this.populateTriggeringNodeOptions();
            this.evaluateButton = createElement('button', { content: 'Evaluate' }) as HTMLButtonElement;
            this.evaluateButton.style.cssText = `
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                border: 1px solid #d1d5db;
                background: #f9fafb;
                cursor: pointer;
            `;
            previewControls.appendChild(previewLabel);
            previewControls.appendChild(this.previewAsSelect);
            previewControls.appendChild(this.evaluateButton);

            const previewSplit = createElement('div');
            previewSplit.style.cssText = `display: flex; gap: 1rem; min-height: 8rem;`;

            // Left: Matched items (with label)
            const matchesCol = createElement('div');
            matchesCol.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; flex: 0 0 40%; min-width: 0;';
            const matchesLabel = createElement('div', { content: 'Matched items' });
            matchesLabel.style.cssText = 'font-weight: 600; color: #374151;';
            this.previewMatches = createElement('div');
            this.previewMatches.style.cssText = `
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                padding: 0.5rem;
                overflow: auto;
                min-height: 6rem;
            `;
            matchesCol.appendChild(matchesLabel);
            matchesCol.appendChild(this.previewMatches);

            // Right: Assembled context with tabs
            const assembledCol = createElement('div');
            assembledCol.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 60%; min-width: 0;';
            // Tabs
            this.previewTabs = createElement('div');
            this.previewTabs.style.cssText = `
                display: flex; gap: 0.5rem; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem;
            `;
            this.contentTabBtn = createElement('button', { content: 'Node content' }) as HTMLButtonElement;
            this.assembledTabBtn = createElement('button', { content: 'Assembled context' }) as HTMLButtonElement;
            const baseTabCss = `
                padding: 0.4rem 0.75rem; border: 1px solid transparent; border-radius: 0.5rem; background: transparent; cursor: pointer;
            `;
            this.assembledTabBtn.style.cssText = baseTabCss;
            this.contentTabBtn.style.cssText = baseTabCss;
            this.previewTabs.appendChild(this.contentTabBtn);
            this.previewTabs.appendChild(this.assembledTabBtn);
            this.previewText = createElement('div');
            this.previewText.style.cssText = `
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                padding: 0.5rem;
                overflow: auto;
                white-space: pre-wrap;
                min-height: 6rem;
            `;
            assembledCol.appendChild(this.previewTabs);
            assembledCol.appendChild(this.previewText);

            previewSplit.appendChild(matchesCol);
            previewSplit.appendChild(assembledCol);
            previewBar.appendChild(previewControls);
            previewBar.appendChild(previewSplit);

            this.container.appendChild(previewBar);
        }

        // Wire events and initial render
        this.wireEvents();
        this.refreshItemsList();
        this.selectFirstItem();
        if (this.showPreview) {
            this.updatePreviewTabsUI();
            this.evaluatePreview();
        }
    }

    public destroy(): void {
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
            void this.persistNow();
        }
        this.cleanupHandlers.forEach(fn => fn());
        this.cleanupHandlers = [];
        try { if (this.editor) this.editor.destroy(); } catch {}
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.container = null;
    }

    // === Internal UI logic (ported from modal) ===
    private wireEvents(): void {
        addEventListenerWithCleanup(this.addItemButton, 'click', () => this.handleAddItem(), this.cleanupHandlers);
        addEventListenerWithCleanup(this.addConditionButton, 'click', () => this.handleAddCondition(), this.cleanupHandlers);
        addEventListenerWithCleanup(this.toggleAllButton, 'click', () => this.handleToggleAll(), this.cleanupHandlers);
        if (this.allowLegacyImport && this.importItemsButton) {
            addEventListenerWithCleanup(this.importItemsButton, 'click', () => this.handleImportLegacyContext(), this.cleanupHandlers);
        }
        addEventListenerWithCleanup(this.removeItemButton, 'click', () => { void this.handleRemoveChecked(); }, this.cleanupHandlers);
        if (this.showPreview) {
            addEventListenerWithCleanup(this.evaluateButton, 'click', () => this.evaluatePreview(), this.cleanupHandlers);
            addEventListenerWithCleanup(this.assembledTabBtn, 'click', () => { this.activePreviewTab = 'assembled'; this.updatePreviewTabsUI(); this.evaluatePreview(); }, this.cleanupHandlers);
            addEventListenerWithCleanup(this.contentTabBtn, 'click', () => { this.activePreviewTab = 'content'; this.updatePreviewTabsUI(); this.evaluatePreview(); }, this.cleanupHandlers);
        }
    }

    private refreshItemsList(): void {
        this.itemsList.innerHTML = '';
        const items = this.node.getConditionalContextItems();
        // Compute applicability for this node once
        const root = this.projectManager.rootNode;
        const matchingNow = this.node.getApplicableConditionalContextItems(root);
        const matchingIdsNow = new Set<string>(matchingNow.map(m => m.id));
        if (items.length === 0) {
            const empty = createElement('div', { content: 'No items yet.' });
            empty.style.cssText = 'color: #6b7280;';
            this.itemsList.appendChild(empty);
            // Do not return; still show inherited items even if none locally
        }
        items.forEach(item => {
            const applies = matchingIdsNow.has(item.id);
            const row = createElement('div');
            row.style.cssText = `
                display: flex;
                flex-direction: row;
                gap: 0.5rem;
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                padding: 0.5rem;
                cursor: pointer;
                background: ${this.selectedItemId === item.id ? '#eff6ff' : 'transparent'};
            `;
            // Status dot
            const dot = createElement('span');
            dot.style.cssText = `
                display: inline-block;
                width: 0.5rem;
                height: 0.5rem;
                border-radius: 50%;
                margin-top: 0.375rem;
                background: ${applies ? '#16a34a' : '#dc2626'};
                flex: 0 0 auto;
            `;
            const checkbox = createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.checked = this.selectedIds.has(item.id);
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                if ((e.currentTarget as HTMLInputElement).checked) {
                    this.selectedIds.add(item.id);
                } else {
                    this.selectedIds.delete(item.id);
                }
            });
            const infoCol = createElement('div');
            infoCol.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 auto; min-width: 0;';
            const title = createElement('div', { content: truncateText((item.text || '').split('\n')[0] || '', 80) || '(empty text)' });
            title.style.cssText = 'font-weight: 500;';
            const meta = createElement('div', { content: `${item.logic} • ${item.conditions.length} condition(s)` });
            meta.style.cssText = 'color: #6b7280; font-size: 0.875rem;';
            infoCol.appendChild(title);
            infoCol.appendChild(meta);
            row.appendChild(dot);
            row.appendChild(checkbox);
            row.appendChild(infoCol);
            row.addEventListener('click', () => {
                this.selectItem(item.id);
            });
            this.itemsList.appendChild(row);
        });

        // Inherited items from ancestors (read-only)
        if (this.showInherited) {
            const inherited = this.buildInheritedItems();
            if (inherited.length > 0) {
            // Header
            const header = createElement('div', { content: 'Inherited items from ancestors' });
            header.style.cssText = 'margin-top: 0.5rem; font-weight: 600; color: #374151;';
            this.itemsList.appendChild(header);

            // Compute applicability set (reuse computed above)
            const matchingIds = matchingIdsNow;

            inherited.forEach(({ sourceNode, item }) => {
                const applies = matchingIds.has(item.id);
                const row = createElement('div');
                row.style.cssText = `
                    display: flex;
                    flex-direction: row;
                    gap: 0.5rem;
                    border: 1px dashed #e5e7eb;
                    border-radius: 0.5rem;
                    padding: 0.5rem;
                    background: #f9fafb;
                    opacity: 0.9;
                `;

                // Status dot
                const dot = createElement('span');
                dot.style.cssText = `
                    display: inline-block;
                    width: 0.5rem;
                    height: 0.5rem;
                    border-radius: 50%;
                    margin-top: 0.375rem;
                    background: ${applies ? '#16a34a' : '#dc2626'};
                    flex: 0 0 auto;
                `;

                const infoCol = createElement('div');
                infoCol.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 auto; min-width: 0;';
                const title = createElement('div', { content: truncateText((item.text || '').split('\n')[0] || '', 80) || '(empty text)' });
                title.style.cssText = 'font-weight: 500; color: #4b5563;';

                // Conditions line (use established formatting)
                const conditionsDiv = createElement('div');
                const conditionsText = (item.conditions && item.conditions.length > 0)
                    ? this.formatConditionsForDisplay(item.conditions as any, item.logic as any)
                    : '<em>Unconditional</em>';
                conditionsDiv.innerHTML = conditionsText;
                conditionsDiv.style.cssText = 'font-size: 0.75rem; color: #7c2d12;';

                const meta = createElement('div');
                meta.style.cssText = 'color: #6b7280; font-size: 0.8125rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;';
                const sourceLabel = createElement('span', { content: 'from' });
                const sourceLink = createElement('a', { content: sourceNode.title || 'Untitled' }) as HTMLAnchorElement;
                sourceLink.href = '#';
                sourceLink.style.cssText = 'color: #2563eb; text-decoration: none; cursor: pointer;';
                sourceLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (this.onNavigateToNodeId) {
                        this.onNavigateToNodeId(sourceNode.id);
                    } else {
                        const event = new CustomEvent<{ nodeId: string }>('cc-select-node', { detail: { nodeId: sourceNode.id } });
                        window.dispatchEvent(event);
                    }
                });
                const logicSpan = createElement('span', { content: `${item.logic} • ${item.conditions.length} condition(s)` });
                meta.appendChild(sourceLabel);
                meta.appendChild(sourceLink);
                meta.appendChild(logicSpan);

                infoCol.appendChild(title);
                infoCol.appendChild(conditionsDiv);
                infoCol.appendChild(meta);

                row.appendChild(dot);
                row.appendChild(infoCol);
                this.itemsList.appendChild(row);
            });
            }
        }
    }

    private buildInheritedItems(): Array<{ sourceNode: DocumentNode; item: ReturnType<DocumentNode['getConditionalContextItems']>[number] }> {
        const root = this.projectManager.rootNode;
        let path: DocumentNode[] = [];
        try {
            path = DocumentNode.getPathFromRoot(root, this.node.id);
        } catch {
            return [];
        }
        const ancestors = path.slice(0, -1); // Exclude current node
        const results: Array<{ sourceNode: DocumentNode; item: ReturnType<DocumentNode['getConditionalContextItems']>[number] }> = [];
        for (const ancestor of ancestors) {
            const items = ancestor.getConditionalContextItems();
            for (const it of items) {
                results.push({ sourceNode: ancestor, item: it });
            }
        }
        return results;
    }

    /**
     * Turn conditional context conditions into a human-readable string (established formatting)
     */
    private formatConditionsForDisplay(conditions: ConditionalContextCondition[], logic: ConditionLogicOperator): string {
        const parts = conditions.map((c) => {
            if (!c || typeof c !== 'object') return '(invalid)';
            if ((c as any).type === 'contains' || (c as any).type === 'contains_not') {
                const cc = c as any;
                const scopeLabel = cc.scope === 'this_content' ? 'this' : (cc.scope === 'this_and_previous_same_layer' ? 'this + previous (same layer)' : (cc.scope === 'path' ? 'path' : String(cc.scope)));
                const mode = cc.type === 'contains' ? 'contains' : 'does not contain';
                const flags = `${cc.wordwise ? 'wordwise' : 'substring'}, ${cc.caseSensitive ? 'case-sensitive' : 'case-insensitive'}`;
                return `[${scopeLabel}] ${mode} "${(cc.term || '').replace(/"/g, '\"')}" (${flags})`;
            }
            if ((c as any).type === 'layer_comparison') {
                const lc = c as any;
                return `layer ${lc.comparator} ${lc.layerName}`;
            }
            return '(unknown condition)';
        });
        return parts.join(` ${logic} `);
    }

    private selectFirstItem(): void {
        const items = this.node.getConditionalContextItems();
        if (items.length > 0) {
            const first = items[0];
            if (first) {
                this.selectItem(first.id);
            } else {
                this.clearEditor();
            }
        } else {
            this.clearEditor();
        }
    }

    private selectItem(id: string): void {
        const item = this.node.getConditionalContextItems().find(i => i.id === id);
        if (!item) return;
        this.selectedItemId = id;
        this.applySelectionToUI();
        this.refreshItemsList();
    }

    private clearEditor(): void {
        this.selectedItemId = null;
        if (this.editor) this.editor.setText('');
        if (this.logicSelect) this.logicSelect.value = 'OR';
        if (this.conditionsContainer) this.conditionsContainer.innerHTML = '';
    }

    private applySelectionToUI(): void {
        if (!this.selectedItemId) {
            this.clearEditor();
            return;
        }
        const item = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
        if (!item) {
            this.clearEditor();
            return;
        }
        if (this.editor) this.editor.setText(item.text || '');
        // Set trigger editor text
        try {
            const triggers = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
            const el = (triggerRow.querySelector('.text-editor-with-highlighting') || triggerRow.querySelector('textarea')) as HTMLElement | null;
            if (el) { /* noop */ }
            // Use editor instance created earlier
            (triggerEditor as any).setText ? (triggerEditor as any).setText(triggers) : undefined;
        } catch {}
        this.logicSelect.value = item.logic;
        this.renderConditions();
    }

    private renderConditions(): void {
        this.conditionsContainer.innerHTML = '';
        if (!this.selectedItemId) return;
        const item = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
        if (!item) return;
        item.conditions.forEach((cond, index) => this.conditionsContainer.appendChild(this.renderConditionRow(cond, index, item.conditions)));
    }

    private renderConditionRow(cond: ConditionalContextCondition, index: number, allConditions: ConditionalContextCondition[]): HTMLElement {
        const row = createElement('div');
        row.style.cssText = `display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;`;

        const getLiveConditions = (): ConditionalContextCondition[] => {
            if (!this.selectedItemId) return [...allConditions];
            const liveItem = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
            return liveItem ? (liveItem.conditions.map(c => ({ ...(c as any) })) as ConditionalContextCondition[]) : [...allConditions];
        };

        // Type selector
        const typeSelect = createElement('select') as HTMLSelectElement;
        ['contains', 'contains_not', 'layer_comparison'].forEach(t => {
            const opt = createElement('option', { content: t }) as HTMLOptionElement;
            opt.value = t;
            typeSelect.appendChild(opt);
        });
        typeSelect.value = cond.type;
        typeSelect.addEventListener('change', () => {
            if (!this.selectedItemId) return;
            const updated = getLiveConditions();
            if (typeSelect.value === 'contains') {
                updated[index] = { type: 'contains', scope: ConditionalScope.ThisAndPreviousSameLayer, term: 'term', wordwise: true, caseSensitive: false };
            } else if (typeSelect.value === 'contains_not') {
                updated[index] = { type: 'contains_not', scope: ConditionalScope.ThisAndPreviousSameLayer, term: 'term', wordwise: true, caseSensitive: false } as any;
            } else {
                updated[index] = { type: 'layer_comparison', comparator: '=', layerName: this.node.template[this.node.level] || (this.node.template[0] ?? '') };
            }
            this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
            this.renderConditions();
            this.refreshItemsList();
            this.schedulePersist();
        });
        row.appendChild(typeSelect);

        // Dynamic fields
        if (cond.type === 'contains' || cond.type === 'contains_not') {
            // Scope
            const scopeSelect = createElement('select') as HTMLSelectElement;
            const scopes: Array<{ value: ConditionalScope; label: string }> = [
                { value: ConditionalScope.ThisContent, label: 'this content' },
                { value: ConditionalScope.ThisAndPreviousSameLayer, label: 'this + previous (same layer)' },
                { value: ConditionalScope.Path, label: 'path' }
            ];
            scopes.forEach(s => {
                const opt = createElement('option', { content: s.label }) as HTMLOptionElement;
                opt.value = s.value;
                scopeSelect.appendChild(opt);
            });
            scopeSelect.value = cond.scope;
            scopeSelect.addEventListener('change', () => {
                if (!this.selectedItemId) return;
                const updated = getLiveConditions();
                (updated[index] as any) = { ...updated[index], scope: scopeSelect.value as ConditionalScope };
                this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
                this.schedulePersist();
            });
            row.appendChild(scopeSelect);

            // Term
            const termInput = createElement('input') as HTMLInputElement;
            termInput.type = 'text';
            termInput.placeholder = 'term...';
            termInput.value = cond.term;
            termInput.addEventListener('input', () => {
                if (!this.selectedItemId) return;
                const updated = getLiveConditions();
                (updated[index] as any) = { ...updated[index], term: termInput.value };
                this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
                this.schedulePersist();
            });
            termInput.style.cssText = 'flex: 1 1 30%; min-width: 10rem;';
            row.appendChild(termInput);

            // Wordwise
            const wordwiseLabel = createElement('label', { content: 'Wordwise' });
            const wordwiseCheckbox = createElement('input') as HTMLInputElement;
            wordwiseCheckbox.type = 'checkbox';
            wordwiseCheckbox.checked = cond.wordwise;
            wordwiseCheckbox.addEventListener('change', () => {
                if (!this.selectedItemId) return;
                const updated = getLiveConditions();
                (updated[index] as any) = { ...updated[index], wordwise: wordwiseCheckbox.checked };
                this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
                this.schedulePersist();
            });
            row.appendChild(wordwiseLabel);
            row.appendChild(wordwiseCheckbox);

            // Case sensitive
            const csLabel = createElement('label', { content: 'Case sensitive' });
            const csCheckbox = createElement('input') as HTMLInputElement;
            csCheckbox.type = 'checkbox';
            csCheckbox.checked = cond.caseSensitive;
            csCheckbox.addEventListener('change', () => {
                if (!this.selectedItemId) return;
                const updated = getLiveConditions();
                (updated[index] as any) = { ...updated[index], caseSensitive: csCheckbox.checked };
                this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
                this.schedulePersist();
            });
            row.appendChild(csLabel);
            row.appendChild(csCheckbox);
        } else {
            // Comparator
            const cmpSelect = createElement('select') as HTMLSelectElement;
            ['>', '<', '='].forEach(c => {
                const opt = createElement('option', { content: c }) as HTMLOptionElement;
                opt.value = c;
                cmpSelect.appendChild(opt);
            });
            cmpSelect.value = cond.comparator;
            cmpSelect.addEventListener('change', () => {
                if (!this.selectedItemId) return;
                const updated = getLiveConditions();
                (updated[index] as any) = { ...updated[index], comparator: cmpSelect.value as any };
                this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
                this.schedulePersist();
            });
            row.appendChild(cmpSelect);

            // Layer name
            const layerSelect = createElement('select') as HTMLSelectElement;
            this.node.template.forEach(name => {
                const opt = createElement('option', { content: name }) as HTMLOptionElement;
                opt.value = name;
                layerSelect.appendChild(opt);
            });
            layerSelect.value = cond.layerName;
            layerSelect.addEventListener('change', () => {
                if (!this.selectedItemId) return;
                const updated = getLiveConditions();
                (updated[index] as any) = { ...updated[index], layerName: layerSelect.value };
                this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
            });
            layerSelect.style.cssText = 'min-width: 8rem;';
            row.appendChild(layerSelect);
        }

        const removeBtn = createElement('button', { content: 'Remove' });
        removeBtn.style.cssText = `
            padding: 0.25rem 0.5rem;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            background: #fff;
            cursor: pointer;
        `;
        removeBtn.addEventListener('click', () => {
            if (!this.selectedItemId) return;
            const updated = getLiveConditions().filter((_, i) => i !== index);
            this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
            this.renderConditions();
            this.refreshItemsList();
            this.schedulePersist();
        });
        row.appendChild(removeBtn);

        return row;
    }

    private handleAddItem(): void {
        const id = this.node.addConditionalContextItem('New conditional context', [], 'OR');
        this.refreshItemsList();
        this.selectItem(id);
    }

    private handleToggleAll(): void {
        const items = this.node.getConditionalContextItems();
        if (items.length === 0) return;
        const nextSelected = new Set<string>();
        for (const item of items) {
            if (!this.selectedIds.has(item.id)) {
                nextSelected.add(item.id);
            }
        }
        this.selectedIds = nextSelected;
        this.refreshItemsList();
    }

    private handleAddCondition(): void {
        if (!this.selectedItemId) return;
        const item = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
        if (!item) return;
        const updated = [...item.conditions, {
            type: 'contains',
            scope: ConditionalScope.ThisAndPreviousSameLayer,
            term: 'term',
            wordwise: true,
            caseSensitive: false
        } as ConditionalContextCondition];
        this.node.updateConditionalContextItem(this.selectedItemId, { conditions: updated });
        this.renderConditions();
        this.refreshItemsList();
    }

    private handleImportLegacyContext(): void {
        const legacy = this.node.context || '';
        const paragraphs = this.parseLegacyContextParagraphs(legacy);
        if (paragraphs.length === 0) {
            alert('No paragraphs found in legacy context.');
            return;
        }

        const existing = new Set(this.node.getConditionalContextItems().map(i => i.text));
        let imported = 0;
        for (const para of paragraphs) {
            if (!para) continue;
            if (existing.has(para)) continue;
            this.node.addConditionalContextItem(para, [], 'OR');
            existing.add(para);
            imported++;
        }

        this.refreshItemsList();
        if (imported > 0) {
            this.schedulePersist();
        }
        alert(imported > 0 ? `Imported ${imported} item${imported === 1 ? '' : 's'} from legacy context.` : 'All legacy context paragraphs are already present.');
    }

    private parseLegacyContextParagraphs(text: string): string[] {
        return text
            .split(/\r?\n\s*\r?\n+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }

    private async handleRemoveChecked(): Promise<void> {
        const items = this.node.getConditionalContextItems();
        if (items.length === 0 || this.selectedIds.size === 0) return;
        const toRemove = items.filter(i => this.selectedIds.has(i.id)).map(i => i.id);
        const confirmed = confirm(`Delete ${toRemove.length} checked item${toRemove.length === 1 ? '' : 's'}?`);
        if (!confirmed) return;
        let removed = 0;
        for (const id of toRemove) {
            if (this.node.removeConditionalContextItem(id)) {
                removed++;
                if (this.selectedItemId === id) {
                    this.selectedItemId = null;
                }
            }
        }
        this.selectedIds.clear();
        this.refreshItemsList();
        this.selectFirstItem();
        this.evaluatePreview();
        if (removed > 0) {
            this.schedulePersist();
        }
    }

    private populateTriggeringNodeOptions(): void {
        if (!this.showPreview) return;
        const root = this.projectManager.rootNode;
        const options: Array<{ id: string; label: string; level: number }> = [];
        const bfs = (n: DocumentNode) => {
            options.push({ id: n.id, label: `${' '.repeat(n.level * 2)}${n.title || 'Untitled'}`, level: n.level });
            n.children.forEach(c => bfs(c));
        };
        bfs(root);
        this.previewAsSelect.innerHTML = '';
        options.forEach(o => {
            const opt = createElement('option', { content: o.label }) as HTMLOptionElement;
            opt.value = o.id;
            this.previewAsSelect.appendChild(opt);
        });
        this.previewAsSelect.value = this.node.id;
    }

    private evaluatePreview(): void {
        if (!this.showPreview) return;
        const root = this.projectManager.rootNode;
        const triggerId = this.previewAsSelect.value || this.node.id;
        const triggeringNode = this.findById(root, triggerId) || this.node;
        const items = triggeringNode.getApplicableConditionalContextItems(root);
        const text = triggeringNode.assembleApplicableConditionalContext(root);
        this.previewMatches.innerHTML = '';
        if (items.length === 0) {
            this.previewMatches.textContent = 'No matching items.';
        } else {
            const ul = createElement('ul');
            ul.style.cssText = 'padding-left: 1rem;';
            items.forEach(i => {
                const firstLine = (i.text || '').split('\n')[0] || '';
                const li = createElement('li', { content: truncateText(firstLine, 80) || '(empty)' });
                ul.appendChild(li);
            });
            this.previewMatches.appendChild(ul);
        }
        if (this.activePreviewTab === 'assembled') {
            this.previewText.textContent = text || '';
        } else {
            this.previewText.textContent = triggeringNode.content || '';
        }
    }

    private updatePreviewTabsUI(): void {
        if (!this.showPreview) return;
        const activate = (btn: HTMLButtonElement, active: boolean) => {
            btn.style.background = active ? '#eef2ff' : 'transparent';
            btn.style.borderColor = active ? '#c7d2fe' : 'transparent';
            btn.style.color = active ? '#1f2937' : '#374151';
        };
        activate(this.assembledTabBtn, this.activePreviewTab === 'assembled');
        activate(this.contentTabBtn, this.activePreviewTab === 'content');
    }

    private handleApplyToSelected(): void {
        if (!this.selectedItemId) return;
        const source = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
        if (!source) return;
        const all = this.node.getConditionalContextItems();
        let updatedCount = 0;
        for (const target of all) {
            if (!this.selectedIds.has(target.id)) continue;
            if (target.id === source.id) continue;
            try {
                this.node.updateConditionalContextItem(target.id, {
                    logic: source.logic,
                    conditions: source.conditions.map(c => ({ ...(c as any) })) as ConditionalContextCondition[]
                });
                updatedCount++;
            } catch (e) {
                console.error('Failed to apply conditions to item', target.id, e);
            }
        }
        if (updatedCount > 0) {
            this.schedulePersist();
            this.refreshItemsList();
            this.evaluatePreview();
        }
    }

    private schedulePersist(): void {
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        this.persistTimer = window.setTimeout(() => {
            void this.persistNow();
        }, 500);
    }

    private async persistNow(): Promise<void> {
        await this.projectManager.saveToStorage();
    }

    private findById(node: DocumentNode, id: string): DocumentNode | null {
        if (node.id === id) return node;
        for (const c of node.children) {
            const found = this.findById(c, id);
            if (found) return found;
        }
        return null;
    }
}


