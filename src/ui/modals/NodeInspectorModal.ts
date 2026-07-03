import { BaseModal } from './core/BaseModal';
import type { DocumentNode, ContentVersion } from '../../DocumentNode';
import { analyzeTagsInHierarchy } from '../../ProjectUtils';
import { Rating } from '../../types/RatingTypes';
import { findProjectByNode } from '../../state';
import { UniversalTextEditor } from '../components/UniversalTextEditor';
import { ConditionalContextEditor } from '../components/ConditionalContextEditor';
import { DiffTool } from '../../DiffTool';
import { promptForVersionName } from './VersionNameModal';


// ============================================================================
// INTERFACES & TYPES
// ============================================================================

// ============================================================================
// EVENT SYSTEM
// ============================================================================

class EventBus {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    emit(event: string, data?: unknown): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    off(event: string, callback: Function): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    destroy(): void {
        this.listeners.clear();
    }
}

// ============================================================================
// BASE COMPONENT SYSTEM
// ============================================================================

abstract class UIComponent {
    protected element: HTMLElement;
    protected isVisible: boolean = false;
    protected eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.element = this.createElement();
    }

    protected abstract createElement(): HTMLElement;
    abstract render(): HTMLElement;
    abstract destroy(): void;

    show(): void {
        this.isVisible = true;
        this.element.style.display = 'block';
    }

    hide(): void {
        this.isVisible = false;
        this.element.style.display = 'none';
    }

    getElement(): HTMLElement {
        return this.element;
    }
}

// ============================================================================
// VERSIONS LIST COMPONENT
// ============================================================================

// @ts-ignore - Legacy class kept for potential future use
class VersionsList extends UIComponent {
    private versions: ContentVersion[] = [];
    private selectedVersionId: string | null = null;

    protected createElement(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'versions-list-container';
        return container;
    }

    setVersions(versions: ContentVersion[]): void {
        this.versions = this.sortVersions(versions);
        this.renderVersions();
    }

    setSelectedVersion(versionId: string | null): void {
        this.selectedVersionId = versionId;
        this.updateSelection();
    }

