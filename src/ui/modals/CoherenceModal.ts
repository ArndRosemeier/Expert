import { BaseModal } from './core/BaseModal';
import { CoherenceAnalysisResult, CoherenceContradiction } from '../../types/CoherenceTypes';
import { DocumentNode } from '../../DocumentNode';
import { CoherenceService } from './services/CoherenceService';
import { OpenRouterClient } from '../../OpenRouterClient';
import { SettingsManager } from '../../SettingsManager';
import { DiffTool } from '../../DiffTool';

export class CoherenceModal extends BaseModal {
    private analysisResult: CoherenceAnalysisResult | null = null;
    private parentNode: DocumentNode | null = null;
    private isLoading: boolean = false;
    private fixedContradictions: Map<number, { originalContent: string; fixedContent: string }> = new Map();
    private appliedFixes: Set<number> = new Set();
    private generationProject: DocumentNode | null = null; // The project root to use for node searching

    constructor(generationProject?: DocumentNode) {
        super({ 
            id: 'coherence-modal',
            closable: true,
            backdrop: false
        });
        this.generationProject = generationProject ?? null;
    }

    /**
     * Open modal in loading state
     */
    async openInLoadingState(parentNode: DocumentNode): Promise<void> {
        this.parentNode = parentNode;
        this.isLoading = true;
        this.analysisResult = null;
        
        await super.open();
        this.setupEventListeners();
    }

    /**
     * Update modal with analysis results
     */
    updateWithResults(result: CoherenceAnalysisResult): void {
        console.log('CoherenceModal: Updating with results', result);
        this.analysisResult = result;
        this.isLoading = false;
        
        // Find the modal content container - try multiple selectors
        const modalContent = (document.querySelector(`[data-modal-id="${this.id}"] .modal-content`) ??
                           document.querySelector('.modal-content')) ??
                           document.querySelector(`#${this.id} .modal-content`);
        
        console.log('CoherenceModal: Found modal content element:', modalContent);
        
        if (modalContent) {
            // Generate new content
            const newContent = this.renderModalContent();
            console.log('CoherenceModal: Generated new content, updating DOM');
            modalContent.innerHTML = newContent;
            
            // Let BaseModal recreate the close button properly if this modal is closable
            if (this.config.closable) {
                this.addCloseButton(modalContent as HTMLElement);
            }
            
            // Re-setup event listeners
            this.setupEventListeners();
            console.log('CoherenceModal: Modal updated successfully');
        } else {
            console.error('Could not find modal content container to update results');
            // Fallback: close and reopen modal with results
            console.log('CoherenceModal: Using fallback - closing and reopening modal');
            void this.close().then(() => {
                void this.openWithData(result, this.parentNode!);
            });
        }
    }

