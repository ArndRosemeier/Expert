import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';

import { 
    RedundancyDetection, 
    RedundancyAnalysisResult, 
    RedundancyAIResponse, 
    RedundancyDetectionConfig, 
    DEFAULT_REDUNDANCY_CONFIG 
} from '../../../types/RedundancyTypes';
export class RedundancyDetectionService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private config: RedundancyDetectionConfig;

    constructor(
        openRouterClient: OpenRouterClient, 
        settingsManager: SettingsManager,
        config: Partial<RedundancyDetectionConfig> = {}
    ) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.config = { ...DEFAULT_REDUNDANCY_CONFIG, ...config };
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
                    analysisError: 'Not enough suitable children for analysis'
                };
            }

            // Build prompt with all siblings
            const prompt = this.buildRedundancyPrompt(children);
            
            // Get AI analysis
            const response = await this.openRouterClient.chat(prompt, 'redundancy_detection');
            
            // Parse response
            const redundancies = this.parseAIResponse(response, children);
            
            return {
                parentNode,
                redundancies,
                timestamp,
                hasRedundantNodes: redundancies.length > 0,
                childrenAnalyzed: children.length,
            };

        } catch (error) {
            console.error('Redundancy analysis failed:', error);
            return {
                parentNode,
                redundancies: [],
                timestamp,
                hasRedundantNodes: false,
                childrenAnalyzed: 0,
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
                // Validate redundancy score threshold
                if (item.redundancy < this.config.minimumRedundancyThreshold) {
                    continue;
                }

                // Parse node identifiers (e.g., "Node2-Node3")
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
            await projectManager.deleteNode(nodeId);
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