import { DocumentNode } from '../DocumentNode';
import { SettingsManager } from '../SettingsManager.js';
import { QualityCriterion } from '../types.js';
import { createPromptExpansionService } from '../services/PromptExpansionService.js';
import { PromptContextBuilder } from '../services/PromptContextBuilder.js';

/**
 * PromptService handles all prompt generation, template processing, and criteria filtering.
 * Manages the conversion from raw templates to filled prompts ready for LLM generation.
 */
export class PromptService {
    
    constructor(private settingsManager: SettingsManager) {}

    /**
     * Gets the raw, unprocessed generation prompt for a node, which includes placeholders.
     * @param node The node for which to get the prompt template.
     * @param deterministicChildCreation Whether to use deterministic child creation for this generation.
     * @returns The raw prompt template string.
     */
    public getRawGenerationPrompt(node: DocumentNode, deterministicChildCreation?: boolean): string {
        const prompts = this.settingsManager.getPrompts();
        
        // Special handling for root node (text expansion)
        if (!node.parentId) {
            return prompts.expand_text_user;
        }
        
        if (node.isLeaf) {
            return prompts.content_generation_user;
        }

        // For non-leaf nodes, check if deterministic child creation is enabled
        const useDeterministic = deterministicChildCreation ?? false;
        return useDeterministic
            ? prompts.deterministic_outline_generation_user
            : prompts.branch_content_generation_user;
    }

    /**
     * Fills a raw prompt template with the specific details of a node (context, path, etc.).
     * @param promptTemplate The raw string template with placeholders.
     * @param node The node providing the data.
     * @param context The compiled context for this node.
     * @param path The hierarchical path to this node.
     * @param count Optional count for list generation.
     * @returns The final, filled prompt ready for an LLM.
     */
    public fillGenerationPrompt(
        promptTemplate: string, 
        node: DocumentNode, 
        context: string, 
        path: string, 
        count?: number,
        languageOverride?: string | null
    ): string {
        // Name the artifact for this node so the action line reinforces what to
        // write: prose for leaves, a level-specific outline for branches.
        const artifact = node.isLeaf ? 'prose' : `${this.getLevelLabel(node)} outline`;

        let draftOrFresh: string;
        if (node.content && node.content.trim() !== '') {
            const masterVersion = node.getMasterVersion();
            if (masterVersion && masterVersion.tags.has('draft')) {
                draftOrFresh = `You have an initial draft to work with:
---
${node.content}
---

Please expand this draft into the full ${artifact}. Use the draft as a bible for what should be covered. Do not advance the plot past the draft.`;
            } else {
                draftOrFresh = `You have this existing ${artifact} to revise or expand:
---
${node.content}
---

Please improve and expand this ${artifact}.`;
            }
        } else {
            draftOrFresh = `Now, write the ${artifact} for this node.`;
        }

        // Use centralized prompt expansion
        const generationOptions: {
            context: string;
            draftOrFresh: string;
            childLevelName: string;
            generateCount: string;
            count?: number;
            lengthHint?: string;
        } = {
            context: context,
            draftOrFresh: draftOrFresh,
            childLevelName: node.childLevelName || '',
            generateCount: this.getGenerateCountInstruction(node)
        };
        
        if (count !== undefined) {
            generationOptions.count = count;
        }

        const lengthHint = this.getLengthHintInstruction(node);
        if (lengthHint) {
            generationOptions.lengthHint = lengthHint;
        }
        
        const promptContext = PromptContextBuilder.forGeneration(node, this.settingsManager, path, generationOptions);
        
        // Check if prompt template contains analysis placeholders and extend context if needed
        if (promptTemplate.includes('{{outline_content}}')) {
            const analysisContext = PromptContextBuilder.forAnalysis(this.settingsManager, {
                outlineContent: node.content
            });
            promptContext.analysis = analysisContext.analysis!;
        }
        
        const expansionService = createPromptExpansionService(this.settingsManager);
        const filledPrompt = expansionService.expandPrompt(promptTemplate, promptContext, languageOverride);
        
        // Special handling for root node prompts (no additional placeholders needed)
        if (!node.parentId) {
            // Root nodes use the expand_text_user prompt which is now user-customizable
        }
        
        if (!node.isLeaf && count) {
            // Count placeholder should already be handled by centralized service
        }

        return filledPrompt;
    }

