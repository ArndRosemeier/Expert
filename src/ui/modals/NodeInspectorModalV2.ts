import { BaseModal } from './core/BaseModal';
import type { DocumentNode, ContentVersion } from '../../DocumentNode';

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface LayoutConfig {
    type: 'split-panel';
    orientation: 'horizontal';
    sizes: [number, number]; // percentages
    gap: string;
}

interface LayoutConstraints {
    maxHeight: 'viewport' | 'container' | number;
    minHeight: number;
    preferredHeight: 'content' | 'fill';
}

interface Rating {
    score: number;
    goal: number;
    criterion: {
        name?: string;
        displayName?: string;
        shortDisplay?: string;
        title?: string;
    } | string;
}

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

    emit(event: string, data?: any): void {
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
// LAYOUT SYSTEM
// ============================================================================

class LayoutManager {
    private container: HTMLElement;
    private config: LayoutConfig;

    constructor(container: HTMLElement, config: LayoutConfig) {
        this.container = container;
        this.config = config;
        this.setupLayout();
    }

    private setupLayout(): void {
        // Use CSS Grid for predictable, robust layout
        this.container.style.display = 'grid';
        this.container.style.height = '100%';
        this.container.style.gap = this.config.gap;
        
        if (this.config.orientation === 'horizontal') {
            this.container.style.gridTemplateColumns = 
                `${this.config.sizes[0]}% ${this.config.sizes[1]}%`;
            this.container.style.gridTemplateRows = '1fr';
        }
    }

    updateSizes(sizes: [number, number]): void {
        this.config.sizes = sizes;
        this.container.style.gridTemplateColumns = 
            `${sizes[0]}% ${sizes[1]}%`;
    }
}

class ConstraintSolver {
    static apply(constraints: LayoutConstraints, element: HTMLElement): void {
        // Set minimum height
        element.style.minHeight = `${constraints.minHeight}px`;
        
        // Set maximum height based on constraint type
        switch (constraints.maxHeight) {
            case 'viewport':
                element.style.maxHeight = '100vh';
                break;
            case 'container':
                element.style.maxHeight = '100%';
                break;
            default:
                element.style.maxHeight = `${constraints.maxHeight}px`;
        }
        
        // Set preferred height
        if (constraints.preferredHeight === 'fill') {
            element.style.height = '100%';
        }
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
            <div class="versions-list-actions">
                <button class="btn btn-primary" id="promote-btn" disabled>
                    Promote to Master
                </button>
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

        // Promote button
        const promoteBtn = this.element.querySelector('#promote-btn');
        if (promoteBtn) {
            promoteBtn.addEventListener('click', () => {
                if (this.selectedVersionId) {
                    this.eventBus.emit('version:promote', this.selectedVersionId);
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

        // Update promote button
        const promoteBtn = this.element.querySelector('#promote-btn') as HTMLButtonElement;
        if (promoteBtn) {
            const selectedVersion = this.versions.find(v => v.id === this.selectedVersionId);
            const isMaster = selectedVersion?.tags.has('master') || false;
            promoteBtn.disabled = !this.selectedVersionId || isMaster;
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
        // Remove event listeners and clean up
        this.element.innerHTML = '';
    }
}

// ============================================================================
// CONTENT VIEWER COMPONENT
// ============================================================================

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

        const ratings = this.version.metadata?.['ratings'] || [];
        
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
        const ratingsHtml = ratings.map(rating => {
            const score = rating.score || 0;
            const goal = rating.goal || 10;
            
            // Extract criterion name
            let criterionName = 'Unknown';
            if (typeof rating.criterion === 'string') {
                criterionName = rating.criterion;
            } else if (rating.criterion) {
                criterionName = rating.criterion.name || 
                              rating.criterion.displayName ||
                              rating.criterion.shortDisplay || 
                              rating.criterion.title ||
                              'Unknown';
            }
            
            // Create progress bar
            const percentage = Math.round((score / goal) * 100);
            const segments = 40;
            const filledSegments = Math.round((score / goal) * segments);
            const emptySegments = segments - filledSegments;
            
            const filledBar = '█'.repeat(Math.max(0, filledSegments));
            const emptyBar = '░'.repeat(Math.max(0, emptySegments));
            
            // Color based on percentage
            let barColor = '#ef4444'; // red
            if (percentage >= 80) barColor = '#22c55e'; // green
            else if (percentage >= 60) barColor = '#f59e0b'; // yellow
            else if (percentage >= 40) barColor = '#f97316'; // orange
            
            return `
                <div class="rating-item">
                    <span class="rating-name">${this.escapeHtml(criterionName)}</span>
                    <span class="rating-bar">
                        <span style="color: ${barColor};">${filledBar}</span><span style="color: #d1d5db;">${emptyBar}</span>
                    </span>
                    <span class="rating-score">${score}/${goal}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="ratings-section">
                <h4>Ratings</h4>
                <div class="ratings-list">
                    ${ratingsHtml}
                </div>
            </div>
        `;
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
// MODEL (DATA LAYER)
// ============================================================================

class NodeInspectorModel {
    private node: DocumentNode;
    private versions: ContentVersion[] = [];
    private selectedVersionId: string | null = null;

    constructor(node: DocumentNode) {
        this.node = node;
        this.loadVersions();
    }

    private loadVersions(): void {
        this.versions = this.node.getAllVersions();
        
        // Auto-select master version
        const masterVersion = this.versions.find(v => v.tags.has('master'));
        this.selectedVersionId = masterVersion ? masterVersion.id : (this.versions[0]?.id || null);
    }

    getVersions(): ContentVersion[] {
        return this.versions;
    }

    getSelectedVersion(): ContentVersion | null {
        return this.versions.find(v => v.id === this.selectedVersionId) || null;
    }

    selectVersion(versionId: string): void {
        this.selectedVersionId = versionId;
    }

    promoteToMaster(versionId: string): boolean {
        try {
            this.node.promoteToMaster(versionId);
            this.loadVersions(); // Reload to get updated versions
            return true;
        } catch (error) {
            console.error('Failed to promote version to master:', error);
            return false;
        }
    }

    getNodeTitle(): string {
        return this.node.title || 'Untitled Node';
    }
}

// ============================================================================
// VIEW (PRESENTATION LAYER)
// ============================================================================

class NodeInspectorView {
    private container: HTMLElement;
    private layoutManager: LayoutManager | null = null;
    private versionsList: VersionsList;
    private contentViewer: ContentViewer;
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.container = this.createContainer();
        this.versionsList = new VersionsList(eventBus);
        this.contentViewer = new ContentViewer(eventBus);
        this.setupLayout();
    }

    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'node-inspector-v2';
        return container;
    }

    private setupLayout(): void {
        // Create header
        const header = document.createElement('div');
        header.className = 'inspector-header';
        header.innerHTML = `
            <h2 id="inspector-title">Node Inspector</h2>
            <p id="inspector-subtitle">View and manage content versions</p>
        `;

        // Create content area with proper height constraints
        const content = document.createElement('div');
        content.className = 'inspector-content';
        
        // Setup layout manager for 30/70 split
        this.layoutManager = new LayoutManager(content, {
            type: 'split-panel',
            orientation: 'horizontal',
            sizes: [30, 70],
            gap: '1.5rem'
        });

        // Add components to content
        content.appendChild(this.versionsList.render());
        content.appendChild(this.contentViewer.render());

        // Assemble view
        this.container.appendChild(header);
        this.container.appendChild(content);
    }

    updateTitle(title: string, versionCount: number): void {
        const titleEl = this.container.querySelector('#inspector-title');
        const subtitleEl = this.container.querySelector('#inspector-subtitle');
        
        if (titleEl) titleEl.textContent = `Node Inspector: ${title}`;
        if (subtitleEl) subtitleEl.textContent = `View and manage content versions (${versionCount} versions)`;
    }

    updateVersions(versions: ContentVersion[]): void {
        this.versionsList.setVersions(versions);
    }

    updateSelectedVersion(version: ContentVersion | null): void {
        this.contentViewer.setVersion(version);
        this.versionsList.setSelectedVersion(version?.id || null);
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.versionsList.destroy();
        this.contentViewer.destroy();
        this.container.innerHTML = '';
    }
}

// ============================================================================
// CONTROLLER (BUSINESS LOGIC)
// ============================================================================

class NodeInspectorController {
    private model: NodeInspectorModel;
    private view: NodeInspectorView;
    private eventBus: EventBus;

    constructor(node: DocumentNode) {
        this.eventBus = new EventBus();
        this.model = new NodeInspectorModel(node);
        this.view = new NodeInspectorView(this.eventBus);
        this.setupEventHandlers();
        this.initializeView();
    }

    private setupEventHandlers(): void {
        this.eventBus.on('version:selected', (versionId: string) => {
            this.model.selectVersion(versionId);
            this.view.updateSelectedVersion(this.model.getSelectedVersion());
        });

        this.eventBus.on('version:promote', (versionId: string) => {
            const success = this.model.promoteToMaster(versionId);
            if (success) {
                this.refreshView();
                console.log('Version promoted to master successfully');
            } else {
                alert('Failed to promote version to master. Please try again.');
            }
        });
    }

    private initializeView(): void {
        this.refreshView();
    }

    private refreshView(): void {
        const versions = this.model.getVersions();
        const selectedVersion = this.model.getSelectedVersion();
        const title = this.model.getNodeTitle();
        
        this.view.updateTitle(title, versions.length);
        this.view.updateVersions(versions);
        this.view.updateSelectedVersion(selectedVersion);
    }

    getElement(): HTMLElement {
        return this.view.getElement();
    }

    destroy(): void {
        this.view.destroy();
        this.eventBus.destroy();
    }
}

// ============================================================================
// MAIN MODAL CLASS
// ============================================================================

export class NodeInspectorModalV2 extends BaseModal {
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
        this.open();
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
        header.innerHTML = `
            <h2>Node Inspector V2</h2>
            <p>${this.node ? this.node.title : ''}</p>
        `;
        container.appendChild(header);

        // Body (two columns)
        const body = document.createElement('div');
        body.className = 'inspector-body';

        // Left column (versions list)
        const left = document.createElement('div');
        left.className = 'inspector-column versions-list';
        left.appendChild(this.renderVersionsList());

        // Right column (content view)
        const right = document.createElement('div');
        right.className = 'inspector-column content-view';
        right.appendChild(this.renderContentView());

        body.appendChild(left);
        body.appendChild(right);
        container.appendChild(body);

        // Styles
        container.appendChild(this.createStyles());
        return container;
    }

    private renderVersionsList(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'scrollable-content';
        if (!this.node) return wrapper;
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
            item.innerHTML = `
                <div class="version-label">${this.getVersionLabel(version)}</div>
                <div class="version-timestamp">${new Date(version.timestamp).toLocaleString()}</div>
                <div class="version-preview">${this.escapeHtml(version.content.substring(0, 60))}${version.content.length > 60 ? '…' : ''}</div>
            `;
            wrapper.appendChild(item);
        }
        return wrapper;
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
        wrapper.innerHTML = `
            <div class="content-label"><strong>${this.getVersionLabel(version)}</strong> <span class="content-timestamp">${new Date(version.timestamp).toLocaleString()}</span></div>
            <pre class="content-main">${this.escapeHtml(version.content)}</pre>
        `;
        return wrapper;
    }

    private getVersionLabel(version: ContentVersion): string {
        if (version.tags.has('master')) return 'Current (Master)';
        if (version.tags.has('generatedWinner')) return 'Generated Winner';
        if (version.tags.has('polished')) return 'Polished';
        if (version.tags.has('coherenceFix')) return 'Coherence Fix';
        if (version.tags.has('draft')) return 'Draft';
        if (version.tags.has('imported')) return 'Imported';
        const restoredTag = Array.from(version.tags).find(tag => tag.startsWith('Restored_'));
        if (restoredTag) return 'Restored';
        const batchTag = Array.from(version.tags).find(tag => tag.startsWith('Batch_'));
        if (batchTag) return 'Batch Update';
        const manualEditTag = Array.from(version.tags).find(tag => tag.startsWith('ManualEdit_'));
        if (manualEditTag) return 'Manual Edit';
        const iterationTag = Array.from(version.tags).find(tag => tag.startsWith('iteration'));
        if (iterationTag && version.tags.has('generated')) {
            const iterationNum = iterationTag.replace('iteration', '');
            return `Generated v${iterationNum}`;
        }
        if (version.tags.has('legacy')) return 'Legacy';
        return 'Version';
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private rerender() {
        // Re-render modal content
        const modalContent = this.render();
        if (this.element) {
            const modalRoot = this.element.querySelector('.modal-content');
            if (modalRoot) {
                modalRoot.innerHTML = '';
                modalRoot.appendChild(modalContent);
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
                font-size: 0.9em;
                color: #6b7280;
                white-space: pre;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .content-label {
                font-size: 1.1em;
                margin-bottom: 0.5em;
            }
            .content-timestamp {
                font-size: 0.9em;
                color: #6b7280;
                margin-left: 1em;
            }
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
        `;
        return style;
    }
} 