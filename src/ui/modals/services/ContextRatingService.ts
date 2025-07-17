import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { ContextRatingRequest, ContextRatingResult, ContextRating } from '../../../types/ContextRatingTypes';
import { ProjectManager } from '../../../ProjectManager';
import { getContextItems } from '../../../ContextFormat';
import { TaskModelService } from '../../../services/TaskModelService';

export class ContextRatingService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private taskModelService: TaskModelService;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.taskModelService = new TaskModelService(settingsManager);
    }

    /**
     * Check if a node is eligible for context rating
     */
    isNodeEligible(node: DocumentNode): boolean {
        // Any node with a parent can have its inherited context rated
        // Root nodes don't inherit context, so they don't need context rating
        return node.parentId !== null && node.parentId !== undefined;
    }

    /**
     * Get reason why a node is not eligible for context rating
     */
    getIneligibilityReason(node: DocumentNode): string {
        if (!node.parentId) {
            return 'Root nodes do not inherit context and therefore do not need context rating';
        }
        return 'Node is eligible for context rating';
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
     * Prepare rating request from node
     */
    private prepareRatingRequest(node: DocumentNode, projectManager: ProjectManager): ContextRatingRequest {
        const contextCheck = this.checkContextMismatch(node, projectManager);
        
        return {
            nodeContent: node.content || '',
            parentContext: contextCheck.parentContext,
            nodeTitle: node.title || 'Untitled Node',
            nodeId: node.id
        };
    }

    /**
     * Perform context rating using AI with retry logic
     */
    async rateContext(node: DocumentNode, projectManager: ProjectManager): Promise<ContextRatingResult> {
        if (!this.isNodeEligible(node)) {
            throw new Error(this.getIneligibilityReason(node));
        }

        const request = this.prepareRatingRequest(node, projectManager);
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
            console.log(`🔒 Context rating: Filtered out ${filteredCount} protected context item(s) starting with "*"`);
        }
        
        // If all items are filtered out, skip rating
        if (filteredContextItems.length === 0) {
            console.log(`📋 Context rating: All context items are protected (start with "*") - skipping rating`);
            return {
                ratings: [],
                analysisTimestamp: new Date(),
                nodeId: node.id,
                originalContext: node.context || '',
                contextMismatch: contextCheck.hasMismatch
            };
        }
        
        const numberedContextItems = filteredContextItems.map((item, index) => `${index + 1}: ${item}`).join('\n\n');
        
        // Create rating prompt
        const prompts = this.settingsManager.getPrompts();
        const ratingPrompt = prompts.context_rating
            .replace(/\{\{node_title\}\}/g, request.nodeTitle)
            .replace(/\{\{node_content\}\}/g, request.nodeContent)
            .replace(/\{\{numbered_context_items\}\}/g, numberedContextItems)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        // Use configurable model based on template-defined leaf status, not current children count
        const isLeaf = node.isLeaf;
        const modelPurpose = this.taskModelService.getModelPurposeForTask('context_rating', isLeaf);
        
        console.log(`🎯 Using ${modelPurpose} model for context rating of ${isLeaf ? 'template-leaf' : 'template-branch'} node "${node.title}"`);
        
        // Retry logic (similar to LoopOrchestrator)
        const maxRetries = 3;
        let lastResponse = '';
        let ratings: ContextRating[] | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                lastResponse = await this.openRouterClient.chat(modelPurpose, ratingPrompt);
            
                // Parse JSON response with mapping from filtered to original indices
                ratings = this.parseRatingResponse(lastResponse, filteredToOriginalMapping);
                
                if (ratings !== null) {
                    break; // Success
                }
                
                console.warn(`Context rating response parsing failed on attempt ${attempt + 1} for node "${node.title}". Retrying...`);
                
            } catch (error) {
                // Check for abort conditions first (like LoopOrchestrator)
                if (error instanceof Error && (
                    error.message === 'Request was aborted' || 
                    error.message.includes('aborted') ||
                    error.name === 'AbortError'
                )) {
                    console.log(`🛑 ContextRatingService: Context rating aborted during attempt ${attempt + 1} for node "${node.title}"`);
                    throw new Error('Context rating was aborted by user');
                }
                
                // Check if this is a parsing error (our parseRatingResponse method throws)
                if (error instanceof Error && error.message.includes('parse')) {
                    console.warn(`Context rating response parsing failed on attempt ${attempt + 1} for node "${node.title}". Retrying...`, error);
                    continue; // Try again
                }
                
                // If it's not a parsing error or abort, it's likely a network/API error
                console.warn(`Context rating API call failed on attempt ${attempt + 1} for node "${node.title}". Retrying...`, error);
                
                // Don't retry on the last attempt
                if (attempt === maxRetries - 1) {
                    throw error;
                }
            }
        }
        
        // If we still don't have ratings after all retries, throw an error
        if (ratings === null) {
            throw new Error(`Context rating failed after ${maxRetries} retries. The AI response may be malformed.\n\nLast AI Response:\n"${lastResponse}"`);
        }
            
        return {
            ratings,
            analysisTimestamp: new Date(),
            nodeId: node.id,
            originalContext: node.context || '',
            contextMismatch: contextCheck.hasMismatch
        };
    }

    /**
     * Parse AI response and extract context ratings
     * Returns null if parsing fails (for retry logic)
     * @param response AI response containing JSON array of ratings
     * @param filteredToOriginalMapping Array mapping filtered indices to original indices
     */
    private parseRatingResponse(response: string, filteredToOriginalMapping: number[]): ContextRating[] | null {
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

            // Validate and normalize ratings
            const ratings: ContextRating[] = [];
            
            for (let index = 0; index < parsed.length; index++) {
                const item = parsed[index];
                
                if (!item || typeof item !== 'object') {
                    console.warn(`Invalid context rating at index ${index}`);
                    return null;
                }

                // Convert AI's filtered item number to original item number
                const filteredItemNumber = Number(item.item_number) || Number(item.number) || 0;
                let originalItemNumber = 0;
                if (filteredItemNumber > 0 && filteredItemNumber <= filteredToOriginalMapping.length) {
                    const originalIndex = filteredToOriginalMapping[filteredItemNumber - 1];
                    originalItemNumber = originalIndex !== undefined ? originalIndex + 1 : 0; // Convert to 1-based
                }
                
                const relevancyRating = Number(item.relevancy_rating) || Number(item.rating) || Number(item.relevancy) || 0;
                
                const rating: ContextRating = {
                    item_number: originalItemNumber,
                    relevancy_rating: relevancyRating
                };

                // Validate rating is between 1-10
                if (rating.relevancy_rating < 1 || rating.relevancy_rating > 10) {
                    rating.relevancy_rating = Math.max(1, Math.min(10, rating.relevancy_rating));
                }

                // Check if we have valid data
                if (rating.item_number <= 0 || rating.relevancy_rating <= 0) {
                    console.warn(`Invalid rating data at index ${index}:`, {
                        originalItem: item,
                        parsedRating: rating
                    });
                    return null;
                }

                ratings.push(rating);
            }
            
            return ratings;
            
        } catch (error) {
            console.warn('Failed to parse context rating response:', error);
            console.warn('Response content:', response);
            return null;
        }
    }
} 