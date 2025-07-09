import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { ContextAnalysisRequest, ContextAnalysisResult, ContextIssue } from '../../../types/ContextAdjusterTypes';
import { ProjectManager } from '../../../ProjectManager';
import { getContextItems } from '../../../ContextFormat';

export class ContextAdjusterService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
    }

    /**
     * Check if a node is eligible for context analysis
     */
    isNodeEligible(node: DocumentNode, projectManager: ProjectManager): boolean {
        // Node is eligible if it has both content and context to analyze
        const hasContent = !!(node.content?.trim() && node.content.trim().length > 0);
        const hasContext = !!(node.context?.trim() && node.context.trim().length > 0);
        
        return hasContent && hasContext;
    }

    /**
     * Get the reason why a node is not eligible (for user feedback)
     */
    getIneligibilityReason(node: DocumentNode, projectManager: ProjectManager): string {
        const hasContent = node.content?.trim() && node.content.trim().length > 0;
        const hasContext = node.context?.trim() && node.context.trim().length > 0;

        if (!hasContent) {
            return 'This node has no content to analyze.';
        }

        if (!hasContext) {
            return 'This node has no context to analyze.';
        }

        return 'Node is not eligible for context analysis.';
    }

    /**
     * Check if node context differs from actual parent context
     */
    checkContextMismatch(node: DocumentNode, projectManager: ProjectManager): { hasMismatch: boolean; parentContext: string } {
        const parentNode = node.parentId ? projectManager.findNodeById(node.parentId) : null;
        const actualParentContext = parentNode?.context || '';
        const nodeContext = node.context || '';
        
        return {
            hasMismatch: actualParentContext !== nodeContext,
            parentContext: actualParentContext
        };
    }

    /**
     * Prepare analysis request from node
     */
    private prepareAnalysisRequest(node: DocumentNode, projectManager: ProjectManager): ContextAnalysisRequest {
        const contextCheck = this.checkContextMismatch(node, projectManager);
        
        return {
            nodeContent: node.content || '',
            parentContext: contextCheck.parentContext,
            nodeTitle: node.title || 'Untitled Node',
            nodeId: node.id
        };
    }

    /**
     * Perform context analysis using AI
     */
    async analyzeContext(node: DocumentNode, projectManager: ProjectManager): Promise<ContextAnalysisResult> {
        if (!this.isNodeEligible(node, projectManager)) {
            throw new Error(this.getIneligibilityReason(node, projectManager));
        }

        const request = this.prepareAnalysisRequest(node, projectManager);
        const contextCheck = this.checkContextMismatch(node, projectManager);
        
        // Format context items as numbered list
        const contextItems = getContextItems(node.context || '');
        const numberedContextItems = contextItems.length > 0 
            ? contextItems.map((item, index) => `${index + 1}: ${item}`).join('\n\n')
            : 'No context items available';
        
        // Create analysis prompt
        const prompts = this.settingsManager.getPrompts();
        const analysisPrompt = prompts.context_analysis
            .replace(/\{\{node_title\}\}/g, request.nodeTitle)
            .replace(/\{\{node_content\}\}/g, request.nodeContent)
            .replace(/\{\{numbered_context_items\}\}/g, numberedContextItems)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        try {
            // Use creator model for analysis
            const response = await this.openRouterClient.chat('creator', analysisPrompt);
            
            // Parse JSON response
            const issues = this.parseAnalysisResponse(response);
            
            return {
                issues,
                hasIssues: issues.length > 0,
                analysisTimestamp: new Date(),
                nodeId: node.id,
                originalContext: node.context || '',
                contextMismatch: contextCheck.hasMismatch
            };
        } catch (error) {
            console.error('Context analysis failed:', error);
            throw new Error('Failed to analyze context. Please try again.');
        }
    }

    /**
     * Parse AI response and extract context issues
     */
    private parseAnalysisResponse(response: string): ContextIssue[] {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No JSON array found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            
            if (!Array.isArray(parsed)) {
                throw new Error('Response is not an array');
            }

            // Validate and normalize issues
            return parsed.map((item, index) => {
                if (!item || typeof item !== 'object') {
                    throw new Error(`Invalid context issue at index ${index}`);
                }

                // Handle possible field name variations for AI typos
                const problematicItem = item.problematic_context_item || 
                                      item.problem_context_item || 
                                      item.problematic_item || 
                                      item.context_item || 
                                      '';

                const reasonForProblem = item.reason_for_problem || 
                                       item.problem_reason || 
                                       item.reason || 
                                       '';

                const justification = item.justification || 
                                    item.explanation || 
                                    item.details || 
                                    '';

                const issue: ContextIssue = {
                    item_number: Number(item.item_number) || Number(item.number) || 0,
                    problematic_context_item: String(problematicItem).trim(),
                    reason_for_problem: String(reasonForProblem).trim(),
                    justification: String(justification).trim(),
                    severity: Number(item.severity) || 1
                };

                // Validate severity is between 1-10
                if (issue.severity < 1 || issue.severity > 10) {
                    issue.severity = Math.max(1, Math.min(10, issue.severity));
                }

                // Check if we have the essential fields (allow for AI typos)
                if (!issue.problematic_context_item || !issue.reason_for_problem || !issue.justification) {
                    console.warn(`Missing required fields in context issue at index ${index}:`, {
                        originalItem: item,
                        parsedIssue: issue
                    });
                    throw new Error(`Missing required fields in context issue at index ${index}`);
                }

                return issue;
            });
        } catch (error) {
            console.error('Failed to parse context analysis response:', error);
            console.error('Response content:', response);
            throw new Error('Failed to parse analysis results. The AI response may be malformed.');
        }
    }

    /**
     * Fix a context issue using AI
     */
    async fixContextIssue(
        node: DocumentNode,
        issue: ContextIssue,
        currentContext: string
    ): Promise<string> {
        const prompts = this.settingsManager.getPrompts();
        
        // Create fix prompt
        const fixPrompt = prompts.context_fix
            .replace(/\{\{node_title\}\}/g, node.title || 'Untitled Node')
            .replace(/\{\{node_content\}\}/g, node.content || '')
            .replace(/\{\{current_context\}\}/g, currentContext)
            .replace(/\{\{problematic_item\}\}/g, issue.problematic_context_item)
            .replace(/\{\{problem_reason\}\}/g, issue.reason_for_problem)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        try {
            // Use creator model for context editing
            const response = await this.openRouterClient.chat('creator', fixPrompt);
            
            return response.trim();
        } catch (error) {
            console.error('Failed to fix context issue:', error);
            throw new Error('Failed to fix context issue. Please try again.');
        }
    }
} 