    private sortVersions(versions: ContentVersion[]): ContentVersion[] {
        return [...versions].sort((a, b) => {
            // Master always first
            const aIsMaster = a.tags.has('master');
            const bIsMaster = b.tags.has('master');
            
            if (aIsMaster && !bIsMaster) return -1;
            if (!aIsMaster && bIsMaster) return 1;
            
            // Then by timestamp (newest first)
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    }

    private renderVersions(): void {
        this.element.innerHTML = `
            <div class="versions-list-header">
                <h3>Versions (${this.versions.length})</h3>
            </div>
            <div class="versions-list-content">
                ${this.versions.map(version => this.renderVersionItem(version)).join('')}
            </div>
        `;

        this.setupEventListeners();
    }

    private renderVersionItem(version: ContentVersion): string {
        const isMaster = version.tags.has('master');
        const isSelected = version.id === this.selectedVersionId;
        
        const classes = ['version-item'];
        if (isMaster) classes.push('master');
        if (isSelected) classes.push('selected');
        
        const tags = Array.from(version.tags)
            .filter(tag => tag !== 'master')
            .map(tag => `<span class="version-tag ${tag}">${tag}</span>`)
            .join('');
        
        const timestamp = new Date(version.timestamp).toLocaleString();
        const contentPreview = this.escapeHtml(version.content.substring(0, 200));
        
        return `
            <div class="${classes.join(' ')}" data-version-id="${version.id}">
                <div class="version-header">
                    <span class="version-id">${version.id.substring(0, 8)}...</span>
                    ${isMaster ? '<span class="master-badge">MASTER</span>' : ''}
                </div>
                ${tags ? `<div class="version-tags">${tags}</div>` : ''}
                <div class="version-timestamp">${timestamp}</div>
                <div class="version-preview">${contentPreview}${version.content.length > 200 ? '...' : ''}</div>
            </div>
        `;
    }

    private setupEventListeners(): void {
        // Version selection
        const content = this.element.querySelector('.versions-list-content');
        if (content) {
            content.addEventListener('click', (e) => {
                const versionItem = (e.target as HTMLElement).closest('.version-item');
                if (versionItem) {
                    const versionId = versionItem.getAttribute('data-version-id');
                    if (versionId) {
                        this.eventBus.emit('version:selected', versionId);
                    }
                }
            });
        }
    }

    private updateSelection(): void {
        // Update visual selection
        const items = this.element.querySelectorAll('.version-item');
        items.forEach(item => {
            const versionId = item.getAttribute('data-version-id');
            if (versionId === this.selectedVersionId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    render(): HTMLElement {
        return this.element;
    }

    destroy(): void {
        // Remove event listeners and clean up
        this.element.innerHTML = '';
    }
}

// ============================================================================
// CONTENT VIEWER COMPONENT  
// ============================================================================

// @ts-ignore - Legacy class kept for potential future use
class ContentViewer extends UIComponent {
    private version: ContentVersion | null = null;

    protected createElement(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'content-viewer-container';
        return container;
    }

    setVersion(version: ContentVersion | null): void {
        this.version = version;
        this.renderContent();
    }

    private renderContent(): void {
        if (!this.version) {
            this.element.innerHTML = `
                <div class="content-viewer-empty">
                    <p>Select a version to view its content</p>
                </div>
            `;
            return;
        }

        const ratings = this.version.metadata?.['ratings'] ?? [];
        
        this.element.innerHTML = `
            <div class="content-viewer-header">
                <h3>Content Preview</h3>
                <div class="version-info">
                    ${this.version.tags.has('master') ? '<strong>MASTER VERSION</strong> • ' : ''}
                    Created: ${new Date(this.version.timestamp).toLocaleString()}
                </div>
            </div>
            <div class="content-viewer-body">
                ${ratings.length > 0 ? this.renderRatings(ratings) : ''}
                <div class="content-section">
                    <pre class="content-text">${this.escapeHtml(this.version.content)}</pre>
                </div>
            </div>
        `;
    }

    private renderRatings(ratings: Rating[]): string {
        // Import and use shared RatingsRenderer
        try {
            const { RatingsRenderer } = require('../components/RatingsRenderer');
            
            // Convert ratings to expected format for RatingsRenderer
            const formattedRatings = ratings.map(rating => {
                return {
                    actual: rating.actual || (rating as any).score || 0, // Support both old and new formats
                    goal: rating.goal || 10,
                    criterion: rating.criterion || 'Unknown',
                    justification: rating.justification,
                    passed: rating.passed,
                    binary: rating.binary
                };
            });
            
            // Use compact mode for modal display
            return RatingsRenderer.renderRatings(formattedRatings, {
                title: 'Ratings',
                compact: true,
                showGoalLine: true,
                showJustification: false, // Keep compact in modal
                showTimestamp: false
            });
        } catch (error) {
            console.warn('RatingsRenderer not available, using fallback', error);
            // Fallback to simple display
            const ratingsHtml = ratings.map(rating => {
                const score = rating.actual || (rating as any).score || 0; // Support both old and new formats
                const goal = rating.goal || 10;
                
                const criterionName = rating.criterion || 'Unknown';
                
                return `
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-weight: 600;">${this.escapeHtml(criterionName)}</span>: 
                        <span style="color: ${score >= goal ? '#28a745' : '#dc3545'};">${score}/${goal}</span>
                    </div>
                `;
            }).join('');
            
            return `
                <div style="padding: 0.75rem; background-color: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                    <h4 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Ratings</h4>
                    ${ratingsHtml}
                </div>
            `;
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    render(): HTMLElement {
        return this.element;
    }

    destroy(): void {
        this.element.innerHTML = '';
    }
}

// ============================================================================
// CONTROLLER (BUSINESS LOGIC)
// ============================================================================



// ============================================================================
// MAIN MODAL CLASS
// ============================================================================

export class NodeInspectorModal extends BaseModal {
    // Embedded Conditional Context editor and listener
    private ccEditor: ConditionalContextEditor | null = null;
    private ccSelectListener: EventListener | null = null;
    private node: DocumentNode | null = null;
    private selectedVersionId: string | null = null;

    constructor() {
        super({
            id: 'node-inspector-modal-v2',
            closable: true,
            backdrop: true,
            width: '80vw',
            height: '80vh',
            maxWidth: 'none',
            maxHeight: 'none',
        });
    }

    public openWithNode(node: DocumentNode) {
        this.node = node;
        const versions = node.getAllVersions();
        // Select master by default, or first version
        const master = versions.find(v => v.tags.has('master'));
        this.selectedVersionId = master ? master.id : (versions[0]?.id ?? null);
        
        // Inject ratings styles
        this.injectRatingsStyles();
        
        // Listen for todo changes while modal is open
        this.setupTodoChangeListener();
        
        void this.open();
    }

    private setupTodoChangeListener(): void {
        const handleTodoChange = (event: CustomEvent) => {
            if (this.node && event.detail.nodeId === this.node.id) {
        
                this.rerender();
            }
        };

        // Remove any existing listener
        window.removeEventListener('todoListChanged', handleTodoChange as EventListener);
        
        // Add new listener
        window.addEventListener('todoListChanged', handleTodoChange as EventListener);
        
        // Store reference for cleanup
        (this as any)._todoChangeHandler = handleTodoChange;
    }

    public override async close(): Promise<void> {
        // Clean up todo change listener
        if ((this as any)._todoChangeHandler) {
            window.removeEventListener('todoListChanged', (this as any)._todoChangeHandler as EventListener);
            delete (this as any)._todoChangeHandler;
        }
        // Cleanup embedded Conditional Context editor and listener
        try { this.ccEditor?.destroy(); } catch {}
        this.ccEditor = null;
        if (this.ccSelectListener) {
            window.removeEventListener('cc-select-node', this.ccSelectListener);
            this.ccSelectListener = null;
        }
        
        // UniversalTextEditor now has automatic cleanup - no manual cleanup needed!
        
        await super.close();
    }

    protected override buildContentStyle(): string {
        return `
            background: #fff;
            border-radius: 12px;
            width: 80vw;
            height: 80vh;
            max-width: none;
            max-height: none;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
    }

    public render(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'node-inspector-v2';

        // Header
        const header = document.createElement('div');
        header.className = 'inspector-header';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';

        const titleEl = document.createElement('h1');
        titleEl.className = 'node-title-fat';
        if (this.node) {
            const project = findProjectByNode(this.node);
            const root = project?.rootNode ?? this.node;
            titleEl.textContent = this.node.getPath(root);
        } else {
            titleEl.textContent = 'Untitled Node';
        }

        header.appendChild(titleEl);
        container.appendChild(header);

        // Body (two columns)
        const body = document.createElement('div');
        body.className = 'inspector-body';

        // Left column (todo list + versions list)
        const left = document.createElement('div');
        left.className = 'inspector-column versions-list';
        
        // Create a single scrollable wrapper for both todo list and versions
        const scrollableWrapper = document.createElement('div');
        scrollableWrapper.className = 'scrollable-content';
        
        // Add todo list if there are incomplete todos
        const todoList = this.renderTodoList();
        if (todoList) {
            // Remove the scrollable-content class from todo list since we have our own wrapper
            todoList.classList.remove('scrollable-content');
            scrollableWrapper.appendChild(todoList);
        }

        // Otherwise, explain the small tree marker when only descendants have todos
        const descendantTodoNotice = this.renderDescendantTodoNotice();
        if (descendantTodoNotice) {
            scrollableWrapper.appendChild(descendantTodoNotice);
        }
        
        // Add versions list content (extract content from existing wrapper)
        const versionsListWithWrapper = this.renderVersionsList();
        // Move all children from versions wrapper to our scrollable wrapper
        while (versionsListWithWrapper.firstChild) {
            scrollableWrapper.appendChild(versionsListWithWrapper.firstChild);
        }
        
        left.appendChild(scrollableWrapper);

        // Right column (content view)
        const right = document.createElement('div');
        right.className = 'inspector-column content-view';
        right.appendChild(this.renderContentView());

        body.appendChild(left);
        body.appendChild(right);
        container.appendChild(body);

        // Styles - append to document head instead of container since BaseModal handles container
        const existingStyles = document.querySelector('#node-inspector-styles');
        if (!existingStyles) {
            const styles = this.createStyles();
            styles.id = 'node-inspector-styles';
            document.head.appendChild(styles);
        }

        // Setup editor event listeners after container is created
        void void setTimeout(() => { this.setupEditorEventListeners(); }, 0);

        return container;
    }

    private renderVersionsList(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'scrollable-content';
        if (!this.node) return wrapper;

        // Explicit "freeze current master as a named version" action.
        const snapshotBtn = document.createElement('button');
        snapshotBtn.className = 'snapshot-current-btn';
        snapshotBtn.textContent = '➕ Save current as version';
        snapshotBtn.onclick = () => { void this.handleSaveCurrentAsVersion(); };
        wrapper.appendChild(snapshotBtn);

        const versions = this.node.getAllVersions();
        // Sort: master first, then by timestamp desc
        versions.sort((a, b) => {
            if (a.tags.has('master')) return -1;
            if (b.tags.has('master')) return 1;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        
        for (const version of versions) {
            const item = document.createElement('div');
            item.className = 'version-list-item' + (version.id === this.selectedVersionId ? ' selected' : '') + (version.tags.has('master') ? ' master' : '');
            item.tabIndex = 0;
            item.onclick = () => {
                this.selectedVersionId = version.id;
                this.rerender();
            };
            
            // Generate tags display
            const tags = Array.from(version.tags)
                .filter(tag => tag !== 'master') // Master gets special treatment with styling
                .map(tag => `<span class="version-tag ${tag} clickable-tag" data-tag="${tag}" data-version-id="${version.id}">${tag}</span>`)
                .join('');
            
            // Compare-to-master is only meaningful for a non-master, non-draft
            // version while a master version actually exists to compare against.
            const canCompareToMaster = !version.tags.has('master')
                && !version.tags.has('draft')
                && versions.some(v => v.tags.has('master'));

            // Generate action buttons for selected version
            const actionButtons = version.id === this.selectedVersionId ? `
                <div class="version-action-buttons-inline">
                    ${canCompareToMaster ? `
                    <button class="version-action-btn compare-btn" data-version-id="${version.id}">
                        🔍 Compare to Master
                    </button>
                    ` : ''}
                    <button class="version-action-btn tag-btn" data-version-id="${version.id}">
                        🏷️ Tag
                    </button>
                    <button class="version-action-btn remove-btn" data-version-id="${version.id}">
                        🗑️ Remove
                    </button>
                </div>
            ` : '';
            
            item.innerHTML = `
                <div class="version-label">${this.getVersionLabel(version)}</div>
                ${tags ? `<div class="version-tags">${tags}</div>` : ''}
                <div class="version-timestamp">Modified: ${new Date(version.timestamp).toLocaleString()}</div>
                <div class="version-preview">
                    ${version.title ? `<div class="preview-title"><strong>Title:</strong> ${this.escapeHtml(version.title.substring(0, 40))}${version.title.length > 40 ? '…' : ''}</div>` : ''}
                    <div class="preview-content"><strong>Content:</strong> ${this.escapeHtml(version.content.substring(0, 50))}${version.content.length > 50 ? '…' : ''}</div>
                    <!-- Context preview removed - using conditional context system -->
                </div>
                ${actionButtons}
            `;
            
            // Add event listeners for action buttons if they exist
            if (version.id === this.selectedVersionId) {
                const tagBtn = item.querySelector('.tag-btn') as HTMLButtonElement;
                const removeBtn = item.querySelector('.remove-btn') as HTMLButtonElement;
                const compareBtn = item.querySelector<HTMLButtonElement>('.compare-btn');

                if (compareBtn) {
                    compareBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent triggering version selection
                        void this.handleCompareToMaster(version.id);
                    });
                }

                if (tagBtn) {
                    tagBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Prevent triggering version selection
                        await this.handleTagVersion(version.id);
                    });
                }
                
                if (removeBtn) {
                    removeBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Prevent triggering version selection
                        await this.handleRemoveVersion(version.id);
                    });
                }
            }
            
            // Add event listeners for clickable tags
            const clickableTags = item.querySelectorAll('.clickable-tag');
            clickableTags.forEach(tagElement => {
                tagElement.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Prevent triggering version selection
                    const tagName = (tagElement as HTMLElement).dataset['tag'];
                    const versionId = (tagElement as HTMLElement).dataset['versionId'];
                    if (tagName && versionId) {
                        await this.handleRemoveTagFromVersion(versionId, tagName);
                    }
                });
            });
            
            wrapper.appendChild(item);
        }
        return wrapper;
    }



    private renderTodoList(): HTMLElement | null {
        if (!this.node) return null;
        
        const incompleteTodos = this.node.getIncompleteTodos();
        if (incompleteTodos.length === 0) {
            return null; // Don't render anything if no todos
        }
        
        const wrapper = document.createElement('div');
        wrapper.className = 'todo-list-section';
        
        const header = document.createElement('div');
        header.className = 'todo-list-header';
        header.innerHTML = `
            <h3 style="margin: 0; font-size: 1em; color: #374151;">📝 Todo Items (${incompleteTodos.length})</h3>
        `;
        
        const todoContainer = document.createElement('div');
        todoContainer.className = 'todo-list-container';
        
        incompleteTodos.forEach((todo) => {
            const todoItem = document.createElement('div');
            todoItem.className = 'todo-item';
            
            // Format related nodes
            const relatedNodesHtml = todo.relatedNodes.length > 0 
                ? `<div class="todo-related-nodes">
                     <small>Related: ${todo.relatedNodes.map(ref => ref.title).join(', ')}</small>
                   </div>`
                : '';
            
            // Build logic error details if available
            const logicErrorHtml = todo.logicError 
                ? `<div class="logic-error-details">
                     <div class="logic-error-meta">
                         <span class="logic-error-type">${todo.logicError.type.replace(/_/g, ' ')}</span>
                         <span class="logic-error-severity">Severity: ${todo.logicError.severity}/10</span>
                     </div>
                     <div class="logic-error-justification">
                         <div class="justification-header" data-todo-id="${todo.id}">
                             <strong>Justification:</strong>
                             <span class="justification-toggle">▶</span>
                         </div>
                         <div class="justification-content collapsed">
                             ${this.escapeHtml(todo.logicError.justification)}
                         </div>
                     </div>
                     ${todo.logicError.suggestedFix 
                         ? `<div class="logic-error-suggestion">
                              <strong>Suggested Fix:</strong> ${this.escapeHtml(todo.logicError.suggestedFix)}
                            </div>` 
                         : ''}
                   </div>`
                : '';

            todoItem.innerHTML = `
                <div class="todo-content">
                    <div class="todo-description">${this.escapeHtml(todo.description)}</div>
                    ${logicErrorHtml}
                    ${relatedNodesHtml}
                    <div class="todo-timestamp">
                        <small>${new Date(todo.timestamp).toLocaleString()}</small>
                    </div>
                </div>
                <div class="todo-actions">
                    <button class="todo-complete-btn" data-todo-id="${todo.id}" title="Mark as completed">
                        ✅
                    </button>
                    <button class="todo-remove-btn" data-todo-id="${todo.id}" title="Remove todo">
                        🗑️
                    </button>
                </div>
            `;
            
            todoContainer.appendChild(todoItem);
        });
        
        wrapper.appendChild(header);
        wrapper.appendChild(todoContainer);
        
        // Add event listeners for todo actions
        wrapper.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const todoId = target.dataset['todoId'];
            
            if (target.classList.contains('todo-complete-btn') && todoId) {
                void this.completeTodo(todoId);
            } else if (target.classList.contains('todo-remove-btn') && todoId) {
                void this.removeTodo(todoId);
            } else if (target.classList.contains('justification-header') || target.closest('.justification-header')) {
                // Handle justification toggle
                const header = target.classList.contains('justification-header') 
                    ? target 
                    : target.closest('.justification-header') as HTMLElement;
                this.toggleJustification(header);
            }
        });
        
        return wrapper;
    }

    /**
     * Collects descendant nodes (children, grandchildren, ...) that have at least
     * one incomplete todo. The node itself is not included.
     */
    private collectDescendantsWithTodos(node: DocumentNode): DocumentNode[] {
        const result: DocumentNode[] = [];
        for (const child of node.children) {
            if (child.getIncompleteTodos().length > 0) {
                result.push(child);
            }
            result.push(...this.collectDescendantsWithTodos(child));
        }
        return result;
    }

    /**
     * Renders an informational notice when the inspected node has no todos of its
     * own but one or more of its descendants do. This explains the small, faded
     * todo icon that appears on ancestor nodes in the tree, which is otherwise
     * unintuitive (opening the node shows no todo).
     */
    private renderDescendantTodoNotice(): HTMLElement | null {
        if (!this.node) return null;
        // The node's own todos are already surfaced by renderTodoList().
        if (this.node.getIncompleteTodos().length > 0) return null;

        const descendantsWithTodos = this.collectDescendantsWithTodos(this.node);
        if (descendantsWithTodos.length === 0) return null;

        const totalTodos = descendantsWithTodos.reduce(
            (sum, n) => sum + n.getIncompleteTodos().length,
            0
        );

        const wrapper = document.createElement('div');
        wrapper.className = 'descendant-todo-notice';

        const listItems = descendantsWithTodos
            .map(n => `<li>${this.escapeHtml(n.title)} <span class="descendant-todo-count">${n.getIncompleteTodos().length}</span></li>`)
            .join('');

        const summary = totalTodos === 1
            ? 'a descendant node has a todo entry'
            : `${totalTodos} todo entries exist in descendant nodes`;

        wrapper.innerHTML = `
            <div class="descendant-todo-notice-header">⚠️ Descendant todo items</div>
            <div class="descendant-todo-notice-body">
                This node has no todos of its own, but ${summary}. That is why it shows the small todo marker in the tree.
            </div>
            <ul class="descendant-todo-notice-list">${listItems}</ul>
        `;

        return wrapper;
    }

    private async completeTodo(todoId: string): Promise<void> {
        if (!this.node) return;
        
        const success = this.node.completeTodo(todoId);
        if (success) {
            this.rerender(); // Refresh the modal to update the todo list
            await this.persistNodeChanges(); // Save changes to storage
        }
    }

    private async removeTodo(todoId: string): Promise<void> {
        if (!this.node) return;
        
        const success = this.node.removeTodo(todoId);
        if (success) {
            this.rerender(); // Refresh the modal to update the todo list
            await this.persistNodeChanges(); // Save changes to storage
        }
    }

    /**
     * Toggle the justification content visibility
     */
    private toggleJustification(header: HTMLElement): void {
        const justificationDiv = header.parentElement;
        if (!justificationDiv) return;
        
        const content = justificationDiv.querySelector('.justification-content') as HTMLElement;
        const toggle = header.querySelector('.justification-toggle') as HTMLElement;
        
        if (!content || !toggle) return;
        
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Expand
            content.classList.remove('collapsed');
            toggle.classList.add('expanded');
            toggle.textContent = '▼';
        } else {
            // Collapse
            content.classList.add('collapsed');
            toggle.classList.remove('expanded');
            toggle.textContent = '▶';
        }
    }

    private renderContentView(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'scrollable-content';
        if (!this.node) return wrapper;
        const version = this.node.getAllVersions().find(v => v.id === this.selectedVersionId);
        if (!version) {
            wrapper.innerHTML = '<p>No version selected.</p>';
            return wrapper;
        }
        
        // Generate tags display for content view
        const contentTags = Array.from(version.tags)
            .map(tag => `<span class="content-version-tag ${tag}">${tag}</span>`)
            .join('');
            
        // Check if this version has ratings
        const hasRatings = version.ratings && version.ratings.length > 0;
        let ratingsHtml = '';
        
        if (hasRatings) {
            // No conversion needed - version.ratings already uses unified Rating interface
            ratingsHtml = this.renderVersionRatings(version.ratings!, version);
        }
        
        wrapper.innerHTML = `
            <div class="content-header">
                <div class="content-label">
                    <strong>${this.getVersionLabel(version)}</strong>
                    <span class="content-timestamp">Modified: ${new Date(version.timestamp).toLocaleString()}</span>
                </div>
                ${contentTags ? `<div class="content-version-tags">${contentTags}</div>` : ''}
                    </div>
                    
            ${hasRatings ? ratingsHtml : ''}
            
            <div class="version-sections">
                <div class="version-section" id="ins-title-section">
                    <h4 class="section-title" id="ins-title-toggle" style="cursor: pointer;">▼ Title</h4>
                    <div class="section-content foldable-content" id="ins-title-content">
                        <input type="text" class="title-editor" id="inspector-title-editor" value="${this.escapeHtml(version.title || '')}" placeholder="Enter title...">
                    </div>
                </div>
                
                <div class="version-section" id="ins-content-section">
                    <h4 class="section-title" id="ins-content-toggle" style="cursor: pointer;">▼ Content</h4>
                    <div class="section-content foldable-content" id="ins-content-content">
                        <textarea class="content-editor auto-resize" id="inspector-content-editor" placeholder="Enter content...">${this.escapeHtml(version.content || '')}</textarea>
                    </div>
                </div>
                
                <!-- Traditional context section removed - using conditional context system -->
                <div class="version-section">
                    <h4 class="section-title">Conditional Context</h4>
                    <div class="section-content" id="inspector-conditional-context-host" style="width: 100%; min-height: 300px; display: flex; flex-direction: column;"></div>
                </div>
                
                <div class="version-section" id="ins-notes-section">
                    <h4 class="section-title" id="ins-notes-toggle" style="cursor: pointer;">▼ Notes</h4>
                    <div class="section-content foldable-content" id="ins-notes-content">
                        <textarea class="notes-editor auto-resize" id="inspector-notes-editor" placeholder="Enter personal notes about this node...">${this.escapeHtml(this.node?.notes || '')}</textarea>
                    </div>
                </div>
                </div>

            `;
        
        // Mount embedded Conditional Context editor (no preview)
        setTimeout(() => {
            try {
                const host = wrapper.querySelector('#inspector-conditional-context-host') as HTMLElement;
                if (host && this.node) {
                    // Destroy previous instance if any
                    try { this.ccEditor?.destroy(); } catch {}
                    this.ccEditor = new ConditionalContextEditor({
                        node: this.node,
                        projectManager: findProjectByNode(this.node)!,
                        showPreview: false,
                        showInheritedByDefault: true,
                        onNavigateToNodeId: (nodeId: string) => {
                            try {
                                const pm = findProjectByNode(this.node!);
                                if (!pm) return;
                                void import('../../project/TreeService')
                                    .then(({ TreeService }) => {
                                        const ts = new TreeService();
                                        const target = ts.findNodeById(nodeId, pm.rootNode);
                                        if (target) {
                                            // Update inspector state and re-render in-place
                                            this.node = target;
                                            const versions = target.getAllVersions();
                                            const master = versions.find(v => v.tags.has('master'));
                                            this.selectedVersionId = master ? master.id : (versions[0]?.id ?? null);
                                            this.rerender();
                                        }
                                    })
                                    .catch((e) => {
                                        console.error('Failed to navigate in NodeInspector:', e);
                                    });
                            } catch (e) {
                                console.error('Failed to navigate in NodeInspector:', e);
                            }
                        }
                    });
                    this.ccEditor.mount(host);

                    // Rewire node-select from embedded editor
                    if (this.ccSelectListener) {
                        window.removeEventListener('cc-select-node', this.ccSelectListener);
                    }
                    this.ccSelectListener = ((ev: Event) => {
                        const detail = (ev as CustomEvent<{ nodeId: string }>).detail;
                        if (detail && detail.nodeId) {
                            // Select in main UI and also re-render inspector to reflect new path/title
                            void import('../project-ui')
                                .then(({ setSelectedNodeAndRedraw }) => {
                                    setSelectedNodeAndRedraw(detail.nodeId);
                                })
                                .catch((e) => {
                                    console.error('Failed to update selection in main UI:', e);
                                });
                            // Optionally, close and reopen to the selected node; for now, just refresh header
                        }
                    }) as EventListener;
                    window.addEventListener('cc-select-node', this.ccSelectListener);
                }
            } catch (e) {
                console.error('Failed to mount embedded Conditional Context editor in NodeInspector:', e);
            }
        }, 0);

        // Wire fold/unfold behavior
        const attachToggle = (toggleId: string, contentId: string) => {
            const t = wrapper.querySelector('#' + toggleId) as HTMLElement | null;
            const c = wrapper.querySelector('#' + contentId) as HTMLElement | null;
            if (t && c) {
                t.addEventListener('click', () => {
                    const isCollapsed = c.classList.toggle('collapsed');
                    const label = t.textContent ?? '';
                    const clean = label.replace(/^([▼▶])\s*/, '');
                    t.textContent = (isCollapsed ? '▶ ' : '▼ ') + clean;
                });
            }
        };
        attachToggle('ins-title-toggle', 'ins-title-content');
        attachToggle('ins-content-toggle', 'ins-content-content');
        attachToggle('ins-context-toggle', 'ins-context-content');
        attachToggle('ins-notes-toggle', 'ins-notes-content');

        return wrapper;
    }

    private getVersionLabel(version: ContentVersion): string {
        if (version.tags.has('master')) return 'Current (Master)';
        if (version.label && version.label.trim().length > 0) return version.label;
        if (version.tags.has('generatedWinner')) return 'Generated Winner';
        if (version.tags.has('polished')) return 'Polished';
        if (version.tags.has('coherenceFix')) return 'Coherence Fix';
        if (version.tags.has('draft')) return 'Draft';
        if (version.tags.has('imported')) return 'Imported';
        
        // Check for generation iterations
        const iterationTag = Array.from(version.tags).find(tag => tag.startsWith('iteration'));
        if (iterationTag && version.tags.has('generated')) {
            const iterationNumber = iterationTag.replace('iteration', '');
            return `Generation ${iterationNumber}`;
        }
        
        if (version.tags.has('generated')) return 'Generated';
        const restoredTag = Array.from(version.tags).find(tag => tag.startsWith('Restored_'));
        if (restoredTag) return 'Restored';
        const batchTag = Array.from(version.tags).find(tag => tag.startsWith('Batch_'));
        if (batchTag) return 'Batch Update';
        const manualEditTag = Array.from(version.tags).find(tag => tag.startsWith('ManualEdit_'));
        if (manualEditTag) return 'Manual Edit';
        if (version.tags.has('legacy')) return 'Legacy';
        return 'Version';
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show a highlighted side-by-side diff of the given (non-master) version
     * against the node's master version. Master is the "original" (left), the
     * selected version is the "modified" (right), so highlights read as what this
     * version changed relative to master. Reuses the shared DiffTool.
     */
    private async handleCompareToMaster(versionId: string): Promise<void> {
        if (!this.node) return;

        const versions = this.node.getAllVersions();
        const master = versions.find(v => v.tags.has('master'));
        const selected = versions.find(v => v.id === versionId);
        if (!master || !selected) {
            console.error('Compare to master: master or selected version not found');
            return;
        }

        const diff = DiffTool.compare(master.content, selected.content);
        const summary = DiffTool.getSummary(diff);
        const selectedLabel = this.getVersionLabel(selected);

        const columnStyle = 'flex:1 1 0; min-width:0; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; display:flex; flex-direction:column;';
        const headStyle = 'padding:6px 10px; font-weight:700; background:#f3f4f6; border-bottom:1px solid #e5e7eb;';
        const bodyStyle = 'padding:10px; white-space:pre-wrap; overflow:auto; max-height:62vh; line-height:1.5;';

        const titleNote = master.title !== selected.title
            ? `<div style="margin-bottom:10px; padding:8px 10px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px;">
                   <strong>Title changed:</strong>
                   <span style="color:#b91c1c;">${this.escapeHtml(master.title || '(empty)')}</span>
                   →
                   <span style="color:#166534;">${this.escapeHtml(selected.title || '(empty)')}</span>
               </div>`
            : '';

        const content = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="font-weight:600;">${this.escapeHtml(summary)}</div>
                ${titleNote}
                <div style="display:flex; gap:12px;">
                    <div style="${columnStyle}">
                        <div style="${headStyle}">Master</div>
                        <div style="${bodyStyle}">${diff.originalHtml}</div>
                    </div>
                    <div style="${columnStyle}">
                        <div style="${headStyle}">${this.escapeHtml(selectedLabel)}</div>
                        <div style="${bodyStyle}">${diff.modifiedHtml}</div>
                    </div>
                </div>
            </div>
        `;

        const { showGenericModal } = await import('./index');
        showGenericModal(
            { content },
            { title: 'Compare to Master', maxWidth: '80vw' }
        );
    }

    private async handleTagVersion(versionId: string): Promise<void> {
        if (!this.node) return;
        
        try {
            // Get the project root node to analyze all tags
            const projectRoot = this.getProjectRoot();
            
            // Get all tags in the project
            const tagAnalysis = analyzeTagsInHierarchy(projectRoot);
            const existingTags = tagAnalysis.allTags;
            
            // Show tag selection modal
            const tagModal = new TagSelectionModal(existingTags);
            const selectedTag = await tagModal.showModal();
            if (!selectedTag) return;
            
            // Find the version and add the tag
            const version = this.node.getAllVersions().find(v => v.id === versionId);
            if (!version) {
                console.error('Version not found');
                return;
            }
            
            // Check if this would create a duplicate master
            if (selectedTag === 'master' && !version.tags.has('master')) {
                // Remove master tag from all other versions
                this.node.getAllVersions().forEach(v => {
                    if (v.id !== versionId) {
                        v.tags.delete('master');
                    }
                });
            }
            
            // Add the tag
            version.tags.add(selectedTag);
            version.timestamp = new Date();
            
            // Persist changes and re-render
            await this.persistNodeChanges();
            this.rerender();
            
        } catch (error) {
            console.error('Error tagging version:', error);
            alert('Failed to tag version. Please try again.');
        }
    }

    private async handleRemoveVersion(versionId: string): Promise<void> {
        if (!this.node) return;
        
        try {
            const version = this.node.getAllVersions().find(v => v.id === versionId);
            if (!version) {
                console.error('Version not found');
                return;
            }
            
            // Confirm removal
            const versionLabel = this.getVersionLabel(version);
            if (!confirm(`Are you sure you want to remove the version "${versionLabel}"?\n\nThis action cannot be undone.`)) {
                return;
            }
            
            // Remove the version
            const wasRemoved = this.node.removeVersion(versionId);
            if (wasRemoved) {
                // If this was the selected version, select another one
                if (this.selectedVersionId === versionId) {
                    const remainingVersions = this.node.getAllVersions();
                    const masterVersion = remainingVersions.find(v => v.tags.has('master'));
                    this.selectedVersionId = masterVersion ? masterVersion.id : (remainingVersions[0]?.id ?? null);
                }
                
                // Persist changes and re-render
                await this.persistNodeChanges();
                this.rerender();
            }
            
        } catch (error) {
            console.error('Error removing version:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`Failed to remove version: ${errorMessage}`);
        }
    }

    /**
     * Freezes the node's current master content as a new, user-named snapshot
     * version. Shared naming modal with the node chat editor.
     */
    private async handleSaveCurrentAsVersion(): Promise<void> {
        if (!this.node) return;

        const defaultName = this.node.suggestNextVersionName();
        const name = await promptForVersionName(defaultName);
        if (name === null) return; // cancelled

        this.node.createNamedVersion(name, { title: this.node.title, content: this.node.content });
        await this.persistNodeChanges();
        this.rerender();
    }

    private async handleRemoveTagFromVersion(versionId: string, tagName: string): Promise<void> {
        if (!this.node) return;
        
        try {
            const version = this.node.getAllVersions().find(v => v.id === versionId);
            if (!version) {
                console.error('Version not found');
                return;
            }
            
            // Remove the tag
            version.tags.delete(tagName);
            version.timestamp = new Date();
            
            // Persist changes and re-render
            await this.persistNodeChanges();
            this.rerender();
            
        } catch (error) {
            console.error('Error removing tag from version:', error);
            alert('Failed to remove tag. Please try again.');
        }
    }

    private getProjectRoot(): DocumentNode {
        if (!this.node) {
            throw new Error('NodeInspectorModal: node is not set');
        }
        const projectManager = findProjectByNode(this.node);
        return projectManager?.rootNode ?? this.node;
    }

    private async persistNodeChanges(): Promise<void> {
        try {
            const projectManager = this.node ? findProjectByNode(this.node) : null;
            if (projectManager) {
                // Save the project to storage
                await projectManager.saveToStorage();
                
                // Update both the project tree and node details to ensure all UI reflects changes
                const { renderMultiProjectTree, renderNodeDetails } = await import('../project-ui');
                renderMultiProjectTree(); // Updates tree titles and structure
                renderNodeDetails();      // Updates details panel content
            }
        } catch (error) {
            console.error('Failed to persist node changes:', error);
        }
    }

    private rerender() {
        // UniversalTextEditor now has automatic cleanup when DOM elements are removed!
        
        // Re-render modal content
        const modalContent = this.render();
        if (this.element) {
            const modalRoot = this.element.querySelector('.modal-content');
            if (modalRoot) {
                modalRoot.innerHTML = '';
                modalRoot.appendChild(modalContent);
                
                // Re-add close button after content replacement (fixes missing close button bug)
                if (this.config.closable) {
                    this.addCloseButton(modalRoot as HTMLElement);
                }
            }
        }
    }

    private setupEditorEventListeners(): void {
        if (!this.node) return;

        const titleEditor = document.getElementById('inspector-title-editor') as HTMLInputElement;
        const contentEditor = document.getElementById('inspector-content-editor') as HTMLTextAreaElement;
        // contextEditor removed - using conditional context system
        const notesEditor = document.getElementById('inspector-notes-editor') as HTMLTextAreaElement;

        // Upgrade content textarea to enhanced UniversalTextEditor - Drop-in replacement!
        if (contentEditor) {
            const enhancedContentEditor = UniversalTextEditor.replace(contentEditor, {
                mode: 'enhanced'  // Enable AI features and text transformation
            });
            
            // Add blur event listener using standard DOM API
            enhancedContentEditor.addEventListener('blur', async () => {
                this.saveContent(enhancedContentEditor.value);
                // Update external UI only when editing is finished
                await this.persistNodeChanges();
            });
        }

        // Traditional context editor removed - using conditional context system

        // Upgrade notes textarea to enhanced UniversalTextEditor - Drop-in replacement!
        if (notesEditor) {
            const enhancedNotesEditor = UniversalTextEditor.replace(notesEditor, {
                mode: 'enhanced'  // Enable AI features for notes editing too
            });
            
            // Add blur event listener using standard DOM API - should work exactly like before
            enhancedNotesEditor.addEventListener('blur', async () => {
                this.saveNotes(enhancedNotesEditor.value);
                // Update external UI only when editing is finished
                await this.persistNodeChanges();
            });
        }

        // Title editor - save only on blur (when focus is lost)
        if (titleEditor) {
            titleEditor.addEventListener('blur', async () => {
                this.saveTitle(titleEditor.value);
                // Update external UI only when editing is finished
                await this.persistNodeChanges();
            });
        }

        // Authorize-anyway toggle: accept (or revoke) a node whose generation did
        // not meet all quality goals, clearing/restoring the ❗ mark in the tree.
        const approveBtn = document.getElementById('inspector-approve-quality-btn');
        if (approveBtn) {
            approveBtn.addEventListener('click', async () => {
                if (!this.node) return;
                if (this.node.isQualityApproved()) {
                    this.node.revokeQualityApproval();
                } else {
                    this.node.approveQuality();
                }
                // Persist + refresh the tree (updates the ❗ mark), then rerender
                // the modal so the button and verdict reflect the new state.
                await this.persistNodeChanges();
                this.rerender();
            });
        }

        // Enhanced mode selection overlay is handled by the editor itself
    }



    // Auto-resize is now handled automatically by UniversalTextEditor

    private saveTitle(newTitle: string): void {
        if (!this.node || !this.selectedVersionId) return;

        try {
            // Find the specific version being edited
            const selectedVersion = this.node.getAllVersions().find(v => v.id === this.selectedVersionId);
            if (!selectedVersion) {
                console.error('Selected version not found for editing');
                return;
            }

            // Update the specific version's title
            selectedVersion.title = newTitle;
            selectedVersion.timestamp = new Date();
            selectedVersion.tags.add('edited');
            selectedVersion.tags.add('title_edited');
        } catch (error) {
            console.error('Failed to save title:', error);
        }
    }

    private saveContent(newContent: string): void {
        if (!this.node || !this.selectedVersionId) return;

        try {
            // Find the specific version being edited
            const selectedVersion = this.node.getAllVersions().find(v => v.id === this.selectedVersionId);
            if (!selectedVersion) {
                console.error('Selected version not found for editing');
                return;
            }

            // Update the specific version's content
            selectedVersion.content = newContent;
            selectedVersion.timestamp = new Date();
            selectedVersion.tags.add('edited');
            selectedVersion.tags.add('content_edited');
        } catch (error) {
            console.error('Failed to save content:', error);
        }
    }

    // saveContext method removed - using conditional context system

    private saveNotes(newNotes: string): void {
        if (!this.node) return;

        try {
            // Notes are stored directly on the node, not in versions
            // since they are user notes about the node itself
            this.node.notes = newNotes;
        } catch (error) {
            console.error('Failed to save notes:', error);
        }
    }

    private renderVersionRatings(ratings: Rating[], version: ContentVersion): string {
        // Group scalar (1-10) criteria first and binary (pass/fail) constraints
        // last, so comparably-scored criteria read together. Stable sort keeps
        // the original order within each group.
        const orderedRatings = [...ratings].sort(
            (a, b) => Number(a.binary === true) - Number(b.binary === true)
        );

        // Use 3-column layout with visual progress bars (0-10 scale)
        const ratingsHtml = orderedRatings.map(rating => {
            const score = rating.actual || (rating as any).score || 0; // Support both old and new formats
            const goal = rating.goal || 10;
            const criterionName = rating.criterion || 'Unknown';

            // Binary (pass/fail) constraints read as a Pass/Fail pill rather than a
            // 0-10 bar, which would be misleading for a 0/1 score.
            if (rating.binary === true) {
                const met = score >= goal;
                const pillColor = met ? '#28a745' : '#dc3545';
                const label = met ? '✓ Pass' : '✗ Fail';
                // Binary rows have no 0-10 bar, so the constraint text gets the
                // freed-up width (abbreviated with an ellipsis; full text on hover).
                return `
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem; padding: 0.125rem 0;">
                    <span title="${this.escapeHtml(criterionName)}" style="font-weight: 500; font-size: 0.85rem; color: #374151; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; min-width: 0;">${this.escapeHtml(criterionName)}</span>
                    <span style="font-weight: 600; font-size: 0.75rem; color: white; background: ${pillColor}; padding: 0.1rem 0.5rem; border-radius: 999px; min-width: 3rem; text-align: center; white-space: nowrap;">${label}</span>
                </div>
                `;
            }

            const scorePercentage = Math.min((score / 10) * 100, 100); // Always scale to 10
            const goalPercentage = Math.min((goal / 10) * 100, 100); // Goal indicator position

            const barColor = score >= goal ? '#28a745' : (score >= goal * 0.7 ? '#ffc107' : '#dc3545');
            const textColor = score >= goal ? '#28a745' : '#dc3545';
            
            return `
                <div style="display: grid; grid-template-columns: 1fr 2fr auto; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem; padding: 0.125rem 0;">
                    <span style="font-weight: 500; font-size: 0.85rem; color: #374151; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${this.escapeHtml(criterionName)}</span>
                    <div style="background: #e9ecef; border-radius: 4px; height: 12px; position: relative; min-width: 0;">
                        <div style="background: ${barColor}; height: 100%; border-radius: 4px; width: ${scorePercentage}%; transition: width 0.3s ease;"></div>
                        ${goal !== 10 ? `<div style="position: absolute; top: 0; left: ${goalPercentage}%; width: 2px; height: 12px; background: #6b7280; border-radius: 1px; transform: translateX(-50%);"></div>` : ''}
                    </div>
                    <span style="font-weight: 600; font-size: 0.8rem; color: ${textColor}; min-width: 3rem; text-align: right;">${score}/${goal}</span>
                </div>
            `;
        }).join('');

        const belowGoal = ratings.filter(rating => {
            const score = rating.actual || (rating as any).score || 0;
            const goal = rating.goal || 10;
            return score < goal;
        }).length;
        const passed = belowGoal === 0;
        const verdict = passed
            ? `<span style="color: #28a745;">PASSED</span>`
            : `<span style="color: #dc3545;">FAILED — ${belowGoal} below goal</span>`;

        // Authorize control: only meaningful on the master version of a node whose
        // winning generation fell short. Lets the user clear the ❗ tree mark by
        // accepting the result as-is (or revoke that acceptance later).
        const isMaster = version.tags.has('master');
        const isApproved = this.node !== null && this.node.isQualityApproved();
        let approveButtonHtml = '';
        if (isMaster && belowGoal > 0) {
            approveButtonHtml = isApproved
                ? `<button id="inspector-approve-quality-btn" data-approved="true" title="This node was authorized despite unmet quality goals. Click to revoke and restore the ❗ mark." style="flex-shrink: 0; font-size: 0.75rem; font-weight: 600; color: #fff; background: #28a745; border: none; border-radius: 999px; padding: 0.25rem 0.7rem; cursor: pointer;">✓ Authorized — revoke</button>`
                : `<button id="inspector-approve-quality-btn" data-approved="false" title="Authorize this node despite unmet quality goals (removes the ❗ mark in the tree)." style="flex-shrink: 0; font-size: 0.75rem; font-weight: 600; color: #fff; background: #6b7280; border: none; border-radius: 999px; padding: 0.25rem 0.7rem; cursor: pointer;">Authorize anyway</button>`;
        }

        return `
            <div style="padding: 0.75rem; background-color: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0 0 0.5rem 0;">
                    <h4 style="margin: 0; font-size: 0.9rem; color: #374151;">Quality Ratings — ${verdict}</h4>
                    ${approveButtonHtml}
                </div>
                <div style="font-size: 0.85rem;">
                    ${ratingsHtml}
                </div>
            </div>
        `;
    }

    private injectRatingsStyles(): void {
        // Add shared ratings renderer styles if not already present
        if (!document.querySelector('#ratings-renderer-styles-modal')) {
            try {
                // Use dynamic import instead of require for browser compatibility
                void import('../components/RatingsRenderer').then(({ RatingsRenderer }) => {
                    const styleElement = document.createElement('style');
                    styleElement.id = 'ratings-renderer-styles-modal';
                    styleElement.textContent = RatingsRenderer.getStyles();
                    document.head.appendChild(styleElement);
                }).catch(error => {
                    console.warn('Could not load RatingsRenderer styles via import', error);
                });
            } catch (error) {
                console.warn('Could not load RatingsRenderer styles', error);
            }
        }
    }

    private createStyles(): HTMLElement {
        const style = document.createElement('style');
        style.textContent = `
            .node-inspector-v2 {
                display: flex;
                flex-direction: column;
                height: 100%;
                width: 100%;
                overflow: hidden;
            }
            .inspector-header {
                flex-shrink: 0;
                padding: 1.5rem;
                border-bottom: 1px solid #e5e7eb;
                background: #f9fafb;
            }
            .node-title-fat {
                font-size: 1.1rem;
                font-weight: 800;
                color: #1f2937;
                margin: 0;
                line-height: 1.2;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                letter-spacing: -0.025em;
            }
            .inspector-body {
                flex: 1 1 0%;
                min-height: 0;
                display: flex;
                flex-direction: row;
                gap: 1.5rem;
                height: 100%;
                overflow: hidden;
            }
            .inspector-column {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
                background: #fff;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                overflow: hidden;
            }
            .versions-list {
                flex: 0 0 30%;
                max-width: 30%;
            }
            .content-view {
                flex: 1 1 70%;
                min-width: 0;
            }
            .scrollable-content {
                flex: 1 1 0%;
                min-height: 0;
                overflow-y: auto;
                padding: 1rem;
            }
            .snapshot-current-btn {
                width: 100%;
                margin-bottom: 0.75rem;
                padding: 0.5rem 0.75rem;
                border: 1px dashed #3b82f6;
                border-radius: 6px;
                background: #eff6ff;
                color: #1d4ed8;
                font-size: 0.85rem;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .snapshot-current-btn:hover {
                background: #dbeafe;
            }
            .version-list-item {
                border-radius: 6px;
                border: 1px solid #e5e7eb;
                margin-bottom: 0.75rem;
                padding: 0.75rem;
                background: #f9fafb;
                cursor: pointer;
                transition: border-color 0.2s, background 0.2s;
            }
            .version-list-item.selected {
                border-color: #3b82f6;
                background: #eff6ff;
            }
            .version-list-item.master {
                border-color: #10b981;
                background: #f0fdf4;
            }
            .version-label {
                font-weight: 600;
                color: #374151;
                margin-bottom: 0.25rem;
            }
            .version-timestamp {
                font-size: 0.85em;
                color: #6b7280;
                margin-bottom: 0.25rem;
            }
            .version-preview {
                font-size: 0.85em;
                color: #6b7280;
                line-height: 1.3;
            }
            .preview-title, .preview-content, .preview-context {
                margin: 0.25rem 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .preview-title strong, .preview-content strong, .preview-context strong {
                color: #374151;
                font-size: 0.8em;
            }
            .version-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 0.25rem;
                margin: 0.5rem 0;
            }
            .version-tag {
                font-size: 0.7rem;
                padding: 0.125rem 0.375rem;
                border-radius: 0.25rem;
                border: 1px solid #d1d5db;
                background: #f3f4f6;
                color: #374151;
                font-weight: 500;
            }
            .version-tag.master {
                background: #10b981;
                color: white;
                border-color: #059669;
            }
            .version-tag.generated {
                background: #3b82f6;
                color: white;
                border-color: #2563eb;
            }
            .version-tag.polished {
                background: #8b5cf6;
                color: white;
                border-color: #7c3aed;
            }
            .version-tag.coherenceFix {
                background: #f59e0b;
                color: white;
                border-color: #d97706;
            }
            .version-tag.generatedWinner {
                background: #059669;
                color: white;
                border-color: #047857;
            }
            .version-tag.draft {
                background: #6b7280;
                color: white;
                border-color: #4b5563;
            }
            .version-tag[class*="iteration"] {
                background: #1f2937;
                color: white;
                border-color: #111827;
                font-size: 0.65rem;
            }
            .clickable-tag {
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
            }
            .clickable-tag:hover {
                transform: scale(1.05);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                opacity: 0.8;
            }
            .clickable-tag:hover::after {
                content: '×';
                position: absolute;
                top: -2px;
                right: -2px;
                background: #dc2626;
                color: white;
                border-radius: 50%;
                width: 12px;
                height: 12px;
                font-size: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            }
            .version-action-buttons-inline {
                margin-top: 0.75rem;
                padding: 0.5rem;
                background: rgba(248, 250, 252, 0.8);
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                display: flex;
                gap: 0.5rem;
            }
            .version-action-btn {
                flex: 1;
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.25rem;
            }
            .version-action-btn.tag-btn {
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                color: white;
                box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
            }
            .version-action-btn.tag-btn:hover {
                background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
            }
            .version-action-btn.remove-btn {
                background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                color: white;
                box-shadow: 0 2px 4px rgba(220, 38, 38, 0.3);
            }
            .version-action-btn.remove-btn:hover {
                background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(220, 38, 38, 0.4);
            }
            .version-action-btn:active {
                transform: translateY(0);
            }
            .content-header {
                margin-bottom: 1rem;
                padding-bottom: 0.75rem;
                border-bottom: 1px solid #e5e7eb;
            }
            .content-label {
                font-size: 1.1em;
                margin-bottom: 0.5em;
            }
            .content-version-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 0.375rem;
                margin-top: 0.5rem;
            }
            .content-version-tag {
                font-size: 0.75rem;
                padding: 0.25rem 0.5rem;
                border-radius: 0.375rem;
                border: 1px solid #d1d5db;
                background: #f9fafb;
                color: #374151;
                font-weight: 500;
            }
            .content-version-tag.master {
                background: #10b981;
                color: white;
                border-color: #059669;
            }
            .content-version-tag.generated {
                background: #3b82f6;
                color: white;
                border-color: #2563eb;
            }
            .content-version-tag.polished {
                background: #8b5cf6;
                color: white;
                border-color: #7c3aed;
            }
            .content-version-tag.coherenceFix {
                background: #f59e0b;
                color: white;
                border-color: #d97706;
            }
            .content-version-tag.generatedWinner {
                background: #059669;
                color: white;
                border-color: #047857;
            }
            .content-version-tag.draft {
                background: #6b7280;
                color: white;
                border-color: #4b5563;
            }
            .content-version-tag[class*="iteration"] {
                background: #1f2937;
                color: white;
                border-color: #111827;
                font-size: 0.7rem;
            }
            .content-timestamp {
                font-size: 0.85em;
                color: #6b7280;
                margin-left: 1em;
            }
            .version-sections {
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }
            .version-section {
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
            }
            .foldable-content { display: block; }
            .foldable-content.collapsed { display: none; }
            .section-title {
                background: #f9fafb;
                color: #374151;
                font-size: 0.9rem;
                font-weight: 600;
                margin: 0;
                padding: 0.75rem 1rem;
                border-bottom: 1px solid #e5e7eb;
            }
            .section-content {
                padding: 1rem;
                margin: 0;
            }
            .title-content {
                font-size: 1.1rem;
                font-weight: 600;
                color: #111827;
                background: #fff;
                border: none;
                font-family: inherit;
            }
            .context-content {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 1rem;
                font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                font-size: 0.9em;
                line-height: 1.5;
                color: #374151;
                white-space: pre-wrap;
                word-break: break-word;
                margin: 0;
            }
            
            .title-editor {
                width: 100%;
                font-size: 1.1rem;
                font-weight: 600;
                color: #111827;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 0.75rem;
                font-family: inherit;
                transition: border-color 0.2s ease;
            }
            
            .title-editor:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .content-editor, .context-editor {
                width: 100%;
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 1rem;
                font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                font-size: 0.9em;
                line-height: 1.5;
                color: #374151;
                resize: vertical;
                transition: border-color 0.2s ease;
                min-height: 100px;
            }
            
            .content-editor:focus, .context-editor:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .auto-resize {
                overflow-y: hidden;
                resize: none;
            }
            
            /* UniversalTextEditor now styles itself automatically when replacing textarea */
            

            .content-main {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 1em;
                font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                font-size: 1em;
                line-height: 1.5;
                color: #374151;
                white-space: pre-wrap;
                word-break: break-word;
                margin: 0;
            }
            
            /* Descendant Todo Notice */
            .descendant-todo-notice {
                border: 1px solid #fde68a;
                background: #fffbeb;
                border-radius: 6px;
                padding: 0.75rem;
                margin-bottom: 1rem;
            }

            .descendant-todo-notice-header {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-weight: 600;
                font-size: 0.9em;
                color: #92400e;
                margin-bottom: 0.4rem;
            }

            .descendant-todo-notice-body {
                font-size: 0.85em;
                color: #78350f;
                line-height: 1.35;
            }

            .descendant-todo-notice-list {
                margin: 0.5rem 0 0 0;
                padding-left: 1.1rem;
                font-size: 0.85em;
                color: #78350f;
            }

            .descendant-todo-notice-list li {
                margin-bottom: 0.2rem;
            }

            .descendant-todo-count {
                display: inline-block;
                min-width: 1.1rem;
                text-align: center;
                background: #f59e0b;
                color: #fff;
                border-radius: 999px;
                font-size: 0.75em;
                font-weight: 700;
                padding: 0 0.35rem;
                margin-left: 0.25rem;
            }

            /* Todo List Styles */
            .todo-list-section {
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 1rem;
                padding-bottom: 1rem;
            }
            
            .todo-list-header h3 {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-weight: 600;
                margin-bottom: 0.75rem;
            }
            
            .todo-list-container {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            
            .todo-item {
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
                padding: 0.75rem;
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                transition: background-color 0.15s ease;
            }
            
            .todo-item:hover {
                background: #f1f3f4;
            }
            
            .todo-content {
                flex: 1;
                min-width: 0;
            }
            
            .todo-description {
                font-weight: 500;
                color: #374151;
                margin-bottom: 0.25rem;
                word-break: break-word;
            }
            
            .logic-error-details {
                background: #fef3c7;
                border: 1px solid #fbbf24;
                border-radius: 4px;
                padding: 0.5rem;
                margin: 0.5rem 0;
                font-size: 0.9em;
            }
            
            .logic-error-meta {
                display: flex;
                gap: 1rem;
                margin-bottom: 0.5rem;
                font-size: 0.85em;
            }
            
            .logic-error-type {
                background: #dc2626;
                color: white;
                padding: 0.125rem 0.5rem;
                border-radius: 12px;
                font-size: 0.75em;
                font-weight: 600;
                text-transform: uppercase;
            }
            
            .logic-error-severity {
                background: #374151;
                color: white;
                padding: 0.125rem 0.5rem;
                border-radius: 12px;
                font-size: 0.75em;
                font-weight: 600;
            }
            
            .logic-error-justification,
            .logic-error-suggestion {
                margin-bottom: 0.5rem;
                line-height: 1.4;
            }
            
            .justification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                user-select: none;
                padding: 0.25rem 0;
            }
            
            .justification-header:hover {
                background: rgba(0, 0, 0, 0.05);
                border-radius: 4px;
                padding: 0.25rem 0.5rem;
                margin: 0 -0.5rem;
            }
            
            .justification-toggle {
                font-family: monospace;
                font-size: 0.8em;
                color: #666;
                transition: transform 0.2s ease;
            }
            
            .justification-toggle.expanded {
                transform: rotate(90deg);
            }
            
            .justification-content {
                padding-left: 1rem;
                margin-top: 0.25rem;
                transition: all 0.3s ease;
                overflow: hidden;
            }
            
            .justification-content.collapsed {
                max-height: 0;
                margin-top: 0;
                opacity: 0;
                padding-left: 0;
            }
            
            .logic-error-justification:last-child,
            .logic-error-suggestion:last-child {
                margin-bottom: 0;
            }
            
            .logic-error-justification strong,
            .logic-error-suggestion strong {
                color: #374151;
                font-weight: 600;
            }
            
            .todo-related-nodes {
                margin-bottom: 0.25rem;
            }
            
            .todo-related-nodes small {
                color: #6b7280;
                font-style: italic;
            }
            
            .todo-timestamp small {
                color: #9ca3af;
                font-size: 0.8em;
            }
            
            .todo-actions {
                display: flex;
                gap: 0.25rem;
                flex-shrink: 0;
            }
            
            .todo-complete-btn, .todo-remove-btn {
                background: none;
                border: none;
                padding: 0.25rem;
                cursor: pointer;
                border-radius: 4px;
                font-size: 1em;
                transition: background-color 0.15s ease;
            }
            
            .todo-complete-btn:hover {
                background: #d1fae5;
            }
            
            .todo-remove-btn:hover {
                background: #fee2e2;
            }
        `;
        return style;
    }
}

// ============================================================================
// TAG SELECTION MODAL
// ============================================================================

class TagSelectionModal extends BaseModal {
    private existingTags: string[];
    private resolvePromise: ((tag: string | null) => void) | null = null;
    private selectedTag: string = '';

    constructor(existingTags: string[]) {
        super({
            id: 'tag-selection-modal',
            closable: true,
            backdrop: true,
            width: '400px',
            height: 'auto',
            maxWidth: '90vw',
            maxHeight: '500px'
        });
        this.existingTags = existingTags;
    }

    public async showModal(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            void this.open();
        });
    }

    public render(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tag-selection-content';
        
        container.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.2rem; color: #374151;">Select or Create Tag</h3>
            <div style="margin-bottom: 1rem;">
                <input type="text" id="tag-input" placeholder="Enter new tag name..." 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 1rem; outline: none; transition: border-color 0.2s;">
            </div>
            <div style="margin-bottom: 1.5rem;">
                <div style="font-weight: 500; margin-bottom: 0.5rem; color: #374151;">Or select existing tag:</div>
                <div id="existing-tags" style="max-height: 200px; overflow-y: auto; border: 1px solid #d1d5db; border-radius: 6px; padding: 0.5rem; background: #f9fafb;">
                    ${this.existingTags.map(tag => `
                        <div class="tag-option" data-tag="${tag}" style="
                            padding: 0.5rem 0.75rem;
                            cursor: pointer;
                            border-radius: 4px;
                            margin-bottom: 0.25rem;
                            transition: background-color 0.2s;
                            font-size: 0.9rem;
                            color: #374151;
                        ">${tag}</div>
                    `).join('')}
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancel-btn" style="
                    padding: 0.5rem 1rem; 
                    border: 1px solid #d1d5db; 
                    background: white; 
                    border-radius: 6px; 
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #374151;
                    transition: all 0.2s;
                ">Cancel</button>
                <button id="ok-btn" style="
                    padding: 0.5rem 1rem; 
                    border: none; 
                    background: #3b82f6; 
                    color: white; 
                    border-radius: 6px; 
                    cursor: pointer;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                ">OK</button>
            </div>
        `;

        this.setupTagSelectionEvents(container);
        return container;
    }

    private setupTagSelectionEvents(container: HTMLElement): void {
        const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
        const existingTagsContainer = container.querySelector('#existing-tags') as HTMLElement;
        const cancelBtn = container.querySelector('#cancel-btn') as HTMLButtonElement;
        const okBtn = container.querySelector('#ok-btn') as HTMLButtonElement;

        // Handle tag selection
        existingTagsContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('tag-option')) {
                // Clear previous selection
                existingTagsContainer.querySelectorAll('.tag-option').forEach(el => {
                    (el as HTMLElement).style.backgroundColor = '';
                });
                
                // Select this tag
                target.style.backgroundColor = '#e3f2fd';
                this.selectedTag = target.dataset['tag'] ?? '';
                tagInput.value = this.selectedTag;
            }
        });

        // Handle input changes
        tagInput.addEventListener('input', () => {
            this.selectedTag = tagInput.value.trim();
            // Clear existing tag selection
            existingTagsContainer.querySelectorAll('.tag-option').forEach(el => {
                (el as HTMLElement).style.backgroundColor = '';
            });
        });

        // Handle buttons
        cancelBtn.addEventListener('click', () => {
            this.resolveAndClose(null);
        });
        
        okBtn.addEventListener('click', () => {
            const finalTag = this.selectedTag || tagInput.value.trim();
            this.resolveAndClose(finalTag || null);
        });

        // Handle Enter key
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const finalTag = this.selectedTag || tagInput.value.trim();
                this.resolveAndClose(finalTag || null);
            }
            if (e.key === 'Escape') {
                this.resolveAndClose(null);
            }
        });

        // Focus input after a brief delay to ensure modal is fully rendered
        void setTimeout(() => {
            tagInput.focus();
        }, 100);
    }

    private resolveAndClose(result: string | null): void {
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
        void this.close();
    }

    protected override buildContentStyle(): string {
        return `
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            max-width: 400px;
            width: 90%;
            max-height: 500px;
            overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        `;
    }

    public override destroy(): void {
        if (this.resolvePromise) {
            this.resolvePromise(null);
            this.resolvePromise = null;
        }
        void super.destroy();
    }
}
