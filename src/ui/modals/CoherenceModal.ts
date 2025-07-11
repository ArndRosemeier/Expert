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

    constructor() {
        super({ 
            id: 'coherence-modal',
            closable: true,
            backdrop: false
        });
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
        const modalContent = document.querySelector(`[data-modal-id="${this.id}"] .modal-content`) ||
                           document.querySelector('.modal-content') ||
                           document.querySelector(`#${this.id} .modal-content`);
        
        console.log('CoherenceModal: Found modal content element:', modalContent);
        
        if (modalContent) {
            // Generate new content
            const newContent = this.renderModalContent();
            console.log('CoherenceModal: Generated new content, updating DOM');
            modalContent.innerHTML = newContent;
            
            // Re-setup event listeners
            this.setupEventListeners();
            console.log('CoherenceModal: Modal updated successfully');
        } else {
            console.error('Could not find modal content container to update results');
            // Fallback: close and reopen modal with results
            console.log('CoherenceModal: Using fallback - closing and reopening modal');
            this.close().then(() => {
                this.openWithData(result, this.parentNode!);
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

        const infoContent = `
            <div class="analysis-info">
                <p><strong>Analyzed Node:</strong> ${this.escapeHtml(nodeTitle)}</p>
                <p><strong>Analysis Time:</strong> ${analysisTimestamp.toLocaleString()}</p>
                <p><strong>Child Nodes:</strong> ${this.analysisResult.childNodeIds.length}</p>
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
        const contradictionItems = contradictions.map((contradiction, index) => {
            const hasProposedFix = this.fixedContradictions.has(index);
            const isApplied = this.appliedFixes.has(index);
            const fixData = this.fixedContradictions.get(index);
            
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
            
            return `
                <div class="contradiction-item" data-contradiction-index="${index}">
                    <div class="contradiction-header">
                        <div class="contradiction-title-section">
                            <h4>Contradiction ${index + 1}</h4>
                            <div class="justification-text">${this.escapeHtml(contradiction.justification)}</div>
                        </div>
                        <div class="contradiction-meta">
                            ${contradiction.parentNodeTitle ? `<span class="parent-title" style="color: #666; font-size: 0.9em; margin-right: 1rem;">From parent: <strong>${this.escapeHtml(contradiction.parentNodeTitle)}</strong></span>` : ''}
                            <span class="child-title">In child: <strong>${this.escapeHtml(contradiction.offending_child_title)}</strong></span>
                            ${contradiction.offending_child_id ? `<button class="button ${buttonState} fix-btn" data-child-id="${contradiction.offending_child_id}" data-contradiction-index="${index}" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>` : ''}
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
                    ${hasProposedFix && fixData ? this.renderBeforeAfterComparison(index, fixData, isApplied) : ''}
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
            
            contradictions.forEach((contradiction, index) => {
                const hasProposedFix = this.fixedContradictions.has(index);
                const isApplied = this.appliedFixes.has(index);
                const fixData = this.fixedContradictions.get(index);
                
                text += `CONTRADICTION ${index + 1}: ${contradiction.justification}\n`;
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
            closeModalBtn.addEventListener('click', async () => this.close());
        }

        // Copy to clipboard handler
        const copyBtn = document.getElementById('copy-coherence-results');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => this.copyToClipboard());
        }

        // Fix buttons handlers
        const fixButtons = document.querySelectorAll('.fix-btn');
        fixButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.target as HTMLButtonElement;
                const childId = button.dataset['childId'];
                const contradictionIndex = parseInt(button.dataset['contradictionIndex'] || '0');
                
                if (childId && this.analysisResult) {
                    await this.handleFixContradiction(childId, contradictionIndex, button);
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
            const button = contradictionItem.querySelector('.fix-btn') as HTMLButtonElement;
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
                const contradictionIndex = parseInt(button.dataset['contradictionIndex'] || '0');
                await this.applyFix(contradictionIndex, button);
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
                const contradictionIndex = parseInt(button.dataset['contradictionIndex'] || '0');
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

        // Find the child node
        const childNode = this.parentNode.children.find(child => child.id === contradiction.offending_child_id);
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
                renderNodeDetails();
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
            const fixButton = contradictionItem.querySelector('.fix-btn') as HTMLButtonElement;
            if (fixButton) {
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

        // Find the child node
        const childNode = this.parentNode.children.find(child => child.id === childId);
        if (!childNode) {
            console.error('Child node not found:', childId);
            alert('Child node not found. Please try again.');
            return;
        }

        // Show loading state
        const originalText = button.textContent;
        button.textContent = '🔄 Fixing...';
        button.disabled = true;

        try {
            // Store original content before fixing
            const originalContent = childNode.content || '';
            
            // Get required services
            const settingsManager = await SettingsManager.getInstance();
            const openRouterClient = OpenRouterClient.getInstance();
            const coherenceService = new CoherenceService(openRouterClient, settingsManager);
            
            // Generate the proposed fix (but don't apply it yet)
            const fixedContent = await coherenceService.fixContradiction(
                this.parentNode,
                childNode,
                contradiction
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
            this.tagSubnodesAsConsistent();
        }
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleEscKey.bind(this));
        
        // Clear data
        this.analysisResult = null;
        this.parentNode = null;
        this.fixedContradictions.clear();
        this.appliedFixes.clear();
        
        await super.close();
    }

    /**
     * Tag all subnodes' master versions with "consistent_to_parent"
     */
    private tagSubnodesAsConsistent(): void {
        if (!this.parentNode) return;
        
        console.log(`🏷️ Tagging subnodes of "${this.parentNode.title}" as consistent to parent`);
        
        let taggedCount = 0;
        
        // Tag all children's master versions
        for (const childNode of this.parentNode.children) {
            const masterVersion = childNode.getMasterVersion();
            if (masterVersion) {
                // Add the consistent_to_parent tag
                masterVersion.tags.add('consistent_to_parent');
                masterVersion.timestamp = new Date(); // Update timestamp
                taggedCount++;
                console.log(`🏷️ Tagged "${childNode.title}" master version as consistent_to_parent`);
            } else {
                console.warn(`⚠️ No master version found for child node "${childNode.title}"`);
            }
        }
        
        console.log(`✅ Tagged ${taggedCount} subnodes as consistent to parent: "${this.parentNode.title}"`);
        
        // Save the project after tagging
        this.saveProjectAfterTagging();
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
     * Escape HTML content
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 