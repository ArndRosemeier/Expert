import { BaseModal } from './core/BaseModal';
import { DocumentNode } from '../../DocumentNode';
import { ContextAdjusterService } from './services/ContextAdjusterService';
import { ContextAnalysisResult, ContextIssue } from '../../types/ContextAdjusterTypes';
import { getContextItems, formatContextItems, getContextInfoText } from '../../ContextFormat';

interface ContextItem {
    text: string;
    index: number; // 1-based index in original context
    category: 'missing-from-child' | 'only-in-child' | 'common' | 'normal';
    hasIssue?: boolean;
    issue?: ContextIssue | undefined;
}

export class ContextAdjusterModal extends BaseModal {
    private analysisResult: ContextAnalysisResult | null = null;
    private targetNode: DocumentNode | null = null;
    private isLoading: boolean = false;
    private removedItems: Set<number> = new Set();
    private compareWithParent: boolean = false;
    private parentNode: DocumentNode | null = null;

    constructor() {
        super({ 
            id: 'context-adjuster-modal',
            closable: true,
            backdrop: true,
            // Make the modal significantly bigger
            maxWidth: '95vw',
            maxHeight: '95vh',
            width: '1200px',
            height: '800px'
        });
    }

    /**
     * Renders the modal content - required by BaseModal
     */
    public render(): HTMLElement {
        const container = document.createElement('div');
        container.innerHTML = this.renderModalContent();
        return container;
    }

    /**
     * Open modal in loading state and start analysis
     */
    async openInLoadingState(targetNode: DocumentNode): Promise<void> {
        this.targetNode = targetNode;
        this.isLoading = true;
        this.analysisResult = null;
        this.removedItems.clear();
        this.compareWithParent = false;
        
        // Find parent node for comparison
        await this.findParentNode();
        
        this.open();
        
        // Start analysis
        try {
            const { getOpenRouterClient, getSettingsManager, getActiveProject } = await import('../../state');
            const contextAdjusterService = new ContextAdjusterService(
                getOpenRouterClient()!,
                getSettingsManager()!
            );
            const projectManager = getActiveProject()!;
            const result = await contextAdjusterService.analyzeContext(targetNode, projectManager);
            this.updateWithResults(result);
        } catch (error) {
            console.error('Context analysis failed:', error);
            this.updateWithError(error instanceof Error ? error.message : 'Analysis failed');
        }
    }

    /**
     * Find the parent node for comparison
     */
    private async findParentNode(): Promise<void> {
        if (!this.targetNode || !this.targetNode.parentId) {
            this.parentNode = null;
            return;
        }

        try {
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject()!;
            const { TreeService } = await import('../../project/TreeService');
            const treeService = new TreeService();
            this.parentNode = treeService.findParentNode(this.targetNode.id, projectManager.rootNode);
        } catch (error) {
            console.warn('Failed to find parent node:', error);
            this.parentNode = null;
        }
    }

