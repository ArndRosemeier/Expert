import { BaseModal } from './core/BaseModal';
import { 
    LogicAnalysisResult, 
    LogicError,
    LogicErrorDetectionConfig,
    LogicErrorType,
    LogicErrorCategory,
    DEFAULT_LOGIC_ERROR_CONFIG,
    getErrorTypeLabel,
    getErrorTypeDescription
} from '../../types/LogicErrorTypes';
import { DocumentNode, TodoNodeReference } from '../../DocumentNode';
import { LogicErrorDetectionService } from './services/LogicErrorDetectionService';
import { OpenRouterClient } from '../../OpenRouterClient';
import { SettingsManager } from '../../SettingsManager';
import { ProjectManager } from '../../ProjectManager';

export interface LogicErrorDetectorModalConfig {
    id: string;
    parentNode: DocumentNode;
    projectManager: ProjectManager;
}

export class LogicErrorDetectorModal extends BaseModal {
    private analysisResult: LogicAnalysisResult | null = null;
    private parentNode: DocumentNode;
    private isLoading: boolean = false;
    private logicErrorService!: LogicErrorDetectionService;
    private addedToTodoSet: Set<string> = new Set(); // Track which errors have been added to todos

    /**
     * Check existing todos to see which logic errors are already added
     */
    private checkExistingTodos(): void {
        const todos = this.parentNode.getIncompleteTodos();
        
        todos.forEach(todo => {
            if (todo.logicError) {
                // Create a unique identifier for this logic error in the todo
                const errorId = this.createErrorIdentifier(
                    todo.logicError.type,
                    todo.logicError.severity,
                    todo.description
                );
                this.addedToTodoSet.add(errorId);
            }
        });
    }

    /**
     * Create a unique identifier for a logic error
     */
    private createErrorIdentifier(type: string, severity: number, description: string): string {
        return `${type}_${severity}_${description.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}`;
    }

    
    // Configuration state
    private detectionConfig: LogicErrorDetectionConfig = { ...DEFAULT_LOGIC_ERROR_CONFIG };
    private modalState: 'configuration' | 'results' = 'configuration';

