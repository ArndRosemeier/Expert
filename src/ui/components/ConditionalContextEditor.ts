import { createElement, addEventListenerWithCleanup, truncateText } from '../modals/core/modal-utils';
import { UniversalTextEditor } from './UniversalTextEditor';
import { DocumentNode, ChildScopeMode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';

export interface ConditionalContextEditorConfig {
    node: DocumentNode;
    projectManager: ProjectManager;
    showPreview?: boolean; // show whether the selected item applies to this node + assembled text
    onNavigateToNodeId?: (nodeId: string) => void; // optional callback for inherited-source link behavior
    showInheritedByDefault?: boolean; // if true, inherited items are shown initially
    /**
     * Optional provider of prospective direct-child titles, used when the node has
     * not been expanded yet. Embedders that hold a live, not-yet-saved outline
     * (e.g. the node chat editor) supply the titles parsed from that outline so a
     * scope targeting a child that will exist after expansion is not falsely
     * flagged as orphaned. When omitted, the node's own saved content is parsed.
     */
    prospectiveChildTitles?: () => string[];
}

/**
 * ConditionalContextEditor
 *
 * The single editor for a node's conditional context items. Scope is purely
 * structural: each item targets the OWNER node's direct children (by title) and
 * can be restricted to leaf-layer (prose) nodes, plus the optional trigger-word
 * (keyword) content gate. There is no text-condition builder.
 *
 * Layout is a single vertical list. Selecting an item expands its editor INLINE,
 * directly underneath the clicked row, so the controls always appear at the spot
 * the user clicked (no separate side column that could scroll out of view).
 *
 * Embeddable in any container (side panel, modal, inspector). Persists changes
 * to storage through the ProjectManager (debounced).
 *
 * NOTE on editor lifecycle: UniversalTextEditor self-destroys when its container
 * leaves the DOM (MutationObserver). Therefore the inline editors are created
 * fresh for the selected row and explicitly destroyed before the list is rebuilt.
 * To preserve typing focus, in-place field edits update only the affected row's
 * summary text instead of rebuilding the whole list.
 */
export class ConditionalContextEditor {
    private node: DocumentNode;
    private projectManager: ProjectManager;
    private showPreview: boolean;
    private onNavigateToNodeId: ((nodeId: string) => void) | undefined;
    private showInherited: boolean;
    private prospectiveChildTitles: (() => string[]) | undefined;

    private container: HTMLElement | null = null;
    private cleanupHandlers: Array<() => void> = [];
    private persistTimer: number | null = null;

    // Top-level structural refs (built once in mount)
    private itemsList: HTMLElement | null = null;
    private inheritedSection: HTMLElement | null = null;

    // Refs for the currently expanded inline detail panel (rebuilt on selection)
    private childChecklist: HTMLElement | null = null;
    private scopeModeSelect: HTMLSelectElement | null = null;
    private previewBox: HTMLElement | null = null;
    private editor: UniversalTextEditor | null = null;
    private triggerEditor: UniversalTextEditor | null = null;

    // Per-row summary refs for in-place updates (avoids destroying the open editor)
    private rowSummaryRefs: Map<string, { title: HTMLElement; meta: HTMLElement }> = new Map();

    // State
    private selectedItemId: string | null = null;
    private selectedIds: Set<string> = new Set();

    // Display-only sorting. 'natural' preserves the stored item order; 'id' and
    // 'text' sort a render-time copy without mutating the node's item array, so
    // persisted order and scope semantics are untouched.
    private sortKey: 'natural' | 'id' | 'text' = 'natural';
    private sortDir: 'asc' | 'desc' = 'asc';
    private sortDirBtn: HTMLButtonElement | null = null;

    constructor(config: ConditionalContextEditorConfig) {
        this.node = config.node;
        this.projectManager = config.projectManager;
        this.showPreview = config.showPreview ?? true;
        this.onNavigateToNodeId = config.onNavigateToNodeId;
        this.showInherited = config.showInheritedByDefault === true;
        this.prospectiveChildTitles = config.prospectiveChildTitles;
    }

    public mount(container: HTMLElement): void {
        this.container = container;
        container.innerHTML = '';
        // Own the layout explicitly so a host's CSS (e.g. .story-elements with
        // flex-direction: column) cannot reflow the component unexpectedly.
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            width: 100%;
            height: 100%;
            min-height: 0;
            box-sizing: border-box;
        `;

        const header = createElement('div', { content: 'Conditional Context Items' });
        header.style.cssText = 'font-weight: 600;';

        const buttonsRow = createElement('div');
        buttonsRow.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;';

        const addBtn = createElement('button', { content: '+ Add Item' });
        addBtn.style.cssText = this.buttonStyle('#2563eb', '#ffffff', '#1d4ed8');
        addEventListenerWithCleanup(addBtn, 'click', () => { this.handleAddItem(); }, this.cleanupHandlers);

        const toggleAllBtn = createElement('button', { content: 'Toggle all' });
        toggleAllBtn.style.cssText = this.buttonStyle('#e5e7eb', '#111827', '#9ca3af');
        addEventListenerWithCleanup(toggleAllBtn, 'click', () => { this.handleToggleAll(); }, this.cleanupHandlers);

        const removeBtn = createElement('button', { content: '🗑 Remove checked' });
        removeBtn.style.cssText = this.buttonStyle('#dc2626', '#ffffff', '#b91c1c');
        addEventListenerWithCleanup(removeBtn, 'click', () => { this.handleRemoveChecked(); }, this.cleanupHandlers);

        buttonsRow.appendChild(addBtn);
        buttonsRow.appendChild(toggleAllBtn);
        buttonsRow.appendChild(removeBtn);

        const sortRow = createElement('div');
        sortRow.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; font-size: 0.85rem; color: #374151;';
        sortRow.appendChild(createElement('span', { content: 'Sort:' }));

        const sortSelect = createElement('select');
        sortSelect.style.cssText = 'padding: 0.35rem; border: 1px solid #d1d5db; border-radius: 0.4rem;';
        const sortOptions: Array<['natural' | 'id' | 'text', string]> = [
            ['natural', 'Natural order'],
            ['id', 'By id'],
            ['text', 'By text']
        ];
        for (const [val, label] of sortOptions) {
            const opt = createElement('option', { content: label });
            opt.value = val;
            sortSelect.appendChild(opt);
        }
        sortSelect.value = this.sortKey;
        addEventListenerWithCleanup(sortSelect, 'change', () => {
            this.sortKey = sortSelect.value as 'natural' | 'id' | 'text';
            this.updateSortDirVisibility();
            this.renderItemsList();
        }, this.cleanupHandlers);

        const sortDirBtn = createElement('button', { content: this.sortDirLabel() });
        sortDirBtn.title = 'Toggle sort direction';
        sortDirBtn.style.cssText = this.buttonStyle('#e5e7eb', '#111827', '#9ca3af');
        addEventListenerWithCleanup(sortDirBtn, 'click', () => {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
            sortDirBtn.textContent = this.sortDirLabel();
            this.renderItemsList();
        }, this.cleanupHandlers);
        this.sortDirBtn = sortDirBtn;

        sortRow.appendChild(sortSelect);
        sortRow.appendChild(sortDirBtn);

        this.itemsList = createElement('div');
        this.itemsList.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            overflow: auto;
            flex: 1 1 auto;
            min-height: 6rem;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.35rem;
        `;

        // Inherited items (read-only)
        const inheritedRow = createElement('label');
        inheritedRow.style.cssText = 'display: flex; gap: 0.4rem; align-items: center; font-size: 0.875rem; color: #374151;';
        const inheritedToggle = createElement('input');
        inheritedToggle.type = 'checkbox';
        inheritedToggle.checked = this.showInherited;
        addEventListenerWithCleanup(inheritedToggle, 'change', () => {
            this.showInherited = inheritedToggle.checked;
            this.renderInherited();
        }, this.cleanupHandlers);
        inheritedRow.appendChild(inheritedToggle);
        inheritedRow.appendChild(createElement('span', { content: 'Show inherited (from ancestors, read-only)' }));

        this.inheritedSection = createElement('div');
        this.inheritedSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; flex: 0 0 auto;';

        container.appendChild(header);
        container.appendChild(buttonsRow);
        container.appendChild(sortRow);
        container.appendChild(this.itemsList);
        container.appendChild(inheritedRow);
        container.appendChild(this.inheritedSection);

        this.updateSortDirVisibility();
        this.refresh();
    }

    /**
     * Re-read the node's items and re-render everything. Safe to call after the
     * node's items are changed externally (e.g. by AI commands in XMLStoryModal).
     */
    public refresh(): void {
        // Drop a stale selection if the item no longer exists.
        if (this.selectedItemId && !this.node.getConditionalContextItems().some(i => i.id === this.selectedItemId)) {
            this.selectedItemId = null;
        }
        this.renderItemsList();
        this.renderInherited();
    }

    public destroy(): void {
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
            void this.persistNow();
        }
        this.destroyInlineEditors();
        this.cleanupHandlers.forEach(fn => { fn(); });
        this.cleanupHandlers = [];
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    // ---------------- Rendering ----------------

    /**
     * Rebuild the item list. The currently selected item gets an inline detail
     * panel rendered directly beneath its row. Inline editors are destroyed first
     * because the DOM wipe below would otherwise auto-destroy them out of order.
     */
    private renderItemsList(): void {
        const itemsList = this.itemsList;
        if (!itemsList) return;

        // Preserve scroll position: rebuilding the list resets scrollTop to 0,
        // which would otherwise yank the view away from the item just clicked.
        const prevScrollTop = itemsList.scrollTop;

        this.destroyInlineEditors();
        itemsList.innerHTML = '';
        this.rowSummaryRefs.clear();
        let selectedWrapper: HTMLElement | null = null;

        const items = this.getSortedItems();
        const applicableIds = new Set(this.node.getApplicableConditionalContextItems(this.projectManager.rootNode).map(i => i.id));

        if (items.length === 0) {
            const empty = createElement('div', { content: 'No items on this node.' });
            empty.style.cssText = 'color: #9ca3af; padding: 0.25rem;';
            itemsList.appendChild(empty);
            return;
        }

        for (const item of items) {
            const isSelected = item.id === this.selectedItemId;

            const wrapper = createElement('div');
            wrapper.style.cssText = `
                display: flex;
                flex-direction: column;
                border-radius: 0.4rem;
                background: ${isSelected ? '#eef2ff' : 'transparent'};
                ${isSelected ? 'box-shadow: 0 0 0 1px #c7d2fe inset;' : ''}
            `;

            const headerLine = createElement('div');
            headerLine.style.cssText = `
                display: flex;
                gap: 0.5rem;
                align-items: flex-start;
                padding: 0.35rem;
                cursor: pointer;
            `;

            const checkbox = createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.selectedIds.has(item.id);
            addEventListenerWithCleanup(checkbox, 'change', () => {
                if (checkbox.checked) this.selectedIds.add(item.id); else this.selectedIds.delete(item.id);
            }, this.cleanupHandlers);

            const dot = createElement('span');
            const applies = applicableIds.has(item.id);
            dot.title = applies ? 'Applies to the current node' : 'Does not apply to the current node';
            dot.style.cssText = `
                margin-top: 0.3rem;
                flex: 0 0 auto;
                width: 0.6rem;
                height: 0.6rem;
                border-radius: 50%;
                background: ${applies ? '#10b981' : '#d1d5db'};
            `;

            // Show the item's id so it can be matched to the ids the AI references
            // in chat. Not a click target, so the text stays selectable for copying.
            const idBadge = createElement('span', { content: item.id });
            idBadge.title = `Context id: ${item.id}`;
            idBadge.style.cssText = `
                flex: 0 0 auto;
                align-self: center;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace;
                font-size: 0.72rem;
                color: #3730a3;
                background: #e0e7ff;
                border: 1px solid #c7d2fe;
                border-radius: 0.3rem;
                padding: 0.05rem 0.35rem;
            `;

            const textCol = createElement('div');
            textCol.style.cssText = 'display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1 1 auto;';
            const title = createElement('div', { content: this.itemTitle(item.text) });
            title.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            const meta = createElement('div', { content: this.scopeSummary(item.childScope, item.leavesOnly, item.keywords) });
            meta.style.cssText = 'color: #6b7280; font-size: 0.8rem;';
            textCol.appendChild(title);
            textCol.appendChild(meta);
            this.rowSummaryRefs.set(item.id, { title, meta });

            // Clicking the row toggles selection (collapse if already open).
            addEventListenerWithCleanup(textCol, 'click', () => { this.toggleSelectItem(item.id); }, this.cleanupHandlers);
            addEventListenerWithCleanup(dot, 'click', () => { this.toggleSelectItem(item.id); }, this.cleanupHandlers);

            // Per-row delete: the obvious, immediate way to remove a single item.
            const deleteBtn = createElement('button', { content: '✕' });
            deleteBtn.title = 'Delete this context item';
            deleteBtn.style.cssText = `
                flex: 0 0 auto;
                align-self: center;
                width: 1.6rem;
                height: 1.6rem;
                line-height: 1;
                padding: 0;
                border-radius: 0.3rem;
                border: 1px solid #fecaca;
                background: #fee2e2;
                color: #b91c1c;
                font-weight: 700;
                cursor: pointer;
            `;
            addEventListenerWithCleanup(deleteBtn, 'click', (e) => {
                e.stopPropagation();
                this.handleRemoveItem(item.id);
            }, this.cleanupHandlers);

            headerLine.appendChild(checkbox);
            headerLine.appendChild(dot);
            headerLine.appendChild(idBadge);
            headerLine.appendChild(textCol);
            headerLine.appendChild(deleteBtn);
            wrapper.appendChild(headerLine);

            if (isSelected) {
                wrapper.appendChild(this.buildInlineDetail(item.id));
                selectedWrapper = wrapper;
            }

            itemsList.appendChild(wrapper);
        }

        // Restore the prior scroll position, then nudge the expanded panel into
        // view if it ended up outside the visible region.
        itemsList.scrollTop = prevScrollTop;
        if (selectedWrapper) {
            const wrapperEl = selectedWrapper;
            const listTop = itemsList.scrollTop;
            const listBottom = listTop + itemsList.clientHeight;
            const wrapTop = wrapperEl.offsetTop;
            const wrapBottom = wrapTop + wrapperEl.offsetHeight;
            if (wrapTop < listTop || wrapBottom > listBottom) {
                wrapperEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    /**
     * Build the inline detail/edit panel for a selected item and create its rich
     * editors. The panel is inserted directly under the item's row.
     */
    private buildInlineDetail(itemId: string): HTMLElement {
        const item = this.node.getConditionalContextItems().find(i => i.id === itemId);
        if (!item) {
            throw new Error(`ConditionalContextEditor: selected item not found: ${itemId}`);
        }

        const panel = createElement('div');
        panel.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            padding: 0.5rem 0.5rem 0.6rem 0.5rem;
            margin: 0 0.25rem 0.25rem 0.25rem;
            border-top: 1px dashed #c7d2fe;
        `;

        // Text editor
        const textLabel = createElement('div', { content: 'Context text:' });
        textLabel.style.cssText = 'font-weight: 600;';
        const editorContainer = createElement('div');
        editorContainer.style.cssText = `
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.5rem;
            min-height: 7rem;
            background: #ffffff;
        `;

        // Trigger words
        const triggerLabel = createElement('div', { content: 'Trigger words (comma-separated, optional):' });
        triggerLabel.style.cssText = 'font-weight: 600;';
        const triggerContainer = createElement('div');
        triggerContainer.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem; background: #ffffff;';

        // Structural scope
        const scopeLabel = createElement('div', { content: 'Applies to children:' });
        scopeLabel.style.cssText = 'font-weight: 600;';
        const scopeModeSelect = createElement('select');
        scopeModeSelect.style.cssText = 'padding: 0.4rem; border: 1px solid #d1d5db; border-radius: 0.5rem;';
        const scopeOptions: Array<[ChildScopeMode, string]> = [
            ['all', 'All children'],
            ['include', 'Only these children'],
            ['exclude', 'All except these children']
        ];
        for (const [val, label] of scopeOptions) {
            const opt = createElement('option', { content: label });
            opt.value = val;
            scopeModeSelect.appendChild(opt);
        }
        scopeModeSelect.value = item.childScope?.mode ?? 'all';
        addEventListenerWithCleanup(scopeModeSelect, 'change', () => { this.handleScopeModeChange(); }, this.cleanupHandlers);
        this.scopeModeSelect = scopeModeSelect;

        const childChecklist = createElement('div');
        childChecklist.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            border: 1px dashed #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.5rem;
            max-height: 30vh;
            overflow: auto;
        `;
        this.childChecklist = childChecklist;

        // Leaves only
        const leavesRow = createElement('label');
        leavesRow.style.cssText = 'display: flex; gap: 0.4rem; align-items: center;';
        const leavesOnlyCheckbox = createElement('input');
        leavesOnlyCheckbox.type = 'checkbox';
        leavesOnlyCheckbox.checked = item.leavesOnly === true;
        addEventListenerWithCleanup(leavesOnlyCheckbox, 'change', () => {
            if (!this.selectedItemId) return;
            this.node.updateConditionalContextItem(this.selectedItemId, { leavesOnly: leavesOnlyCheckbox.checked });
            this.updateRowSummary(this.selectedItemId);
            this.renderPreview();
            this.schedulePersist();
        }, this.cleanupHandlers);
        leavesRow.appendChild(leavesOnlyCheckbox);
        leavesRow.appendChild(createElement('span', { content: 'Leaves only (reach only leaf / prose nodes)' }));

        panel.appendChild(textLabel);
        panel.appendChild(editorContainer);
        panel.appendChild(triggerLabel);
        panel.appendChild(triggerContainer);
        panel.appendChild(scopeLabel);
        panel.appendChild(scopeModeSelect);
        panel.appendChild(childChecklist);
        panel.appendChild(leavesRow);

        if (this.showPreview) {
            const previewBox = createElement('div');
            previewBox.style.cssText = `
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                padding: 0.5rem;
                background: #f9fafb;
                font-size: 0.875rem;
                white-space: pre-wrap;
            `;
            this.previewBox = previewBox;
            panel.appendChild(previewBox);
        }

        // Create rich editors now that their containers exist in this panel.
        this.editor = new UniversalTextEditor(editorContainer, { mode: 'enhanced', autoResize: false }, {
            onTextChange: (text) => {
                if (!this.selectedItemId) return;
                this.node.updateConditionalContextItem(this.selectedItemId, { text });
                this.updateRowSummary(this.selectedItemId);
                this.renderPreview();
                this.schedulePersist();
            }
        });
        const edEl = this.editor.getHTMLElement();
        edEl.style.width = '100%';
        edEl.style.minHeight = '6rem';
        edEl.style.boxSizing = 'border-box';
        this.editor.setText(item.text);

        this.triggerEditor = new UniversalTextEditor(triggerContainer, { mode: 'enhanced', autoResize: false }, {
            onBlur: () => {
                const triggerEditor = this.triggerEditor;
                if (!this.selectedItemId || !triggerEditor) return;
                const raw = triggerEditor.getText().trim();
                const parts = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
                const dedup = Array.from(new Set(parts));
                this.node.updateConditionalContextItem(this.selectedItemId, { keywords: dedup });
                this.updateRowSummary(this.selectedItemId);
                this.renderPreview();
                this.schedulePersist();
            }
        });
        this.triggerEditor.setText((item.keywords ?? []).join(', '));

        this.renderChildChecklist();
        this.renderPreview();

        return panel;
    }

    private renderInherited(): void {
        const inheritedSection = this.inheritedSection;
        if (!inheritedSection) return;
        inheritedSection.innerHTML = '';
        if (!this.showInherited) return;

        const root = this.projectManager.rootNode;
        const chain = DocumentNode.getPathFromRoot(root, this.node.id);
        const ancestors = chain.slice(0, -1); // exclude this node
        const applicableIds = new Set(this.node.getApplicableConditionalContextItems(root).map(i => i.id));

        let any = false;
        for (const ancestor of ancestors) {
            const items = ancestor.getConditionalContextItems();
            for (const item of items) {
                any = true;
                const row = createElement('div');
                row.style.cssText = 'display: flex; gap: 0.4rem; align-items: center; font-size: 0.8rem; color: #4b5563;';
                const dot = createElement('span');
                const applies = applicableIds.has(item.id);
                dot.style.cssText = `flex: 0 0 auto; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: ${applies ? '#10b981' : '#d1d5db'};`;
                const idBadge = createElement('span', { content: item.id });
                idBadge.title = `Context id: ${item.id}`;
                idBadge.style.cssText = `flex: 0 0 auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 0.68rem; color: #4b5563; background: #eef2f7; border: 1px solid #e5e7eb; border-radius: 0.3rem; padding: 0.02rem 0.3rem;`;
                const label = createElement('span', { content: this.itemTitle(item.text, 60) });
                const src = createElement('a', { content: ` — ${truncateText(ancestor.title, 24)}` });
                src.style.cssText = 'color: #2563eb; cursor: pointer; text-decoration: underline;';
                addEventListenerWithCleanup(src, 'click', () => { this.navigateTo(ancestor.id); }, this.cleanupHandlers);
                row.appendChild(dot);
                row.appendChild(idBadge);
                row.appendChild(label);
                row.appendChild(src);
                inheritedSection.appendChild(row);
            }
        }
        if (!any) {
            const none = createElement('div', { content: 'No inherited items.' });
            none.style.cssText = 'color: #9ca3af; font-size: 0.8rem;';
            inheritedSection.appendChild(none);
        }
    }

    private renderChildChecklist(): void {
        const childChecklist = this.childChecklist;
        if (!childChecklist) return;
        childChecklist.innerHTML = '';
        const item = this.selectedItemId
            ? this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId)
            : undefined;
        if (!item) return;

        const mode = item.childScope?.mode ?? 'all';
        if (mode === 'all') {
            childChecklist.style.display = 'none';
            return;
        }
        childChecklist.style.display = 'flex';

        const selected = new Set(item.childScope?.titles ?? []);
        const childTitles = this.getKnownChildTitles();
        const hasGenerated = this.node.children.length > 0;

        if (childTitles.length === 0) {
            const hint = createElement('div', { content: 'No direct children or outline sections found yet. Add ===Section=== headers to the outline first.' });
            hint.style.cssText = 'color: #9ca3af;';
            childChecklist.appendChild(hint);
        } else {
            if (!hasGenerated) {
                const hint = createElement('div', { content: 'Prospective children (from outline headers):' });
                hint.style.cssText = 'color: #6b7280; font-size: 0.8rem;';
                childChecklist.appendChild(hint);
            }
            for (const titleText of childTitles) {
                const row = createElement('label');
                row.style.cssText = 'display: flex; gap: 0.4rem; align-items: center;';
                const cb = createElement('input');
                cb.type = 'checkbox';
                cb.checked = selected.has(titleText);
                addEventListenerWithCleanup(cb, 'change', () => { this.toggleChildTitle(titleText, cb.checked); }, this.cleanupHandlers);
                row.appendChild(cb);
                row.appendChild(createElement('span', { content: titleText }));
                childChecklist.appendChild(row);
            }
        }

        // Orphaned selections: a selected title that matches neither a current child
        // nor a prospective child (from generated children or the live/saved outline).
        const known = new Set(childTitles);
        const orphans = (item.childScope?.titles ?? []).filter(t => !known.has(t));
        for (const orphan of orphans) {
            const row = createElement('div');
            row.style.cssText = 'display: flex; gap: 0.4rem; align-items: center; color: #b91c1c;';
            const warn = createElement('span', { content: `⚠ "${orphan}" — no matching child` });
            const rm = createElement('button', { content: 'remove' });
            rm.style.cssText = 'padding: 0.1rem 0.4rem; border: 1px solid #fecaca; background: #fef2f2; border-radius: 0.3rem; cursor: pointer; color: #b91c1c;';
            addEventListenerWithCleanup(rm, 'click', () => { this.toggleChildTitle(orphan, false); }, this.cleanupHandlers);
            row.appendChild(warn);
            row.appendChild(rm);
            childChecklist.appendChild(row);
        }
    }

    private renderPreview(): void {
        const previewBox = this.previewBox;
        if (!previewBox) return;
        const item = this.selectedItemId
            ? this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId)
            : undefined;
        if (!item) {
            previewBox.textContent = '';
            return;
        }
        const root = this.projectManager.rootNode;
        const applies = this.node.getApplicableConditionalContextItems(root).some(i => i.id === item.id);
        const assembled = this.node.assembleApplicableConditionalContext(root);
        previewBox.textContent =
            `Applies to this node (${truncateText(this.node.title, 30)}): ${applies ? 'YES' : 'no'}\n\n` +
            `Assembled context for this node:\n${assembled.length > 0 ? assembled : '(none)'}`;
    }

    /**
     * Update only the summary (title + meta) line of a single row in place. Used
     * after field edits so the open inline editor keeps focus (a full list rebuild
     * would destroy and recreate the editor).
     */
    private updateRowSummary(itemId: string): void {
        const refs = this.rowSummaryRefs.get(itemId);
        if (!refs) return;
        const item = this.node.getConditionalContextItems().find(i => i.id === itemId);
        if (!item) return;
        refs.title.textContent = this.itemTitle(item.text);
        refs.meta.textContent = this.scopeSummary(item.childScope, item.leavesOnly, item.keywords);
    }

    // ---------------- Handlers ----------------

    private handleAddItem(): void {
        const id = this.node.addConditionalContextItem('New conditional context');
        this.schedulePersist();
        this.selectedItemId = id;
        this.renderItemsList();
    }

    private handleRemoveItem(id: string): void {
        this.node.removeConditionalContextItem(id);
        if (this.selectedItemId === id) this.selectedItemId = null;
        this.selectedIds.delete(id);
        this.schedulePersist();
        this.refresh();
    }

    private handleRemoveChecked(): void {
        if (this.selectedIds.size === 0) return;
        for (const id of Array.from(this.selectedIds)) {
            this.node.removeConditionalContextItem(id);
            if (this.selectedItemId === id) this.selectedItemId = null;
        }
        this.selectedIds.clear();
        this.schedulePersist();
        this.refresh();
    }

    private handleToggleAll(): void {
        const items = this.node.getConditionalContextItems();
        const allSelected = items.length > 0 && items.every(i => this.selectedIds.has(i.id));
        this.selectedIds.clear();
        if (!allSelected) {
            for (const i of items) this.selectedIds.add(i.id);
        }
        this.renderItemsList();
    }

    private toggleSelectItem(id: string): void {
        this.selectedItemId = this.selectedItemId === id ? null : id;
        this.renderItemsList();
    }

    private handleScopeModeChange(): void {
        if (!this.selectedItemId || !this.scopeModeSelect) return;
        const item = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
        const mode = this.scopeModeSelect.value as ChildScopeMode;
        const titles = item?.childScope?.titles ?? [];
        this.node.updateConditionalContextItem(this.selectedItemId, { childScope: { mode, titles } });
        this.updateRowSummary(this.selectedItemId);
        this.renderChildChecklist();
        this.renderPreview();
        this.schedulePersist();
    }

    private toggleChildTitle(titleText: string, checked: boolean): void {
        if (!this.selectedItemId) return;
        const item = this.node.getConditionalContextItems().find(i => i.id === this.selectedItemId);
        if (!item) return;
        const mode = item.childScope?.mode ?? 'include';
        const titles = new Set(item.childScope?.titles ?? []);
        if (checked) titles.add(titleText); else titles.delete(titleText);
        const effectiveMode: ChildScopeMode = mode === 'all' ? 'include' : mode;
        this.node.updateConditionalContextItem(this.selectedItemId, { childScope: { mode: effectiveMode, titles: Array.from(titles) } });
        this.updateRowSummary(this.selectedItemId);
        this.renderChildChecklist();
        this.renderPreview();
        this.schedulePersist();
    }

    private navigateTo(nodeId: string): void {
        if (this.onNavigateToNodeId) {
            this.onNavigateToNodeId(nodeId);
            return;
        }
        const event = new CustomEvent<{ nodeId: string }>('cc-select-node', { detail: { nodeId } });
        window.dispatchEvent(event);
    }

    // ---------------- Helpers ----------------

    /**
     * The set of direct-child titles a scope can target: the union of generated
     * children and prospective (not-yet-expanded) children. When an embedder
     * supplies a live outline provider (e.g. the node chat editor's unsaved
     * outline) it is used; otherwise the node's own union helper is used. Both
     * sources already merge generated children with outline sections, so a scope
     * targeting a section that will exist after expansion is never falsely orphaned.
     */
    private getKnownChildTitles(): string[] {
        if (this.prospectiveChildTitles) {
            return this.prospectiveChildTitles();
        }
        return this.node.getDirectChildTitles();
    }

    private destroyInlineEditors(): void {
        this.editor?.destroy();
        this.editor = null;
        this.triggerEditor?.destroy();
        this.triggerEditor = null;
        this.childChecklist = null;
        this.scopeModeSelect = null;
        this.previewBox = null;
    }

    /**
     * Return the node's items in the current display order. 'natural' keeps the
     * stored order; 'id'/'text' return a sorted COPY so the node's underlying
     * array (and thus persistence/scope semantics) is never mutated. Ids of the
     * form "id_<n>" are compared numerically so id_2 precedes id_10.
     */
    private getSortedItems(): ReturnType<DocumentNode['getConditionalContextItems']> {
        const items = this.node.getConditionalContextItems();
        if (this.sortKey === 'natural') return items;
        const dir = this.sortDir === 'asc' ? 1 : -1;
        if (this.sortKey === 'id') {
            items.sort((a, b) => {
                const byNum = this.idNumber(a.id) - this.idNumber(b.id);
                return (byNum !== 0 ? byNum : a.id.localeCompare(b.id)) * dir;
            });
        } else {
            items.sort((a, b) =>
                this.itemTitle(a.text, 200).localeCompare(this.itemTitle(b.text, 200), undefined, { sensitivity: 'base' }) * dir
            );
        }
        return items;
    }

    /** Numeric value of an "id_<n>" id; ids without a number sort last. */
    private idNumber(id: string): number {
        const match = /(\d+)/.exec(id);
        return match ? parseInt(match[1]!, 10) : Number.MAX_SAFE_INTEGER;
    }

    private sortDirLabel(): string {
        return this.sortDir === 'asc' ? '▲ Asc' : '▼ Desc';
    }

    /** The direction toggle only matters when a real sort key is active. */
    private updateSortDirVisibility(): void {
        if (!this.sortDirBtn) return;
        this.sortDirBtn.style.display = this.sortKey === 'natural' ? 'none' : '';
    }

    private itemTitle(text: string, max = 80): string {
        const firstLine = (text.split('\n')[0] ?? '').trim();
        return firstLine.length > 0 ? truncateText(firstLine, max) : '(empty text)';
    }

    private scopeSummary(childScope: { mode: ChildScopeMode; titles: string[] } | undefined, leavesOnly: boolean | undefined, keywords: string[] | undefined): string {
        const parts: string[] = [];
        const mode = childScope?.mode ?? 'all';
        const titles = childScope?.titles ?? [];
        const titlesLabel = titles.length > 0 ? titles.join(', ') : '(none)';
        if (mode === 'all') parts.push('all children');
        else if (mode === 'include') parts.push(`only: ${titlesLabel}`);
        else parts.push(`except: ${titlesLabel}`);
        if (leavesOnly === true) parts.push('leaves only');
        if (keywords && keywords.length > 0) parts.push(`triggers: ${keywords.join(', ')}`);
        return parts.join(' • ');
    }

    private buttonStyle(bg: string, fg: string, border: string): string {
        return `padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid ${border}; background: ${bg}; color: ${fg}; font-weight: 600; cursor: pointer;`;
    }

    // ---------------- Persistence ----------------

    private schedulePersist(): void {
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        this.persistTimer = window.setTimeout(() => { void this.persistNow(); }, 400);
    }

    private async persistNow(): Promise<void> {
        await this.projectManager.saveToStorage();
    }
}
