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

    constructor(config: RedundancyDetectorModalConfig) {
        super({ 
            id: config.id,
            closable: true,
            backdrop: true
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
        this.isLoading = true;
        this.analysisResult = null;
        
        await super.open();
        this.setupEventListeners();
        
        // Start analysis immediately
        await this.performAnalysis();
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
        if (this.isLoading) {
            return this.renderLoadingContent();
        }
        
        if (!this.analysisResult) {
            return this.renderErrorContent('No analysis results available');
        }
        
        if (this.analysisResult.analysisError) {
            return this.renderErrorContent(this.analysisResult.analysisError);
        }
        
        return this.renderAnalysisResults();
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
            <div class="modal-footer">
                <button id="close-modal-btn" class="btn btn-secondary">Close</button>
                ${hasRedundantNodes ? '<button id="refresh-after-changes-btn" class="btn btn-primary">🔄 Refresh Tree</button>' : ''}
            </div>
        `;
    }

    /**
     * Render no redundancies found
     */
    private renderNoRedundancies(): string {
        return `
            <div class="no-redundancy-container" style="text-align: center; padding: 40px;">
                <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
                <h3 style="color: #2e7d32; margin-bottom: 15px;">No Redundant Nodes Found</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    All children appear to serve unique plot functions. No deletion recommendations at this time.
                </p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: left;">
                    <strong>Analysis Summary:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Children analyzed: ${this.analysisResult?.childrenAnalyzed || 0}</li>
                        <li>Redundancy threshold: 70%</li>
                        <li>Redundancies found: 0</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Render redundancy findings
     */
    private renderRedundancies(redundancies: RedundancyDetection[]): string {
        return `
            <div class="redundancy-results">
                <div class="results-summary" style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #856404;">
                        🗑️ ${redundancies.length} Redundant ${redundancies.length === 1 ? 'Node' : 'Nodes'} Detected
                    </h4>
                    <p style="margin: 0; color: #856404;">
                        The following nodes appear to contain redundant plot content and can potentially be deleted without story loss.
                    </p>
                </div>
                
                <div class="redundancy-list">
                    ${redundancies.map((redundancy, index) => this.renderRedundancyItem(redundancy, index)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render individual redundancy item
     */
    private renderRedundancyItem(redundancy: RedundancyDetection, index: number): string {
        const isDeleted = this.deletedNodes.has(redundancy.nodeToDelete.id);
        
        return `
            <div class="redundancy-item" style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px; ${isDeleted ? 'opacity: 0.5;' : ''}">
                <div class="redundancy-header" style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd;">
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div>
                            <h4 style="margin: 0 0 5px 0; color: #d32f2f;">
                                ${isDeleted ? '🗑️ Deleted:' : '⚠️ Suggested Deletion:'}  "${redundancy.nodeToDelete.title}"
                            </h4>
                            <p style="margin: 0; color: #666; font-size: 0.9em;">
                                Redundancy Score: <strong>${redundancy.redundancyScore}%</strong> | 
                                Plot Loss: <strong>${redundancy.plotLoss}</strong>
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="redundancy-content" style="padding: 15px;">
                    <div class="node-comparison" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div class="keep-node" style="border: 2px solid #4caf50; border-radius: 8px; padding: 10px;">
                            <h5 style="margin: 0 0 10px 0; color: #2e7d32;">✅ Keep: "${redundancy.nodeToKeep.title}"</h5>
                            <div style="max-height: 100px; overflow-y: auto; font-size: 0.85em; color: #666;">
                                ${this.truncateContent(redundancy.nodeToKeep.content || '[No content]', 200)}
                            </div>
                        </div>
                        
                        <div class="delete-node" style="border: 2px solid #f44336; border-radius: 8px; padding: 10px;">
                            <h5 style="margin: 0 0 10px 0; color: #d32f2f;">🗑️ Delete: "${redundancy.nodeToDelete.title}"</h5>
                            <div style="max-height: 100px; overflow-y: auto; font-size: 0.85em; color: #666;">
                                ${this.truncateContent(redundancy.nodeToDelete.content || '[No content]', 200)}
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
                            : `
                                <button class="delete-node-btn btn btn-danger" data-node-id="${redundancy.nodeToDelete.id}" style="margin-right: 10px;">
                                    🗑️ Delete This Node
                                </button>
                                <button class="keep-both-btn btn btn-secondary" data-index="${index}">
                                    Keep Both Nodes
                                </button>
                            `
                        }
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Truncate content for display
     */
    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        
        return content.substring(0, maxLength) + '...';
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        // Remove existing listeners first
        this.cleanupHandlers.forEach(cleanup => cleanup());
        this.cleanupHandlers = [];
        
        // Close button
        const closeBtn = document.getElementById('close-modal-btn');
        if (closeBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(closeBtn, 'click', () => {
                this.close();
            }));
        }
        
        // Retry analysis button
        const retryBtn = document.getElementById('retry-analysis-btn');
        if (retryBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(retryBtn, 'click', () => {
                this.performAnalysis();
            }));
        }
        
        // Refresh tree button
        const refreshBtn = document.getElementById('refresh-after-changes-btn');
        if (refreshBtn) {
            this.cleanupHandlers.push(this.addEventListenerWithCleanup(refreshBtn, 'click', () => {
                this.close();
                // Trigger tree refresh
                const { renderProjectUI } = require('../project-ui');
                void renderProjectUI(this.projectManager);
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
                this.updateModalContent();
                this.setupEventListeners();
                
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