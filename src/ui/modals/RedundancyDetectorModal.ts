import { BaseModal } from './core/BaseModal';
import { RedundancyAnalysisResult, RedundancyDetection } from '../../types/RedundancyTypes';
import { DocumentNode } from '../../DocumentNode';
import { RedundancyDetectionService } from './services/RedundancyDetectionService';
import { OpenRouterClient } from '../../OpenRouterClient';
import { SettingsManager } from '../../SettingsManager';
import { ProjectManager } from '../../ProjectManager';

export interface RedundancyDetectorModalConfig {
    id: string;
    parentNode: DocumentNode;
    projectManager: ProjectManager;
}

export class RedundancyDetectorModal extends BaseModal {
    private analysisResult: RedundancyAnalysisResult | null = null;
    private parentNode: DocumentNode;
    private projectManager: ProjectManager;
    private isLoading: boolean = false;
    private redundancyService!: RedundancyDetectionService;
    private deletedNodes: Set<string> = new Set();
    
    // Configuration state
    private currentThreshold: number = 70;
    private showAllResults: boolean = false;
    private modalState: 'configuration' | 'results' = 'configuration';

    constructor(config: RedundancyDetectorModalConfig) {
        super({ 
            id: config.id,
            closable: true,
            backdrop: true,
            maxWidth: '1200px',
            width: '95vw'
        });
        
        this.parentNode = config.parentNode;
        this.projectManager = config.projectManager;
    }

    /**
     * Required render method from BaseModal
     */
    public render(): HTMLElement {
        const content = document.createElement('div');
        content.innerHTML = this.renderModalContent();
        return content;
    }

    /**
     * Open modal and start analysis
     */
    override async open(): Promise<void> {
        // Initialize service here where we can await SettingsManager
        const openRouterClient = OpenRouterClient.getInstance();
        const settingsManager = await SettingsManager.getInstance();
        this.redundancyService = new RedundancyDetectionService(openRouterClient, settingsManager);
        
        // Start with configuration screen
        this.modalState = 'configuration';
        this.isLoading = false;
        this.analysisResult = null;
        
        await super.open();
        this.setupEventListeners();
    }

    /**
     * Perform redundancy analysis
     */
    private async performAnalysis(): Promise<void> {
        try {
            console.log(`🔍 Starting redundancy analysis for: ${this.parentNode.title}`);
            
            this.analysisResult = await this.redundancyService.analyzeSiblings(this.parentNode);
            this.isLoading = false;
            
            console.log(`✅ Analysis complete: ${this.analysisResult.redundancies.length} redundancies found`);
            
            // Update modal content
            this.updateModalContent();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Redundancy analysis failed:', error);
            this.isLoading = false;
            this.analysisResult = {
                parentNode: this.parentNode,
                redundancies: [],
                timestamp: new Date(),
                hasRedundantNodes: false,
                childrenAnalyzed: 0,
                thresholdUsed: this.currentThreshold,
                analysisError: error instanceof Error ? error.message : 'Analysis failed'
            };
            
            this.updateModalContent();
            this.setupEventListeners();
        }
    }

    /**
     * Update modal content
     */
    private updateModalContent(): void {
        const modalContent = document.querySelector(`[data-modal-id="${this.id}"] .modal-content`);
        
        if (modalContent) {
            modalContent.innerHTML = this.renderModalContent();
        }
    }

    /**
     * Generate modal content HTML
     */
    protected renderModalContent(): string {
        if (this.modalState === 'configuration') {
            return this.renderConfigurationScreen();
        } else {
            return this.renderResultsScreen();
        }
    }