    /**
     * Run context adjustment in automatic mode - analyze and remove all problematic items automatically
     * Returns true if any changes were made, false otherwise
     */
    async runAutomaticMode(targetNode: DocumentNode): Promise<boolean> {
        this.targetNode = targetNode;
        this.isLoading = true;
        this.analysisResult = null;
        this.removedItems.clear();
        
        try {
            const { getOpenRouterClient, getSettingsManager, getActiveProject } = await import('../../state');
            const contextAdjusterService = new ContextAdjusterService(
                getOpenRouterClient()!,
                getSettingsManager()!
            );
            const projectManager = getActiveProject()!;
            
            // Analyze context
            const result = await contextAdjusterService.analyzeContext(targetNode, projectManager);
            this.analysisResult = result;
            this.isLoading = false;
            
            // If no issues found, tag the node as context_ai_adjusted to prevent future analysis
            if (!result.hasIssues) {
                // Tag the node as context_ai_adjusted even when no issues are found
                this.targetNode.setContextWithTags(this.targetNode.context || '', ['context_ai_adjusted']);
                
                // Save the project after tagging
                const { getActiveProject } = await import('../../state');
                const projectManager = getActiveProject()!;
                await projectManager.saveToStorage();
                
                console.log(`✅ No context issues found for "${this.targetNode.title}" - tagged as context_ai_adjusted`);
                return false; // No changes made to context content
            }
            
            // Automatically remove all problematic items
            this.removeAllItems();
            
            // Apply changes automatically (skip alert)
            await this.applyChanges(true);
            
            return true; // Changes were made
        } catch (error) {
            console.error('Automatic context adjustment failed:', error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Update modal with analysis results
     */
    updateWithResults(result: ContextAnalysisResult): void {
        this.analysisResult = result;
        this.isLoading = false;
        // Update only the modal body content, not the entire content container
        // This preserves the BaseModal's close button
        const contentDiv = document.getElementById('context-adjuster-content');
        if (contentDiv) {
            contentDiv.innerHTML = this.renderAnalysisContent();
        }
        this.setupEventListeners();
    }

    /**
     * Update modal with error message
     */
    updateWithError(errorMessage: string): void {
        this.isLoading = false;
        this.analysisResult = null;
        
        // Show error in the content area
        const contentDiv = document.getElementById('context-adjuster-content');
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="error-message">
                    <h3>❌ Analysis Failed</h3>
                    <p>${this.escapeHtml(errorMessage)}</p>
                </div>
            `;
        }
    }

    /**
     * Open modal with existing analysis results
     */
    async openWithData(result: ContextAnalysisResult, targetNode: DocumentNode): Promise<void> {
        this.analysisResult = result;
        this.targetNode = targetNode;
        this.isLoading = false;
        this.removedItems.clear();
        this.compareWithParent = false;
        
        // Find parent node for comparison
        await this.findParentNode();
        
        await this.open();
        this.setupEventListeners();
    }

    private renderModalContent(): string {
        return `
            <div class="modal-header">
                <h2>🎯 Context Adjuster</h2>
            </div>
            <div class="modal-body">
                <div id="context-adjuster-content">
                    ${this.isLoading ? this.renderLoadingContent() : this.renderAnalysisContent()}
                </div>
            </div>
            <div class="modal-footer">
                ${this.renderFooter()}
            </div>
        `;
    }

    private renderLoadingContent(): string {
        return `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <h3>🔍 Analyzing Context...</h3>
                <p>Examining inherited context items to identify potential issues for subnode creation.</p>
                
                <div class="analysis-steps">
                    <div class="step">
                        <span class="step-icon">📋</span>
                        <span class="step-text">Breaking context into numbered items</span>
                    </div>
                    <div class="step">
                        <span class="step-icon">🔍</span>
                        <span class="step-text">Analyzing each context item for potential issues</span>
                    </div>
                    <div class="step">
                        <span class="step-icon">📊</span>
                        <span class="step-text">Identifying problematic items with severity ratings</span>
                    </div>
                </div>
            </div>
        `;
    }

    private renderAnalysisContent(): string {
        if (!this.analysisResult) {
            return '<div class="error-message">No analysis results available.</div>';
        }

        // Add context mismatch warning at the top if present
        const contextMismatchWarning = this.renderContextMismatchWarning();
        
        // Render parent comparison checkbox if parent exists
        const parentComparisonSection = this.renderParentComparisonSection();

        if (!this.analysisResult.hasIssues && !this.compareWithParent) {
            return `
                ${contextMismatchWarning}
                ${parentComparisonSection}
                <div class="no-issues-message" style="
                    text-align: center;
                    padding: 2rem;
                    background: #f8f9fa;
                    border: 1px solid #e9ecef;
                    border-radius: 8px;
                    margin: 1rem 0;
                ">
                    <h3 style="
                        color: #28a745;
                        font-size: 1.2rem;
                        margin: 0 0 1rem 0;
                    ">✅ Context Analysis Complete</h3>
                    <p style="
                        color: #6c757d;
                        margin: 0 0 1.5rem 0;
                        line-height: 1.5;
                    ">No problematic context items were found. The inherited context appears suitable for creating subnodes.</p>
                    
                    <div class="context-summary" style="
                        background: #ffffff;
                        border: 1px solid #e9ecef;
                        border-radius: 6px;
                        padding: 1rem;
                        margin: 0 auto;
                        max-width: 100%;
                    ">
                        <h4 style="
                            color: #495057;
                            font-size: 1rem;
                            margin: 0 0 0.75rem 0;
                        ">📋 Current Context Items:</h4>
                        <div class="code-block" style="
                            background: #f8f9fa;
                            border: 1px solid #e9ecef;
                            border-radius: 4px;
                            padding: 0.75rem;
                            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                            font-size: 0.85rem;
                            line-height: 1.4;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            text-align: left;
                            max-height: 400px;
                            overflow-y: auto;
                        ">${this.formatContextItems(this.analysisResult.originalContext || 'No context available')}</div>
                    </div>
                </div>
            `;
        }

        // Get organized context items based on comparison mode
        const contextItems = this.getOrganizedContextItems();

        return `
            ${contextMismatchWarning}
            ${parentComparisonSection}
            <div class="analysis-results" style="
                margin: 1rem 0;
            ">
                <div style="
                    background: #f8f9fa;
                    border: 1px solid #e9ecef;
                    border-radius: 8px;
                    padding: 1.5rem;
                    margin-bottom: 1.5rem;
                ">
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 0.75rem;
                    ">
                        <h3 style="
                            color: #495057;
                            font-size: 1.2rem;
                            margin: 0;
                        ">🎯 Context Analysis Results</h3>
                        ${this.analysisResult.hasIssues ? `
                            <button class="button button-danger remove-all-btn" style="
                                padding: 0.5rem 1rem;
                                font-size: 0.9rem;
                                border-radius: 6px;
                                font-weight: 500;
                            ">
                                🗑️ Remove All Issues
                            </button>
                        ` : ''}
                    </div>
                    <p style="
                        color: #6c757d;
                        margin: 0;
                        line-height: 1.5;
                        text-align: center;
                    ">${this.getResultsSummary()}</p>
                </div>
                
                <div class="items-container" style="
                    max-height: 500px;
                    overflow-y: auto;
                    border: 1px solid #e9ecef;
                    border-radius: 8px;
                    background: white;
                ">
                    ${contextItems.map((item, index) => this.renderContextItem(item, index)).join('')}
                </div>
                
                ${this.removedItems.size > 0 ? this.renderApplyChangesSection() : ''}
            </div>
        `;
    }

    private renderContextMismatchWarning(): string {
        if (!this.analysisResult?.contextMismatch || !this.targetNode) {
            return '';
        }

        return `
            <div class="info-message" style="
                background: #e7f3ff;
                border: 1px solid #b8daff;
                border-radius: 4px;
                padding: 1rem;
                margin-bottom: 1rem;
                color: #0c5460;
            ">
                <h4 style="margin: 0 0 0.5rem 0; color: #0c5460;">
                    ℹ️ Context Status
                </h4>
                <p style="margin: 0;">
                    <strong>This node's context appears to be edited already.</strong> 
                    The context differs from the parent context, indicating it has been manually or automatically modified.
                </p>
            </div>
        `;
    }

    private renderParentComparisonSection(): string {
        if (!this.parentNode) {
            return '';
        }

        return `
            <div class="parent-comparison-section" style="
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 1rem;
            ">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input 
                        type="checkbox" 
                        id="compare-with-parent-checkbox" 
                        ${this.compareWithParent ? 'checked' : ''}
                        style="
                            margin: 0;
                            transform: scale(1.2);
                        "
                    />
                    <label for="compare-with-parent-checkbox" style="
                        font-weight: 500;
                        color: #495057;
                        margin: 0;
                        cursor: pointer;
                    ">
                        📊 Compare with Parent Context
                    </label>
                </div>
                <p style="
                    margin: 0.5rem 0 0 1.8rem;
                    color: #6c757d;
                    font-size: 0.9rem;
                    line-height: 1.4;
                ">
                    Show items missing from child, items only in child, and highlight differences.
                </p>
            </div>
        `;
    }

    private getOrganizedContextItems(): ContextItem[] {
        if (!this.targetNode || !this.analysisResult) {
            return [];
        }

        const childItems = getContextItems(this.targetNode.context || '');
        const items: ContextItem[] = [];

        if (this.compareWithParent && this.parentNode) {
            const parentItems = getContextItems(this.parentNode.context || '');
            
            // Items missing from child (only in parent)
            parentItems.forEach((parentItem, parentIndex) => {
                const isInChild = childItems.some(childItem => 
                    childItem.trim() === parentItem.trim()
                );
                
                if (!isInChild) {
                    items.push({
                        text: parentItem,
                        index: parentIndex + 1, // 1-based
                        category: 'missing-from-child'
                    });
                }
            });

            // Items only in child (not in parent)
            childItems.forEach((childItem, childIndex) => {
                const isInParent = parentItems.some(parentItem => 
                    parentItem.trim() === childItem.trim()
                );
                
                if (!isInParent) {
                    const issue = this.findIssueForItem(childIndex + 1);
                    items.push({
                        text: childItem,
                        index: childIndex + 1,
                        category: 'only-in-child',
                        hasIssue: !!issue,
                        issue: issue
                    });
                }
            });

            // Common items
            childItems.forEach((childItem, childIndex) => {
                const isInParent = parentItems.some(parentItem => 
                    parentItem.trim() === childItem.trim()
                );
                
                if (isInParent) {
                    const issue = this.findIssueForItem(childIndex + 1);
                    items.push({
                        text: childItem,
                        index: childIndex + 1,
                        category: 'common',
                        hasIssue: !!issue,
                        issue: issue
                    });
                }
            });
        } else {
            // Normal mode - just list all items with their issues
            childItems.forEach((item, index) => {
                const issue = this.findIssueForItem(index + 1);
                items.push({
                    text: item,
                    index: index + 1,
                    category: 'normal',
                    hasIssue: !!issue,
                    issue: issue
                });
            });
        }

        return items;
    }

    private findIssueForItem(itemNumber: number): ContextIssue | undefined {
        return this.analysisResult?.issues.find(issue => issue.item_number === itemNumber);
    }

    private getResultsSummary(): string {
        if (!this.analysisResult) {
            return '';
        }

        if (this.compareWithParent && this.parentNode) {
            const items = this.getOrganizedContextItems();
            const missingCount = items.filter(item => item.category === 'missing-from-child').length;
            const onlyInChildCount = items.filter(item => item.category === 'only-in-child').length;
            const commonCount = items.filter(item => item.category === 'common').length;
            const issuesCount = items.filter(item => item.hasIssue).length;

            return `Comparison with parent: ${missingCount} missing from child, ${onlyInChildCount} only in child, ${commonCount} common. ${issuesCount} items have issues.`;
        } else {
            const issuesCount = this.analysisResult.issues.length;
            return issuesCount > 0 
                ? `Found ${issuesCount} potential issue(s) in the inherited context. Issues are sorted by severity (highest first).`
                : 'No problematic context items found.';
        }
    }

    private renderContextItem(item: ContextItem, index: number): string {
        const isRemoved = this.removedItems.has(item.index);
        let categoryStyle = '';
        let categoryLabel = '';

        switch (item.category) {
            case 'missing-from-child':
                categoryStyle = 'background: #fff3cd; border-left: 4px solid #ffc107;';
                categoryLabel = '⬇️ Missing from Child (only in parent)';
                break;
            case 'only-in-child':
                categoryStyle = 'background: #d1ecf1; border-left: 4px solid #17a2b8;';
                categoryLabel = '⬆️ Only in Child (not in parent)';
                break;
            case 'common':
                categoryStyle = 'background: #d4edda; border-left: 4px solid #28a745;';
                categoryLabel = '↔️ Common (in both)';
                break;
            default:
                categoryStyle = '';
                categoryLabel = '';
        }

        const severityColor = item.issue ? this.getSeverityColor(item.issue.severity) : '';
        
        return `
            <div class="context-item${isRemoved ? ' removed' : ''}${item.hasIssue ? ' has-issue' : ''}" 
                 data-item-index="${index}" 
                 data-item-number="${item.index}" 
                 style="
                    ${categoryStyle}
                    border-bottom: 1px solid #e9ecef;
                    padding: 1rem;
                    opacity: ${isRemoved ? '0.6' : '1'};
                    transition: all 0.3s ease;
                ">
                <div class="item-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: ${item.issue ? '0.75rem' : '0'};
                ">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <span class="item-number" style="
                                font-weight: 600;
                                color: #495057;
                                font-size: 0.9rem;
                                min-width: 60px;
                            ">Item #${item.index}</span>
                            
                            ${categoryLabel ? `
                                <span class="category-badge" style="
                                    font-size: 0.8rem;
                                    font-weight: 500;
                                    color: #495057;
                                ">${categoryLabel}</span>
                            ` : ''}
                            
                            ${item.issue ? `
                                <span class="severity-badge" style="
                                    background-color: ${severityColor};
                                    color: white;
                                    padding: 0.25rem 0.5rem;
                                    border-radius: 4px;
                                    font-size: 0.8rem;
                                    font-weight: 500;
                                ">
                                    Severity ${item.issue.severity}/10
                                </span>
                            ` : ''}
                        </div>
                        
                        <div class="item-text" style="
                            background: ${item.category === 'missing-from-child' ? '#fff' : 'rgba(255,255,255,0.7)'};
                            border: 1px solid #e9ecef;
                            border-radius: 4px;
                            padding: 0.75rem;
                            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                            font-size: 0.85rem;
                            line-height: 1.4;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            max-height: 150px;
                            overflow-y: auto;
                        ">${this.escapeHtml(item.text)}</div>
                    </div>
                    
                    ${item.category !== 'missing-from-child' ? `
                        <div class="item-actions" style="margin-left: 1rem;">
                            ${isRemoved ? `
                                <button class="button button-secondary undo-remove-btn" data-item-number="${item.index}" style="
                                    padding: 0.4rem 0.8rem;
                                    font-size: 0.85rem;
                                    border-radius: 4px;
                                ">
                                    ↶ Undo
                                </button>
                            ` : `
                                <button class="button button-danger remove-item-btn" data-item-number="${item.index}" style="
                                    padding: 0.4rem 0.8rem;
                                    font-size: 0.85rem;
                                    border-radius: 4px;
                                ">
                                    🗑️ Remove
                                </button>
                            `}
                        </div>
                    ` : ''}
                </div>
                
                ${item.issue ? `
                    <div class="issue-details" style="
                        margin-top: 0.75rem;
                        padding-top: 0.75rem;
                        border-top: 1px solid rgba(0,0,0,0.1);
                    ">
                        <div class="issue-reason" style="margin-bottom: 0.75rem;">
                            <strong style="color: #495057; font-size: 0.9rem;">Problem:</strong> 
                            <span style="color: #6c757d; line-height: 1.5;">${this.escapeHtml(item.issue.reason_for_problem)}</span>
                        </div>
                        
                        <div class="issue-justification">
                            <strong style="color: #495057; font-size: 0.9rem;">Justification:</strong> 
                            <span style="color: #6c757d; line-height: 1.5;">${this.escapeHtml(item.issue.justification)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    private renderIssueItem(issue: ContextIssue, index: number): string {
        const severityColor = this.getSeverityColor(issue.severity);
        const isRemoved = this.removedItems.has(issue.item_number);

        return `
            <div class="issue-item${isRemoved ? ' removed' : ''}" data-issue-index="${index}" data-item-number="${issue.item_number}" style="
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 1rem;
                background: ${isRemoved ? '#f8f9fa' : '#ffffff'};
                opacity: ${isRemoved ? '0.6' : '1'};
                transition: all 0.3s ease;
            ">
                <div class="issue-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                    padding-bottom: 0.5rem;
                    border-bottom: 1px solid #f0f0f0;
                ">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span class="issue-number" style="
                            font-weight: 600;
                            color: #495057;
                            font-size: 0.9rem;
                        ">Item #${issue.item_number}</span>
                        <span class="severity-badge" style="
                            background-color: ${severityColor};
                            color: white;
                            padding: 0.25rem 0.5rem;
                            border-radius: 4px;
                            font-size: 0.8rem;
                            font-weight: 500;
                        ">
                            Severity ${issue.severity}/10
                        </span>
                    </div>
                    
                    <div class="issue-actions">
                        ${isRemoved ? `
                            <button class="button button-secondary undo-remove-btn" data-item-number="${issue.item_number}" style="
                                padding: 0.4rem 0.8rem;
                                font-size: 0.85rem;
                                border-radius: 4px;
                            ">
                                ↶ Undo
                            </button>
                        ` : `
                            <button class="button button-danger remove-item-btn" data-item-number="${issue.item_number}" style="
                                padding: 0.4rem 0.8rem;
                                font-size: 0.85rem;
                                border-radius: 4px;
                            ">
                                🗑️ Remove
                            </button>
                        `}
                    </div>
                </div>
                
                <div class="issue-content">
                    <div class="problematic-text" style="margin-bottom: 0.75rem;">
                        <strong style="color: #495057; font-size: 0.9rem;">Problematic Text:</strong>
                        <div class="code-block" style="
                            background: #f8f9fa;
                            border: 1px solid #e9ecef;
                            border-radius: 4px;
                            padding: 0.75rem;
                            margin-top: 0.5rem;
                            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                            font-size: 0.85rem;
                            line-height: 1.4;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                        ">${this.escapeHtml(issue.problematic_context_item)}</div>
                    </div>
                    
                    <div class="issue-reason" style="margin-bottom: 0.75rem;">
                        <strong style="color: #495057; font-size: 0.9rem;">Problem:</strong> 
                        <span style="color: #6c757d; line-height: 1.5;">${this.escapeHtml(issue.reason_for_problem)}</span>
                    </div>
                    
                    <div class="issue-justification">
                        <strong style="color: #495057; font-size: 0.9rem;">Justification:</strong> 
                        <span style="color: #6c757d; line-height: 1.5;">${this.escapeHtml(issue.justification)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    private renderApplyChangesSection(): string {
        return `
            <div class="apply-changes-section" style="
                border: 2px solid #e3f2fd;
                border-radius: 8px;
                padding: 1.5rem;
                margin-top: 1.5rem;
                background: #f8f9fa;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                <h4 style="
                    margin: 0 0 0.75rem 0;
                    color: #495057;
                    font-size: 1.1rem;
                    font-weight: 600;
                ">📝 Apply Changes</h4>
                <p style="
                    margin: 0 0 1rem 0;
                    color: #6c757d;
                    line-height: 1.5;
                ">You have marked ${this.removedItems.size} item(s) for removal. Click "Apply Changes" to update the context.</p>
                
                <div class="action-buttons" style="
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                ">
                    <button class="button button-primary apply-changes-btn" style="
                        padding: 0.6rem 1.2rem;
                        font-size: 0.9rem;
                        font-weight: 500;
                        border-radius: 6px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    ">
                        ✅ Apply Changes
                    </button>
                    <button class="button button-secondary reset-changes-btn" style="
                        padding: 0.6rem 1.2rem;
                        font-size: 0.9rem;
                        font-weight: 500;
                        border-radius: 6px;
                    ">
                        ↶ Reset All
                    </button>
                </div>
            </div>
        `;
    }

    private getSeverityColor(severity: number): string {
        if (severity >= 8) return '#dc3545'; // Red for high severity
        if (severity >= 6) return '#fd7e14'; // Orange for medium-high
        if (severity >= 4) return '#ffc107'; // Yellow for medium
        return '#28a745'; // Green for low severity
    }

    private formatContextItems(context: string): string {
        const items = getContextItems(context);
        if (items.length === 0) {
            return 'No context items available';
        }
        
        return items.map((item, index) => 
            `${index + 1}. ${this.escapeHtml(item)}`
        ).join('\n\n');
    }

    /**
     * Remove a context item
     */
    removeItem(itemNumber: number): void {
        this.removedItems.add(itemNumber);
        this.refreshContent();
    }

    /**
     * Remove all context items
     */
    removeAllItems(): void {
        if (!this.analysisResult || !this.analysisResult.hasIssues) return;
        
        // Add all issue item numbers to removedItems
        this.analysisResult.issues.forEach(issue => {
            this.removedItems.add(issue.item_number);
        });
        
        this.refreshContent();
    }

    /**
     * Undo removal of a context item
     */
    undoRemoveItem(itemNumber: number): void {
        this.removedItems.delete(itemNumber);
        this.refreshContent();
    }

    /**
     * Apply all changes to the context
     */
    async applyChanges(skipAlert: boolean = false): Promise<void> {
        if (!this.targetNode || this.removedItems.size === 0) return;

        try {
            // Show loading state
            const applyButton = document.querySelector('.apply-changes-btn') as HTMLButtonElement;
            if (applyButton) {
                applyButton.disabled = true;
                applyButton.textContent = '🔄 Applying...';
            }

            const contextItems = getContextItems(this.targetNode.context || '');
            
            // Remove items (convert to 0-based indexing)
            const filteredItems = contextItems.filter((_, index) => 
                !this.removedItems.has(index + 1)
            );
            
            // Create the new context
            const newContext = formatContextItems(filteredItems);
            
            // Update the node's context using the proper method with AI adjustment tag
            this.targetNode.setContextWithTags(newContext, ['edited', 'context_edited', 'context_ai_adjusted']);
            
            // Propagate context to all descendants (like in project-ui.ts)
            const propagateRecursively = (parentNode: DocumentNode) => {
                for (const child of parentNode.children) {
                    child.setContext(parentNode.context, 'master');
                    propagateRecursively(child);
                }
            };
            propagateRecursively(this.targetNode);
            
            // Update the context textarea in the main UI immediately
            const contextTextArea = document.getElementById('node-context') as HTMLTextAreaElement;
            if (contextTextArea) {
                contextTextArea.value = newContext;
            }
            
            // Update the context items count display in main UI
            const contextLabel = document.querySelector('label[for="node-context"]');
            if (contextLabel) {
                const contextInfoSpan = contextLabel.parentElement?.querySelector('span');
                if (contextInfoSpan) {
                    contextInfoSpan.textContent = getContextInfoText(newContext);
                }
            }
            
            // Trigger project save
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject()!;
            await projectManager.saveToStorage();
            
            // Trigger UI refresh to ensure all changes are reflected
            try {
                const { renderNodeDetails } = await import('../project-ui');
                renderNodeDetails();
            } catch (uiError) {
                console.warn('⚠️ ContextAdjuster: Failed to refresh main UI:', uiError);
            }
            
            // Show success message (unless in automatic mode)
            if (!skipAlert) {
                alert(`Successfully removed ${this.removedItems.size} context item(s).`);
            }
            
            // Reset and close (but don't close in automatic mode)
            this.removedItems.clear();
            if (!skipAlert) {
                this.close();
            }
            
        } catch (error) {
            console.error('Failed to apply changes:', error);
            alert('Failed to apply changes. Please try again.');
            
            // Reset button state
            const applyButton = document.querySelector('.apply-changes-btn') as HTMLButtonElement;
            if (applyButton) {
                applyButton.disabled = false;
                applyButton.textContent = '✅ Apply Changes';
            }
        }
    }

    /**
     * Reset all changes
     */
    resetChanges(): void {
        this.removedItems.clear();
        this.refreshContent();
    }

    /**
     * Refresh the modal content
     */
    private refreshContent(): void {
        const contentDiv = document.getElementById('context-adjuster-content');
        if (contentDiv) {
            contentDiv.innerHTML = this.renderAnalysisContent();
            // Setup event listeners after content is updated
            this.setupEventListeners();
        }
    }

    private renderFooter(): string {
        return `
            <div class="button-group">
                <button id="context-adjuster-close-btn" class="button button-secondary">
                    Close
                </button>
            </div>
        `;
    }

    private setupEventListeners(): void {
        // Parent comparison checkbox
        const compareCheckbox = document.querySelector('#compare-with-parent-checkbox') as HTMLInputElement;
        if (compareCheckbox) {
            compareCheckbox.addEventListener('change', () => {
                this.compareWithParent = compareCheckbox.checked;
                this.refreshContent();
            });
        }

        // Remove item buttons
        const removeButtons = document.querySelectorAll('.remove-item-btn');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const itemNumber = parseInt((e.target as HTMLElement).getAttribute('data-item-number') || '0');
                this.removeItem(itemNumber);
            });
        });

        // Remove all button
        const removeAllButton = document.querySelector('.remove-all-btn');
        if (removeAllButton) {
            removeAllButton.addEventListener('click', () => {
                this.removeAllItems();
            });
        }

        // Undo remove buttons
        const undoButtons = document.querySelectorAll('.undo-remove-btn');
        undoButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const itemNumber = parseInt((e.target as HTMLElement).getAttribute('data-item-number') || '0');
                this.undoRemoveItem(itemNumber);
            });
        });

        // Apply changes button
        const applyButton = document.querySelector('.apply-changes-btn');
        if (applyButton) {
            applyButton.addEventListener('click', async () => {
                await this.applyChanges();
            });
        }

        // Reset changes button
        const resetButton = document.querySelector('.reset-changes-btn');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetChanges();
            });
        }

        // FIXED: Close button event listener
        const closeButton = document.querySelector('#context-adjuster-close-btn');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                void this.close();
            });
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 