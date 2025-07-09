import { BaseModal } from './core/BaseModal';
import { ContextAdjusterService } from './services/ContextAdjusterService';
import { ContextAnalysisResult, ContextIssue } from '../../types/ContextAdjusterTypes';
import { DocumentNode } from '../../DocumentNode';
import { DiffTool } from '../../DiffTool';
import { getContextItems, formatContextItems } from '../../ContextFormat';

export class ContextAdjusterModal extends BaseModal {
    private contextAdjusterService: ContextAdjusterService | null = null;
    private analysisResult: ContextAnalysisResult | null = null;
    private targetNode: DocumentNode | null = null;
    private isLoading: boolean = false;
    private removedItems: Set<number> = new Set();

    constructor() {
        super({ id: 'context-adjuster-modal' });
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
            
            // If no issues found, return false (no changes made)
            if (!result.hasIssues) {
                return false;
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

        if (!this.analysisResult.hasIssues) {
            return `
                ${contextMismatchWarning}
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
                        max-width: 600px;
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
                            max-height: 300px;
                            overflow-y: auto;
                        ">${this.formatContextItems(this.analysisResult.originalContext || 'No context available')}</div>
                    </div>
                </div>
            `;
        }

        // Sort issues by severity (highest first)
        const sortedIssues = [...this.analysisResult.issues].sort((a, b) => b.severity - a.severity);

        return `
            ${contextMismatchWarning}
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
                        <button class="button button-danger remove-all-btn" style="
                            padding: 0.5rem 1rem;
                            font-size: 0.9rem;
                            border-radius: 6px;
                            font-weight: 500;
                        ">
                            🗑️ Remove All
                        </button>
                    </div>
                    <p style="
                        color: #6c757d;
                        margin: 0;
                        line-height: 1.5;
                        text-align: center;
                    ">Found ${sortedIssues.length} potential issue(s) in the inherited context. Issues are sorted by severity (highest first).</p>
                </div>
                
                <div class="issues-container">
                    ${sortedIssues.map((issue, index) => this.renderIssueItem(issue, index)).join('')}
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
                    const { getContextItemCount } = await import('../../ContextFormat');
                    const itemCount = getContextItemCount(newContext);
                    contextInfoSpan.textContent = `${itemCount} context items in context. Any paragraph is considered a context item.`;
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
                <button class="button button-secondary" onclick="this.getRootNode().host.close()">
                    Close
                </button>
            </div>
        `;
    }

    private setupEventListeners(): void {
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
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 