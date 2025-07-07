import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { CoherenceAnalysisRequest, CoherenceAnalysisResult, CoherenceContradiction } from '../../../types/CoherenceTypes';

export class CoherenceService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
    }

    /**
     * Check if a node is eligible for coherence analysis
     */
    isNodeEligible(node: DocumentNode): boolean {
        if (!node.children || node.children.length === 0) {
            return false;
        }

        // Check if any child has non-empty, non-draft content
        const hasValidChildren = node.children.some(child => {
            const content = child.content?.trim();
            return content && content.length > 0 && !content.toLowerCase().includes('[draft]');
        });

        return hasValidChildren;
    }

    /**
     * Get the reason why a node is not eligible (for user feedback)
     */
    getIneligibilityReason(node: DocumentNode): string {
        if (!node.children || node.children.length === 0) {
            return 'This node has no children to analyze.';
        }

        const validChildren = node.children.filter(child => {
            const content = child.content?.trim();
            return content && content.length > 0 && !content.toLowerCase().includes('[draft]');
        });

        if (validChildren.length === 0) {
            return 'All child nodes are empty or contain draft content.';
        }

        return 'Node is not eligible for coherence analysis.';
    }

    /**
     * Prepare analysis request from node and its children
     */
    private prepareAnalysisRequest(node: DocumentNode): CoherenceAnalysisRequest {
        const validChildren = node.children.filter(child => {
            const content = child.content?.trim();
            return content && content.length > 0 && !content.toLowerCase().includes('[draft]');
        });

        const childrenContent = validChildren
            .map(child => child.content)
            .join('\n\n---\n\n');

        return {
            parentContent: node.content || '',
            parentContext: node.context || '',
            childrenContent: childrenContent,
            parentNodeTitle: node.title || 'Untitled Node',
            childNodeTitles: validChildren.map(child => child.title || 'Untitled'),
            childNodes: validChildren.map(child => ({
                id: child.id,
                title: child.title || 'Untitled',
                content: child.content || '',
                isLeaf: !child.children || child.children.length === 0
            }))
        };
    }

    /**
     * Perform coherence analysis using AI
     */
    async analyzeCoherence(node: DocumentNode): Promise<CoherenceAnalysisResult> {
        if (!this.isNodeEligible(node)) {
            throw new Error(this.getIneligibilityReason(node));
        }

        const request = this.prepareAnalysisRequest(node);
        
        // Create analysis prompt
        const prompts = this.settingsManager.getPrompts();
        const analysisPrompt = prompts.coherence_analysis
            .replace(/\{\{parent_content\}\}/g, request.parentContent)
            .replace(/\{\{parent_context\}\}/g, request.parentContext)
            .replace(/\{\{children_content\}\}/g, request.childrenContent)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        try {
            // Use creator model for analysis
            const response = await this.openRouterClient.chat('creator', analysisPrompt);
            
            // Parse JSON response
            const contradictions = this.parseAnalysisResponse(response, request.childNodes);
            
            return {
                contradictions,
                hasContradictions: contradictions.length > 0,
                analysisTimestamp: new Date(),
                parentNodeId: node.id,
                childNodeIds: node.children.map(child => child.id)
            };
        } catch (error) {
            console.error('Coherence analysis failed:', error);
            throw new Error('Failed to analyze coherence. Please try again.');
        }
    }

    /**
     * Parse AI response and extract contradictions
     */
    private parseAnalysisResponse(response: string, childNodes: Array<{id: string; title: string; content: string; isLeaf: boolean}>): CoherenceContradiction[] {
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

            // Create a mapping from child title to child ID
            const titleToIdMap = new Map<string, string>();
            childNodes.forEach(child => {
                titleToIdMap.set(child.title, child.id);
            });

            // Validate and normalize contradictions
            return parsed.map((item, index) => {
                if (!item || typeof item !== 'object') {
                    throw new Error(`Invalid contradiction at index ${index}`);
                }

                const offendingChildTitle = String(item.offending_child_title || '').trim();
                
                const contradiction: CoherenceContradiction = {
                    fact_in_outline: String(item.fact_in_outline || '').trim(),
                    fact_in_expansion: String(item.fact_in_expansion || '').trim(),
                    justification: String(item.justification || '').trim(),
                    offending_child_title: offendingChildTitle
                };

                // Add child ID using robust title matching
                let childId = titleToIdMap.get(offendingChildTitle);
                
                // If exact match fails, try fuzzy matching
                if (!childId) {
                    const normalizedOffendingTitle = offendingChildTitle.toLowerCase().trim();
                    for (const child of childNodes) {
                        const normalizedChildTitle = child.title.toLowerCase().trim();
                        if (normalizedChildTitle === normalizedOffendingTitle || 
                            normalizedChildTitle.includes(normalizedOffendingTitle) ||
                            normalizedOffendingTitle.includes(normalizedChildTitle)) {
                            childId = child.id;
                            break;
                        }
                    }
                }
                
                // If still no match, use the first child as fallback (better than no fix button)
                if (!childId && childNodes.length > 0) {
                    console.warn(`Could not match offending child title "${offendingChildTitle}" to any child node. Using first child as fallback.`);
                    childId = childNodes[0]!.id;
                }
                
                if (childId) {
                    contradiction.offending_child_id = childId;
                }

                if (!contradiction.fact_in_outline || !contradiction.fact_in_expansion || !contradiction.justification || !contradiction.offending_child_title) {
                    throw new Error(`Missing required fields in contradiction at index ${index}`);
                }

                return contradiction;
            });
        } catch (error) {
            console.error('Failed to parse coherence analysis response:', error);
            console.error('Response content:', response);
            throw new Error('Failed to parse analysis results. The AI response may be malformed.');
        }
    }

    /**
     * Fix a contradiction in a child node
     */
    async fixContradiction(
        parentNode: DocumentNode,
        childNode: DocumentNode,
        contradiction: CoherenceContradiction
    ): Promise<string> {
        const prompts = this.settingsManager.getPrompts();
        
        // Create fix prompt
        const fixPrompt = prompts.fix_contradiction
            .replace(/\{\{parent_content\}\}/g, parentNode.content || '')
            .replace(/\{\{parent_context\}\}/g, parentNode.context || '')
            .replace(/\{\{child_title\}\}/g, childNode.title || 'Untitled')
            .replace(/\{\{child_content\}\}/g, childNode.content || '')
            .replace(/\{\{fact_in_outline\}\}/g, contradiction.fact_in_outline)
            .replace(/\{\{fact_in_expansion\}\}/g, contradiction.fact_in_expansion)
            .replace(/\{\{justification\}\}/g, contradiction.justification)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        try {
            // Use appropriate model based on whether child is leaf or not
            const isLeaf = !childNode.children || childNode.children.length === 0;
            const model = isLeaf ? 'prose' : 'creator';
            
            const response = await this.openRouterClient.chat(model, fixPrompt);
            
            return response.trim();
        } catch (error) {
            console.error('Failed to fix contradiction:', error);
            throw new Error('Failed to fix contradiction. Please try again.');
        }
    }
} 