    constructor(config: LogicErrorDetectorModalConfig) {
        super({ 
            id: config.id,
            closable: true,
            backdrop: true,
            maxWidth: '1200px',
            width: '95vw'
        });
        
        this.parentNode = config.parentNode;
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
     * Open modal and initialize service
     */
    override async open(): Promise<void> {
        // Initialize service here where we can await SettingsManager
        const openRouterClient = OpenRouterClient.getInstance();
        const settingsManager = await SettingsManager.getInstance();
        
        this.logicErrorService = new LogicErrorDetectionService(
            openRouterClient,
            settingsManager,
            this.detectionConfig
        );

        // Check existing todos to see what's already been added
        this.checkExistingTodos();

        await super.open();
        this.setupEventListeners();
    }

    /**
     * Main render method that switches between states
     */
    private renderModalContent(): string {
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
        const leafCount = this.countLeafNodes(this.parentNode);
        
        return `
            <div class="modal-header">
                <h2>🧩 Logic Error Detection Configuration</h2>
            </div>
                
            <div class="modal-body" style="padding: 20px;">
                <div class="node-info" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 10px 0;">📋 Analysis Target</h3>
                    <p style="margin: 0; color: #666;">
                        <strong>Parent Node:</strong> "${this.parentNode.title}"<br>
                        <strong>Leaf Nodes to Analyze:</strong> ${leafCount} deepest content nodes
                    </p>
                </div>
                
                <div class="config-section" style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0;">⚙️ Detection Settings</h3>
                    
                    <div class="severity-setting" style="margin-bottom: 20px;">
                        <label for="severity-slider" style="display: block; margin-bottom: 8px; font-weight: 500;">
                            Minimum Severity: <span id="severity-value">${this.detectionConfig.minimumSeverity}</span>/10
                        </label>
                        <input 
                            type="range" 
                            id="severity-slider" 
                            min="1" 
                            max="10" 
                            value="${this.detectionConfig.minimumSeverity}" 
                            style="width: 100%; margin-bottom: 8px;"
                        >
                        <p style="margin: 0; font-size: 0.9em; color: #666;">
                            Only errors with severity <strong>${this.detectionConfig.minimumSeverity}+</strong> will be flagged as actionable.
                            Lower values show more potential issues but may include minor concerns.
                        </p>
                    </div>
                    
                    <div class="error-types-setting" style="margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; font-weight: 500;">Error Types to Check:</h4>
                        <div class="error-types-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px;">
                            ${this.renderErrorTypeCheckboxes()}
                        </div>
                    </div>
                    
                    <div class="advanced-settings" style="margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; font-weight: 500;">Advanced Options:</h4>
                        
                        <div class="empty-leaves-setting" style="margin-bottom: 10px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input 
                                    type="checkbox" 
                                    id="include-empty-checkbox" 
                                    ${this.detectionConfig.includeEmptyLeaves ? 'checked' : ''}
                                >
                                <span>Include empty leaf nodes in analysis</span>
                            </label>
                        </div>
                        

                    </div>
                </div>
                
                <div class="analysis-info" style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0;">🧩 How Logic Detection Works</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #666;">
                        <li>Collects all deepest leaf nodes with actual content</li>
                        <li>Includes full parent section context for comprehensive analysis</li>
                        <li>Formats content with clear title markers (===Title: Name ===)</li>
                        <li>AI analyzes complete content for logical inconsistencies and plot holes</li>
                        <li>Reports specific errors with justification and severity</li>
                        <li>Links errors to the exact leaf nodes that contain them</li>
                    </ul>
                </div>
                
                <div class="action-buttons" style="text-align: center;">
                    <button 
                        id="start-analysis-btn" 
                        class="btn btn-primary" 
                        style="background: #1976d2; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin-right: 10px;"
                    >
                        🧩 Analyze for Logic Errors
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
     * Render error type checkboxes
     */
    private renderErrorTypeCheckboxes(): string {
        const allErrorTypes: LogicErrorType[] = [
            'plot_hole',
            'character_contradiction',
            'timeline_inconsistency',
            'logical_inconsistency',
            'factual_error',
            'continuity_error'
        ];

        return allErrorTypes.map(type => {
            const isChecked = this.detectionConfig.errorTypes.includes(type);
            const label = getErrorTypeLabel(type);
            const description = getErrorTypeDescription(type);
            
            return `
                <div class="error-type-item" style="border: 1px solid #ddd; padding: 10px; border-radius: 6px;">
                    <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
                        <input 
                            type="checkbox" 
                            class="error-type-checkbox" 
                            data-error-type="${type}"
                            ${isChecked ? 'checked' : ''}
                            style="margin-top: 2px;"
                        >
                        <div>
                            <span style="font-weight: 500;">${label}</span>
                            <p style="margin: 2px 0 0 0; font-size: 0.8em; color: #666; line-height: 1.3;">
                                ${description}
                            </p>
                        </div>
                    </label>
                </div>
            `;
        }).join('');
    }

    /**
     * Count leaf nodes under parent
     */
    private countLeafNodes(node: DocumentNode): number {
        let count = 0;
        const traverse = (currentNode: DocumentNode) => {
            if (!currentNode.children || currentNode.children.length === 0) {
                count++;
            } else {
                for (const child of currentNode.children) {
                    traverse(child);
                }
            }
        };
        
        if (node.children) {
            for (const child of node.children) {
                traverse(child);
            }
        }
        
        return count;
    }

    /**
     * Render the results screen
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
        
        return content;
    }

    /**
     * Render loading state
     */
    private renderLoadingContent(): string {
        return `
            <div class="modal-header">
                <h2>🧩 Analyzing Logic and Consistency</h2>
            </div>
            <div class="modal-body">
                <div class="loading-container" style="text-align: center; padding: 40px;">
                    <div class="puzzle-spinner" style="
                    margin: 20px auto; 
                    width: 72px; 
                    height: 72px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 48px; 
                    animation: spin 2s linear infinite;
                    overflow: hidden;
                ">🧩</div>
                    <h3 style="color: #1976d2; margin: 20px 0 10px 0;">Analyzing Story Logic</h3>
                    <p style="font-size: 1.1em; margin-bottom: 20px;">Analyzing leaf nodes under <strong>${this.parentNode.title}</strong> for logical errors...</p>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: left; max-width: 400px; margin: 0 auto;">
                        <p style="margin: 0 0 8px 0; color: #666; font-size: 0.9em;">🔍 <strong>What we're checking:</strong></p>
                        <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 0.9em;">
                            <li>Plot holes and missing explanations</li>
                            <li>Character contradictions and inconsistencies</li>
                            <li>Timeline and sequence issues</li>
                            <li>Logical inconsistencies in events</li>
                            <li>Factual contradictions</li>
                            <li>Continuity errors between sections</li>
                        </ul>
                    </div>
                    <p style="color: #999; font-size: 0.8em; margin-top: 20px;">This may take a moment for large content sections...</p>
                </div>
            </div>
            <style>
                .puzzle-spinner {
                    transform-origin: center;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    }

    /**
     * Render error state
     */
    private renderErrorContent(error: string): string {
        return `
            <div class="modal-header">
                <h2>🧩 Logic Analysis Error</h2>
            </div>
            <div class="modal-body">
                <div class="error-container" style="text-align: center; padding: 40px;">
                    <p style="color: #d32f2f; margin-bottom: 20px;">❌ ${error}</p>
                    <button 
                        id="back-to-config-btn" 
                        class="btn btn-secondary"
                        style="background: #757575; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;"
                    >
                        ⚙️ Back to Configuration
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
        
        const { errors, leavesAnalyzed } = this.analysisResult;
        
        return `
            <div class="modal-header">
                <h2>🧩 Logic Error Analysis Results</h2>
                <p style="color: #666; margin: 5px 0 0 0;">
                    Analyzed ${leavesAnalyzed} leaf nodes under <strong>${this.parentNode.title}</strong>
                </p>
            </div>
            <div class="modal-body">
                ${this.renderAnalysisSummary()}
                ${errors.length > 0 ? this.renderLogicErrors(errors) : this.renderNoErrors()}
            </div>
        `;
    }

    /**
     * Render analysis summary
     */
    private renderAnalysisSummary(): string {
        if (!this.analysisResult) return '';
        
        const { errors, actionableErrors, leavesAnalyzed, errorsByCategory } = this.analysisResult;
        
        return `
            <div class="analysis-summary" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1976d2;">📊 Analysis Summary</h3>
                <div class="summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #1976d2;">
                        <h4 style="margin: 0; color: #1976d2;">Leaves Analyzed</h4>
                        <p style="margin: 5px 0 0 0; font-size: 1.2em; font-weight: bold;">${leavesAnalyzed}</p>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid ${actionableErrors > 0 ? '#d32f2f' : '#4caf50'};">
                        <h4 style="margin: 0; color: ${actionableErrors > 0 ? '#d32f2f' : '#4caf50'};">Actionable Errors</h4>
                        <p style="margin: 5px 0 0 0; font-size: 1.2em; font-weight: bold;">${actionableErrors}</p>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #ff9800;">
                        <h4 style="margin: 0; color: #ff9800;">Total Found</h4>
                        <p style="margin: 5px 0 0 0; font-size: 1.2em; font-weight: bold;">${errors.length}</p>
                    </div>
                </div>
                
                ${errorsByCategory.critical > 0 || errorsByCategory.major > 0 || errorsByCategory.minor > 0 ? `
                    <div class="severity-breakdown" style="margin-top: 15px; padding: 15px; background: white; border-radius: 6px;">
                        <h4 style="margin: 0 0 10px 0;">Severity Breakdown:</h4>
                        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                            ${errorsByCategory.critical > 0 ? `<span style="color: #d32f2f;">⚠️ Critical: ${errorsByCategory.critical}</span>` : ''}
                            ${errorsByCategory.major > 0 ? `<span style="color: #ff9800;">⚡ Major: ${errorsByCategory.major}</span>` : ''}
                            ${errorsByCategory.minor > 0 ? `<span style="color: #ffc107;">💡 Minor: ${errorsByCategory.minor}</span>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render logic errors list
     */
    private renderLogicErrors(errors: LogicError[]): string {
        const filteredErrors = errors.filter(error => 
            error.severity >= this.detectionConfig.minimumSeverity
        );
        
        const belowThreshold = errors.length - filteredErrors.length;
        
        return `
            <div class="logic-errors-results">
                ${belowThreshold > 0 ? `
                    <div style="background: #e3f2fd; padding: 10px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #1976d2;">
                        <p style="margin: 0; font-size: 0.9em; color: #1976d2;">
                            💡 <strong>Note:</strong> ${belowThreshold} additional error${belowThreshold === 1 ? '' : 's'} found below severity threshold ${this.detectionConfig.minimumSeverity}.
                        </p>
                    </div>
                ` : ''}
                
                <div class="errors-list">
                    ${filteredErrors.map((error) => 
                        this.renderLogicErrorItem(error)
                    ).join('')}
                </div>
                
                <div class="action-buttons" style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <button 
                        id="back-to-config-btn" 
                        class="btn btn-secondary" 
                        style="background: #757575; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;"
                    >
                        ⚙️ Reconfigure Analysis
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render individual logic error item
     */
    private renderLogicErrorItem(error: LogicError): string {
        // Check if this error has already been added to todos
        const errorId = this.createErrorIdentifier(error.type, error.severity, error.description);
        const isAddedToTodo = this.addedToTodoSet.has(errorId);
        
        const severityColor = this.getSeverityColor(error.category);
        const severityIcon = this.getSeverityIcon(error.category);
        
        return `
            <div class="logic-error-item" style="border: 2px solid ${severityColor}; border-radius: 8px; margin-bottom: 20px; background: white;">
                <div class="error-header" style="background: ${severityColor}15; padding: 15px; border-bottom: 1px solid ${severityColor};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 5px 0; color: ${severityColor};">
                                ${severityIcon} ${getErrorTypeLabel(error.type)}

                            </h4>
                            <p style="margin: 0; color: #666; font-size: 0.9em;">
                                Severity: <strong style="color: ${severityColor};">${error.severity}/10 (${error.category})</strong>
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="error-content" style="padding: 15px;">
                    <div class="error-description" style="margin-bottom: 15px;">
                        <h5 style="margin: 0 0 8px 0; color: #333;">Description:</h5>
                        <p style="margin: 0; color: #333; line-height: 1.4;">${error.description}</p>
                    </div>
                    
                    <div class="error-justification" style="margin-bottom: 15px;">
                        <h5 style="margin: 0 0 8px 0; color: #333;">Analysis:</h5>
                        <p style="margin: 0; color: #666; line-height: 1.4; font-style: italic;">${error.justification}</p>
                    </div>
                    
                    <div class="affected-leaves" style="margin-bottom: 15px;">
                        <h5 style="margin: 0 0 8px 0; color: #333;">Affected Sections:</h5>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${error.offendingLeaves.map(leafTitle => 
                                `<span style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; border: 1px solid #ddd;">${leafTitle}</span>`
                            ).join('')}
                        </div>
                    </div>
                    
                    ${error.suggestedFix ? `
                        <div class="suggested-fix" style="margin-bottom: 15px; background: #f9f9f9; padding: 12px; border-radius: 6px; border-left: 4px solid #4caf50;">
                            <h5 style="margin: 0 0 8px 0; color: #2e7d32;">💡 Suggested Fix:</h5>
                            <p style="margin: 0; color: #333; line-height: 1.4;">${error.suggestedFix}</p>
                        </div>
                    ` : ''}
                    
                    <div class="error-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
                        ${isAddedToTodo ? `
                            <button 
                                class="todo-added-btn" 
                                disabled
                                style="background: #4caf50; color: white; padding: 6px 12px; border: none; border-radius: 4px; font-size: 0.9em; cursor: not-allowed; opacity: 0.8;"
                            >
                                ✅ Added to Todo
                            </button>
                        ` : `
                            <button 
                                class="add-todo-btn btn btn-warning" 
                                data-error-id="${error.id}"
                                style="background: #ff9800; color: white; padding: 6px 12px; border: none; border-radius: 4px; font-size: 0.9em; cursor: pointer;"
                            >
                                📝 Add to Todo
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render no errors found state
     */
    private renderNoErrors(): string {
        return `
            <div style="text-align: center; padding: 40px; color: #666;">
                <h3 style="color: #4caf50; margin-bottom: 10px;">🎉 No Logic Errors Found!</h3>
                <p style="margin: 0 0 20px 0;">
                    Your story appears to be logically consistent across all ${this.analysisResult?.leavesAnalyzed} analyzed leaf nodes.
                </p>
                <button 
                    id="back-to-config-btn" 
                    class="btn btn-secondary"
                    style="background: #757575; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;"
                >
                    ⚙️ Analyze Different Settings
                </button>
            </div>
        `;
    }

    /**
     * Get color for severity category
     */
    private getSeverityColor(category: LogicErrorCategory): string {
        switch (category) {
            case 'critical': return '#d32f2f';
            case 'major': return '#ff9800';
            case 'minor': return '#ffc107';
            default: return '#757575';
        }
    }

    /**
     * Get icon for severity category
     */
    private getSeverityIcon(category: LogicErrorCategory): string {
        switch (category) {
            case 'critical': return '🚨';
            case 'major': return '⚠️';
            case 'minor': return '💡';
            default: return '❓';
        }
    }

    /**
     * Perform logic error analysis
     */
    private async performAnalysis(): Promise<void> {
        try {
            console.log(`🧩 Starting logic error analysis for: ${this.parentNode.title}`);
            
            // Update service configuration
            this.logicErrorService.updateConfig(this.detectionConfig);
            
            this.analysisResult = await this.logicErrorService.analyzeLogicErrors(this.parentNode);
            this.isLoading = false;
            
            console.log(`✅ Logic analysis complete: ${this.analysisResult.errors.length} errors found, ${this.analysisResult.actionableErrors} actionable`);
            
            // Force UI update
            this.modalState = 'results';
            this.isLoading = false;
            console.log('🔄 Forcing modal state update:', this.modalState, 'loading:', this.isLoading);
            this.updateModalContent();
            
        } catch (error) {
            console.error('Logic error analysis failed:', error);
            this.isLoading = false;
            this.analysisResult = {
                parentNode: this.parentNode,
                errors: [],
                leavesAnalyzed: 0,
                totalLeafContent: 0,
                timestamp: new Date(),
                errorsByType: {
                    'plot_hole': 0,
                    'character_contradiction': 0,
                    'timeline_inconsistency': 0,
                    'logical_inconsistency': 0,
                    'factual_error': 0,
                    'continuity_error': 0
                },
                errorsByCategory: { critical: 0, major: 0, minor: 0 },
                actionableErrors: 0,
                analysisError: error instanceof Error ? error.message : 'Analysis failed'
            };
            
            // Force UI update for error case
            this.modalState = 'results';
            this.isLoading = false;
            console.log('❌ Error case - forcing modal state update:', this.modalState);
            this.updateModalContent();
        }
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        this.clearModalEventListeners();
        
        if (this.modalState === 'configuration') {
            this.setupConfigurationEventListeners();
        } else {
            this.setupResultsEventListeners();
        }
    }

    /**
     * Clear modal event listeners
     */
    private clearModalEventListeners(): void {
        // Configuration listeners
        const severitySlider = document.getElementById('severity-slider');
        if (severitySlider) {
            severitySlider.replaceWith(severitySlider.cloneNode(true));
        }
        
        const errorTypeCheckboxes = document.querySelectorAll('.error-type-checkbox');
        errorTypeCheckboxes.forEach(checkbox => {
            checkbox.replaceWith(checkbox.cloneNode(true));
        });
        
        const includeEmptyCheckbox = document.getElementById('include-empty-checkbox');
        if (includeEmptyCheckbox) {
            includeEmptyCheckbox.replaceWith(includeEmptyCheckbox.cloneNode(true));
        }
        

        
        const startAnalysisBtn = document.getElementById('start-analysis-btn');
        if (startAnalysisBtn) {
            startAnalysisBtn.replaceWith(startAnalysisBtn.cloneNode(true));
        }
        
        const cancelBtn = document.getElementById('cancel-config-btn');
        if (cancelBtn) {
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        }
        
        // Results listeners
        const backToConfigBtn = document.getElementById('back-to-config-btn');
        if (backToConfigBtn) {
            backToConfigBtn.replaceWith(backToConfigBtn.cloneNode(true));
        }
        

    }

    /**
     * Set up configuration event listeners
     */
    private setupConfigurationEventListeners(): void {
        // Severity slider
        const severitySlider = document.getElementById('severity-slider') as HTMLInputElement;
        const severityValue = document.getElementById('severity-value');
        if (severitySlider && severityValue) {
            severitySlider.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.detectionConfig.minimumSeverity = parseInt(target.value);
                severityValue.textContent = this.detectionConfig.minimumSeverity.toString();
                
                // Update description
                const description = document.querySelector('.severity-setting p');
                if (description) {
                    description.innerHTML = `Only errors with severity <strong>${this.detectionConfig.minimumSeverity}+</strong> will be flagged as actionable.
                        Lower values show more potential issues but may include minor concerns.`;
                }
            });
        }

        // Error type checkboxes
        const errorTypeCheckboxes = document.querySelectorAll('.error-type-checkbox') as NodeListOf<HTMLInputElement>;
        errorTypeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const errorType = target.dataset['errorType'] as LogicErrorType;
                
                if (target.checked) {
                    if (!this.detectionConfig.errorTypes.includes(errorType)) {
                        this.detectionConfig.errorTypes.push(errorType);
                    }
                } else {
                    this.detectionConfig.errorTypes = this.detectionConfig.errorTypes.filter(type => type !== errorType);
                }
            });
        });

        // Include empty leaves checkbox
        const includeEmptyCheckbox = document.getElementById('include-empty-checkbox') as HTMLInputElement;
        if (includeEmptyCheckbox) {
            includeEmptyCheckbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.detectionConfig.includeEmptyLeaves = target.checked;
            });
        }



        // Start analysis button
        const startAnalysisBtn = document.getElementById('start-analysis-btn');
        if (startAnalysisBtn) {
            startAnalysisBtn.addEventListener('click', async () => {
                // Immediately show loading state
                this.modalState = 'results';
                this.isLoading = true;
                this.updateModalContent();
                
                // Small delay to ensure UI updates before heavy computation
                await new Promise(resolve => setTimeout(resolve, 50));
                
                await this.startAnalysis();
            });
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancel-config-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.close();
            });
        }
    }

    /**
     * Set up results event listeners
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

        // Add to todo button
        const addTodoButtons = document.querySelectorAll('.add-todo-btn');
        addTodoButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target as HTMLElement;
                const errorId = target.dataset['errorId'];
                if (errorId && this.analysisResult) {
                    const error = this.analysisResult.errors.find(e => e.id === errorId);
                    if (error) {
                        void this.addErrorToTodo(error);
                    }
                }
            });
        });


    }

    /**
     * Start the analysis with current configuration
     */
    private async startAnalysis(): Promise<void> {
        // Validate configuration
        if (this.detectionConfig.errorTypes.length === 0) {
            this.isLoading = false;
            this.modalState = 'configuration';
            this.updateModalContent();
            alert('Please select at least one error type to check for.');
            return;
        }

        // Note: Loading state already set by button handler
        // Perform the analysis
        await this.performAnalysis();
    }

    /**
     * Update modal content after state changes
     */
    private updateModalContent(): void {
        console.log('🔄 Updating modal content, state:', this.modalState, 'loading:', this.isLoading);
        
        // Use BaseModal's element property - it MUST exist when this is called
        const contentElement = this.element!.querySelector('.modal-content')!;
        
        console.log('✅ Updating modal content HTML');
        contentElement.innerHTML = this.renderModalContent();
        this.setupEventListeners();
    }

    /**
     * Add a logic error to the parent node's todo list
     */
    private async addErrorToTodo(error: LogicError): Promise<void> {
        // Create references to the offending nodes
        const relatedNodes: TodoNodeReference[] = [];
        
        // Try to find actual node references for the offending leaf titles
        error.offendingLeaves.forEach(leafTitle => {
            const foundNode = this.findNodeByTitle(this.parentNode, leafTitle);
            if (foundNode) {
                relatedNodes.push({
                    id: foundNode.id,
                    title: foundNode.title
                });
            } else {
                // If we can't find the node, create a reference with just the title
                relatedNodes.push({
                    id: 'unknown',
                    title: leafTitle
                });
            }
        });

        // Create todo description
        const description = `${error.type.replace(/_/g, ' ').toUpperCase()}: ${error.description}`;
        
        // Add the todo to the parent node with full logic error details
        const logicErrorData = {
            type: error.type,
            severity: error.severity,
            justification: error.justification
        } as const;
        
        if (error.suggestedFix) {
            (logicErrorData as any).suggestedFix = error.suggestedFix;
        }
        
        const todo = this.parentNode.addTodo(description, relatedNodes, logicErrorData);
        
        console.log(`📝 Added logic error to todo list:`, todo);
        
        // Track that this error has been added to todos
        const errorId = this.createErrorIdentifier(error.type, error.severity, error.description);
        this.addedToTodoSet.add(errorId);
        
        // Refresh the modal content to show updated state
        this.updateModalContent();
        
        // Persist the changes and refresh UI
        await this.persistTodoChanges();
        
        // Show confirmation message
        const confirmation = document.createElement('div');
        confirmation.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            animation: slideIn 0.3s ease-out;
        `;
        confirmation.textContent = '✅ Added to todo list!';
        
        document.body.appendChild(confirmation);
        
        // Remove confirmation after 3 seconds
        setTimeout(() => {
            if (confirmation.parentNode) {
                confirmation.parentNode.removeChild(confirmation);
            }
        }, 3000);
        
        // Add CSS animation
        if (!document.getElementById('todo-confirmation-styles')) {
            const style = document.createElement('style');
            style.id = 'todo-confirmation-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Persist todo changes and refresh UI components
     */
    private async persistTodoChanges(): Promise<void> {
        try {
            // Get the active project manager
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject();
            
            if (projectManager) {
                // Save the project to storage
                await projectManager.saveToStorage();
                
                // Update the project tree to show todo indicators
                const { renderMultiProjectTree } = await import('../project-ui');
                renderMultiProjectTree();
                
                // Refresh any open NodeInspectorModal that might be showing this node
                this.refreshNodeInspectorIfOpen();
            }
        } catch (error) {
            console.error('Failed to persist todo changes:', error);
        }
    }

    /**
     * Refresh NodeInspectorModal if it's open and showing the same node
     */
    private refreshNodeInspectorIfOpen(): void {
        try {
            // Dispatch a custom event that the NodeInspectorModal can listen for
            const event = new CustomEvent('todoListChanged', {
                detail: { nodeId: this.parentNode.id }
            });
            window.dispatchEvent(event);
        } catch (error) {
            console.warn('Could not notify about todo changes:', error);
        }
    }

    /**
     * Find a node by title recursively
     */
    private findNodeByTitle(node: DocumentNode, title: string): DocumentNode | null {
        if (node.title === title) {
            return node;
        }
        
        for (const child of node.children) {
            const found = this.findNodeByTitle(child, title);
            if (found) {
                return found;
            }
        }
        
        return null;
    }
} 