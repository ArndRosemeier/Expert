import { BaseModal } from './core/BaseModal';
import { DocumentNode } from '../../DocumentNode';
import { ContentVersion } from '../../DocumentNode';

export class NodeInspectorModal extends BaseModal {
    private node: DocumentNode | null = null;
    private selectedVersionId: string | null = null;
    private versions: ContentVersion[] = [];

    constructor() {
        super({ 
            id: 'node-inspector-modal',
            closable: true,
            backdrop: true,
            width: '80vw',
            height: '80vh',
            maxWidth: 'none',
            maxHeight: 'none'
        });
    }

    /**
     * Override buildContentStyle to remove height constraints
     */
    protected override buildContentStyle(): string {
        return `
            background-color: white;
            padding: 0;
            border-radius: 12px;
            width: 80vw;
            height: 80vh;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
    }

    /**
     * Open modal with a specific node
     */
    public async openWithNode(node: DocumentNode): Promise<void> {
        this.node = node;
        this.versions = this.node.getAllVersions();
        
        // Sort versions: master first, then by timestamp (newest first)
        this.versions.sort((a, b) => {
            const aIsMaster = a.tags.has('master');
            const bIsMaster = b.tags.has('master');
            
            if (aIsMaster && !bIsMaster) return -1;
            if (!aIsMaster && bIsMaster) return 1;
            
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        
        // Auto-select the master version if it exists
        const masterVersion = this.versions.find(v => v.tags.has('master'));
        this.selectedVersionId = masterVersion ? masterVersion.id : (this.versions[0]?.id || null);
        
        await this.open();
        this.setupEventListeners();
    }

    /**
     * Render method required by BaseModal
     */
    public render(): HTMLElement {
        const content = document.createElement('div');
        content.innerHTML = this.renderModalContent();
        return content;
    }

    /**
     * Render modal content
     */
    private renderModalContent(): string {
        if (!this.node) {
            return '<p>No node selected for inspection.</p>';
        }

        const nodeTitle = this.escapeHtml(this.node.title || 'Untitled Node');
        
        return `
            <div class="inspector-container">
                <div class="inspector-header">
                    <h2>Node Inspector: ${nodeTitle}</h2>
                    <p class="inspector-subtitle">View and manage content versions (${this.versions.length} versions)</p>
                </div>
                
                <div class="inspector-body">
                    <div class="columns-container">
                        <div class="left-column">
                            <div class="versions-panel">
                                <div class="versions-list" id="versions-list">
                                    ${this.renderVersionsList()}
                                </div>
                                <div class="version-actions">
                                    <button id="promote-to-master-btn" class="btn btn-primary" disabled>
                                        Promote to Master
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="right-column">
                            <div class="content-view" id="content-view">
                                ${this.renderContentView()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .inspector-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .inspector-header h2 {
                    margin: 0 0 0.5rem 0;
                    font-size: 1.5rem;
                    color: #111827;
                }
                
                .inspector-subtitle {
                    margin: 0;
                    color: #6b7280;
                    font-size: 0.875rem;
                }
                
                .inspector-header {
                    flex-shrink: 0;
                    padding: 1.5rem;
                    border-bottom: 1px solid #e5e7eb;
                    background-color: #f9fafb;
                }
                
                .inspector-body {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-height: 0;
                    padding: 1.5rem;
                    overflow: hidden;
                }
                
                .columns-container {
                    display: flex;
                    flex: 1;
                    min-height: 0;
                    gap: 1.5rem;
                    overflow: hidden;
                    max-height: calc(80vh - 140px);
                }
                
                .left-column {
                    flex: 1 1 30%;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    max-height: 100%;
                }
                
                .right-column {
                    flex: 1 1 70%;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    max-height: 100%;
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    overflow: hidden;
                }
                
                .versions-panel {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    min-height: 0;
                }
                
                .content-view {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    background-color: white;
                    border-radius: 6px;
                    margin: 1rem;
                    border: 1px solid #e5e7eb;
                }
                
                .ratings-section {
                    margin-bottom: 1rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .rating-line {
                    display: flex;
                    align-items: center;
                    margin: 0;
                    padding: 0;
                    line-height: 1.2;
                    font-size: 0.875rem;
                    font-family: monospace;
                }
                
                .rating-name {
                    flex: 0 0 240px;
                    margin-right: 8px;
                    font-weight: 500;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .rating-bar {
                    flex: 1;
                    font-family: monospace;
                    font-size: 0.75rem;
                    margin-right: 8px;
                }
                
                .rating-score {
                    flex: 0 0 40px;
                    text-align: right;
                    font-weight: 500;
                }
                
                .content-section {
                    margin-top: 0;
                }
                
                .versions-list {
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background-color: #fafafa;
                    padding: 1rem;
                    min-height: 0;
                }
                
                .version-item {
                    padding: 1rem;
                    margin-bottom: 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background-color: white;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .version-item:last-child {
                    margin-bottom: 0;
                }
                
                .version-item:hover {
                    border-color: #3b82f6;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                
                .version-item.selected {
                    border-color: #3b82f6;
                    background-color: #eff6ff;
                }
                
                .version-item.master {
                    border-color: #10b981;
                    background-color: #f0fdf4;
                }
                
                .version-item.master.selected {
                    border-color: #10b981;
                    background-color: #dcfce7;
                }
                
                .version-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                }
                
                .version-id {
                    font-family: monospace;
                    font-size: 0.875rem;
                    color: #6b7280;
                    background-color: #f3f4f6;
                    padding: 0.375rem 0.75rem;
                    border-radius: 6px;
                    flex: 1;
                    margin-right: 0.75rem;
                }
                
                .master-badge {
                    background-color: #10b981;
                    color: white;
                    padding: 0.375rem 0.75rem;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    flex-shrink: 0;
                }
                
                .version-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.375rem;
                    margin-bottom: 0.75rem;
                }
                
                .version-tag {
                    background-color: #6b7280;
                    color: white;
                    padding: 0.375rem 0.75rem;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-weight: 500;
                }
                
                .version-tag.master { background-color: #10b981; }
                .version-tag.generated { background-color: #8b5cf6; }
                .version-tag.polished { background-color: #f59e0b; }
                .version-tag.coherenceFix { background-color: #ef4444; }
                .version-tag.imported { background-color: #06b6d4; }
                .version-tag.draft { background-color: #84cc16; }
                
                .version-timestamp {
                    font-size: 0.875rem;
                    color: #6b7280;
                    margin-bottom: 0.75rem;
                }
                
                .version-content-preview {
                    font-size: 0.875rem;
                    color: #374151;
                    line-height: 1.5;
                    background-color: #f9fafb;
                    padding: 0.75rem;
                    border-radius: 6px;
                    border: 1px solid #e5e7eb;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    max-height: 8rem;
                    overflow-y: auto;
                }
                
                .version-actions {
                    flex-shrink: 0;
                    text-align: center;
                }
                
                .no-content {
                    color: #9ca3af;
                    font-style: italic;
                    text-align: center;
                    padding: 2rem;
                }
                
                .btn {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .btn-primary {
                    background-color: #3b82f6;
                    color: white;
                }
                
                .btn-primary:hover:not(:disabled) {
                    background-color: #2563eb;
                }
            </style>
        `;
    }

    /**
     * Render content view
     */
    private renderContentView(): string {
        if (!this.selectedVersionId) {
            return '<div class="no-content">Select a version to view its content</div>';
        }

        const version = this.versions.find(v => v.id === this.selectedVersionId);
        if (!version) {
            return '<div class="no-content">Version not found</div>';
        }

        const content = version.content || '';
        const ratings = version.metadata?.['ratings'] || [];
        
        let html = '';
        
        // Add ratings if they exist
        if (ratings && Array.isArray(ratings) && ratings.length > 0) {
            html += '<div class="ratings-section">';
            html += this.renderRatings(ratings);
            html += '</div>';
        }
        
        // Add content
        if (content.trim()) {
            html += `<div class="content-section"><pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${this.escapeHtml(content)}</pre></div>`;
        } else {
            html += '<div class="no-content">This version has no content</div>';
        }

        return html;
    }

    /**
     * Render ratings with no spacing between bars
     */
    private renderRatings(ratings: any[]): string {
        return ratings.map(rating => {
            const score = rating.score || 0;
            const goal = rating.goal || 10;
            
            // Get criterion name - try all possible properties
            let criterionName = 'Unknown';
            if (rating.criterion) {
                criterionName = rating.criterion.name || 
                              rating.criterion.displayName ||
                              rating.criterion.shortDisplay || 
                              rating.criterion.title ||
                              String(rating.criterion) ||
                              'Unknown';
            } else if (rating.name) {
                criterionName = rating.name;
            } else if (rating.displayName) {
                criterionName = rating.displayName;
            } else if (rating.title) {
                criterionName = rating.title;
            }
            
            // Create visual bar that fills available space
            const totalSegments = 50;
            const filledSegments = Math.round((score / goal) * totalSegments);
            const emptySegments = totalSegments - filledSegments;
            
            const filledBar = '█'.repeat(Math.max(0, filledSegments));
            const emptyBar = '░'.repeat(Math.max(0, emptySegments));
            
            // Color based on percentage
            const percentage = (score / goal) * 100;
            let barColor = '#ef4444'; // red
            if (percentage >= 80) barColor = '#22c55e'; // green
            else if (percentage >= 60) barColor = '#f59e0b'; // yellow
            else if (percentage >= 40) barColor = '#f97316'; // orange
            
            return `<div class="rating-line">
                <span class="rating-name">${this.escapeHtml(criterionName)}</span>
                <span class="rating-bar"><span style="color: ${barColor};">${filledBar}</span><span style="color: #d1d5db;">${emptyBar}</span></span>
                <span class="rating-score">${score}/${goal}</span>
            </div>`;
        }).join('');
    }

    /**
     * Render versions list
     */
    private renderVersionsList(): string {
        if (this.versions.length === 0) {
            return '<div class="no-content">No versions available</div>';
        }

        return this.versions.map(version => {
            const isMaster = version.tags.has('master');
            const isSelected = version.id === this.selectedVersionId;
            const classes = ['version-item'];
            
            if (isMaster) classes.push('master');
            if (isSelected) classes.push('selected');
            
            const tags = Array.from(version.tags)
                .filter(tag => tag !== 'master') // Master gets special treatment
                .map(tag => `<span class="version-tag ${tag}">${tag}</span>`)
                .join('');
            
            const timestamp = new Date(version.timestamp).toLocaleString();
            const contentPreview = this.escapeHtml(version.content.substring(0, 300));
            
            return `
                <div class="${classes.join(' ')}" data-version-id="${version.id}">
                    <div class="version-header">
                        <div class="version-id">${version.id.substring(0, 12)}...</div>
                        ${isMaster ? '<div class="master-badge">MASTER</div>' : ''}
                    </div>
                    
                    ${tags ? `<div class="version-tags">${tags}</div>` : ''}
                    
                    <div class="version-timestamp">Created: ${timestamp}</div>
                    
                    <div class="version-content-preview">${contentPreview}${version.content.length > 300 ? '...' : ''}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Version selection
        const versionsList = document.getElementById('versions-list');
        if (versionsList) {
            versionsList.addEventListener('click', (e) => {
                const versionItem = (e.target as HTMLElement).closest('.version-item');
                if (versionItem) {
                    const versionId = versionItem.getAttribute('data-version-id');
                    if (versionId) {
                        this.selectVersion(versionId);
                    }
                }
            });
        }

        // Promote to master button
        const promoteBtn = document.getElementById('promote-to-master-btn');
        if (promoteBtn) {
            promoteBtn.addEventListener('click', () => {
                this.promoteToMaster();
            });
        }

        // Escape key to close
        document.addEventListener('keydown', this.handleEscKey.bind(this));
    }

    /**
     * Select a version
     */
    private selectVersion(versionId: string): void {
        this.selectedVersionId = versionId;
        this.updateUI();
    }

    /**
     * Promote selected version to master
     */
    private promoteToMaster(): void {
        if (!this.selectedVersionId || !this.node) return;

        const version = this.versions.find(v => v.id === this.selectedVersionId);
        if (!version) return;

        try {
            this.node.promoteToMaster(this.selectedVersionId);
            
            // Refresh versions list
            this.versions = this.node.getAllVersions();
            
            // Sort versions: master first, then by timestamp (newest first)
            this.versions.sort((a, b) => {
                const aIsMaster = a.tags.has('master');
                const bIsMaster = b.tags.has('master');
                
                if (aIsMaster && !bIsMaster) return -1;
                if (!aIsMaster && bIsMaster) return 1;
                
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            });
            
            this.updateUI();
            
            // Show success message
            console.log('Version promoted to master successfully');
        } catch (error) {
            console.error('Failed to promote version to master:', error);
            alert('Failed to promote version to master. Please try again.');
        }
    }

    /**
     * Update UI after state changes
     */
    private updateUI(): void {
        const versionsList = document.getElementById('versions-list');
        const contentView = document.getElementById('content-view');
        const promoteBtn = document.getElementById('promote-to-master-btn') as HTMLButtonElement;

        if (versionsList) {
            versionsList.innerHTML = this.renderVersionsList();
        }

        if (contentView) {
            contentView.innerHTML = this.renderContentView();
        }

        if (promoteBtn) {
            const selectedVersion = this.versions.find(v => v.id === this.selectedVersionId);
            const isMaster = selectedVersion?.tags.has('master') || false;
            promoteBtn.disabled = !this.selectedVersionId || isMaster;
        }
    }

    /**
     * Handle escape key
     */
    private handleEscKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Close modal and cleanup
     */
    override async close(): Promise<void> {
        document.removeEventListener('keydown', this.handleEscKey.bind(this));
        await super.close();
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 