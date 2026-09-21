import { BaseModal } from './core/BaseModal';
import { 
    RedundancyAnalysisResult, 
    RedundancyDetection,
    RecursiveRedundancyResult,
    RecursiveRedundancyConfig,
    RedundancyAnalysisProgress,
    DEFAULT_RECURSIVE_REDUNDANCY_CONFIG
} from '../../types/RedundancyTypes';
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
    private recursiveResult: RecursiveRedundancyResult | null = null;
    private analysisProgress: RedundancyAnalysisProgress | null = null;
    private parentNode: DocumentNode;
    private projectManager: ProjectManager;
    private isLoading: boolean = false;
    private redundancyService!: RedundancyDetectionService;
    private deletedNodes: Set<string> = new Set();
    
    // Configuration state
    private currentThreshold: number = 40;
    private showAllResults: boolean = false;
    private modalState: 'configuration' | 'results' | 'progress' = 'configuration';
    
    // Recursive configuration
    private recursiveMode: boolean = false;
    private recursiveConfig: RecursiveRedundancyConfig = { ...DEFAULT_RECURSIVE_REDUNDANCY_CONFIG };

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
        // Don't call setupEventListeners() here - it clears BaseModal's close button listeners!
        // The initial configuration screen event listeners are set up by setupConfigurationEventListeners
        // which gets called when modalState is 'configuration' in updateModalContent()
        this.setupConfigurationEventListeners();
    }

    /**
     * Perform redundancy analysis (single or recursive)
     */
    private async performAnalysis(): Promise<void> {
        try {
            if (this.recursiveMode) {
                await this.performRecursiveAnalysis();
            } else {
                await this.performSingleAnalysis();
            }
        } catch (error) {
            console.error('Analysis failed:', error);
            this.isLoading = false;
            this.modalState = 'results';
            
            // Create error result based on mode
            if (this.recursiveMode) {
                this.recursiveResult = {
                    rootNode: this.parentNode,
                    analysisResults: new Map(),
                    allRedundancies: [],
                    totalNodesAnalyzed: 0,
                    totalRedundantNodes: 0,
                    timestamp: new Date(),
                    config: this.recursiveConfig,
                    errors: [error instanceof Error ? error.message : 'Analysis failed']
                };
            } else {
                this.analysisResult = {
                    parentNode: this.parentNode,
                    redundancies: [],
                    timestamp: new Date(),
                    hasRedundantNodes: false,
                    childrenAnalyzed: 0,
                    thresholdUsed: this.currentThreshold,
                    analysisError: error instanceof Error ? error.message : 'Analysis failed'
                };
            }
            
            this.updateModalContent();
        }
    }

    /**
     * Perform single node analysis
     */
    private async performSingleAnalysis(): Promise<void> {
        console.log(`🔍 Starting single redundancy analysis for: ${this.parentNode.title}`);
        
        this.analysisResult = await this.redundancyService.analyzeSiblings(this.parentNode);
        this.isLoading = false;
        this.modalState = 'results';
        
        console.log(`✅ Single analysis complete: ${this.analysisResult.redundancies.length} redundancies found`);
        this.updateModalContent();
    }

    /**
     * Perform recursive analysis with progress tracking
     */
    private async performRecursiveAnalysis(): Promise<void> {
        console.log(`🔄 Starting recursive redundancy analysis from: ${this.parentNode.title}`);
        
        // Configure the service for recursive analysis
        this.redundancyService.updateRecursiveConfig({
            ...this.recursiveConfig,
            minimumRedundancyThreshold: this.currentThreshold
        });

        // Set up progress tracking
        this.redundancyService.setProgressCallback((progress: RedundancyAnalysisProgress) => {
            this.analysisProgress = progress;
            this.updateModalContent();
            
            // Switch to results when complete
            if (progress.phase === 'complete') {
                setTimeout(() => {
                    this.modalState = 'results';
                    this.isLoading = false;
                    this.updateModalContent();
                }, 1000); // Small delay to show completion
            }
        });

        // Switch to progress view
        this.modalState = 'progress';
        this.updateModalContent();

        // Determine root node for analysis
        const rootNode = this.recursiveConfig.analyzeEntireProject 
            ? this.projectManager.rootNode 
            : this.parentNode;

        // Perform recursive analysis
        this.recursiveResult = await this.redundancyService.analyzeRecursive(rootNode);
        
        console.log(`✅ Recursive analysis complete: ${this.recursiveResult.totalRedundantNodes} redundancies found across ${this.recursiveResult.totalNodesAnalyzed} nodes`);
    }

    /**
     * Update modal content and let BaseModal handle the close button
     */
    private updateModalContent(): void {
        const modalContent = document.querySelector(`[data-modal-id="${this.id}"] .modal-content`);
        
        if (modalContent) {
            // Update the content
            modalContent.innerHTML = this.renderModalContent();
            
            // Set up event listeners FIRST (this clears cleanup handlers)
            this.setupEventListeners();
            
            // THEN add close button (so its cleanup handlers don't get cleared)
            if (this.config.closable) {
                this.addCloseButton(modalContent as HTMLElement);
            }
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
        const childCount = this.parentNode.children.length;
        
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
                    
                    <div class="recursive-section" style="margin-bottom: 20px; border: 2px solid #e0e0e0; border-radius: 8px; padding: 15px;">
                        <h3 style="margin: 0 0 15px 0; color: #1976d2;">🔄 Recursive Analysis (Beta)</h3>
                        
                        <div class="recursive-mode-setting" style="margin-bottom: 15px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input 
                                    type="checkbox" 
                                    id="recursive-mode-checkbox" 
                                    ${this.recursiveMode ? 'checked' : ''}
                                >
                                <span style="font-weight: 500;">Enable recursive analysis</span>
                            </label>
                            <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #666;">
                                Analyze multiple levels of the project tree in one operation
                            </p>
                        </div>
                        
                        <div id="recursive-options" style="display: ${this.recursiveMode ? 'block' : 'none'};">
                            <div class="depth-setting" style="margin-bottom: 15px;">
                                <label for="depth-slider" style="display: block; margin-bottom: 8px; font-weight: 500;">
                                    Analysis Depth: <span id="depth-value">${this.recursiveConfig.maxDepth}</span> level${this.recursiveConfig.maxDepth === 1 ? '' : 's'}
                                    ${this.recursiveConfig.analyzeEntireProject ? '<span style="color: #666; font-weight: normal;"> (disabled - analyzing entire project)</span>' : ''}
                                </label>
                                <input 
                                    type="range" 
                                    id="depth-slider" 
                                    min="1" 
                                    max="10" 
                                    value="${this.recursiveConfig.maxDepth}" 
                                    style="width: 100%; margin-bottom: 8px; ${this.recursiveConfig.analyzeEntireProject ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                                    ${this.recursiveConfig.analyzeEntireProject ? 'disabled' : ''}
                                >
                                <p style="margin: 0; font-size: 0.9em; color: #666;">
                                    ${this.recursiveConfig.analyzeEntireProject 
                                        ? 'Entire project mode: all levels will be analyzed regardless of depth setting'
                                        : '1 = current node only, 2 = children + grandchildren, etc.'
                                    }
                                </p>
                            </div>
                            
                            <div class="entire-project-setting" style="margin-bottom: 15px;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input 
                                        type="checkbox" 
                                        id="entire-project-checkbox" 
                                        ${this.recursiveConfig.analyzeEntireProject ? 'checked' : ''}
                                    >
                                    <span>Analyze entire project from root</span>
                                </label>
                                <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #666;">
                                    Start analysis from project root instead of current node
                                </p>
                            </div>
                            
                            <div class="recursive-info" style="background: #fff3e0; padding: 12px; border-radius: 6px; border-left: 4px solid #ff9800;">
                                <p style="margin: 0; font-size: 0.9em; color: #e65100;">
                                    <strong>⚠️ Performance Note:</strong> Recursive analysis may take significantly longer and use more API calls. 
                                    Deep project trees will show a progress bar during analysis.
                                </p>
                            </div>
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
     * Render the progress screen for recursive analysis
     */
    private renderProgressScreen(): string {
        if (!this.analysisProgress) {
            return this.renderLoadingContent();
        }

        const progress = this.analysisProgress;
        const progressBarWidth = Math.max(5, progress.percentage); // Minimum 5% for visibility

        return `
            <div class="modal-header">
                <h2>🔄 Recursive Redundancy Analysis</h2>
            </div>
            
            <div class="modal-body" style="padding: 20px;">
                <div class="progress-container" style="margin-bottom: 20px;">
                    <div class="progress-info" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-weight: 500; color: #1976d2;">${progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1)}</span>
                        <span style="font-weight: 500; color: #666;">${progress.percentage}%</span>
                    </div>
                    
                    <div class="progress-bar-container" style="width: 100%; height: 20px; background-color: #e0e0e0; border-radius: 10px; overflow: hidden;">
                        <div class="progress-bar" style="width: ${progressBarWidth}%; height: 100%; background: linear-gradient(90deg, #1976d2 0%, #42a5f5 100%); transition: width 0.3s ease;"></div>
                    </div>
                    
                    <div class="progress-details" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        ${progress.currentNode ? `<p style="margin: 0 0 8px 0;"><strong>Current:</strong> ${progress.currentNode}</p>` : ''}
                        <p style="margin: 0 0 8px 0;"><strong>Progress:</strong> ${progress.completedNodes} of ${progress.totalNodes} nodes</p>
                        ${progress.currentDepth > 0 ? `<p style="margin: 0 0 8px 0;"><strong>Depth:</strong> Level ${progress.currentDepth}</p>` : ''}
                        <p style="margin: 0 0 8px 0;"><strong>Redundancies Found:</strong> ${progress.redundanciesFound}</p>
                        ${progress.message ? `<p style="margin: 0; color: #666; font-style: italic;">${progress.message}</p>` : ''}
                    </div>
                </div>
                
                <div class="progress-actions" style="text-align: center;">
                    <button 
                        id="cancel-analysis-btn"
                        class="btn btn-secondary" 
                        style="background: #757575; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;"
                        ${progress.phase === 'complete' ? 'disabled' : ''}
                    >
                        ${progress.phase === 'complete' ? 'Analysis Complete' : 'Cancel Analysis'}
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
        
        if (this.modalState === 'progress') {
            content = this.renderProgressScreen();
        } else if (this.isLoading) {
            content = this.renderLoadingContent();
        } else if (!this.analysisResult && !this.recursiveResult) {
            content = this.renderErrorContent('No analysis results available');
        } else if (this.analysisResult?.analysisError) {
            content = this.renderErrorContent(this.analysisResult.analysisError);
        } else if (this.recursiveResult?.errors.length) {
            content = this.renderErrorContent(this.recursiveResult.errors.join('\n'));
        } else {
            content = this.recursiveResult ? this.renderRecursiveResults() : this.renderAnalysisResults();
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
     * Render recursive analysis results
     */
    private renderRecursiveResults(): string {
        if (!this.recursiveResult) {
            return this.renderErrorContent('No recursive analysis results available');
        }

        const result = this.recursiveResult;
        const redundancies = result.allRedundancies;
        const actualThreshold = result.config.minimumRedundancyThreshold;

        return `
            <div class="modal-header">
                <h2>🔄 Recursive Redundancy Analysis Results</h2>
            </div>
            
            <div class="modal-body" style="padding: 20px;">
                <div class="recursive-summary" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0; color: #1976d2;">📊 Analysis Summary</h3>
                    <div class="summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #1976d2;">
                            <h4 style="margin: 0; color: #1976d2;">Nodes Analyzed</h4>
                            <p style="margin: 5px 0 0 0; font-size: 1.2em; font-weight: bold;">${result.totalNodesAnalyzed}</p>
                        </div>
                        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #d32f2f;">
                            <h4 style="margin: 0; color: #d32f2f;">Redundancies Found</h4>
                            <p style="margin: 5px 0 0 0; font-size: 1.2em; font-weight: bold;">${result.totalRedundantNodes}</p>
                        </div>
                        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #ff9800;">
                            <h4 style="margin: 0; color: #ff9800;">${result.config.analyzeEntireProject ? 'Analysis Mode' : 'Max Depth'}</h4>
                            <p style="margin: 5px 0 0 0; font-size: 1.2em; font-weight: bold;">
                                ${result.config.analyzeEntireProject 
                                    ? 'Entire Project' 
                                    : `${result.config.maxDepth} level${result.config.maxDepth === 1 ? '' : 's'}`
                                }
                            </p>
                        </div>
                        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #4caf50;">
                            <h4 style="margin: 0; color: #4caf50;">Analysis Scope</h4>
                            <p style="margin: 5px 0 0 0; font-size: 1.1em; font-weight: bold;">${result.config.analyzeEntireProject ? 'Entire Project' : 'From Selected Node'}</p>
                        </div>
                    </div>
                    
                    ${result.errors.length > 0 ? `
                        <div style="background: #fff3e0; padding: 12px; border-radius: 6px; border-left: 4px solid #ff9800; margin-top: 15px;">
                            <h4 style="margin: 0 0 8px 0; color: #e65100;">⚠️ Analysis Warnings</h4>
                            <ul style="margin: 0; padding-left: 20px; color: #e65100;">
                                ${result.errors.map(error => `<li>${error}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
                
                ${redundancies.length > 0 
                    ? this.renderRedundancies(redundancies)
                    : `<div style="text-align: center; padding: 30px; color: #666; font-style: italic;">
                        🎉 No redundancies found above ${actualThreshold}% threshold across the analyzed nodes.
                       </div>`
                }
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
                        <li>Children analyzed: ${this.analysisResult?.childrenAnalyzed ?? 0}</li>
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

    private renderDeletionTitle(isDeleted: boolean, isAboveThreshold: boolean, title: string): string {
        if (isDeleted) {
            return `🗑️ Deleted:  "${title}"`;
        }
        if (isAboveThreshold) {
            return `⚠️ Suggested Deletion:  "${title}"`;
        }
        return `📊 Similarity Detected:  "${title}"`;
    }

    private renderDeletionActions(isDeleted: boolean, isAboveThreshold: boolean, redundancy: RedundancyDetection, index: number): string {
        if (isDeleted) {
            return '<span style="color: #666; font-style: italic;">Node has been deleted</span>';
        }
        if (isAboveThreshold) {
            return `
                <button class="delete-node-btn btn btn-danger" data-node-id="${redundancy.nodeToDelete.id}" style="margin-right: 10px;">
                    🗑️ Delete This Node
                </button>
                <button class="keep-both-btn btn btn-secondary" data-index="${index}">
                    Keep Both Nodes
                </button>
            `;
        }
        return `
            <div style="background: #f0f0f0; padding: 10px; border-radius: 6px; color: #666; font-style: italic;">
                📊 Below deletion threshold - shown for analysis insight only
            </div>
        `;
    }

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
                                ${this.renderDeletionTitle(isDeleted, isAboveThreshold, redundancy.nodeToDelete.title)}
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
                                ${this.renderDeletionActions(isDeleted, isAboveThreshold, redundancy, index)}
                            </div>
                </div>
            </div>
        `;
    }



    /**
     * Update the display of a specific deleted item without re-rendering the entire modal
     */
    private updateDeletedItemDisplay(nodeId: string): void {
        console.log(`🔄 Updating deleted item display for node: ${nodeId}`);
        
        // Find the redundancy item that contains the deleted node
        const deleteButtons = document.querySelectorAll(`.delete-node-btn[data-node-id="${nodeId}"]`);
        console.log(`Found ${deleteButtons.length} delete buttons for node ${nodeId}`);
        
        deleteButtons.forEach((button, index) => {
            const redundancyItem = button.closest('.redundancy-item');
            if (!(redundancyItem instanceof HTMLElement)) {
                console.log(`No redundancy item found for button ${index + 1}`);
                return;
            }

            console.log(`Updating redundancy item ${index + 1}`);
                
                // Update the item to show it's deleted
                redundancyItem.style.opacity = '0.5';
                
                // Find and update the actions section
                const actionsDiv = redundancyItem.querySelector('.actions');
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span style="color: #666; font-style: italic;">Node has been deleted</span>';
                    console.log(`Updated actions for item ${index + 1}`);
                }
                
                // Update the header to show deleted status
                const headerTitle = redundancyItem.querySelector('h4');
                if (headerTitle && !(headerTitle.textContent ?? '').includes('🗑️ Deleted:')) {
                    headerTitle.textContent = (headerTitle.textContent ?? '').replace('⚠️ Suggested Deletion:', '🗑️ Deleted:');
                    console.log(`Updated header for item ${index + 1}`);
                }
        });
        
        if (deleteButtons.length === 0) {
            console.log(`⚠️ No delete buttons found for node ${nodeId} - this might indicate a structural issue`);
        }
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        // Only clear modal-specific listeners, not BaseModal's listeners (like close button)
        // We'll track our own listeners separately
        this.clearModalEventListeners();
        
        if (this.modalState === 'configuration') {
            this.setupConfigurationEventListeners();
        } else {
            this.setupResultsEventListeners();
        }
    }

    /**
     * Clear only the modal's own event listeners, preserving BaseModal's listeners
     */
    private clearModalEventListeners(): void {
        // Clear only our own listeners by removing them from the current DOM elements
        // This preserves BaseModal's cleanup handlers (like the close button)
        
        // Remove configuration screen listeners
        const thresholdSlider = document.getElementById('threshold-slider');
        if (thresholdSlider) {
            thresholdSlider.replaceWith(thresholdSlider.cloneNode(true));
        }
        
        const showAllCheckbox = document.getElementById('show-all-checkbox');
        if (showAllCheckbox) {
            showAllCheckbox.replaceWith(showAllCheckbox.cloneNode(true));
        }
        
        const analyzeBtn = document.getElementById('start-analysis-btn');
        if (analyzeBtn) {
            analyzeBtn.replaceWith(analyzeBtn.cloneNode(true));
        }
        
        const cancelBtn = document.getElementById('cancel-config-btn');
        if (cancelBtn) {
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        }
        
        // Remove recursive mode listeners
        const recursiveModeCheckbox = document.getElementById('recursive-mode-checkbox');
        if (recursiveModeCheckbox) {
            recursiveModeCheckbox.replaceWith(recursiveModeCheckbox.cloneNode(true));
        }
        
        const depthSlider = document.getElementById('depth-slider');
        if (depthSlider) {
            depthSlider.replaceWith(depthSlider.cloneNode(true));
        }
        
        const entireProjectCheckbox = document.getElementById('entire-project-checkbox');
        if (entireProjectCheckbox) {
            entireProjectCheckbox.replaceWith(entireProjectCheckbox.cloneNode(true));
        }
        
        // Remove results screen listeners  
        const backToConfigBtn = document.getElementById('back-to-config-btn');
        if (backToConfigBtn) {
            backToConfigBtn.replaceWith(backToConfigBtn.cloneNode(true));
        }
        
        const retryBtn = document.getElementById('retry-analysis-btn');
        if (retryBtn) {
            retryBtn.replaceWith(retryBtn.cloneNode(true));
        }
        
        // Remove delete button listeners
        document.querySelectorAll('.delete-node-btn').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });
    }

    /**
     * Set up event listeners for configuration screen
     */
    private setupConfigurationEventListeners(): void {
        const thresholdSlider = document.getElementById('threshold-slider');
        const thresholdValue = document.getElementById('threshold-value');
        if (!(thresholdSlider instanceof HTMLInputElement) || !thresholdValue) {
            throw new Error('Redundancy configuration threshold controls not found');
        }
        thresholdSlider.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.currentThreshold = parseInt(target.value);
            thresholdValue.textContent = `${this.currentThreshold}%`;
            
            const description = document.querySelector('.threshold-setting p');
            if (description) {
                description.innerHTML = `Only nodes with <strong>${this.currentThreshold}%+</strong> redundancy will be marked for deletion.
                    Lower values show more similarities but may be less actionable.`;
            }
        });

        const showAllCheckbox = document.getElementById('show-all-checkbox');
        if (!(showAllCheckbox instanceof HTMLInputElement)) {
            throw new Error('Redundancy configuration show-all checkbox not found');
        }
        showAllCheckbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.showAllResults = target.checked;
        });

        const analyzeBtn = document.getElementById('start-analysis-btn');
        if (!analyzeBtn) {
            throw new Error('Redundancy configuration start-analysis button not found');
        }
        analyzeBtn.addEventListener('click', () => {
            void this.startAnalysis();
        });

        const cancelBtn = document.getElementById('cancel-config-btn');
        if (!cancelBtn) {
            throw new Error('Redundancy configuration cancel button not found');
        }
        cancelBtn.addEventListener('click', () => {
            void this.close();
        });

        const recursiveModeCheckbox = document.getElementById('recursive-mode-checkbox');
        if (!(recursiveModeCheckbox instanceof HTMLInputElement)) {
            throw new Error('Redundancy configuration recursive-mode checkbox not found');
        }
        recursiveModeCheckbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.recursiveMode = target.checked;
            
            const recursiveOptions = document.getElementById('recursive-options');
            if (recursiveOptions) {
                recursiveOptions.style.display = this.recursiveMode ? 'block' : 'none';
            }
        });

        const depthSlider = document.getElementById('depth-slider');
        const depthValue = document.getElementById('depth-value');
        if (!(depthSlider instanceof HTMLInputElement) || !depthValue) {
            throw new Error('Redundancy configuration depth controls not found');
        }
        depthSlider.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.recursiveConfig.maxDepth = parseInt(target.value);
            const levels = this.recursiveConfig.maxDepth === 1 ? 'level' : 'levels';
            depthValue.textContent = `${this.recursiveConfig.maxDepth} ${levels}`;
        });

        const entireProjectCheckbox = document.getElementById('entire-project-checkbox');
        if (!(entireProjectCheckbox instanceof HTMLInputElement)) {
            throw new Error('Redundancy configuration entire-project checkbox not found');
        }
        entireProjectCheckbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.recursiveConfig.analyzeEntireProject = target.checked;
            
            const depthSliderEl = document.getElementById('depth-slider');
            const depthValueEl = document.getElementById('depth-value');
            if (!(depthSliderEl instanceof HTMLInputElement) || !depthValueEl) {
                throw new Error('Redundancy configuration depth controls not found during project toggle');
            }
            const depthLabel = depthSliderEl.parentElement?.querySelector('label');
            const depthDescription = depthSliderEl.parentElement?.querySelector('p');
            if (!depthLabel || !depthDescription) {
                throw new Error('Redundancy configuration depth labels not found');
            }

            if (target.checked) {
                depthSliderEl.disabled = true;
                depthSliderEl.style.opacity = '0.5';
                depthSliderEl.style.cursor = 'not-allowed';
                
                const currentDepthText = `${this.recursiveConfig.maxDepth} level${this.recursiveConfig.maxDepth === 1 ? '' : 's'}`;
                depthLabel.innerHTML = `Analysis Depth: <span id="depth-value">${currentDepthText}</span> <span style="color: #666; font-weight: normal;"> (disabled - analyzing entire project)</span>`;
                
                depthDescription.textContent = 'Entire project mode: all levels will be analyzed regardless of depth setting';
                depthDescription.style.color = '#666';
            } else {
                depthSliderEl.disabled = false;
                depthSliderEl.style.opacity = '1';
                depthSliderEl.style.cursor = 'pointer';
                
                const currentDepthText = `${this.recursiveConfig.maxDepth} level${this.recursiveConfig.maxDepth === 1 ? '' : 's'}`;
                depthLabel.innerHTML = `Analysis Depth: <span id="depth-value">${currentDepthText}</span>`;
                
                depthDescription.textContent = '1 = current node only, 2 = children + grandchildren, etc.';
                depthDescription.style.color = '#666';
            }
        });
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
            backToConfigBtn.addEventListener('click', () => {
                this.modalState = 'configuration';
                this.updateModalContent();
            });
        }
        
        // Retry analysis button  
        const retryBtn = document.getElementById('retry-analysis-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                void this.performAnalysis();
            });
        }
        
        // Delete node buttons
        const deleteButtons = document.querySelectorAll('.delete-node-btn');
        deleteButtons.forEach(button => {
            const nodeId = (button as HTMLElement).dataset['nodeId'];
            if (nodeId) {
                button.addEventListener('click', () => {
                    void this.handleDeleteNode(nodeId);
                });
            }
        });
        
        // Keep both buttons
        const keepButtons = document.querySelectorAll('.keep-both-btn');
        keepButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Just mark as reviewed, no action needed
                button.textContent = '✓ Keeping Both';
                (button as HTMLElement).style.background = '#4caf50';
                (button as HTMLElement).style.color = 'white';
            });
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

} 