    /**
     * Render the configuration screen
     */
    private renderConfigurationScreen(): string {
        const childCount = this.parentNode.children?.length || 0;
        
        return `
            <div class="modal-header">
                <h2>🔍 Redundancy Detection Configuration</h2>
            </div>
                
                <div class="modal-body" style="padding: 20px;">
                    <div class="node-info" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0;">📋 Analysis Target</h3>
                        <p style="margin: 0; color: #666;">
                            <strong>Parent Node:</strong> "${this.parentNode.title}"<br>
                            <strong>Children to Analyze:</strong> ${childCount} nodes
                        </p>
                    </div>
                    
                    <div class="config-section" style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0;">⚙️ Detection Settings</h3>
                        
                        <div class="threshold-setting" style="margin-bottom: 15px;">
                            <label for="threshold-slider" style="display: block; margin-bottom: 8px; font-weight: 500;">
                                Deletion Threshold: <span id="threshold-value">${this.currentThreshold}%</span>
                            </label>
                            <input 
                                type="range" 
                                id="threshold-slider" 
                                min="0" 
                                max="100" 
                                value="${this.currentThreshold}" 
                                style="width: 100%; margin-bottom: 8px;"
                            >
                            <p style="margin: 0; font-size: 0.9em; color: #666;">
                                Only nodes with <strong>${this.currentThreshold}%+</strong> redundancy will be marked for deletion.
                                Lower values show more similarities but may be less actionable.
                            </p>
                        </div>
                        
                        <div class="show-all-setting">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input 
                                    type="checkbox" 
                                    id="show-all-checkbox" 
                                    ${this.showAllResults ? 'checked' : ''}
                                >
                                <span>Show all similarity results (including below threshold)</span>
                            </label>
                            <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #666;">
                                See how the AI perceives similarities, even if they're not actionable.
                            </p>
                        </div>
                    </div>
                    
                    <div class="analysis-info" style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0;">🤖 How It Works</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #666;">
                            <li>AI analyzes all ${childCount} children for redundant plot content</li>
                            <li>Identifies successive nodes where one could be safely deleted</li>
                            <li>Focuses on plot redundancy, not just text similarity</li>
                            <li>Recommends specific deletions with reasoning</li>
                        </ul>
                    </div>
                    
                    <div class="action-buttons" style="text-align: center;">
                        <button 
                            id="start-analysis-btn" 
                            class="btn btn-primary" 
                            style="background: #1976d2; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin-right: 10px;"
                        >
                            🔍 Analyze for Redundancies
                        </button>
                        <button 
                            id="cancel-config-btn"
                            class="btn btn-secondary" 
                            style="background: #757575; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
        `;
    }

    /**
     * Render the results screen (existing logic)
     */
    private renderResultsScreen(): string {
        let content: string;
        
        if (this.isLoading) {
            content = this.renderLoadingContent();
        } else if (!this.analysisResult) {
            content = this.renderErrorContent('No analysis results available');
        } else if (this.analysisResult.analysisError) {
            content = this.renderErrorContent(this.analysisResult.analysisError);
        } else {
            content = this.renderAnalysisResults();
        }
        
        // Return content directly - BaseModal already provides modal-content wrapper
        return content;
    }

    /**
     * Render loading state
     */
    private renderLoadingContent(): string {
        return `
            <div class="modal-header">
                <h2>🔍 Analyzing Children for Redundancy</h2>
            </div>
            <div class="modal-body">
                <div class="loading-container" style="text-align: center; padding: 40px;">
                    <div class="spinner" style="margin: 20px auto;"></div>
                    <p>Analyzing <strong>${this.parentNode.title}</strong> children for redundant content...</p>
                    <p style="color: #666; font-size: 0.9em;">This may take a moment as AI reviews plot similarities.</p>
                </div>
            </div>
        `;
    }

