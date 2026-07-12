import { 
    LogicError,
    LogicAnalysisResult,
    LogicErrorDetectionConfig,
    LogicErrorAIResponse,
    LogicErrorType,
    DEFAULT_LOGIC_ERROR_CONFIG,
    categorizeErrorBySeverity
} from '../../../types/LogicErrorTypes';
import { DocumentNode } from '../../../DocumentNode';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { TaskModelService } from '../../../services/TaskModelService';

export class LogicErrorDetectionService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private taskModelService: TaskModelService;
    private config: LogicErrorDetectionConfig;

    constructor(
        openRouterClient: OpenRouterClient,
        settingsManager: SettingsManager,
        config: Partial<LogicErrorDetectionConfig> = {}
    ) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.taskModelService = new TaskModelService(settingsManager);
        this.config = { ...DEFAULT_LOGIC_ERROR_CONFIG, ...config };
    }

    /**
     * Main method to analyze logic errors in leaf nodes
     */
    async analyzeLogicErrors(parentNode: DocumentNode): Promise<LogicAnalysisResult> {
        const timestamp = new Date();
        
        try {
            console.log(`🧩 Starting logic error analysis for: ${parentNode.title}`);
            
            // Collect all leaf nodes under the parent
            const leaves = this.collectDeepestLeaves(parentNode);
            
            if (leaves.length === 0) {
                return {
                    parentNode,
                    errors: [],
                    leavesAnalyzed: 0,
                    totalLeafContent: 0,
                    timestamp,
                    errorsByType: this.createEmptyErrorsByType(),
                    errorsByCategory: { critical: 0, major: 0, minor: 0 },
                    actionableErrors: 0,
                    analysisError: 'No leaf nodes found to analyze'
                };
            }

            console.log(`🧩 Found ${leaves.length} leaf nodes to analyze`);
            
            // Filter and prepare leaves for analysis
            const analysisLeaves = this.prepareLeaves(leaves);
            
            if (analysisLeaves.length === 0) {
                return {
                    parentNode,
                    errors: [],
                    leavesAnalyzed: 0,
                    totalLeafContent: 0,
                    timestamp,
                    errorsByType: this.createEmptyErrorsByType(),
                    errorsByCategory: { critical: 0, major: 0, minor: 0 },
                    actionableErrors: 0,
                    analysisError: 'No suitable leaf content found for analysis'
                };
            }

            // Format content for AI analysis
            const formattedContent = this.formatLeavesForAnalysis(analysisLeaves);
            const totalContent = formattedContent.length;
            
            console.log(`🧩 Formatted ${analysisLeaves.length} leaves (${totalContent} characters) for analysis`);
            
            // Build prompt and get AI analysis
            const prompt = this.buildLogicAnalysisPrompt(formattedContent, parentNode);
            
            // Use the rater model specifically configured for logic error analysis
            const modelPurpose = this.taskModelService.getModelPurposeForTask('logic_error_analysis', false);
            const response = await this.openRouterClient.chat(modelPurpose, prompt);
            
            // Parse AI response into structured errors
            const errors = this.parseAIResponse(response, analysisLeaves);
            
            // Calculate statistics
            const errorsByType = this.calculateErrorsByType(errors);
            const errorsByCategory = this.calculateErrorsByCategory(errors);
            const actionableErrors = errors.filter(e => e.severity >= this.config.minimumSeverity).length;
            
            console.log(`🧩 Analysis complete: ${errors.length} total errors, ${actionableErrors} actionable`);
            
            return {
                parentNode,
                errors,
                leavesAnalyzed: analysisLeaves.length,
                totalLeafContent: totalContent,
                timestamp,
                errorsByType,
                errorsByCategory,
                actionableErrors
            };

        } catch (error) {
            console.error('Logic error analysis failed:', error);
            return {
                parentNode,
                errors: [],
                leavesAnalyzed: 0,
                totalLeafContent: 0,
                timestamp,
                errorsByType: this.createEmptyErrorsByType(),
                errorsByCategory: { critical: 0, major: 0, minor: 0 },
                actionableErrors: 0,
                analysisError: error instanceof Error ? error.message : 'Unknown analysis error'
            };
        }
    }

    /**
     * Collect all deepest leaf nodes under a parent
     */
    private collectDeepestLeaves(node: DocumentNode): DocumentNode[] {
        const leaves: DocumentNode[] = [];
        
        const traverse = (currentNode: DocumentNode) => {
            if (this.isLeafNode(currentNode)) {
                leaves.push(currentNode);
            } else if (currentNode.children.length > 0) {
                for (const child of currentNode.children) {
                    traverse(child);
                }
            }
        };
        
        for (const child of node.children) {
            traverse(child);
        }
        
        return leaves;
    }

    /**
     * Check if a node is a leaf (has no children or only empty children)
     */
    private isLeafNode(node: DocumentNode): boolean {
        if (node.children.length === 0) {
            return true;
        }
        
        // Also consider nodes with only empty children as leaves
        return node.children.every(child => 
            child.children.length === 0 && 
            child.content.trim().length === 0
        );
    }

    /**
     * Prepare leaves for analysis by filtering
     */
    private prepareLeaves(leaves: DocumentNode[]): DocumentNode[] {
        let prepared = leaves;
        
        // Filter out empty leaves if configured
        if (!this.config.includeEmptyLeaves) {
            prepared = prepared.filter(leaf => 
                leaf.content && leaf.content.trim().length > 0
            );
        }
        
        // Limit total number of leaves
        if (prepared.length > this.config.maxLeavesPerAnalysis) {
            console.warn(`🧩 Too many leaves (${prepared.length}), limiting to ${this.config.maxLeavesPerAnalysis}`);
            prepared = prepared.slice(0, this.config.maxLeavesPerAnalysis);
        }
        
        return prepared;
    }

    /**
     * Format leaves with clear title markers for AI analysis
     */
    private formatLeavesForAnalysis(leaves: DocumentNode[]): string {
        return leaves.map(leaf => {
            const titleMarker = this.createTitleMarker(leaf.title);
            const content = leaf.content || '[No content]';
            return `${titleMarker}\n${content}\n`;
        }).join('\n');
    }

    /**
     * Create a clear title marker for content sections
     */
    private createTitleMarker(title: string): string {
        return `===Title: ${title} ===`;
    }

    /**
     * Build the AI prompt for logic error analysis
     */
    private buildLogicAnalysisPrompt(formattedContent: string, parentNode: DocumentNode): string {
        const prompts = this.settingsManager.getPrompts();
        const language = this.settingsManager.getLanguage();
        
        // Get parent node context
        const parentContext = this.buildParentContext(parentNode);
        
        return prompts.logic_error_analysis
            .replace('{{formatted_leaves}}', formattedContent)
            .replace('{{parent_context}}', parentContext)
            .replace('{{language}}', language)
            .replace('{{error_types}}', this.config.errorTypes.join(', '));
    }

    /**
     * Build context information from parent node
     */
    private buildParentContext(parentNode: DocumentNode): string {
        const contextParts: string[] = [];
        
        // Add the parent node's content if it exists
        if (parentNode.content && parentNode.content.trim().length > 0) {
            contextParts.push(`PARENT SECTION CONTENT:\nTitle: ${parentNode.title}\nContent: ${parentNode.content.trim()}`);
        } else {
            contextParts.push(`PARENT SECTION:\nTitle: ${parentNode.title}\n(This section serves as a container for the content below)`);
        }
        
        // Add basic path context
        const pathInfo = this.getNodePath(parentNode);
        contextParts.push(`STORY STRUCTURE:\n${pathInfo}`);
        
        return contextParts.join('\n\n');
    }

    /**
     * Get contextual path information for the node
     */
    private getNodePath(node: DocumentNode): string {
        // For now, just show the immediate title and level
        // Future enhancement: could accept full path from calling modal
        return `Section: "${node.title}" (Level ${node.level})`;
    }

    /**
     * Parse AI response into structured logic errors
     */
    private parseAIResponse(response: string, leaves: DocumentNode[]): LogicError[] {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }

            const parsed: LogicErrorAIResponse = JSON.parse(jsonMatch[0]);
            
            if (!Array.isArray(parsed.errors)) {
                console.warn('Invalid errors array in AI response');
                return [];
            }

            const logicErrors: LogicError[] = [];
            const leafTitles = leaves.map(leaf => leaf.title);

            for (const item of parsed.errors) {
                // Validate error type
                if (!this.isValidErrorType(item.type)) {
                    console.warn(`Invalid error type: ${item.type}`);
                    continue;
                }

                // Validate offending leaves exist
                const validOffendingLeaves = item.offendingLeaves.filter(title => 
                    leafTitles.includes(title)
                );

                if (validOffendingLeaves.length === 0) {
                    console.warn(`No valid leaf titles found for error: ${item.description}`);
                    continue;
                }

                // Create structured error
                const logicError: LogicError = {
                    id: this.generateErrorId(),
                    type: item.type,
                    severity: Math.max(1, Math.min(10, Math.round(item.severity))), // Clamp to 1-10
                    category: categorizeErrorBySeverity(item.severity),
                    description: item.description,
                    justification: item.justification,
                    offendingLeaves: validOffendingLeaves,
                    reviewed: false,
                    resolved: false,
                    ...(item.suggestedFix && { suggestedFix: item.suggestedFix })
                };

                logicErrors.push(logicError);
            }

            return logicErrors;

        } catch (error) {
            console.error('Failed to parse AI response:', error);
            console.log('Raw response:', response);
            return [];
        }
    }

    /**
     * Generate a unique ID for an error
     */
    private generateErrorId(): string {
        return `logic_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Validate if an error type is supported
     */
    private isValidErrorType(type: string): type is LogicErrorType {
        const validTypes: LogicErrorType[] = [
            'plot_hole',
            'character_contradiction',
            'timeline_inconsistency',
            'logical_inconsistency',
            'factual_error',
            'continuity_error'
        ];
        return validTypes.includes(type as LogicErrorType);
    }

    /**
     * Calculate error counts by type
     */
    private calculateErrorsByType(errors: LogicError[]): Record<LogicErrorType, number> {
        const counts = this.createEmptyErrorsByType();
        
        for (const error of errors) {
            counts[error.type]++;
        }
        
        return counts;
    }

    /**
     * Calculate error counts by category
     */
    private calculateErrorsByCategory(errors: LogicError[]): Record<string, number> {
        const counts = { critical: 0, major: 0, minor: 0 };
        
        for (const error of errors) {
            counts[error.category]++;
        }
        
        return counts;
    }

    /**
     * Create empty error type counts
     */
    private createEmptyErrorsByType(): Record<LogicErrorType, number> {
        return {
            'plot_hole': 0,
            'character_contradiction': 0,
            'timeline_inconsistency': 0,
            'logical_inconsistency': 0,
            'factual_error': 0,
            'continuity_error': 0
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<LogicErrorDetectionConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): LogicErrorDetectionConfig {
        return { ...this.config };
    }
} 