import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { ContextAnalysisRequest, ContextAnalysisResult, ContextIssue } from '../../../types/ContextAdjusterTypes';
import { ProjectManager } from '../../../ProjectManager';
import { getContextItems } from '../../../ContextFormat';
import { TaskModelService } from '../../../services/TaskModelService';

export class ContextAdjusterService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private taskModelService: TaskModelService;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.taskModelService = new TaskModelService(settingsManager);
    }

    /**
     * Check if a node is eligible for context analysis
     */
    isNodeEligible(node: DocumentNode): boolean {
        // Any node with a parent can have its inherited context analyzed and adjusted
        // Root nodes don't inherit context, so they don't need context adjustment
        return node.parentId !== null && node.parentId !== undefined;
    }

    /**
     * Get reason why a node is not eligible for context adjustment
     */
    getIneligibilityReason(node: DocumentNode): string {
        if (!node.parentId) {
            return 'Root nodes do not inherit context and therefore do not need context adjustment';
        }
        return 'Node is eligible for context adjustment';
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
     * Perform context analysis using AI with retry logic
     */
    async analyzeContext(node: DocumentNode, projectManager: ProjectManager): Promise<ContextAnalysisResult> {
        if (!this.isNodeEligible(node)) {
            throw new Error(this.getIneligibilityReason(node));
        }

        const request = this.prepareAnalysisRequest(node, projectManager);
        const contextCheck = this.checkContextMismatch(node, projectManager);
        
        // Format context items as numbered list, filtering out items that start with "*"
        const allContextItems = getContextItems(node.context || '');
        
        // Create filtered list (exclude items starting with "*") and mapping
        const filteredContextItems: string[] = [];
        const filteredToOriginalMapping: number[] = []; // Maps filtered index to original index
        
        allContextItems.forEach((item, originalIndex) => {
            if (!item.trim().startsWith('*')) {
                filteredContextItems.push(item);
                filteredToOriginalMapping.push(originalIndex);
            }
        });
        
        const filteredCount = allContextItems.length - filteredContextItems.length;
        if (filteredCount > 0) {
            console.log(`🔒 Context analysis: Filtered out ${filteredCount} protected context item(s) starting with "*"`);
        }
        
        // If all items are filtered out, skip analysis
        if (filteredContextItems.length === 0) {
            console.log(`📋 Context analysis: All context items are protected (start with "*") - skipping analysis`);
            return {
                issues: [],
                hasIssues: false,
                analysisTimestamp: new Date(),
                nodeId: node.id,
                originalContext: node.context || '',
                contextMismatch: contextCheck.hasMismatch
            };
        }
        
        const numberedContextItems = filteredContextItems.map((item, index) => `${index + 1}: ${item}`).join('\n\n');
        
        // Create analysis prompt
        const prompts = this.settingsManager.getPrompts();
        const analysisPrompt = prompts.context_analysis
            .replace(/\{\{node_title\}\}/g, request.nodeTitle)
            .replace(/\{\{node_content\}\}/g, request.nodeContent)
            .replace(/\{\{numbered_context_items\}\}/g, numberedContextItems)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        // Use configurable model based on template-defined leaf status, not current children count
        const isLeaf = node.isLeaf;
        const modelPurpose = this.taskModelService.getModelPurposeForTask('context_adjustment', isLeaf);
        
        console.log(`🔍 Using ${modelPurpose} model for context analysis of ${isLeaf ? 'template-leaf' : 'template-branch'} node "${node.title}"`);
        
        // Retry logic (similar to LoopOrchestrator)
        const maxRetries = 3;
        let lastResponse = '';
        let issues: ContextIssue[] | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                lastResponse = await this.openRouterClient.chat(modelPurpose, analysisPrompt);
            
            // Parse JSON response with mapping from filtered to original indices
                issues = this.parseAnalysisResponse(lastResponse, filteredToOriginalMapping);
                
                if (issues !== null) {
                    break; // Success
                }
                
                console.warn(`Context analysis response parsing failed on attempt ${attempt + 1} for node "${node.title}". Retrying...`);
                
            } catch (error) {
                // Check for abort conditions first (like LoopOrchestrator)
                if (error instanceof Error && (
                    error.message === 'Request was aborted' || 
                    error.message.includes('aborted') ||
                    error.name === 'AbortError'
                )) {
                    console.log(`🛑 ContextAdjusterService: Context analysis aborted during attempt ${attempt + 1} for node "${node.title}"`);
                    throw new Error('Context analysis was aborted by user');
                }
                
                // Check if this is a parsing error (our parseAnalysisResponse method throws)
                if (error instanceof Error && error.message.includes('parse')) {
                    console.warn(`Context analysis response parsing failed on attempt ${attempt + 1} for node "${node.title}". Retrying...`, error);
                    continue; // Try again
                }
                
                // If it's not a parsing error or abort, it's likely a network/API error
                console.warn(`Context analysis API call failed on attempt ${attempt + 1} for node "${node.title}". Retrying...`, error);
                
                // Don't retry on the last attempt
                if (attempt === maxRetries - 1) {
                    throw error;
                }
            }
        }
        
        // If we still don't have issues after all retries, throw an error
        if (issues === null) {
            throw new Error(`Context analysis failed after ${maxRetries} retries. The AI response may be malformed.\n\nLast AI Response:\n"${lastResponse}"`);
        }
            
            return {
                issues,
                hasIssues: issues.length > 0,
                analysisTimestamp: new Date(),
                nodeId: node.id,
                originalContext: node.context || '',
                contextMismatch: contextCheck.hasMismatch
            };
    }

    /**
     * Parse AI response and extract context issues
     * Returns null if parsing fails (for retry logic)
     * @param response AI response containing JSON array of issues
     * @param filteredToOriginalMapping Array mapping filtered indices to original indices
     */
    private parseAnalysisResponse(response: string, filteredToOriginalMapping: number[]): ContextIssue[] | null {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('No JSON array found in response');
                return null;
            }

            const parsed = JSON.parse(jsonMatch[0]);
            
            if (!Array.isArray(parsed)) {
                console.warn('Response is not an array');
                return null;
            }

            // Validate and normalize issues
            const issues: ContextIssue[] = [];
            
            for (let index = 0; index < parsed.length; index++) {
                const item = parsed[index];
                
                if (!item || typeof item !== 'object') {
                    console.warn(`Invalid context issue at index ${index}`);
                    return null;
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

                // Convert AI's filtered item number to original item number
                const filteredItemNumber = Number(item.item_number) || Number(item.number) || 0;
                let originalItemNumber = 0;
                if (filteredItemNumber > 0 && filteredItemNumber <= filteredToOriginalMapping.length) {
                    const originalIndex = filteredToOriginalMapping[filteredItemNumber - 1];
                    originalItemNumber = originalIndex !== undefined ? originalIndex + 1 : 0; // Convert to 1-based
                }
                
                const issue: ContextIssue = {
                    item_number: originalItemNumber,
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
                    return null;
                }

                issues.push(issue);
            }
            
            return issues;
            
        } catch (error) {
            console.warn('Failed to parse context analysis response:', error);
            console.warn('Response content:', response);
            return null;
        }
    }
} 