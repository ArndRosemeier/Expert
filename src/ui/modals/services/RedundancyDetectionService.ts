import { 
    RedundancyDetection,
    RedundancyAnalysisResult,
    RedundancyAIResponse,
    RedundancyDetectionConfig,
    RecursiveRedundancyResult,
    RecursiveRedundancyConfig,
    RedundancyAnalysisProgress,
    DEFAULT_RECURSIVE_REDUNDANCY_CONFIG,
    DEFAULT_REDUNDANCY_CONFIG
} from '../../../types/RedundancyTypes';
import { DocumentNode } from '../../../DocumentNode';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { TaskModelService } from '../../../services/TaskModelService';

export class RedundancyDetectionService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private taskModelService: TaskModelService;
    private config: RedundancyDetectionConfig;
    private recursiveConfig: RecursiveRedundancyConfig;
    private progressCallback?: (progress: RedundancyAnalysisProgress) => void;

    constructor(
        openRouterClient: OpenRouterClient, 
        settingsManager: SettingsManager,
        config: Partial<RedundancyDetectionConfig> = {},
        recursiveConfig: Partial<RecursiveRedundancyConfig> = {}
    ) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.taskModelService = new TaskModelService(settingsManager);
        this.config = { ...DEFAULT_REDUNDANCY_CONFIG, ...config };
        this.recursiveConfig = { ...DEFAULT_RECURSIVE_REDUNDANCY_CONFIG, ...recursiveConfig };
    }

    /**
     * Set progress callback for recursive analysis
     */
    setProgressCallback(callback: (progress: RedundancyAnalysisProgress) => void): void {
        this.progressCallback = callback;
    }

    /**
     * Update recursive configuration
     */
    updateRecursiveConfig(config: Partial<RecursiveRedundancyConfig>): void {
        this.recursiveConfig = { ...this.recursiveConfig, ...config };
    }

    /**
     * Main method for recursive redundancy analysis
     */
    async analyzeRecursive(rootNode: DocumentNode): Promise<RecursiveRedundancyResult> {
        const startTime = Date.now();
        const timestamp = new Date();
        const analysisResults = new Map<string, RedundancyAnalysisResult>();
        const allRedundancies: RedundancyDetection[] = [];
        const errors: string[] = [];
        
        try {
            // Phase 1: Discover all nodes to analyze
            this.updateProgress({
                phase: 'discovering',
                currentNode: rootNode.title,
                totalNodes: 0,
                completedNodes: 0,
                percentage: 0,
                currentDepth: 0,
                redundanciesFound: 0,
                message: 'Discovering nodes to analyze...'
            });

            const nodesToAnalyze = this.discoverNodesToAnalyze(rootNode);
            
            this.updateProgress({
                phase: 'analyzing',
                currentNode: '',
                totalNodes: nodesToAnalyze.length,
                completedNodes: 0,
                percentage: 0,
                currentDepth: 1,
                redundanciesFound: 0,
                message: `Found ${nodesToAnalyze.length} nodes to analyze${this.recursiveConfig.analyzeEntireProject ? ' across entire project' : ` within ${this.recursiveConfig.maxDepth} level${this.recursiveConfig.maxDepth === 1 ? '' : 's'}`}`
            });

            // Phase 2: Analyze each eligible node
            let completedCount = 0;
            for (const { node, depth } of nodesToAnalyze) {
                try {
                    this.updateProgress({
                        phase: 'analyzing',
                        currentNode: node.title,
                        totalNodes: nodesToAnalyze.length,
                        completedNodes: completedCount,
                        percentage: Math.round((completedCount / nodesToAnalyze.length) * 100),
                        currentDepth: depth,
                        redundanciesFound: allRedundancies.length,
                        message: `Analyzing: ${node.title} (depth ${depth})`
                    });

                    // Only analyze if node has eligible children
                    if (this.isNodeEligible(node)) {
                        const result = await this.analyzeSiblings(node);
                        analysisResults.set(node.id, result);
                        
                        // Collect redundancies above threshold
                        const aboveThreshold = result.redundancies.filter(r => 
                            r.redundancyScore >= this.recursiveConfig.minimumRedundancyThreshold
                        );
                        allRedundancies.push(...aboveThreshold);
                        
                        // Small delay to prevent overwhelming the API
                        if (nodesToAnalyze.length > 5) {
                            await this.delay(100);
                        }
                    }
                } catch (error) {
                    const errorMsg = `Failed to analyze ${node.title}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    console.error(errorMsg);
                }
                
                completedCount++;
                
                // Update progress
                this.updateProgress({
                    phase: 'analyzing',
                    currentNode: node.title,
                    totalNodes: nodesToAnalyze.length,
                    completedNodes: completedCount,
                    percentage: Math.round((completedCount / nodesToAnalyze.length) * 100),
                    currentDepth: depth,
                    redundanciesFound: allRedundancies.length,
                    message: `Completed: ${node.title}`
                });
            }

            // Phase 3: Processing results
            this.updateProgress({
                phase: 'processing',
                currentNode: '',
                totalNodes: nodesToAnalyze.length,
                completedNodes: completedCount,
                percentage: 100,
                currentDepth: 0,
                redundanciesFound: allRedundancies.length,
                message: 'Processing results...'
            });

            const result: RecursiveRedundancyResult = {
                rootNode,
                analysisResults,
                allRedundancies,
                totalNodesAnalyzed: completedCount,
                totalRedundantNodes: allRedundancies.length,
                timestamp,
                config: this.recursiveConfig,
                errors
            };

            // Phase 4: Complete
            this.updateProgress({
                phase: 'complete',
                currentNode: '',
                totalNodes: nodesToAnalyze.length,
                completedNodes: completedCount,
                percentage: 100,
                currentDepth: 0,
                redundanciesFound: allRedundancies.length,
                message: `Analysis complete! Found ${allRedundancies.length} redundancies in ${Math.round((Date.now() - startTime) / 1000)}s`
            });

            return result;

        } catch (error) {
            const errorMsg = `Recursive analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            
            return {
                rootNode,
                analysisResults,
                allRedundancies,
                totalNodesAnalyzed: analysisResults.size,
                totalRedundantNodes: allRedundancies.length,
                timestamp,
                config: this.recursiveConfig,
                errors
            };
        }
    }

    /**
     * Discover all nodes that should be analyzed within the depth limit
     */
    private discoverNodesToAnalyze(rootNode: DocumentNode): Array<{ node: DocumentNode; depth: number }> {
        const nodesToAnalyze: Array<{ node: DocumentNode; depth: number }> = [];
        
        const traverse = (node: DocumentNode, currentDepth: number) => {
            // Check if this node should be analyzed (has eligible children)
            if (this.isNodeEligible(node)) {
                nodesToAnalyze.push({ node, depth: currentDepth });
            }
            
            // Continue to children based on mode:
            // - If analyzing entire project: traverse all children regardless of depth
            // - If limited analysis: respect depth limit
            const shouldContinue = this.recursiveConfig.analyzeEntireProject 
                ? node.children && node.children.length > 0
                : currentDepth < this.recursiveConfig.maxDepth && node.children;
                
            if (shouldContinue) {
                for (const child of node.children!) {
                    traverse(child, currentDepth + 1);
                }
            }
        };
        
        if (this.recursiveConfig.analyzeEntireProject) {
            // Start from root with depth 1 - analyze ENTIRE project tree
            traverse(rootNode, 1);
        } else {
            // Start from immediate children with depth 1 - respect depth limit
            if (rootNode.children) {
                for (const child of rootNode.children) {
                    traverse(child, 1);
                }
            }
        }
        
        return nodesToAnalyze;
    }

    /**
     * Update progress and notify callback
     */
    private updateProgress(progress: RedundancyAnalysisProgress): void {
        if (this.progressCallback) {
            this.progressCallback(progress);
        }
    }

    /**
     * Simple delay utility
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if a node is eligible for redundancy analysis
     */
    isNodeEligible(node: DocumentNode): boolean {
        if (!node.children || node.children.length < 2) {
            return false;
        }

        // Count children with actual content
        const childrenWithContent = node.children.filter(child => 
            this.config.includeEmptyNodes || (child.content && child.content.trim().length > 0)
        );

        return childrenWithContent.length >= 2;
    }

    /**
     * Get the reason why a node is not eligible (for user feedback)
     */
    getIneligibilityReason(node: DocumentNode): string {
        if (!node.children || node.children.length === 0) {
            return 'This node has no children to analyze.';
        }

        if (node.children.length < 2) {
            return 'This node needs at least 2 children for redundancy analysis.';
        }

        const childrenWithContent = node.children.filter(child => 
            child.content && child.content.trim().length > 0
        );

        if (childrenWithContent.length < 2) {
            return 'This node needs at least 2 children with content for analysis.';
        }

        return 'This node is eligible for analysis.';
    }

    /**
     * Main method to analyze siblings for redundancy
     */
    async analyzeSiblings(parentNode: DocumentNode): Promise<RedundancyAnalysisResult> {
        const timestamp = new Date();
        
        try {
            // Validate eligibility
            if (!this.isNodeEligible(parentNode)) {
                return {
                    parentNode,
                    redundancies: [],
                    timestamp,
                    hasRedundantNodes: false,
                    childrenAnalyzed: 0,
                    thresholdUsed: this.config.minimumRedundancyThreshold,
                    analysisError: this.getIneligibilityReason(parentNode)
                };
            }

            // Prepare children for analysis
            const children = this.prepareChildrenForAnalysis(parentNode.children);
            
            if (children.length < 2) {
                return {
                    parentNode,
                    redundancies: [],
                    timestamp,
                    hasRedundantNodes: false,
                    childrenAnalyzed: children.length,
                    thresholdUsed: this.config.minimumRedundancyThreshold,
                    analysisError: 'Not enough suitable children for analysis'
                };
            }

            // Build prompt with all siblings
            const prompt = this.buildRedundancyPrompt(children);
            
            // Get AI analysis using proper task model configuration
            // Use context_rating task since redundancy detection is an analytical/rating task
            const modelPurpose = this.taskModelService.getModelPurposeForTask('context_rating', false);
            const response = await this.openRouterClient.chat(modelPurpose, prompt);
            
            // Parse response
            const redundancies = this.parseAIResponse(response, children);
            
            // Only count redundancies above threshold as "actionable"
            const aboveThresholdCount = redundancies.filter(r => 
                r.redundancyScore >= this.config.minimumRedundancyThreshold
            ).length;

            return {
                parentNode,
                redundancies,
                timestamp,
                hasRedundantNodes: aboveThresholdCount > 0,
                childrenAnalyzed: children.length,
                thresholdUsed: this.config.minimumRedundancyThreshold,
            };

        } catch (error) {
            console.error('Redundancy analysis failed:', error);
            return {
                parentNode,
                redundancies: [],
                timestamp,
                hasRedundantNodes: false,
                childrenAnalyzed: 0,
                thresholdUsed: this.config.minimumRedundancyThreshold,
                analysisError: error instanceof Error ? error.message : 'Unknown analysis error'
            };
        }
    }

    /**
     * Prepare children for analysis (filter content)
     */
    private prepareChildrenForAnalysis(children: DocumentNode[]): DocumentNode[] {
        return children
            .filter(child => {
                // Include nodes with content, or empty nodes if configured
                return this.config.includeEmptyNodes || 
                       (child.content && child.content.trim().length > 0);
            });
    }

    /**
     * Build the prompt for redundancy analysis
     */
    private buildRedundancyPrompt(children: DocumentNode[]): string {
        const siblingNodes = children.map((child, index) => {
            // Truncate content to avoid huge prompts
            const content = child.content || '[No content]';
            const truncatedContent = content.length > this.config.maxContentLength 
                ? content.substring(0, this.config.maxContentLength) + '...'
                : content;
            
            return `Node ${index + 1}: "${child.title}"
Content: ${truncatedContent}`;
        }).join('\n\n---\n\n');

        const prompts = this.settingsManager.getPrompts();
        return prompts.redundancy_detection.replace('{{sibling_nodes}}', siblingNodes);
    }

    /**
     * Parse AI response into structured redundancy detections
     */
    private parseAIResponse(response: string, children: DocumentNode[]): RedundancyDetection[] {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }

            const parsed: RedundancyAIResponse = JSON.parse(jsonMatch[0]);
            
            if (!parsed.redundancies || !Array.isArray(parsed.redundancies)) {
                console.warn('Invalid redundancies array in AI response');
                return [];
            }

            const detections: RedundancyDetection[] = [];

            for (const item of parsed.redundancies) {
                // Parse node identifiers (e.g., "Node2-Node3") - no threshold filtering here
                const nodeResult = this.parseNodePair(item.pair, item.deleteNode, children);
                if (!nodeResult) {
                    console.warn(`Could not parse node pair: ${item.pair}`);
                    continue;
                }

                detections.push({
                    nodeToKeep: nodeResult.nodeToKeep,
                    nodeToDelete: nodeResult.nodeToDelete,
                    redundancyScore: item.redundancy,
                    reasoning: item.reasoning || 'No reasoning provided',
                    plotLoss: item.plotLoss || 'none'
                });
            }

            return detections;

        } catch (error) {
            console.error('Failed to parse AI response:', error);
            console.log('Raw response:', response);
            return [];
        }
    }

    /**
     * Parse node pair string and identify which nodes to keep/delete
     */
    private parseNodePair(
        pairString: string, 
        deleteNodeString: string, 
        children: DocumentNode[]
    ): { nodeToKeep: DocumentNode; nodeToDelete: DocumentNode } | null {
        try {
            // Parse pair like "Node2-Node3"
            const pairMatch = pairString.match(/Node(\d+)-Node(\d+)/);
            if (!pairMatch) return null;

            const index1 = parseInt(pairMatch[1]!, 10) - 1; // Convert to 0-based
            const index2 = parseInt(pairMatch[2]!, 10) - 1;

            // Parse delete node like "Node3"
            const deleteMatch = deleteNodeString.match(/Node(\d+)/);
            if (!deleteMatch || !deleteMatch[1]) return null;

            const deleteIndex = parseInt(deleteMatch[1], 10) - 1;

            // Validate indices
            if (index1 < 0 || index1 >= children.length ||
                index2 < 0 || index2 >= children.length ||
                deleteIndex < 0 || deleteIndex >= children.length) {
                return null;
            }

            // Determine which node to keep
            const nodeToDelete = children[deleteIndex];
            const nodeToKeep = deleteIndex === index1 ? children[index2] : children[index1];

            if (!nodeToDelete || !nodeToKeep) {
                return null;
            }

            return { nodeToKeep, nodeToDelete };

        } catch (error) {
            console.error('Error parsing node pair:', error);
            return null;
        }
    }

    /**
     * Delete a redundant node safely
     */
    async deleteRedundantNode(nodeId: string, projectManager: any): Promise<boolean> {
        try {
            const nodeToDelete = projectManager.findNodeById(nodeId);
            if (!nodeToDelete) {
                throw new Error('Node not found');
            }

            if (!nodeToDelete.parentId) {
                throw new Error('Cannot delete root node');
            }

            // Perform the deletion
            const deleteSuccess = projectManager.removeNode(nodeId);
            if (!deleteSuccess) {
                throw new Error('Failed to remove node from tree');
            }
            await projectManager.saveToStorage();
            
            console.log(`🗑️ Deleted redundant node: ${nodeToDelete.title}`);
            return true;

        } catch (error) {
            console.error('Failed to delete redundant node:', error);
            return false;
        }
    }

    /**
     * Get configuration for debugging
     */
    getConfig(): RedundancyDetectionConfig {
        return { ...this.config };
    }
} 