import { BaseModal } from './core/BaseModal';
import { ContextAdjusterService } from './services/ContextAdjusterService';
import { ContextAnalysisResult, ContextIssue } from '../../types/ContextAdjusterTypes';
import { DocumentNode } from '../../DocumentNode';
import { DiffTool } from '../../DiffTool';

export class ContextAdjusterModal extends BaseModal {
    private contextAdjusterService: ContextAdjusterService | null = null;
    private analysisResult: ContextAnalysisResult | null = null;
    private targetNode: DocumentNode | null = null;
    private isLoading: boolean = false;
    private fixedIssues: Map<number, { originalContext: string; fixedContext: string }> = new Map();
    private appliedFixes: Set<number> = new Set();
    private currentContext: string = ''; // Track the current context state

    constructor() {
        super({ id: 'context-adjuster-modal' });
    }

    /**
     * Open modal in loading state and start analysis
     */
    async openInLoadingState(targetNode: DocumentNode): Promise<void> {
        this.targetNode = targetNode;
        this.isLoading = true;
        this.analysisResult = null;
        this.fixedIssues.clear();
        this.appliedFixes.clear();
        
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
        this.fixedIssues.clear();
        this.appliedFixes.clear();
        
        await this.open();
        this.setupEventListeners();
    }

    public render(): HTMLElement {
        const modal = document.createElement('div');
        modal.innerHTML = this.renderModalContent();
        return modal;
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
                <p>Examining inherited context from parent nodes to identify potential issues for subnode creation.</p>
                
                <div class="analysis-steps">
                    <div class="step">
                        <span class="step-icon">📋</span>
                        <span class="step-text">Collecting inherited context from parent chain</span>
                    </div>
                    <div class="step">
                        <span class="step-icon">🔍</span>
                        <span class="step-text">Analyzing context for potential issues</span>
                    </div>
                    <div class="step">
                        <span class="step-icon">📊</span>
                        <span class="step-text">Identifying problematic items</span>
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
                <div class="no-issues-message">
                    <h3>✅ Context Analysis Complete</h3>
                    <p>No problematic context items were found. The inherited context appears suitable for creating subnodes.</p>
                    
                    <div class="context-summary">
                        <h4>📋 Current Inherited Context:</h4>
                        <div class="code-block">${this.formatText(this.analysisResult.originalContext || 'No inherited context')}</div>
                    </div>
                </div>
            `;
        }

        return `
            ${contextMismatchWarning}
            <div class="analysis-results">
                <h3>🎯 Context Analysis Results</h3>
                <p>Found ${this.analysisResult.issues.length} potential issue(s) in the inherited context that might confuse subnode creation.</p>
                
                <div class="issues-container">
                    ${this.renderIssues(this.analysisResult.issues)}
                </div>
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

    private renderIssues(issues: ContextIssue[]): string {
        return issues.map((issue, index) => `
            <div class="issue-item" data-issue-index="${index}">
                <div class="issue-header">
                    <div class="severity-indicator ${issue.severity}">
                        ${this.getSeverityIcon(issue.severity)} ${issue.severity.toUpperCase()}
                    </div>
                </div>
                
                <div class="issue-content">
                    <div class="problematic-item">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <strong>Problematic Context Item:</strong>
                            <button class="fix-btn button button-warning" data-issue-index="${index}">
                                🔧 Generate Fix
                            </button>
                        </div>
                        <div class="code-block problematic">${this.formatText(issue.problematic_context_item)}</div>
                    </div>
                    
                    <div class="problem-reason">
                        <strong>Problem:</strong> ${this.escapeHtml(issue.reason_for_problem)}
                    </div>
                    
                    <div class="justification">
                        <strong>Why This Matters:</strong> ${this.escapeHtml(issue.justification)}
                    </div>
                </div>
            </div>
        `).join('');
    }

    private renderBeforeAfterComparison(index: number, fixData: { originalContext: string; fixedContext: string }, isApplied: boolean = false): string {
        const diffResult = DiffTool.compare(fixData.originalContext, fixData.fixedContext);
        const diffSummary = DiffTool.getSummary(diffResult);
        
        // Format the diff results to preserve line breaks and paragraphs
        const formattedOriginal = this.formatDiffHtml(diffResult.originalHtml);
        const formattedModified = this.formatDiffHtml(diffResult.modifiedHtml);
        
        return `
            <div class="before-after-section">
                <h4>📝 Proposed Context Fix</h4>
                
                <div class="diff-container">
                    <p class="diff-stats">Changes: ${diffSummary}</p>
                    <div class="diff-before">
                        <h5>Before:</h5>
                        <div class="code-block">${formattedOriginal}</div>
                    </div>
                    <div class="diff-after">
                        <h5>After:</h5>
                        <div class="code-block">${formattedModified}</div>
                    </div>
                </div>
                
                <div class="fix-actions">
                    ${isApplied ? 
                        '<span class="applied-indicator">✅ Fix has been applied to node context</span>' :
                        `<button class="apply-fix-btn button button-success" data-issue-index="${index}">
                            ✅ Apply Fix
                        </button>
                        <button class="reject-fix-btn button button-danger" data-issue-index="${index}">
                            ❌ Reject Fix
                        </button>`
                    }
                </div>
            </div>
        `;
    }

    private getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'high': return '🔴';
            case 'medium': return '🟡';
            case 'low': return '🟢';
            default: return '🟡';
        }
    }

    private renderFooter(): string {
        return `
            <div style="margin-top: 1.5rem;">
                <button id="copy-context-results" class="button button-primary">
                    📋 Copy Results
                </button>
            </div>
        `;
    }

    private setupEventListeners(): void {
        // Fix It buttons
        const fixButtons = document.querySelectorAll('.fix-btn');
        fixButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.target as HTMLButtonElement;
                const issueIndex = parseInt(button.dataset['issueIndex'] || '0');
                await this.handleFixIssue(issueIndex, button);
            });
        });

        // Copy results button
        const copyBtn = document.getElementById('copy-context-results');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyToClipboard());
        }
    }

    /**
     * Copy results to clipboard
     */
    private async copyToClipboard(): Promise<void> {
        try {
            const text = this.generateClipboardText();
            await navigator.clipboard.writeText(text);
            
            // Show success feedback
            const copyBtn = document.getElementById('copy-context-results');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            alert('Failed to copy to clipboard. Please try again.');
        }
    }

    /**
     * Generate clipboard text
     */
    private generateClipboardText(): string {
        if (!this.analysisResult) return '';

        const lines = [
            '🎯 CONTEXT ADJUSTER ANALYSIS RESULTS',
            '=' .repeat(50),
            '',
            `Node: ${this.targetNode?.title || 'Untitled'}`,
            `Analysis Date: ${this.analysisResult.analysisTimestamp.toLocaleString()}`,
            `Issues Found: ${this.analysisResult.issues.length}`,
            ''
        ];

        if (this.analysisResult.hasIssues) {
            this.analysisResult.issues.forEach((issue, index) => {
                lines.push(`ISSUE #${index + 1} [${issue.severity.toUpperCase()}]`);
                lines.push('-'.repeat(30));
                lines.push(`Problematic Item: "${issue.problematic_context_item}"`);
                lines.push(`Problem: ${issue.reason_for_problem}`);
                lines.push(`Justification: ${issue.justification}`);
                lines.push('');
            });
        } else {
            lines.push('✅ No context issues found.');
        }

        return lines.join('\n');
    }

    /**
     * Update a specific issue item to show the before/after comparison
     */
    private updateIssueItem(issueIndex: number): void {
        if (!this.analysisResult) return;
        
        const issue = this.analysisResult.issues[issueIndex];
        const fixData = this.fixedIssues.get(issueIndex);
        
        if (!issue || !fixData) return;
        
        // Find the issue item in the DOM
        const issueItem = document.querySelector(`[data-issue-index="${issueIndex}"]`);
        if (!issueItem) return;
        
        // Check if before/after section already exists
        const existingBeforeAfter = issueItem.querySelector('.before-after-section');
        if (existingBeforeAfter) {
            existingBeforeAfter.remove();
        }
        
        // Add the before/after comparison
        const isApplied = this.appliedFixes.has(issueIndex);
        const beforeAfterHtml = this.renderBeforeAfterComparison(issueIndex, fixData, isApplied);
        issueItem.insertAdjacentHTML('beforeend', beforeAfterHtml);
        
        // Setup event listeners for the new action buttons
        this.setupFixActionListeners();
        
        // Update the button state only if applied
        if (isApplied) {
            const button = issueItem.querySelector('.fix-btn') as HTMLButtonElement;
            if (button) {
                button.textContent = '✅ Applied!';
                button.classList.remove('button-warning', 'button-secondary');
                button.classList.add('button-success');
                button.disabled = true;
            }
        }
    }

    /**
     * Setup event listeners for apply/reject fix buttons
     */
    private setupFixActionListeners(): void {
        // Apply fix buttons
        const applyButtons = document.querySelectorAll('.apply-fix-btn');
        applyButtons.forEach(btn => {
            // Remove existing listeners to avoid duplicates
            const newBtn = btn.cloneNode(true) as HTMLButtonElement;
            btn.parentNode?.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', async (e) => {
                const button = e.target as HTMLButtonElement;
                const issueIndex = parseInt(button.dataset['issueIndex'] || '0');
                await this.applyFix(issueIndex, button);
            });
        });

        // Reject fix buttons
        const rejectButtons = document.querySelectorAll('.reject-fix-btn');
        rejectButtons.forEach(btn => {
            // Remove existing listeners to avoid duplicates
            const newBtn = btn.cloneNode(true) as HTMLButtonElement;
            btn.parentNode?.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                const button = e.target as HTMLButtonElement;
                const issueIndex = parseInt(button.dataset['issueIndex'] || '0');
                this.rejectFix(issueIndex);
            });
        });
    }

    /**
     * Get the current context that should be used as base for fixes
     */
    private getCurrentContextForFix(): string {
        // If we have applied fixes, use the current node context
        // Otherwise use the original context from analysis
        if (this.appliedFixes.size > 0 && this.targetNode) {
            return this.targetNode.context || '';
        }
        return this.analysisResult?.originalContext || '';
    }

    /**
     * Handle fixing a context issue
     */
    private async handleFixIssue(issueIndex: number, button: HTMLButtonElement): Promise<void> {
        if (!this.analysisResult || !this.targetNode) return;

        const issue = this.analysisResult.issues[issueIndex];
        if (!issue) return;

        // Show loading state
        const originalText = button.textContent;
        button.textContent = '🔄 Generating Fix...';
        button.disabled = true;

        try {
            const { getOpenRouterClient, getSettingsManager } = await import('../../state');
            const contextAdjusterService = new ContextAdjusterService(
                getOpenRouterClient()!,
                getSettingsManager()!
            );
            
            // Use current context state as base for fix
            const currentContextForFix = this.getCurrentContextForFix();
            
            const fixedContext = await contextAdjusterService.fixContextIssue(
                this.targetNode,
                issue,
                currentContextForFix
            );

            // Store the fix data
            this.fixedIssues.set(issueIndex, {
                originalContext: currentContextForFix,
                fixedContext: fixedContext
            });

            // Update the UI to show the before/after comparison
            this.updateIssueItem(issueIndex);

            // Reset button state
            button.textContent = '🔧 Fix Generated!';
            button.classList.remove('button-warning');
            button.classList.add('button-secondary');
            button.disabled = true;

        } catch (error) {
            console.error('Failed to generate fix:', error);
            button.textContent = '❌ Fix Failed';
            button.classList.remove('button-warning');
            button.classList.add('button-danger');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('button-danger');
                button.classList.add('button-warning');
                button.disabled = false;
            }, 3000);
            
            alert('Failed to generate fix. Please try again.');
        }
    }

    /**
     * Apply a proposed fix to the target node
     */
    private async applyFix(issueIndex: number, button: HTMLButtonElement): Promise<void> {
        if (!this.analysisResult || !this.targetNode) return;

        const issue = this.analysisResult.issues[issueIndex];
        const fixData = this.fixedIssues.get(issueIndex);
        
        if (!issue || !fixData) return;

        // Show loading state
        const originalText = button.textContent;
        button.textContent = '🔄 Applying...';
        button.disabled = true;

        try {
            // Apply the fix to the target node context
            this.targetNode.setContextWithTags(fixData.fixedContext, ['edited', 'context_edited']);
            
            // Mark this fix as applied
            this.appliedFixes.add(issueIndex);
            
            // Show success feedback
            button.textContent = '✅ Applied!';
            button.classList.remove('button-success');
            button.classList.add('button-success');
            button.disabled = true;
            
            // Update the issue item to show it's been applied
            this.updateIssueItem(issueIndex);
            
            console.log('✅ Applied context fix to node:', this.targetNode.title);
            
            // Save the project after applying the fix
            try {
                const { getActiveProject } = await import('../../state');
                const activeProject = getActiveProject();
                if (activeProject) {
                    await activeProject.saveToStorage();
                    console.log('✅ Project saved after applying context fix');
                } else {
                    console.warn('⚠️ No active project found to save after applying fix');
                }
            } catch (saveError) {
                console.warn('⚠️ Failed to save project after applying fix:', saveError);
                // Don't fail the fix application if save fails
            }
            
        } catch (error) {
            console.error('Failed to apply fix:', error);
            button.textContent = '❌ Apply Failed';
            button.classList.remove('button-success');
            button.classList.add('button-danger');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('button-danger');
                button.classList.add('button-success');
                button.disabled = false;
            }, 3000);
            
            alert('Failed to apply fix. Please try again.');
        }
    }

    /**
     * Reject a proposed fix and invalidate subsequent fixes
     */
    private rejectFix(issueIndex: number): void {
        // Remove the proposed fix
        this.fixedIssues.delete(issueIndex);
        
        // If this fix was applied, we need to invalidate subsequent fixes
        // because they were based on a context state that included this fix
        if (this.appliedFixes.has(issueIndex)) {
            this.invalidateSubsequentFixes(issueIndex);
        }
        
        // Find and remove the before/after section
        const issueItem = document.querySelector(`[data-issue-index="${issueIndex}"]`);
        if (issueItem) {
            const beforeAfterSection = issueItem.querySelector('.before-after-section');
            if (beforeAfterSection) {
                beforeAfterSection.remove();
            }
            
            // Reset the fix button
            const fixButton = issueItem.querySelector('.fix-btn') as HTMLButtonElement;
            if (fixButton) {
                fixButton.textContent = '🔧 Generate Fix';
                fixButton.classList.remove('button-secondary', 'button-success');
                fixButton.classList.add('button-warning');
                fixButton.disabled = false;
            }
        }
        
        console.log('Rejected proposed fix for issue:', issueIndex);
    }

    /**
     * Invalidate fixes that were generated after a rejected applied fix
     */
    private invalidateSubsequentFixes(rejectedIssueIndex: number): void {
        if (!this.analysisResult) return;

        // Get all issue indices that come after the rejected one
        const subsequentIndices = [];
        for (let i = rejectedIssueIndex + 1; i < this.analysisResult.issues.length; i++) {
            if (this.fixedIssues.has(i) && !this.appliedFixes.has(i)) {
                subsequentIndices.push(i);
            }
        }

        // Remove subsequent fixes and reset their UI
        subsequentIndices.forEach(index => {
            this.fixedIssues.delete(index);
            
            const issueItem = document.querySelector(`[data-issue-index="${index}"]`);
            if (issueItem) {
                const beforeAfterSection = issueItem.querySelector('.before-after-section');
                if (beforeAfterSection) {
                    beforeAfterSection.remove();
                }
                
                const fixButton = issueItem.querySelector('.fix-btn') as HTMLButtonElement;
                if (fixButton) {
                    fixButton.textContent = '🔧 Generate Fix';
                    fixButton.classList.remove('button-secondary', 'button-success');
                    fixButton.classList.add('button-warning');
                    fixButton.disabled = false;
                }
            }
        });

        if (subsequentIndices.length > 0) {
            console.log(`Invalidated ${subsequentIndices.length} subsequent fixes due to rejection of fix ${rejectedIssueIndex}`);
        }
    }

    override async close(): Promise<void> {
        // Reset state
        this.analysisResult = null;
        this.targetNode = null;
        this.isLoading = false;
        this.fixedIssues.clear();
        this.appliedFixes.clear();
        this.currentContext = '';
        
        super.close();
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format text preserving line breaks and paragraphs
     */
    private formatText(text: string): string {
        if (!text) return '';
        
        // First escape HTML to prevent XSS
        const escaped = this.escapeHtml(text);
        
        // Convert line breaks to <br> tags and double line breaks to paragraphs
        return escaped
            .split('\n\n')  // Split on double line breaks (paragraphs)
            .map(paragraph => paragraph.trim())
            .filter(paragraph => paragraph.length > 0)
            .map(paragraph => {
                // Convert single line breaks within paragraphs to <br>
                const withBreaks = paragraph.replace(/\n/g, '<br>');
                return `<p>${withBreaks}</p>`;
            })
            .join('');
    }

    /**
     * Format diff HTML that already contains spans with background colors
     * while preserving line breaks and paragraphs
     */
    private formatDiffHtml(diffHtml: string): string {
        if (!diffHtml) return '';
        
        // The diff HTML already contains escaped text with spans for highlighting
        // We need to convert line breaks to <br> tags while preserving the spans
        return diffHtml
            .replace(/\n\n/g, '</p><p>')  // Convert double line breaks to paragraph breaks
            .replace(/\n/g, '<br>')       // Convert single line breaks to <br>
            .replace(/^/, '<p>')          // Add opening paragraph tag at start
            .replace(/$/, '</p>')         // Add closing paragraph tag at end
            .replace(/<p><\/p>/g, '')     // Remove empty paragraphs
            .replace(/<p>\s*<\/p>/g, ''); // Remove paragraphs with only whitespace
    }
} 