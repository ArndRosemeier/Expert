import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { TaskModelService } from '../../../services/TaskModelService';
import { CoherenceAnalysisRequest, CoherenceAnalysisResult, CoherenceContradiction } from '../../../types/CoherenceTypes';
import { CoherenceLog } from '../../../CoherenceLog';

export class CoherenceService {
    private openRouterClient: OpenRouterClient;
    private taskModelService: TaskModelService;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.taskModelService = new TaskModelService(settingsManager);
    }

    /**
     * Check if a node is eligible for coherence analysis
     * CRITICAL: This must align with stateless generation logic that uses node.getState() === 'Final'
     */
    isNodeEligible(node: DocumentNode): boolean {
        if (!node.children || node.children.length === 0) {
            return false;
        }

        // Check if any child has Final content AND is not already tagged as consistent
        // Use the same logic as UnifiedGenerationService: node.getState() === 'Final'
        const hasValidChildren = node.children.some(child => {
            // Use proper node state check instead of manual content inspection
            const hasValidContent = child.getState() === 'Final';
            
            // Exclude children that are already tagged as consistent to parent
            const isAlreadyConsistent = child.isConsistentToParent();
            
            return hasValidContent && !isAlreadyConsistent;
        });

        return hasValidChildren;
    }

    /**
     * Get the reason why a node is not eligible (for user feedback)
     * CRITICAL: This must align with stateless generation logic that uses node.getState() === 'Final'
     */
    getIneligibilityReason(node: DocumentNode): string {
        if (!node.children || node.children.length === 0) {
            return 'This node has no children to analyze.';
        }

        // Use same logic as isNodeEligible and UnifiedGenerationService
        const validChildren = node.children.filter(child => {
            return child.getState() === 'Final';
        });

        if (validChildren.length === 0) {
            return 'All child nodes are empty or in draft state (not Final).';
        }

        // Check if all valid children are already tagged as consistent
        const alreadyConsistentChildren = validChildren.filter(child => {
            return child.isConsistentToParent();
        });

        if (alreadyConsistentChildren.length === validChildren.length) {
            return 'All child nodes with Final content are already marked as consistent to parent.';
        }

        // Check if there are any children left to analyze after filtering
        const analyzeableChildren = validChildren.filter(child => {
            const isAlreadyConsistent = child.isConsistentToParent();
            return !isAlreadyConsistent;
        });

        if (analyzeableChildren.length === 0) {
            return 'No child nodes need coherence analysis (all are empty, draft, or already consistent).';
        }

        return 'Node is not eligible for coherence analysis.';
    }

    /**
     * Prepare analysis request from node and its children
     * CRITICAL: This must align with stateless generation logic that uses node.getState() === 'Final'
     */
    private prepareAnalysisRequest(node: DocumentNode): CoherenceAnalysisRequest {
        const validChildren = node.children.filter(child => {
            // Use same logic as isNodeEligible and UnifiedGenerationService
            const hasValidContent = child.getState() === 'Final';
            
            // Exclude children that are already tagged as consistent to parent
            const isAlreadyConsistent = child.isConsistentToParent();
            
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
            parentContext: '', // Traditional context removed
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
    async analyzeCoherence(
        node: DocumentNode,
        frozenSettings: {
            coherenceAnalysisPrompt: string;
            fixContradictionPrompt: string;
            language: string;
            taskModelConfigs: {
                coherence_analysis: { outline: string; prose: string };
                fix_contradiction: { outline: string; prose: string };
            };
        }
    ): Promise<CoherenceAnalysisResult> {
        if (!this.isNodeEligible(node)) {
            throw new Error(this.getIneligibilityReason(node));
        }

        const request = this.prepareAnalysisRequest(node);
        
        // Use frozen settings - no fallbacks, errors fly if missing
        let analysisPrompt = frozenSettings.coherenceAnalysisPrompt
            .replace(/\{\{parent_content\}\}/g, request.parentContent)
            .replace(/\{\{parent_context\}\}/g, request.parentContext)
            .replace(/\{\{children_content\}\}/g, request.childrenContent)
            .replace(/\{\{language\}\}/g, frozenSettings.language);

        // Strengthen prompt with allowed child titles and strict JSON output requirements
        const allowedTitles = JSON.stringify(request.childNodeTitles);
        const strictGuard = `\n\nSTRICT INSTRUCTIONS:\n- Only reference offending_child_title from this exact list: ${allowedTitles}.\n- If none of these children are inconsistent, return an empty JSON array: []\n- Output must be ONLY a JSON array (no code fences, no prose), with items of the form:\n  [{\n    "offending_child_title": string,\n    "fact_in_outline": string,\n    "fact_in_expansion": string,\n    "justification": string,\n    "severity": number (1-10)\n  }]`;
        analysisPrompt += strictGuard;

        try {
            console.log(`🔍 Starting coherence analysis for "${node.title}" with ${request.childNodes.length} child nodes`);
            
            // Use frozen task model configuration - no fallbacks
            const isLeafNode = node.isLeaf;
            const taskConfig = frozenSettings.taskModelConfigs.coherence_analysis;
            const modelPurpose = isLeafNode ? taskConfig.prose : taskConfig.outline;
            
            console.log(`🤖 Using ${modelPurpose} model for coherence analysis of ${isLeafNode ? 'template-leaf' : 'template-branch'} node "${node.title}"`);
            
            // Get model name for error reporting
            // const modelName = this.taskModelService.getCurrentModelName(modelPurpose as any);
            
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
                // Only include analyzed children (Final and not already consistent)
                childNodeIds: request.childNodes.map(child => child.id)
            };
        } catch (error) {
            // Log detailed error information
            console.error('Coherence analysis failed for node:', node.title);
            console.error('Error details:', error);
            console.error('Current settings state:', {
                hasFrozenSettings: !!frozenSettings,
                hasCoherencePrompt: !!frozenSettings.coherenceAnalysisPrompt,
                language: frozenSettings.language,
                requestChildCount: request.childNodes.length
            });
            
            // Get model information for error messages
            const isLeafNode = node.isLeaf;
            const modelPurpose = this.taskModelService.getModelPurposeForTask('coherence_analysis', isLeafNode);
            const modelName = this.taskModelService.getCurrentModelName(modelPurpose);
            
            // Check for content filtering errors
            if (error instanceof Error) {
                if (error.name === 'ContentFilterError' || error.name === 'EmptyResponseError') {
                    // Content was filtered by AI safety system
                    throw new Error(`Content analysis blocked by AI safety system. The model "${modelName}" detected content that violates its usage policies. 

To fix this:
1. Go to Settings → Task Models → Coherence Analysis
2. Change the model to a less restrictive one like:
   • Mistral Large (best unrestricted quality)
   • Other Mistral models
   • Meta Llama models
3. Avoid Google Gemini and Claude models for adult/explicit content

Original error: ${error.message}`);
                }
                
                if (error.message.includes('Response body is null') || error.message.includes('response length: 0')) {
                    // Likely content filtering but not explicitly flagged
                    throw new Error(`Empty response from AI model "${modelName}" - likely content filtering. The model appears to be refusing to analyze your content due to safety restrictions.

To fix this:
1. Go to Settings → Task Models → Coherence Analysis  
2. Switch to a more permissive model like Mistral Large (best unrestricted quality) or other Mistral models
3. Google and Claude models are particularly restrictive with adult content

If the problem persists, try rephrasing explicit content in your project to be less detailed.`);
                }
            }
            
            // Re-throw with message matching retry heuristic in UnifiedGenerationService
            throw new Error('Failed to parse analysis results: malformed coherence response');
        }
    }

    /**
     * Parse AI response and extract contradictions
     */
    private parseAnalysisResponse(response: string, childNodes: Array<{id: string; title: string; content: string; isLeaf: boolean}>): CoherenceContradiction[] {
        try {
            // Normalize common wrappers: code fences and leading/trailing prose
            const candidates: string[] = [];

            // 1) Code fence extraction
            const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
            let fenceMatch: RegExpExecArray | null;
            while ((fenceMatch = fenceRegex.exec(response)) !== null) {
                if (fenceMatch[1]) candidates.push(fenceMatch[1].trim());
            }

            // 2) JSON array lazy match
            const arrayLazyMatch = response.match(/\[[\s\S]*?\]/);
            if (arrayLazyMatch) candidates.push(arrayLazyMatch[0].trim());

            // 3) Raw response as fallback
            candidates.push(response.trim());

            let parsedValue: unknown = null;
            for (const candidate of candidates) {
                try {
                    const parsed = JSON.parse(candidate);
                    parsedValue = parsed;
                    break;
                } catch (e) {
                    // Try next candidate
                }
            }

            if (parsedValue === null) {
                throw new Error(`No valid JSON found in response`);
            }

            // Accept either an array of items or a single item
            const parsedArray: any[] = Array.isArray(parsedValue) ? parsedValue : [parsedValue];

            // Create a mapping from child title to child ID
            const titleToIdMap = new Map<string, string>();
            childNodes.forEach(child => {
                titleToIdMap.set(child.title, child.id);
            });

            // Validate and normalize contradictions
            return parsedArray.map((item, index) => {
                if (!item || typeof item !== 'object') {
                    throw new Error(`Invalid contradiction at index ${index}`);
                }

                let offendingChildTitle = String(item.offending_child_title || '').trim();
                
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
                
                // Strict: if we can't match the title, error out
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
        frozenSettings: {
            coherenceAnalysisPrompt: string;
            fixContradictionPrompt: string;
            language: string;
            taskModelConfigs: {
                coherence_analysis: { outline: string; prose: string };
                fix_contradiction: { outline: string; prose: string };
            };
        },
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
        
        // Use frozen settings - no fallbacks, errors fly if missing
        const fixPrompt = frozenSettings.fixContradictionPrompt
            .replace(/\{\{parent_content\}\}/g, parentNode.content || '')
            .replace(/\{\{parent_context\}\}/g, '') // Traditional context removed
            .replace(/\{\{child_title\}\}/g, childNode.title || 'Untitled')
            .replace(/\{\{child_content\}\}/g, childNode.content || '')
            .replace(/\{\{fact_in_outline\}\}/g, contradiction.fact_in_outline)
            .replace(/\{\{fact_in_expansion\}\}/g, contradiction.fact_in_expansion)
            .replace(/\{\{justification\}\}/g, contradiction.justification)
            .replace(/\{\{language\}\}/g, frozenSettings.language);

        try {
            // Use frozen task model configuration - no fallbacks
            const isLeaf = childNode.isLeaf;
            const taskConfig = frozenSettings.taskModelConfigs.fix_contradiction;
            const modelPurpose = isLeaf ? taskConfig.prose : taskConfig.outline;
            
            console.log(`🤖 Using ${modelPurpose} model for fixing contradiction in ${isLeaf ? 'template-leaf' : 'template-branch'} node "${childNode.title}"`);
            
            if (onProgress) {
                onProgress(`Generating fix using ${modelPurpose} model...`);
            }
            
            const response = await this.openRouterClient.chat(modelPurpose as any, fixPrompt);
            
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
        frozenSettings: {
            coherenceAnalysisPrompt: string;
            fixContradictionPrompt: string;
            language: string;
            taskModelConfigs: {
                coherence_analysis: { outline: string; prose: string };
                fix_contradiction: { outline: string; prose: string };
            };
        },
        isAutomaticMode: boolean = false,
        projectId?: string,
        onProgress?: (message: string, current?: number, total?: number) => void
    ): Promise<CoherenceAnalysisResult> {
        // First, perform the regular coherence analysis
        const analysisResult = await this.analyzeCoherence(node, frozenSettings);
        
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
                
                // Update progress for this fix
                if (onProgress) {
                    onProgress(`Fixing contradiction ${i + 1} of ${toAutofix.length} in "${childNode.title}"`, i + 1, toAutofix.length + 1);
                }
                
                // Generate the fix with local progress callback
                const fixedContent = await this.fixContradiction(node, childNode, contradiction, frozenSettings, (message) => {
                    console.log(`   ⚡ ${message}`);
                    // Update progress with more detailed message
                    if (onProgress) {
                        onProgress(`[${i + 1}/${toAutofix.length}] ${message}`, i + 1, toAutofix.length + 1);
                    }
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
        
        // Final progress update
        if (onProgress && toAutofix.length > 0) {
            onProgress(`Completed autofix: ${fixedContradictions.length}/${toAutofix.length} fixes applied`, toAutofix.length + 1, toAutofix.length + 1);
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