    /**
     * Parses a bulleted list from text content.
     * @param text The text containing bulleted items.
     * @returns Array of parsed bullet point items.
     */
    public parseBulletedList(text: string): string[] {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('*') || line.startsWith('-'))
            .map(line => line.substring(1).trim())
            .filter(line => line.length > 0);
    }

    /**
     * Filters criteria based on node type (leaf vs outline/branch).
     * @param criteria The full list of criteria.
     * @param isLeafNode Whether the node is a leaf node.
     * @returns Filtered criteria appropriate for the node type.
     */
    public filterCriteriaForNodeType(criteria: QualityCriterion[], isLeafNode: boolean): QualityCriterion[] {
        return criteria.filter(criterion => {
            // If both outline and leaf are undefined or both are true, include the criterion
            if (criterion.outline === undefined && criterion.leaf === undefined) {
                return true; // Legacy criteria - apply to all
            }
            
            // For leaf nodes, include criteria where leaf is true
            if (isLeafNode) {
                return criterion.leaf === true;
            }
            
            // For outline/branch nodes, include criteria where outline is true
            return criterion.outline === true;
        });
    }

    /**
     * Gets available prompt templates for a node type.
     * @param isRootNode Whether this is the root node.
     * @param isLeafNode Whether this is a leaf node.
     * @returns Object containing available prompt templates.
     */
    public getAvailablePrompts(isRootNode: boolean, isLeafNode: boolean): { [key: string]: string } {
        const prompts = this.settingsManager.getPrompts();
        
        if (isRootNode) {
            return {
                'expand_text': prompts.expand_text_user
            };
        }
        
        if (isLeafNode) {
            return {
                'content_generation': prompts.content_generation_user
            };
        }
        
        return {
            'branch_content_generation': prompts.branch_content_generation_user
        };
    }

    /**
     * Validates that a prompt template contains required placeholders.
     * @param template The prompt template to validate.
     * @param isRootNode Whether this is for a root node.
     * @param isLeafNode Whether this is for a leaf node.
     * @returns Array of validation errors, empty if valid.
     */
    public validatePromptTemplate(template: string, isRootNode: boolean, isLeafNode: boolean): string[] {
        const errors: string[] = [];
        
        // Required placeholders for all non-root nodes
        if (!isRootNode) {
            const requiredPlaceholders = ['{{path}}', '{{context}}', '{{title}}'];
            
            for (const placeholder of requiredPlaceholders) {
                if (!template.includes(placeholder)) {
                    errors.push(`Missing required placeholder: ${placeholder}`);
                }
            }
            
            // Additional placeholders for branch nodes
            if (!isLeafNode) {
                if (!template.includes('{{child_level_name}}')) {
                    errors.push('Missing required placeholder for branch nodes: {{child_level_name}}');
                }
            }
        }
        
        return errors;
    }

    /**
     * Generates smart count instruction based on template.
     * @param node The node to get count instruction for.
     * @returns Natural language instruction about how many entries to create.
     */
    public getGenerateCountInstruction(node: DocumentNode): string {
        const templateCount = node.getTemplateChildrenCount();
        if (templateCount !== null) {
            return `exactly ${templateCount} entries`;
        }
        return 'as many entries as make logical sense based on the content';
    }

    /**
     * Builds a fuzzy output-length guideline for this node from its template
     * layer's configured paragraph target (node.layerLengths[node.level]).
     * A target of N produces a "~(N-1)-(N+1) paragraphs" range. Returns an empty
     * string when no length is configured for the layer.
     *
     * This is intentionally a soft hint only: LLMs cannot reliably hit exact
     * lengths, so we steer with a paragraph range and state explicitly that it
     * is not enforceable.
     * @param node The node being generated.
     * @returns A natural-language length guideline, or '' when unset.
     */
    public getLengthHintInstruction(node: DocumentNode): string {
        const lengths = node.layerLengths;
        if (!Array.isArray(lengths)) {
            return '';
        }
        const target = lengths[node.level];
        if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) {
            return '';
        }
        const rounded = Math.round(target);
        const low = Math.max(1, rounded - 1);
        const high = rounded + 1;
        const unit = node.isLeaf ? 'of prose' : 'of outline';
        return `Target length (a soft guideline only — it cannot be strictly enforced): aim for roughly ${low}-${high} paragraphs ${unit}. Do not pad or truncate the content just to hit this; prioritize quality and coherence, but keep the overall length close to this range.`;
    }

    /**
     * Gets the clean name of a node's own template layer (e.g. "Chapter"),
     * stripping any trailing count like "Chapter 4" -> "Chapter".
     * @param node The node whose layer name to resolve.
     * @returns The cleaned level name, or "section" if unavailable.
     */
    public getLevelLabel(node: DocumentNode): string {
        const raw = node.template[node.level];
        if (!raw) {
            return 'section';
        }
        const cleaned = raw.replace(/\s+\d+\s*$/, '').trim();
        return cleaned.length > 0 ? cleaned : raw;
    }

    /**
     * Gets placeholder descriptions for help/documentation.
     * @returns Object mapping placeholders to their descriptions.
     */
    public getPlaceholderDescriptions(): { [placeholder: string]: string } {
        return {
            '{{path}}': 'The hierarchical path from root to this node',
            '{{context}}': 'Compiled contextual information from ancestors, siblings, and parent',
            '{{title}}': 'The title of the current node',
            '{{content}}': 'The current content of the node (if any)',
            '{{child_level_name}}': 'The name of the child level (for branch nodes)',
            '{{count}}': 'The number of items to generate (for list generation)',
            '{{generate_count}}': 'Smart count instruction: "exactly X entries" when count specified, "as many entries as make logical sense" when not specified',
            '{{child_count}}': 'Smart count instruction for child section creation based on template definition'
        };
    }

    /**
     * Estimates the token count of a filled prompt (rough approximation).
     * @param filledPrompt The completed prompt string.
     * @returns Estimated token count.
     */
    public estimateTokenCount(filledPrompt: string): number {
        // Rough approximation: 1 token ≈ 4 characters for English text
        return Math.ceil(filledPrompt.length / 4);
    }

    /**
     * Checks if a prompt would exceed typical context window limits.
     * @param filledPrompt The completed prompt string.
     * @param maxTokens The maximum token limit (default: 32000 for modern models).
     * @returns true if prompt likely exceeds limit, false otherwise.
     */
    public exceedsContextLimit(filledPrompt: string, maxTokens: number = 32000): boolean {
        return this.estimateTokenCount(filledPrompt) > maxTokens;
    }

    /**
     * Truncates context if the prompt becomes too long.
     * @param context The context string to potentially truncate.
     * @param maxContextTokens Maximum tokens to allow for context portion.
     * @returns Truncated context if needed.
     */
    public truncateContextIfNeeded(context: string, maxContextTokens: number = 20000): string {
        const estimatedTokens = this.estimateTokenCount(context);
        
        if (estimatedTokens <= maxContextTokens) {
            return context;
        }
        
        // Truncate to approximate token limit
        const targetLength = maxContextTokens * 4; // Convert back to characters
        const truncated = context.substring(0, targetLength);
        
        return truncated + '\n\n[... context truncated due to length ...]';
    }
} 