    /**
     * Open modal with coherence analysis results (legacy method)
     */
    async openWithData(result: CoherenceAnalysisResult, parentNode: DocumentNode): Promise<void> {
        this.analysisResult = result;
        this.parentNode = parentNode;
        this.isLoading = false;
        
        await super.open();
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
        if (!this.parentNode) {
            return '<p>No node data available.</p>';
        }

        // Show loading state
        if (this.isLoading) {
            return this.renderLoadingContent();
        }

        // Show results
        if (!this.analysisResult) {
            return '<p>No analysis results available.</p>';
        }

        const { contradictions, hasContradictions, analysisTimestamp } = this.analysisResult;
        const nodeTitle = this.parentNode.title || 'Untitled Node';
        
        const headerContent = `
            <div class="modal-header">
                <h2>Coherence Analysis Results</h2>
            </div>
        `;

        const statusContent = hasContradictions 
            ? `<div class="analysis-status error">
                <strong>⚠️ Found ${contradictions.length} contradiction${contradictions.length === 1 ? '' : 's'}</strong>
                <p>The outline and expanded content have some inconsistencies.</p>
               </div>`
            : `<div class="analysis-status success">
                <strong>✅ No contradictions found</strong>
                <p>The outline and expanded content are coherent.</p>
               </div>`;

        const isComprehensiveMode = this.analysisResult.contradictions.some(c => c.parentNodeId);
        
        const infoContent = `
            <div class="analysis-info">
                <p><strong>Analyzed Node:</strong> ${this.escapeHtml(nodeTitle)}</p>
                <p><strong>Analysis Time:</strong> ${analysisTimestamp.toLocaleString()}</p>
                <p><strong>Child Nodes:</strong> ${this.analysisResult.childNodeIds.length}</p>
                ${isComprehensiveMode ? '<p><strong>Note:</strong> This is a comprehensive view showing contradictions from multiple parent nodes.</p>' : ''}
            </div>
        `;

        const contradictionsContent = hasContradictions 
            ? this.renderContradictions(contradictions)
            : '';

        const actionsContent = `
            <div class="modal-actions">
                <button class="button button-secondary" id="copy-coherence-results">
                    📋 Copy to Clipboard
                </button>
                <button class="button button-primary" id="close-coherence-modal-btn">
                    Close
                </button>
            </div>
        `;

        return `
            <style>
                .coherence-modal {
                    max-width: 1200px;
                    max-height: 80vh;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                }
                
                .modal-body {
                    flex: 1;
                    overflow-y: auto;
                }
                
                .analysis-status {
                    padding: 1rem;
                    border-radius: 4px;
                    margin-bottom: 1rem;
                    font-size: 1.1rem;
                }
                
                .analysis-status.success {
                    background-color: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                
                .analysis-status.error {
                    background-color: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                
                .analysis-status.coherence-loading {
                    background-color: #e2e3e5;
                    color: #495057;
                    border: 1px solid #d6d8db;
                }
                
                .analysis-info {
                    background-color: #f8f9fa;
                    border: 1px solid #e9ecef;
                            border-radius: 4px;
                            padding: 1rem;
                            margin-bottom: 1rem;
                        }
                        
                        .analysis-info p {
                            margin: 0.5rem 0;
                        }
                        
                        .analysis-info p:first-child {
                            margin-top: 0;
                        }
                        
                        .analysis-info p:last-child {
                            margin-bottom: 0;
                        }
                        
                        .contradictions-section {
                            margin-top: 1rem;
                        }
                        
                        .contradiction-item {
                            border: 1px solid #dee2e6;
                            border-radius: 8px;
                            margin-bottom: 1rem;
                            background-color: #ffffff;
                            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                        }
                        
                        .contradiction-header {
                            padding: 1rem;
                            background-color: #f8f9fa;
                            border-bottom: 1px solid #dee2e6;
                            border-radius: 8px 8px 0 0;
                        }
                        
                        .contradiction-title-section {
                            margin-bottom: 0.5rem;
                        }
                        
                        .contradiction-title-section h4 {
                            margin: 0 0 0.5rem 0;
                            color: #495057;
                        }
                        
                        .severity-badge {
                            display: inline-flex;
                            align-items: center;
                            gap: 0.5rem;
                            padding: 0.25rem 0.75rem;
                            border-radius: 12px;
                            font-size: 0.875rem;
                            font-weight: 500;
                            margin-bottom: 0.5rem;
                        }
                        
                        .severity-badge.severity-high {
                            background-color: #f8d7da;
                            color: #721c24;
                            border: 1px solid #f5c6cb;
                        }
                        
                        .severity-badge.severity-medium {
                            background-color: #fff3cd;
                            color: #856404;
                            border: 1px solid #ffeaa7;
                        }
                        
                        .severity-badge.severity-low {
                            background-color: #d4edda;
                            color: #155724;
                            border: 1px solid #c3e6cb;
                        }
                        
                        .severity-icon {
                            font-size: 1rem;
                        }
                        
                        .severity-number {
                            font-weight: 600;
                            font-size: 0.8rem;
                        }
                        
                        .justification-text {
                            color: #6c757d;
                            font-style: italic;
                        }
                        
                        .contradiction-meta {
                            display: flex;
                            align-items: center;
                            gap: 1rem;
                            flex-wrap: wrap;
                        }
                        
                        .contradiction-details {
                            padding: 1rem;
                        }
                        
                        .outline-fact, .expansion-fact {
                            margin-bottom: 1rem;
                        }
                        
                        .outline-fact strong, .expansion-fact strong {
                            color: #495057;
                        }
                        
                        .outline-fact p, .expansion-fact p {
                            margin: 0.5rem 0;
                            padding: 0.5rem;
                            background-color: #f8f9fa;
                            border-radius: 4px;
                        }
                        
                        .before-after-section {
                            margin-top: 1rem;
                            border-top: 1px solid #dee2e6;
                            padding-top: 1rem;
                        }
                        
                        .before-after-details {
                            background-color: #f8f9fa;
                            border: 1px solid #dee2e6;
                            border-radius: 4px;
                            padding: 1rem;
                        }
                        
                        .before-after-summary {
                            cursor: pointer;
                            font-weight: 500;
                            color: #495057;
                        }
                        
                        .before-after-content {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 1rem;
                            margin-top: 1rem;
                        }
                        
                        .content-box {
                            background-color: #ffffff;
                            border: 1px solid #dee2e6;
                            border-radius: 4px;
                            padding: 1rem;
                            font-family: monospace;
                            font-size: 0.9rem;
                            line-height: 1.4;
                        }
                        
                        .diff-content {
                            white-space: pre-wrap;
                            word-wrap: break-word;
                        }
                        
                        .diff-content ins {
                            background-color: #d4edda;
                            color: #155724;
                            text-decoration: none;
                        }
                        
                        .diff-content del {
                            background-color: #f8d7da;
                            color: #721c24;
                            text-decoration: line-through;
                        }
                        
                        .fix-actions {
                            margin-top: 1rem;
                            display: flex;
                            gap: 0.5rem;
                        }
                        
                        .loading-spinner {
                            display: inline-block;
                            width: 20px;
                            height: 20px;
                            border: 2px solid #f3f3f3;
                            border-top: 2px solid #007bff;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            margin-right: 0.5rem;
                        }
                        
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        
                        @media (max-width: 768px) {
                            .before-after-content {
                                grid-template-columns: 1fr;
                            }
                            
                            .contradiction-meta {
                                flex-direction: column;
                                align-items: flex-start;
                            }
                            
                            .severity-badge {
                                margin-bottom: 0.75rem;
                            }
                        }
                    </style>
            ${headerContent}
            <div class="modal-body">
                ${statusContent}
                ${infoContent}
                ${contradictionsContent}
            </div>
            ${actionsContent}
        `;
    }

