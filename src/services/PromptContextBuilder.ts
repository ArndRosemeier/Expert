import { DocumentNode } from '../DocumentNode.js';
import { SettingsManager } from '../SettingsManager.js';
import { PlaceholderContext } from './PromptExpansionService.js';

export class PromptContextBuilder {
    
    private static getValidatedCriteria(settingsManager: SettingsManager): any[] {
        const profile = settingsManager.getLastUsedProfile();
        if (!profile) {
            throw new Error('No active profile available - settings configuration corrupted');
        }
        if (!profile.criteria || profile.criteria.length === 0) {
            throw new Error('Profile has no criteria configured - profile data corrupted or incomplete');
        }
        return profile.criteria;
    }

    /**
     * Build context for a specific node
     */
    static forNode(node: DocumentNode, settingsManager: SettingsManager): PlaceholderContext {
        const language = settingsManager.getLanguage();
        console.log('🔍 PromptContextBuilder.forNode() called:', {
            nodeTitle: node.title,
            language,
            settingsManagerInstance: settingsManager.constructor.name
        });
        
        return {
            node: {
                title: node.title,
                content: node.content,
                isLeaf: node.isLeaf
            },
            project: {
                title: 'Current Project', // TODO: Get actual project title
                language,
                criteria: this.getValidatedCriteria(settingsManager)
            }
        };
    }
    
    /**
     * Build context for generation operations
     */
    static forGeneration(
        node: DocumentNode, 
        settingsManager: SettingsManager,
        path: string,
        options: {
            count?: number;
            childLevelName?: string;
            generateCount?: string;
            draftOrFresh?: string;
            parentContent?: string;
            context?: string;
        } = {}
    ): PlaceholderContext {
        const base = this.forNode(node, settingsManager);
        base.node!.path = path;
        base.generation = {
            ...(options.count !== undefined && { count: options.count }),
            ...(options.childLevelName !== undefined && { childLevelName: options.childLevelName }),
            ...(options.generateCount !== undefined && { generateCount: options.generateCount }),
            ...(options.draftOrFresh !== undefined && { draftOrFresh: options.draftOrFresh }),
            ...(options.parentContent !== undefined && { parentContent: options.parentContent }),
            ...(options.context !== undefined && { context: options.context })
        };
        return base;
    }
    
    /**
     * Build context for prompt operations
     */
    static forPrompt(
        settingsManager: SettingsManager,
        options: {
            userPrompt?: string;
            lastResponse?: string;
            editorAdvice?: string;
            originalPrompt?: string;
            response?: string;
            ratings?: any;
            instruction?: string;
            originalText?: string;
            detail?: string;
        } = {}
    ): PlaceholderContext {
        return {
            project: {
                language: settingsManager.getLanguage(),
                criteria: this.getValidatedCriteria(settingsManager)
            },
            prompt: options
        };
    }
    
    /**
     * Build context for analysis operations
     */
    static forAnalysis(
        settingsManager: SettingsManager,
        options: {
            fileName?: string;
            textContent?: string;
            extractionRequest?: string;
            nodeTitle?: string;
            parentTitle?: string;
            childTitle?: string;
            factInOutline?: string;
            factInExpansion?: string;
            justification?: string;
            outlineContent?: string;
            description?: string;
            childrenContent?: string;
            parentContext?: string;
        } = {}
    ): PlaceholderContext {
        return {
            project: {
                language: settingsManager.getLanguage(),
                criteria: this.getValidatedCriteria(settingsManager)
            },
            analysis: options
        };
    }
    
    /**
     * Build context for UI operations
     */
    static forUI(
        settingsManager: SettingsManager,
        options: {
            nodeData?: string;
            startingNode?: string;
            selected?: string;
        } = {}
    ): PlaceholderContext {
        return {
            project: {
                language: settingsManager.getLanguage(),
                criteria: this.getValidatedCriteria(settingsManager)
            },
            ui: options
        };
    }
    
    /**
     * Legacy method - creates context from old-style parameter lists
     * This helps with migration from scattered .replace() calls
     */
    static fromLegacyParams(
        settingsManager: SettingsManager | { getLanguage(): string; getCriteria(): any[] },
        params: Record<string, string>
    ): PlaceholderContext {
        // Handle legacy mock objects that have getCriteria method
        const language = settingsManager.getLanguage();
        const criteria = 'getCriteria' in settingsManager 
            ? settingsManager.getCriteria() 
            : this.getValidatedCriteria(settingsManager as SettingsManager);
            
        return {
            project: {
                language: language,
                criteria: criteria
            },
            custom: params
        };
    }
    
    /**
     * Extend existing context with additional data
     */
    static extend(base: PlaceholderContext, additions: Partial<PlaceholderContext>): PlaceholderContext {
        return {
            ...base,
            node: { ...base.node, ...additions.node },
            project: { ...base.project, ...additions.project },
            generation: { ...base.generation, ...additions.generation },
            prompt: { ...base.prompt, ...additions.prompt },
            analysis: { ...base.analysis, ...additions.analysis },
            ui: { ...base.ui, ...additions.ui },
            custom: { ...base.custom, ...additions.custom }
        };
    }
} 