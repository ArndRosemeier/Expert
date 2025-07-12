import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { TaskModelService } from '../../../services/TaskModelService';
import { CoherenceAnalysisRequest, CoherenceAnalysisResult, CoherenceContradiction } from '../../../types/CoherenceTypes';
import { CoherenceLog } from '../../../CoherenceLog';

export class CoherenceService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private taskModelService: TaskModelService;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.taskModelService = new TaskModelService(settingsManager);
    }

    /**
     * Check if a node is eligible for coherence analysis
     */
    isNodeEligible(node: DocumentNode): boolean {
        if (!node.children || node.children.length === 0) {
            return false;
        }

        // Check if any child has non-empty, non-draft content AND is not already tagged as consistent
        const hasValidChildren = node.children.some(child => {
            const content = child.content?.trim();
            const hasValidContent = content && content.length > 0 && !content.toLowerCase().includes('[draft]');
            
            // Exclude children that are already tagged as consistent to parent
            const masterVersion = child.getMasterVersion();
            const isAlreadyConsistent = masterVersion && masterVersion.tags.has('consistent_to_parent');
            
            return hasValidContent && !isAlreadyConsistent;
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

        // Check if all valid children are already tagged as consistent
        const alreadyConsistentChildren = validChildren.filter(child => {
            const masterVersion = child.getMasterVersion();
            return masterVersion && masterVersion.tags.has('consistent_to_parent');
        });

        if (alreadyConsistentChildren.length === validChildren.length) {
            return 'All child nodes are already marked as consistent to parent.';
        }

        // Check if there are any children left to analyze after filtering
        const analyzeableChildren = validChildren.filter(child => {
            const masterVersion = child.getMasterVersion();
            const isAlreadyConsistent = masterVersion && masterVersion.tags.has('consistent_to_parent');
            return !isAlreadyConsistent;
        });

        if (analyzeableChildren.length === 0) {
            return 'No child nodes need coherence analysis (all are empty, draft, or already consistent).';
        }

        return 'Node is not eligible for coherence analysis.';
    }

    /**
     * Prepare analysis request from node and its children
     */
    private prepareAnalysisRequest(node: DocumentNode): CoherenceAnalysisRequest {
        const validChildren = node.children.filter(child => {
            const content = child.content?.trim();
            const hasValidContent = content && content.length > 0 && !content.toLowerCase().includes('[draft]');
            
            // Exclude children that are already tagged as consistent to parent
            const masterVersion = child.getMasterVersion();
            const isAlreadyConsistent = masterVersion && masterVersion.tags.has('consistent_to_parent');
            
            return hasValidContent && !isAlreadyConsistent;
        });

        const childrenContent = validChildren
            .map(child => {
                const title = child.title ? `Title: ${child.title}\n\n` : '';
                return title + child.content;
            })
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
        
        // Create analysis prompt with better error handling
        const prompts = this.settingsManager.getPrompts();
        
        // Check if prompts are properly loaded
        if (!prompts || !prompts.coherence_analysis) {
            console.error('Coherence analysis prompts not available. Current prompts:', prompts);
            throw new Error('Coherence analysis prompts not available. This may be due to settings being modified during analysis.');
        }
        
        const analysisPrompt = prompts.coherence_analysis
            .replace(/\{\{parent_content\}\}/g, request.parentContent)
            .replace(/\{\{parent_context\}\}/g, request.parentContext)
            .replace(/\{\{children_content\}\}/g, request.childrenContent)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        try {
            console.log(`🔍 Starting coherence analysis for "${node.title}" with ${request.childNodes.length} child nodes`);
            
            // Use configurable model for analysis based on whether node is leaf or not
            const isLeafNode = !node.children || node.children.length === 0;
            const modelPurpose = this.taskModelService.getModelPurposeForTask('coherence_analysis', isLeafNode);
            
            console.log(`🤖 Using ${modelPurpose} model for coherence analysis of ${isLeafNode ? 'leaf' : 'branch'} node "${node.title}"`);
            
            const response = await this.openRouterClient.chat(modelPurpose, analysisPrompt);
            
            console.log(`✅ Coherence analysis API call completed for "${node.title}"`);
            
            // Parse JSON response
            const contradictions = this.parseAnalysisResponse(response, request.childNodes);
            
            console.log(`📊 Coherence analysis parsing completed for "${node.title}": ${contradictions.length} contradictions found`);
            
            return {
                contradictions,
                hasContradictions: contradictions.length > 0,
                analysisTimestamp: new Date(),
                parentNodeId: node.id,
                childNodeIds: node.children.map(child => child.id)
            };
        } catch (error) {
            // Log detailed error information
            console.error('Coherence analysis failed for node:', node.title);
            console.error('Error details:', error);
            console.error('Current settings state:', {
                hasPrompts: !!prompts,
                hasCoherencePrompt: !!(prompts && prompts.coherence_analysis),
                language: this.settingsManager.getLanguage(),
                requestChildCount: request.childNodes.length
            });
            
            // Provide more specific error message based on error type
            if (error instanceof Error) {
                if (error.message.includes('API key') || error.message.includes('authentication')) {
                    throw new Error('Coherence analysis failed due to API authentication issues. Please check your API key settings.');
                } else if (error.message.includes('parse') || error.message.includes('JSON')) {
                    throw new Error('Coherence analysis failed due to malformed AI response. Please try again.');
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    throw new Error('Coherence analysis failed due to network issues. Please check your connection and try again.');
                }
            }
            
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
                    offending_child_title: offendingChildTitle,
                    severity: this.parseSeverity(item.severity)
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
                
                // No fallback - if we can't match the title, that's an error that must be visible
                if (!childId) {
                    throw new Error(`Could not match offending child title "${offendingChildTitle}" to any child node. Available titles: ${childNodes.map(c => c.title).join(', ')}`);
                }
                
                contradiction.offending_child_id = childId;

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
     * Parse and validate severity from AI response
     */
    private parseSeverity(severity: any): number {
        // Convert to number and validate
        const severityNum = Number(severity);
        
        if (isNaN(severityNum) || severityNum < 1 || severityNum > 10) {
            console.warn(`Invalid severity value: ${severity}, defaulting to 5`);
            return 5; // Default to medium severity
        }
        
        return Math.round(severityNum); // Ensure it's an integer
    }

    /**
     * Fix a contradiction in a child node
     */
    async fixContradiction(
        parentNode: DocumentNode,
        childNode: DocumentNode,
        contradiction: CoherenceContradiction,
        onProgress?: (message: string) => void
    ): Promise<string> {
        // Log the problem that's about to be fixed
        console.log(`🔧 FIXING CONTRADICTION in "${childNode.title}"`);
        console.log(`   📋 Problem: ${contradiction.justification}`);
        console.log(`   ⚖️ Severity: ${contradiction.severity}/10`);
        console.log(`   📄 Parent says: "${contradiction.fact_in_outline}"`);
        console.log(`   📝 Child says: "${contradiction.fact_in_expansion}"`);
        
        // Emit progress feedback
        if (onProgress) {
            onProgress(`Analyzing contradiction in "${childNode.title}"...`);
        }
        
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
            // Use configurable model based on whether child is leaf or not
            const isLeaf = !childNode.children || childNode.children.length === 0;
            const modelPurpose = this.taskModelService.getModelPurposeForTask('fix_contradiction', isLeaf);
            
            console.log(`🤖 Using ${modelPurpose} model for fixing contradiction in ${isLeaf ? 'leaf' : 'branch'} node "${childNode.title}"`);
            
            if (onProgress) {
                onProgress(`Generating fix using ${modelPurpose} model...`);
            }
            
            const response = await this.openRouterClient.chat(modelPurpose, fixPrompt);
            
            console.log(`✅ Generated fix for "${childNode.title}" (${response.length} characters)`);
            
            if (onProgress) {
                onProgress(`Fix generated successfully for "${childNode.title}"`);
            }
            
            return response.trim();
        } catch (error) {
            console.error('Failed to fix contradiction:', error);
            if (onProgress) {
                onProgress(`Failed to generate fix: ${error}`);
            }
            throw new Error('Failed to fix contradiction. Please try again.');
        }
    }

    /**
     * Analyze coherence and automatically fix contradictions if autofix is enabled
     */
    async analyzeCoherenceWithAutofix(
        node: DocumentNode,
        autofixSeverity: number, // -1 = disabled, 1-10 = threshold
        isAutomaticMode: boolean = false,
        projectId?: string
    ): Promise<CoherenceAnalysisResult> {
        // First, perform the regular coherence analysis
        const analysisResult = await this.analyzeCoherence(node);
        
        // If no contradictions found, return the result
        if (!analysisResult.hasContradictions) {
            return analysisResult;
        }
        
        // If autofix is disabled, log all contradictions and return
        if (autofixSeverity === -1) {
            if (isAutomaticMode && projectId) {
                const coherenceLog = CoherenceLog.getInstance();
                analysisResult.contradictions.forEach(contradiction => {
                    coherenceLog.logCoherenceIssue(projectId, node, contradiction, 'autofix_disabled');
                });
            }
            return analysisResult;
        }
        
        // Separate contradictions into autofix and log categories
        const toAutofix = analysisResult.contradictions.filter(c => c.severity >= autofixSeverity);
        const toLog = analysisResult.contradictions.filter(c => c.severity < autofixSeverity);
        
        console.log(`🤖 Autofix processing: ${toAutofix.length} contradictions to fix (severity ${autofixSeverity}+), ${toLog.length} to log`);
        
        // Log contradictions below the threshold
        if (isAutomaticMode && projectId && toLog.length > 0) {
            const coherenceLog = CoherenceLog.getInstance();
            toLog.forEach(contradiction => {
                coherenceLog.logCoherenceIssue(projectId, node, contradiction, 'below_autofix_threshold', autofixSeverity);
            });
        }
        
        // If no contradictions need fixing, return the result
        if (toAutofix.length === 0) {
            return analysisResult;
        }
        
        // Apply automatic fixes
        const fixedContradictions: CoherenceContradiction[] = [];
        const failedContradictions: CoherenceContradiction[] = [];
        
        console.log(`🔧 Starting autofix process for ${toAutofix.length} contradiction(s) in "${node.title}"`);
        
        for (let i = 0; i < toAutofix.length; i++) {
            const contradiction = toAutofix[i];
            if (!contradiction) continue;
            
            try {
                // Find the child node
                const childNode = node.children.find(child => child.id === contradiction.offending_child_id);
                if (!childNode) {
                    console.error(`Child node not found for contradiction: ${contradiction.offending_child_id}`);
                    failedContradictions.push(contradiction);
                    continue;
                }
                
                console.log(`🔧 [${i + 1}/${toAutofix.length}] Auto-fixing contradiction in "${childNode.title}"`);
                
                // Generate the fix with progress callback
                const fixedContent = await this.fixContradiction(node, childNode, contradiction, (message) => {
                    console.log(`   ⚡ ${message}`);
                });
                
                // Apply the fix automatically
                childNode.setContent(fixedContent, 'autofix');
                
                console.log(`✅ [${i + 1}/${toAutofix.length}] Successfully auto-fixed contradiction in "${childNode.title}" (severity ${contradiction.severity})`);
                fixedContradictions.push(contradiction);
                
            } catch (error) {
                console.error(`❌ [${i + 1}/${toAutofix.length}] Failed to automatically fix contradiction in "${contradiction.offending_child_title}":`, error);
                failedContradictions.push(contradiction);
                
                // Log the failed fix
                if (isAutomaticMode && projectId) {
                    const coherenceLog = CoherenceLog.getInstance();
                    coherenceLog.logCoherenceIssue(projectId, node, contradiction, 'autofix_failed', autofixSeverity);
                }
            }
        }
        
        if (fixedContradictions.length > 0) {
            console.log(`✅ Autofix completed: ${fixedContradictions.length}/${toAutofix.length} contradictions fixed successfully`);
        }
        if (failedContradictions.length > 0) {
            console.log(`⚠️ Autofix partial failure: ${failedContradictions.length}/${toAutofix.length} contradictions could not be fixed`);
        }
        
        // Update the analysis result to reflect the fixes
        const remainingContradictions = [...toLog, ...failedContradictions];
        
        return {
            ...analysisResult,
            contradictions: remainingContradictions,
            hasContradictions: remainingContradictions.length > 0,
            // Add metadata about the autofix process
            autofixSummary: {
                enabled: true,
                severityThreshold: autofixSeverity,
                totalContradictions: analysisResult.contradictions.length,
                fixedCount: fixedContradictions.length,
                failedCount: failedContradictions.length,
                loggedCount: toLog.length
            }
        };
    }
} 