import { BaseModal } from './core/BaseModal';
import type { DocumentNode, ContentVersion } from '../../DocumentNode';
import { analyzeTagsInHierarchy } from '../../ProjectUtils';
import { getActiveProject } from '../../state';

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface Rating {
    score: number;
    goal: number;
    criterion: {
        name?: string;
        displayName?: string;
        shortDisplay?: string;
        title?: string;
    } | string;
    justification?: string;
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
        // Import and use shared RatingsRenderer
        try {
            const { RatingsRenderer } = require('../components/RatingsRenderer');
            
            // Convert ratings to expected format
            const formattedRatings = ratings.map(rating => {
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
                
                return {
                    score: rating.score || 0,
                    goal: rating.goal || 10,
                    criterion: criterionName,
                    justification: rating.justification
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
                const score = rating.score || 0;
                const goal = rating.goal || 10;
                
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
            <h1 class="node-title-fat">${this.node ? this.escapeHtml(this.node.title) : 'Untitled Node'}</h1>
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

        // Styles - append to document head instead of container since BaseModal handles container
        const existingStyles = document.querySelector('#node-inspector-styles');
        if (!existingStyles) {
            const styles = this.createStyles();
            styles.id = 'node-inspector-styles';
            document.head.appendChild(styles);
        }

        // Setup editor event listeners after container is created
        setTimeout(() => this.setupEditorEventListeners(), 0);

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
            
            // Generate tags display
            const tags = Array.from(version.tags)
                .filter(tag => tag !== 'master') // Master gets special treatment with styling
                .map(tag => `<span class="version-tag ${tag} clickable-tag" data-tag="${tag}" data-version-id="${version.id}">${tag}</span>`)
                .join('');
            
            // Generate action buttons for selected version
            const actionButtons = version.id === this.selectedVersionId ? `
                <div class="version-action-buttons-inline">
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
                <div class="version-timestamp">${new Date(version.timestamp).toLocaleString()}</div>
                <div class="version-preview">
                    ${version.title ? `<div class="preview-title"><strong>Title:</strong> ${this.escapeHtml(version.title.substring(0, 40))}${version.title.length > 40 ? '…' : ''}</div>` : ''}
                    <div class="preview-content"><strong>Content:</strong> ${this.escapeHtml(version.content.substring(0, 50))}${version.content.length > 50 ? '…' : ''}</div>
                    ${version.context ? `<div class="preview-context"><strong>Context:</strong> ${this.escapeHtml(version.context.substring(0, 40))}${version.context.length > 40 ? '…' : ''}</div>` : ''}
                </div>
                ${actionButtons}
            `;
            
            // Add event listeners for action buttons if they exist
            if (version.id === this.selectedVersionId) {
                const tagBtn = item.querySelector('.tag-btn') as HTMLButtonElement;
                const removeBtn = item.querySelector('.remove-btn') as HTMLButtonElement;
                
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
            ratingsHtml = this.renderVersionRatings(version.ratings!);
        }
        
        wrapper.innerHTML = `
            <div class="content-header">
                <div class="content-label"><strong>${this.getVersionLabel(version)}</strong> <span class="content-timestamp">${new Date(version.timestamp).toLocaleString()}</span></div>
                ${contentTags ? `<div class="content-version-tags">${contentTags}</div>` : ''}
                    </div>
                    
            ${hasRatings ? ratingsHtml : ''}
            
            <div class="version-sections">
                <div class="version-section">
                    <h4 class="section-title">Title</h4>
                    <div class="section-content">
                        <input type="text" class="title-editor" id="inspector-title-editor" value="${this.escapeHtml(version.title || '')}" placeholder="Enter title...">
                    </div>
                </div>
                
                <div class="version-section">
                    <h4 class="section-title">Content</h4>
                    <div class="section-content">
                        <textarea class="content-editor auto-resize" id="inspector-content-editor" placeholder="Enter content...">${this.escapeHtml(version.content || '')}</textarea>
                    </div>
                </div>
                
                <div class="version-section">
                    <h4 class="section-title">Context</h4>
                    <div class="section-content">
                        <textarea class="context-editor auto-resize" id="inspector-context-editor" placeholder="Enter context...">${this.escapeHtml(version.context || '')}</textarea>
                    </div>
                </div>
                </div>

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
        const projectManager = getActiveProject()!;
        return projectManager.rootNode;
    }

    private async persistNodeChanges(): Promise<void> {
        try {
            // Get the active project manager
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject();
            
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

    private setupEditorEventListeners(): void {
        if (!this.node) return;

        const titleEditor = document.getElementById('inspector-title-editor') as HTMLInputElement;
        const contentEditor = document.getElementById('inspector-content-editor') as HTMLTextAreaElement;
        const contextEditor = document.getElementById('inspector-context-editor') as HTMLTextAreaElement;

        // Auto-resize textareas
        this.setupAutoResize(contentEditor);
        this.setupAutoResize(contextEditor);

        // Title editor
        if (titleEditor) {
            titleEditor.addEventListener('input', () => {
                this.saveTitle(titleEditor.value);
            });
        }

        // Content editor
        if (contentEditor) {
            contentEditor.addEventListener('input', () => {
                this.saveContent(contentEditor.value);
            });
        }

        // Context editor
        if (contextEditor) {
            contextEditor.addEventListener('input', () => {
                this.saveContext(contextEditor.value);
            });
        }
    }

    private setupAutoResize(textarea: HTMLTextAreaElement): void {
        if (!textarea) return;

        const resize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.max(100, textarea.scrollHeight) + 'px';
        };

        // Initial resize
        resize();

        // Resize on input
        textarea.addEventListener('input', resize);

        // Resize on window resize
        window.addEventListener('resize', resize);
    }

    private saveTitle(newTitle: string): void {
        if (!this.node) return;

        try {
            // Update the node title with proper tags
            this.node.setTitleWithTags(newTitle, ['edited', 'title_edited']);
            
            // Debounced save
            clearTimeout((this as any)._titleSaveTimeout);
            (this as any)._titleSaveTimeout = setTimeout(async () => {
                await this.persistNodeChanges();
            }, 1000);
        } catch (error) {
            console.error('Failed to save title:', error);
        }
    }

    private saveContent(newContent: string): void {
        if (!this.node) return;

        try {
            // Update the node content with proper tags
            this.node.setContentWithTags(newContent, ['edited', 'content_edited']);
            
            // Debounced save
            clearTimeout((this as any)._contentSaveTimeout);
            (this as any)._contentSaveTimeout = setTimeout(async () => {
                await this.persistNodeChanges();
            }, 1000);
        } catch (error) {
            console.error('Failed to save content:', error);
        }
    }

    private saveContext(newContext: string): void {
        if (!this.node) return;

        try {
            // Update the node context with proper tags
            this.node.setContextWithTags(newContext, ['edited', 'context_edited']);
            
            // Propagate context to all descendants (like in main UI)
            const propagateRecursively = (parentNode: DocumentNode) => {
                for (const child of parentNode.children) {
                    child.setContext(parentNode.context, 'master');
                    propagateRecursively(child);
                }
            };
            propagateRecursively(this.node);
            
            // Debounced save
            clearTimeout((this as any)._contextSaveTimeout);
            (this as any)._contextSaveTimeout = setTimeout(async () => {
                await this.persistNodeChanges();
            }, 1000);
        } catch (error) {
            console.error('Failed to save context:', error);
        }
    }

    private renderVersionRatings(ratings: Rating[]): string {
        // Use 3-column layout with visual progress bars (0-10 scale)
        const ratingsHtml = ratings.map(rating => {
            const score = rating.score || 0;
            const goal = rating.goal || 10;
            const scorePercentage = Math.min((score / 10) * 100, 100); // Always scale to 10
            const goalPercentage = Math.min((goal / 10) * 100, 100); // Goal indicator position
            
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
        
        return `
            <div style="padding: 0.75rem; background-color: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #374151;">Quality Ratings</h4>
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
                import('../components/RatingsRenderer').then(({ RatingsRenderer }) => {
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
                font-size: 1.875rem;
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
                font-size: 0.9em;
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
            this.open();
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
                this.selectedTag = target.dataset['tag'] || '';
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
        setTimeout(() => {
            tagInput.focus();
        }, 100);
    }

    private resolveAndClose(result: string | null): void {
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
        this.close();
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
        super.destroy();
    }
}