    /**
     * Render loading content
     */
    private renderLoadingContent(): string {
        const nodeTitle = this.parentNode!.title || 'Untitled Node';
        
        const headerContent = `
            <div class="modal-header">
                <h2>Analyzing Coherence</h2>
            </div>
        `;

        const loadingContent = `
            <div class="modal-body">
                <div class="analysis-status coherence-loading">
                    <div class="loading-spinner"></div>
                    <strong>🔍 Analyzing coherence...</strong>
                    <p>Checking for contradictions between outline and expanded content.</p>
                </div>
                
                <div class="analysis-info">
                    <p><strong>Analyzing Node:</strong> ${this.escapeHtml(nodeTitle)}</p>
                    <p><strong>Status:</strong> Analysis in progress</p>
                </div>
                
                <div class="loading-details">
                    <p>The AI is carefully comparing the parent outline with the expanded child content to identify any factual contradictions...</p>
                </div>
            </div>
        `;

        return `${headerContent}${loadingContent}`;
    }

    /**
     * Render contradictions list
     */
    private renderContradictions(contradictions: CoherenceContradiction[]): string {
        // Sort contradictions by severity (highest to lowest)
        const sortedContradictions = [...contradictions].sort((a, b) => b.severity - a.severity);
        
        const contradictionItems = sortedContradictions.map((contradiction, index) => {
            const originalIndex = contradictions.indexOf(contradiction);
            const hasProposedFix = this.fixedContradictions.has(originalIndex);
            const isApplied = this.appliedFixes.has(originalIndex);
            const fixData = this.fixedContradictions.get(originalIndex);
            
            let buttonState = 'button-warning';
            let buttonText = '🔧 Generate Fix';
            let buttonDisabled = false;
            
            if (isApplied) {
                buttonState = 'button-success';
                buttonText = '✅ Applied!';
                buttonDisabled = true;
            } else if (hasProposedFix) {
                buttonState = 'button-secondary';
                buttonText = '📝 Fix Generated';
                buttonDisabled = true;
            }
            
            // Determine severity styling and label
            const severityInfo = this.getSeverityInfo(contradiction.severity);
            
            return `
                <div class="contradiction-item" data-contradiction-index="${originalIndex}">
                    <div class="contradiction-header">
                        <div class="contradiction-title-section">
                            <h4>Contradiction ${index + 1}</h4>
                            <div class="severity-badge ${severityInfo.className}">
                                <span class="severity-icon">${severityInfo.icon}</span>
                                <span class="severity-label">${severityInfo.label}</span>
                                <span class="severity-number">(${contradiction.severity}/10)</span>
                            </div>
                            <div class="justification-text">${this.escapeHtml(contradiction.justification)}</div>
                        </div>
                        <div class="contradiction-meta">
                            ${contradiction.parentNodeTitle ? `<span class="parent-title" style="color: #666; font-size: 0.9em; margin-right: 1rem;">From parent: <strong>${this.escapeHtml(contradiction.parentNodeTitle)}</strong></span>` : ''}
                            <span class="child-title">In child: <strong>${this.escapeHtml(contradiction.offending_child_title)}</strong></span>
                            ${contradiction.offending_child_id ? `<button class="button ${buttonState} fix-btn" data-child-id="${contradiction.offending_child_id}" data-contradiction-index="${originalIndex}" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>` : ''}
                        </div>
                    </div>
                    <div class="contradiction-details">
                        <div class="outline-fact">
                            <strong>In Outline:</strong>
                            <p>${this.escapeHtml(contradiction.fact_in_outline)}</p>
                        </div>
                        <div class="expansion-fact">
                            <strong>In Expanded Content:</strong>
                            <p>${this.escapeHtml(contradiction.fact_in_expansion)}</p>
                        </div>
                    </div>
                    ${hasProposedFix && fixData ? this.renderBeforeAfterComparison(originalIndex, fixData, isApplied) : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="contradictions-section">
                <h3>Found Contradictions</h3>
                <div class="contradictions-list">
                    ${contradictionItems}
                </div>
            </div>
        `;
    }

    /**
     * Render before/after comparison for fixed contradictions
     */
    private renderBeforeAfterComparison(index: number, fixData: { originalContent: string; fixedContent: string }, isApplied: boolean = false): string {
        // Use DiffTool to generate highlighted differences
        const diffResult = DiffTool.compare(fixData.originalContent, fixData.fixedContent);
        const diffSummary = DiffTool.getSummary(diffResult);
        
        return `
            <div class="before-after-section">
                <details class="before-after-details" open>
                    <summary class="before-after-summary">
                        <span class="summary-text">📝 Proposed Fix (Review Before Applying)</span>
                        <span class="summary-icon">▼</span>
                    </summary>
                    <div class="diff-summary">
                        <p class="diff-stats">Changes: ${diffSummary}</p>
                    </div>
                    <div class="before-after-content">
                        <div class="before-section">
                            <h5>Current Content:</h5>
                            <div class="content-box before-content diff-content">
                                ${diffResult.originalHtml}
                            </div>
                        </div>
                        <div class="after-section">
                            <h5>Proposed Fix:</h5>
                            <div class="content-box after-content diff-content">
                                ${diffResult.modifiedHtml}
                            </div>
                        </div>
                    </div>
                    <div class="fix-actions">
                        ${!isApplied ? `
                            <button class="button button-success apply-fix-btn" data-contradiction-index="${index}">
                                ✅ Apply Fix
                            </button>
                            <button class="button button-secondary reject-fix-btn" data-contradiction-index="${index}">
                                ❌ Reject Fix
                            </button>
                        ` : `
                            <div class="fix-applied-status">
                                <span class="applied-badge">✅ Fix Applied Successfully</span>
                            </div>
                        `}
                    </div>
                </details>
            </div>
        `;
    }

    /**
     * Generate readable text for clipboard
     */
    private generateClipboardText(): string {
        if (!this.analysisResult || !this.parentNode) {
            return 'No analysis results available.';
        }

        const { contradictions, hasContradictions, analysisTimestamp } = this.analysisResult;
        const nodeTitle = this.parentNode.title || 'Untitled Node';
        
        let text = `COHERENCE ANALYSIS RESULTS\n`;
        text += `${'='.repeat(30)}\n\n`;
        text += `Node: ${nodeTitle}\n`;
        text += `Analysis Time: ${analysisTimestamp.toLocaleString()}\n`;
        text += `Child Nodes Analyzed: ${this.analysisResult.childNodeIds.length}\n\n`;

        if (hasContradictions) {
            text += `STATUS: ⚠️ Found ${contradictions.length} contradiction${contradictions.length === 1 ? '' : 's'}\n\n`;
            
            // Sort contradictions by severity (highest to lowest)
            const sortedContradictions = [...contradictions].sort((a, b) => (b.severity || 5) - (a.severity || 5));
            
            sortedContradictions.forEach((contradiction, index) => {
                const originalIndex = contradictions.indexOf(contradiction);
                const hasProposedFix = this.fixedContradictions.has(originalIndex);
                const isApplied = this.appliedFixes.has(originalIndex);
                const fixData = this.fixedContradictions.get(originalIndex);
                
                const severityInfo = this.getSeverityInfo(contradiction.severity || 5);
                
                text += `CONTRADICTION ${index + 1}: ${contradiction.justification}\n`;
                text += `Severity: ${severityInfo.label} (${contradiction.severity || 5}/10)\n`;
                text += `Child Node: ${contradiction.offending_child_title}\n`;
                text += `${'-'.repeat(20)}\n`;
                text += `In Outline: ${contradiction.fact_in_outline}\n`;
                text += `In Expanded Content: ${contradiction.fact_in_expansion}\n`;
                
                if (hasProposedFix && fixData) {
                    if (isApplied) {
                        text += `\nSTATUS: ✅ FIX APPLIED\n`;
                    } else {
                        text += `\nSTATUS: 📝 FIX GENERATED (NOT YET APPLIED)\n`;
                    }
                    text += `Original Content: ${fixData.originalContent.substring(0, 200)}${fixData.originalContent.length > 200 ? '...' : ''}\n`;
                    text += `Proposed/Applied Fix: ${fixData.fixedContent.substring(0, 200)}${fixData.fixedContent.length > 200 ? '...' : ''}\n`;
                }
                
                text += `\n`;
            });
        } else {
            text += `STATUS: ✅ No contradictions found\n`;
            text += `The outline and expanded content are coherent.\n\n`;
        }

        return text;
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Close button handler for results modal
        const closeModalBtn = document.getElementById('close-coherence-modal-btn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => { void this.close(); });
        }

        // Copy to clipboard handler
        const copyBtn = document.getElementById('copy-coherence-results');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => { void this.copyToClipboard(); });
        }

        // Fix buttons handlers
        const fixButtons = document.querySelectorAll('.fix-btn');
        fixButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target as HTMLButtonElement;
                const childId = button.dataset['childId'];
                const contradictionIndex = parseInt(button.dataset['contradictionIndex'] ?? '0');
                
                if (childId && this.analysisResult) {
                    void this.handleFixContradiction(childId, contradictionIndex, button);
                }
            });
        });

        // Setup fix action listeners (apply/reject)
        this.setupFixActionListeners();

        // ESC key handler
        document.addEventListener('keydown', this.handleEscKey.bind(this));
    }

    /**
     * Handle ESC key press
     */
    private handleEscKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            void this.close();
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
            const copyBtn = document.getElementById('copy-coherence-results');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                void void setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            alert('Failed to copy to clipboard. Please try again.');
        }
    }

    /**
     * Update a specific contradiction item to show the before/after comparison
     */
    private updateContradictionItem(contradictionIndex: number): void {
        if (!this.analysisResult) return;
        
        const contradiction = this.analysisResult.contradictions[contradictionIndex];
        const fixData = this.fixedContradictions.get(contradictionIndex);
        
        if (!contradiction || !fixData) return;
        
        // Find the contradiction item in the DOM
        const contradictionItem = document.querySelector(`[data-contradiction-index="${contradictionIndex}"]`);
        if (!contradictionItem) return;
        
        // Check if before/after section already exists
        const existingBeforeAfter = contradictionItem.querySelector('.before-after-section');
        if (existingBeforeAfter) {
            existingBeforeAfter.remove();
        }
        
        // Add the before/after comparison
        const isApplied = this.appliedFixes.has(contradictionIndex);
        const beforeAfterHtml = this.renderBeforeAfterComparison(contradictionIndex, fixData, isApplied);
        contradictionItem.insertAdjacentHTML('beforeend', beforeAfterHtml);
        
        // Setup event listeners for the new action buttons
        this.setupFixActionListeners();
        
        // Update the button state only if applied
        if (isApplied) {
            const button = contradictionItem.querySelector('.fix-btn');
            if (button instanceof HTMLButtonElement) {
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
            
            newBtn.addEventListener('click', (e) => {
                const button = e.target as HTMLButtonElement;
                const contradictionIndex = parseInt(button.dataset['contradictionIndex'] ?? '0');
                void this.applyFix(contradictionIndex, button);
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
                const contradictionIndex = parseInt(button.dataset['contradictionIndex'] ?? '0');
                this.rejectFix(contradictionIndex);
            });
        });
    }

    /**
     * Apply a proposed fix to the child node
     */
    private async applyFix(contradictionIndex: number, button: HTMLButtonElement): Promise<void> {
        if (!this.analysisResult || !this.parentNode) return;

        const contradiction = this.analysisResult.contradictions[contradictionIndex];
        const fixData = this.fixedContradictions.get(contradictionIndex);
        
        if (!contradiction || !fixData || !contradiction.offending_child_id) return;

        // Find the child node using the same logic as handleFixContradiction
        let childNode: DocumentNode | undefined;
        
        // Determine which project root to use for searching
        if (this.generationProject) {
            // Use the generation project (passed from generation loop)
            childNode = this.generationProject.findDescendantById(contradiction.offending_child_id) ?? undefined;
        } else {
            // Fallback to active project (for direct action button calls)
            const { getActiveProject } = await import('../../state');
            const activeProject = getActiveProject();
            const projectRoot = activeProject?.rootNode;
            if (projectRoot) {
                childNode = projectRoot.findDescendantById(contradiction.offending_child_id) ?? undefined;
            } else {
                // Final fallback to old logic
                childNode = this.parentNode.children.find(child => child.id === contradiction.offending_child_id);
            }
        }
        
        if (!childNode) {
            alert('Child node not found. Please try again.');
            return;
        }

        // Show loading state
        const originalText = button.textContent;
        button.textContent = '🔄 Applying...';
        button.disabled = true;

        try {
            // Actually apply the fix to the child node content using version management system
            childNode.setContent(fixData.fixedContent, 'master');
            
            // Mark this fix as applied
            this.appliedFixes.add(contradictionIndex);
            
            // Show success feedback
            button.textContent = '✅ Applied!';
            button.classList.remove('button-success');
            button.classList.add('button-success');
            button.disabled = true;
            
            // Update the contradiction item to show it's been applied
            this.updateContradictionItem(contradictionIndex);
            
            console.log('✅ Applied fix to child node:', childNode.title);
            
            // Save the project after applying the fix
            try {
                const { getActiveProject } = await import('../../state');
                const activeProject = getActiveProject();
                if (activeProject) {
                    await activeProject.saveToStorage();
                    console.log('✅ Project saved after applying coherence fix');
                } else {
                    console.warn('⚠️ No active project found to save after applying fix');
                }
            } catch (saveError) {
                console.warn('⚠️ Failed to save project after applying fix:', saveError);
                // Don't fail the fix application if save fails
            }
            
            // Refresh the main UI to show the updated content
            try {
                const { renderNodeDetails } = await import('../project-ui');
                void renderNodeDetails();
                console.log('✅ Main UI refreshed after applying coherence fix');
            } catch (refreshError) {
                console.warn('⚠️ Failed to refresh main UI after applying fix:', refreshError);
                // Don't fail the fix application if UI refresh fails
            }
            
        } catch (error) {
            console.error('Failed to apply fix:', error);
            button.textContent = '❌ Apply Failed';
            button.classList.remove('button-success');
            button.classList.add('button-danger');
            
            void void setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('button-danger');
                button.classList.add('button-success');
                button.disabled = false;
            }, 3000);
            
            alert('Failed to apply fix. Please try again.');
        }
    }

    /**
     * Reject a proposed fix
     */
    private rejectFix(contradictionIndex: number): void {
        // Remove the proposed fix
        this.fixedContradictions.delete(contradictionIndex);
        
        // Find and remove the before/after section
        const contradictionItem = document.querySelector(`[data-contradiction-index="${contradictionIndex}"]`);
        if (contradictionItem) {
            const beforeAfterSection = contradictionItem.querySelector('.before-after-section');
            if (beforeAfterSection) {
                beforeAfterSection.remove();
            }
            
            // Reset the fix button
            const fixButton = contradictionItem.querySelector('.fix-btn');
            if (fixButton instanceof HTMLButtonElement) {
                fixButton.textContent = '🔧 Generate Fix';
                fixButton.classList.remove('button-secondary', 'button-success');
                fixButton.classList.add('button-warning');
                fixButton.disabled = false;
            }
        }
        
        console.log('Rejected proposed fix for contradiction:', contradictionIndex);
    }

    /**
     * Handle fixing a contradiction
     */
    private async handleFixContradiction(childId: string, contradictionIndex: number, button: HTMLButtonElement): Promise<void> {
        if (!this.analysisResult || !this.parentNode) {
            console.error('No analysis result or parent node available');
            return;
        }

        const contradiction = this.analysisResult.contradictions[contradictionIndex];
        if (!contradiction) {
            console.error('Contradiction not found at index:', contradictionIndex);
            return;
        }

        // Find the child node and its parent - use generationProject if available, otherwise activeProject
        let childNode: DocumentNode | undefined;
        let actualParentNode: DocumentNode | undefined;
        
        // Determine which project root to use for searching
        let projectRoot: DocumentNode | null = null;
        
        if (this.generationProject) {
            // Use the generation project (passed from generation loop)
            projectRoot = this.generationProject;
        } else {
            // Fallback to active project (for direct action button calls)
            const { getActiveProject } = await import('../../state');
            const activeProject = getActiveProject();
            projectRoot = activeProject?.rootNode ?? null;
        }
        
        if (projectRoot) {
            // Use the centralized findDescendantById method
            childNode = projectRoot.findDescendantById(childId) ?? undefined;
            
            // Find the actual parent node for this contradiction
            if (contradiction.parentNodeId) {
                // Multi-parent comprehensive mode: find the specific parent for this contradiction
                actualParentNode = projectRoot.findDescendantById(contradiction.parentNodeId) ?? undefined;
            } else {
                // Single-parent mode: use the modal's parent node (but validate it exists in project)
                actualParentNode = projectRoot.findDescendantById(this.parentNode.id) ?? this.parentNode;
            }
        } else {
            // Fallback to old logic if no project root available
            actualParentNode = this.parentNode;
            childNode = this.parentNode.children.find(child => child.id === childId);
        }
        
        if (!childNode || !actualParentNode) {
            console.error('Child node or parent node not found:', { childId, parentId: contradiction.parentNodeId });
            alert('Child node not found. This may be due to using the comprehensive coherence modal with multiple parents. Please try individual coherence checks instead.');
            return;
        }

        // Show loading state
        const originalText = button.textContent;
        button.textContent = '🔄 Fixing...';
        button.disabled = true;
        
        // Log the problem that's about to be fixed
        console.log(`🔧 MANUAL FIX REQUESTED for "${childNode.title}"`);
        console.log(`   📋 Problem: ${contradiction.justification}`);
        console.log(`   ⚖️ Severity: ${contradiction.severity}/10`);
        console.log(`   📄 Parent says: "${contradiction.fact_in_outline}"`);
        console.log(`   📝 Child says: "${contradiction.fact_in_expansion}"`);

        try {
            // Store original content before fixing
            const originalContent = childNode.content || '';
            
            // Get required services
            const settingsManager = await SettingsManager.getInstance();
            const openRouterClient = OpenRouterClient.getInstance();
            const coherenceService = new CoherenceService(openRouterClient, settingsManager);
            
            // Prepare frozen settings for consistency
            const { CoherenceUtils } = await import('../utils/CoherenceUtils');
            const frozenSettings = CoherenceUtils.prepareFrozenSettings(settingsManager);
            
            // Generate the proposed fix (but don't apply it yet) with progress feedback
            const fixedContent = await coherenceService.fixContradiction(
                actualParentNode,
                childNode,
                contradiction,
                frozenSettings,
                (message) => {
                    // Update button text with progress
                    button.textContent = `🔄 ${message.substring(0, 20)}...`;
                }
            );

            // Store the proposed fix for review
            this.fixedContradictions.set(contradictionIndex, {
                originalContent,
                fixedContent
            });
            
            // Show success feedback for generation
            button.textContent = '📝 Fix Generated';
            button.classList.remove('button-warning');
            button.classList.add('button-secondary');
            button.disabled = true;
            
            // Update the contradiction item to show the before/after comparison
            this.updateContradictionItem(contradictionIndex);
            
            console.log('Generated proposed fix for child:', childNode.title);
            
        } catch (error) {
            console.error('Failed to generate fix:', error);
            button.textContent = '❌ Generation Failed';
            button.classList.remove('button-warning');
            button.classList.add('button-danger');
            
            void void setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('button-danger');
                button.classList.add('button-warning');
                button.disabled = false;
            }, 3000);
            
            alert('Failed to generate fix. Please try again.');
        }
    }

    /**
     * Close modal and cleanup
     */
    override async close(): Promise<void> {
        // Tag all subnodes as consistent to parent before closing
        if (this.parentNode) {
            await this.tagSubnodesAsConsistent();
        }
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleEscKey.bind(this));
        
        // Refresh the main UI to show the updated coherence status icons
        try {
            const { renderMultiProjectTree, renderNodeDetails } = await import('../project-ui');
            renderMultiProjectTree(); // Updates tree titles and coherence icons
            void renderNodeDetails(); // Updates details panel content
            console.log('✅ Main UI refreshed after coherence check');
        } catch (refreshError) {
            console.warn('⚠️ Failed to refresh main UI after coherence check:', refreshError);
            // Don't fail the modal close if UI refresh fails
        }
        
        // Clear data
        this.analysisResult = null;
        this.parentNode = null;
        this.fixedContradictions.clear();
        this.appliedFixes.clear();
        
        await super.close();
    }

    /**
     * Tag all subnodes' master versions with "consistent_to_parent"
     * In comprehensive mode, tags all children from all analyzed parent nodes
     */
    private async tagSubnodesAsConsistent(): Promise<void> {
        if (!this.parentNode || !this.analysisResult) return;
        
        const isComprehensiveMode = this.analysisResult.analyzedNodes && this.analysisResult.analyzedNodes.length > 1;
        
        if (isComprehensiveMode && this.analysisResult.analyzedNodes) {
            console.log(`🏷️ Tagging subnodes from comprehensive analysis (${this.analysisResult.analyzedNodes.length} parent nodes)`);
            
            let taggedCount = 0;
            
            // Tag children from all analyzed parent nodes
            for (const parentNode of this.analysisResult.analyzedNodes) {
                for (const childNode of parentNode.children) {
                    const masterVersion = childNode.getMasterVersion();
                    if (masterVersion) {
                        masterVersion.tags.add('consistent_to_parent');
                        masterVersion.timestamp = new Date();
                        taggedCount++;
                        console.log(`🏷️ Tagged "${childNode.title}" (parent: "${parentNode.title}") as consistent_to_parent`);
                    }
                }
            }
            
            console.log(`✅ Tagged ${taggedCount} subnodes from comprehensive analysis`);
        } else {
            console.log(`🏷️ Tagging subnodes of "${this.parentNode.title}" as consistent to parent`);
            
            let taggedCount = 0;
            
            // Tag all children's master versions
            for (const childNode of this.parentNode.children) {
                const masterVersion = childNode.getMasterVersion();
                if (masterVersion) {
                    masterVersion.tags.add('consistent_to_parent');
                    masterVersion.timestamp = new Date();
                    taggedCount++;
                } else {
                    console.warn(`⚠️ No master version found for child node "${childNode.title}"`);
                }
            }
            
            console.log(`✅ Tagged ${taggedCount} subnodes as consistent to parent: "${this.parentNode.title}"`);
        }
        
        // Save the project after tagging
        await this.saveProjectAfterTagging();
    }

    /**
     * Save project after tagging subnodes
     */
    private async saveProjectAfterTagging(): Promise<void> {
        try {
            const { getActiveProject } = await import('../../state');
            const activeProject = getActiveProject();
            if (activeProject) {
                await activeProject.saveToStorage();
                console.log('✅ Project saved after tagging subnodes as consistent');
            } else {
                console.warn('⚠️ No active project found to save after tagging');
            }
        } catch (error) {
            console.warn('⚠️ Failed to save project after tagging subnodes:', error);
            // Don't fail the close operation if save fails
        }
    }

    /**
     * Get severity info for a given severity level
     */
    private getSeverityInfo(severity: number): { className: string; icon: string; label: string } {
        if (severity >= 8) {
            return { className: 'severity-high', icon: '⚠️', label: 'High Severity' };
        } else if (severity >= 5) {
            return { className: 'severity-medium', icon: '⚡', label: 'Medium Severity' };
        } else {
            return { className: 'severity-low', icon: '✅', label: 'Low Severity' };
        }
    }

    /**
     * Escape HTML characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 