    /**
     * Render error state
     */
    private renderErrorContent(error: string): string {
        return `
            <div class="modal-header">
                <h2>❌ Redundancy Analysis Failed</h2>
            </div>
            <div class="modal-body">
                <div class="error-container" style="text-align: center; padding: 40px;">
                    <p style="color: #d32f2f; margin-bottom: 20px;">
                        <strong>Analysis Error:</strong> ${error}
                    </p>
                    <button id="retry-analysis-btn" class="btn btn-primary">
                        🔄 Retry Analysis
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render analysis results
     */
    private renderAnalysisResults(): string {
        if (!this.analysisResult) return '';
        
        const { redundancies, hasRedundantNodes, childrenAnalyzed } = this.analysisResult;
        
        return `
            <div class="modal-header">
                <h2>🔍 Redundancy Analysis Results</h2>
                <p style="color: #666; margin: 5px 0 0 0;">
                    Analyzed ${childrenAnalyzed} children of <strong>${this.parentNode.title}</strong>
                </p>
            </div>
            <div class="modal-body">
                ${hasRedundantNodes ? this.renderRedundancies(redundancies) : this.renderNoRedundancies()}
            </div>
        `;
    }

    /**
     * Render no redundancies found
     */
    private renderNoRedundancies(): string {
        const actualThreshold = this.analysisResult?.thresholdUsed ?? this.currentThreshold;
        
        return `
            <div class="no-redundancy-container" style="text-align: center; padding: 40px;">
                <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
                <h3 style="color: #2e7d32; margin-bottom: 15px;">No Redundant Nodes Found</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    All children appear to serve unique plot functions. No deletion recommendations at this time.
                </p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <strong>Analysis Summary:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Children analyzed: ${this.analysisResult?.childrenAnalyzed || 0}</li>
                        <li>Redundancy threshold: ${actualThreshold}%</li>
                        <li>Redundancies found: 0</li>
                    </ul>
                </div>
                
                <div class="action-buttons" style="text-align: center; padding-top: 20px; border-top: 1px solid #ddd;">
                    <button 
                        id="back-to-config-btn" 
                        class="btn btn-secondary" 
                        style="background: #757575; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;"
                    >
                        ⚙️ Reconfigure Analysis
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render redundancy findings with threshold filtering
     */
    private renderRedundancies(redundancies: RedundancyDetection[]): string {
        // Use the actual threshold from the analysis result
        const actualThreshold = this.analysisResult?.thresholdUsed ?? this.currentThreshold;
        
        // Filter results based on user settings
        const filteredResults = this.showAllResults 
            ? redundancies 
            : redundancies.filter(r => r.redundancyScore >= actualThreshold);
        
        const totalFound = redundancies.length;
        const aboveThreshold = redundancies.filter(r => r.redundancyScore >= actualThreshold).length;
        const belowThreshold = totalFound - aboveThreshold;

        return `
            <div class="redundancy-results">
                <div class="results-summary" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">📊 Similarity Analysis Results</h4>
                    <div class="stats" style="margin-bottom: 15px;">
                        <p style="margin: 0; color: #666;">
                            <strong>Total Similarities Found:</strong> ${totalFound}<br>
                            <strong>Above Threshold (${actualThreshold}%+):</strong> ${aboveThreshold} 
                            ${aboveThreshold > 0 ? '<span style="color: #d32f2f;">← Actionable deletions</span>' : ''}<br>
                            <strong>Below Threshold:</strong> ${belowThreshold}
                            ${this.showAllResults && belowThreshold > 0 ? '<span style="color: #666;">← Shown for insight</span>' : ''}
                        </p>
                    </div>
                    ${!this.showAllResults && belowThreshold > 0 ? `
                        <div style="background: #e3f2fd; padding: 10px; border-radius: 6px; border-left: 4px solid #1976d2;">
                            <p style="margin: 0; font-size: 0.9em; color: #1976d2;">
                                💡 <strong>Tip:</strong> Enable "Show all results" to see ${belowThreshold} additional similarities below your threshold.
                            </p>
                        </div>
                    ` : ''}
                </div>
                
                ${filteredResults.length === 0 
                    ? `<div style="text-align: center; padding: 30px; color: #666; font-style: italic;">
                        ${this.showAllResults 
                            ? 'No similarities detected by AI analysis.' 
                            : `No redundancies above ${actualThreshold}% threshold.${belowThreshold > 0 ? '<br>Try lowering the threshold or enabling "Show all results".' : ''}`
                        }
                       </div>`
                    : `<div class="redundancy-list">
                        ${filteredResults.map((redundancy, index) => 
                            this.renderRedundancyItem(redundancy, index)
                        ).join('')}
                       </div>`
                }
                
                <div class="action-buttons" style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <button 
                        id="back-to-config-btn" 
                        class="btn btn-secondary" 
                        style="background: #757575; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;"
                    >
                        ⚙️ Reconfigure Analysis
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render individual redundancy item
     */
    private renderRedundancyItem(redundancy: RedundancyDetection, index: number): string {
        const isDeleted = this.deletedNodes.has(redundancy.nodeToDelete.id);
        const actualThreshold = this.analysisResult?.thresholdUsed ?? this.currentThreshold;
        const isAboveThreshold = redundancy.redundancyScore >= actualThreshold;
        const borderColor = isAboveThreshold ? '#d32f2f' : '#ffa726';
        const bgColor = isAboveThreshold ? '#fff5f5' : '#fff8e1';
        
        return `
            <div class="redundancy-item" style="border: 2px solid ${borderColor}; border-radius: 8px; margin-bottom: 15px; ${isDeleted ? 'opacity: 0.5;' : ''} background: ${bgColor};">
                <div class="redundancy-header" style="background: ${isAboveThreshold ? '#ffebee' : '#fffde7'}; padding: 15px; border-bottom: 1px solid ${borderColor};">
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div>
                            <h4 style="margin: 0 0 5px 0; color: ${isAboveThreshold ? '#d32f2f' : '#f57c00'};">
                                ${isDeleted 
                                    ? '🗑️ Deleted:' 
                                    : isAboveThreshold 
                                        ? '⚠️ Suggested Deletion:' 
                                        : '📊 Similarity Detected:'
                                }  "${redundancy.nodeToDelete.title}"
                            </h4>
                            <p style="margin: 0; color: #666; font-size: 0.9em;">
                                Redundancy Score: <strong style="color: ${isAboveThreshold ? '#d32f2f' : '#f57c00'};">${redundancy.redundancyScore}%</strong> 
                                ${!isAboveThreshold ? `<span style="color: #666;">(Below ${actualThreshold}% threshold)</span>` : ''} | 
                                Plot Loss: <strong>${redundancy.plotLoss}</strong>
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="redundancy-content" style="padding: 15px;">
                    <div class="node-comparison" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div class="keep-node" style="border: 2px solid #4caf50; border-radius: 8px; padding: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: #2e7d32;">✅ Keep: "${redundancy.nodeToKeep.title}"</h5>
                            <div style="max-height: 300px; overflow-y: auto; font-size: 0.9em; color: #333; line-height: 1.4; white-space: pre-wrap; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                                ${redundancy.nodeToKeep.content || '[No content]'}
                            </div>
                        </div>
                        
                        <div class="delete-node" style="border: 2px solid #f44336; border-radius: 8px; padding: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: #d32f2f;">🗑️ Delete: "${redundancy.nodeToDelete.title}"</h5>
                            <div style="max-height: 300px; overflow-y: auto; font-size: 0.9em; color: #333; line-height: 1.4; white-space: pre-wrap; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                                ${redundancy.nodeToDelete.content || '[No content]'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="reasoning" style="background: #f0f7ff; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                        <strong>AI Reasoning:</strong>
                        <p style="margin: 5px 0 0 0; font-style: italic;">${redundancy.reasoning}</p>
                    </div>
                    
                                                <div class="actions" style="text-align: center;">
                                ${isDeleted 
                                    ? `<span style="color: #666; font-style: italic;">Node has been deleted</span>`
                                    : isAboveThreshold 
                                        ? `
                                            <button class="delete-node-btn btn btn-danger" data-node-id="${redundancy.nodeToDelete.id}" style="margin-right: 10px;">
                                                🗑️ Delete This Node
                                            </button>
                                            <button class="keep-both-btn btn btn-secondary" data-index="${index}">
                                                Keep Both Nodes
                                            </button>
                                        `
                                        : `
                                            <div style="background: #f0f0f0; padding: 10px; border-radius: 6px; color: #666; font-style: italic;">
                                                📊 Below deletion threshold - shown for analysis insight only
                                            </div>
                                        `
                                }
                            </div>
                </div>
            </div>
        `;
    }



    /**
     * Update the display of a specific deleted item without re-rendering the entire modal
     */
    private updateDeletedItemDisplay(nodeId: string): void {
        // Find the redundancy item that contains the deleted node
        const deleteButtons = document.querySelectorAll(`.delete-node-btn[data-node-id="${nodeId}"]`);
        
        deleteButtons.forEach(button => {
            const redundancyItem = button.closest('.redundancy-item') as HTMLElement;
            if (redundancyItem) {
                // Update the item to show it's deleted
                redundancyItem.style.opacity = '0.5';
                
                // Find and update the actions section
                const actionsDiv = redundancyItem.querySelector('.actions');
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span style="color: #666; font-style: italic;">Node has been deleted</span>';
                }
                
                // Update the header to show deleted status
                const headerTitle = redundancyItem.querySelector('h4');
                if (headerTitle && !headerTitle.textContent?.includes('🗑️ Deleted:')) {
                    headerTitle.textContent = headerTitle.textContent?.replace('⚠️ Suggested Deletion:', '🗑️ Deleted:') || '';
                }
            }
        });
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        // Remove existing listeners first
        this.cleanupHandlers.forEach(cleanup => cleanup());
        this.cleanupHandlers = [];
        
        if (this.modalState === 'configuration') {
            this.setupConfigurationEventListeners();
        } else {
            this.setupResultsEventListeners();
        }
    }

    /**
     * Set up event listeners for configuration screen
     */
    private setupConfigurationEventListeners(): void {
        // Threshold slider
        const thresholdSlider = document.getElementById('threshold-slider') as HTMLInputElement;
        const thresholdValue = document.getElementById('threshold-value');
        if (thresholdSlider && thresholdValue) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(thresholdSlider, 'input', (e) => {
                const target = e.target as HTMLInputElement;
                this.currentThreshold = parseInt(target.value);
                thresholdValue.textContent = `${this.currentThreshold}%`;
                
                // Update the description text
                const description = document.querySelector('.threshold-setting p');
                if (description) {
                    description.innerHTML = `Only nodes with <strong>${this.currentThreshold}%+</strong> redundancy will be marked for deletion.
                        Lower values show more similarities but may be less actionable.`;
                }
            }));
        }

        // Show all checkbox
        const showAllCheckbox = document.getElementById('show-all-checkbox') as HTMLInputElement;
        if (showAllCheckbox) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(showAllCheckbox, 'change', (e) => {
                const target = e.target as HTMLInputElement;
                this.showAllResults = target.checked;
            }));
        }

        // Start analysis button
        const analyzeBtn = document.getElementById('start-analysis-btn');
        if (analyzeBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(analyzeBtn, 'click', async () => {
                await this.startAnalysis();
            }));
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancel-config-btn');
        if (cancelBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(cancelBtn, 'click', () => {
                this.close();
            }));
        }
    }

    /**
     * Start the analysis with current configuration
     */
    private async startAnalysis(): Promise<void> {
        // Update service configuration
        this.redundancyService = new RedundancyDetectionService(
            OpenRouterClient.getInstance(),
            await SettingsManager.getInstance(),
            { minimumRedundancyThreshold: this.currentThreshold }
        );

        // Switch to results state and show loading
        this.modalState = 'results';
        this.isLoading = true;
        this.updateModalContent();
        this.setupEventListeners();
        
        // Perform the analysis
        await this.performAnalysis();
    }

    /**
     * Set up event listeners for results screen
     */
    private setupResultsEventListeners(): void {
        // Back to configuration button
        const backToConfigBtn = document.getElementById('back-to-config-btn');
        if (backToConfigBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(backToConfigBtn, 'click', () => {
                this.modalState = 'configuration';
                this.updateModalContent();
                this.setupEventListeners();
            }));
        }
        
        // Retry analysis button  
        const retryBtn = document.getElementById('retry-analysis-btn');
        if (retryBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(retryBtn, 'click', () => {
                this.performAnalysis();
            }));
        }
        
        // Delete node buttons
        const deleteButtons = document.querySelectorAll('.delete-node-btn');
        deleteButtons.forEach(button => {
            const nodeId = (button as HTMLElement).dataset['nodeId'];
            if (nodeId) {
                this.cleanupHandlers.push(this.addEventListenerWithCleanup(button, 'click', () => {
                    this.handleDeleteNode(nodeId);
                }));
            }
        });
        
        // Keep both buttons
        const keepButtons = document.querySelectorAll('.keep-both-btn');
        keepButtons.forEach(button => {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(button, 'click', () => {
                // Just mark as reviewed, no action needed
                button.textContent = '✓ Keeping Both';
                (button as HTMLElement).style.background = '#4caf50';
                (button as HTMLElement).style.color = 'white';
            }));
        });
    }

    /**
     * Handle node deletion
     */
    private async handleDeleteNode(nodeId: string): Promise<void> {
        const nodeToDelete = this.projectManager.findNodeById(nodeId);
        if (!nodeToDelete) {
            alert('Node not found');
            return;
        }
        
        const confirmed = confirm(
            `Are you sure you want to delete "${nodeToDelete.title}"?\n\nThis action cannot be undone.`
        );
        
        if (!confirmed) return;
        
        try {
            const success = await this.redundancyService.deleteRedundantNode(nodeId, this.projectManager);
            
            if (success) {
                this.deletedNodes.add(nodeId);
                
                // Update just the specific item's display instead of re-rendering entire modal
                this.updateDeletedItemDisplay(nodeId);
                
                console.log(`✅ Successfully deleted redundant node: ${nodeToDelete.title}`);
            } else {
                alert('Failed to delete node. Please try again.');
            }
            
        } catch (error) {
            console.error('Delete operation failed:', error);
            alert('Failed to delete node. Please try again.');
        }
    }

    /**
     * Helper to add event listener with cleanup tracking
     */
    private addEventListenerWithCleanup(
        element: Element, 
        event: string, 
        handler: EventListener
    ): () => void {
        element.addEventListener(event, handler);
        return () => element.removeEventListener(event, handler);
    }
} 