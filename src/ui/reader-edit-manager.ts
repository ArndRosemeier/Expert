import { ProjectManager } from '../ProjectManager.js';
import { DocumentNode } from '../DocumentNode.js';
import { OpenRouterClient } from '../OpenRouterClient.js';
import { QualityCriterion } from '../types.js';
import { 
    ReaderEditAction, 
    EditActionConfig, 
    EditContext 
} from '../types/ReaderEditingTypes';
import { promptExpansionService } from '../services/PromptExpansionService.js';
import { PromptContextBuilder } from '../services/PromptContextBuilder.js';
import { formatCriteriaAsJson } from '../ProjectUtils';

/**
 * ReaderEditManager handles AI-powered editing actions within the reader view.
 * Manages action configurations, prompt execution, and content replacement.
 */
export class ReaderEditManager {
    private projectManager: ProjectManager;
    private config: EditActionConfig;
    private static readonly CONFIG_STORAGE_KEY = 'reader_edit_actions';

    constructor(projectManager: ProjectManager) {
        this.projectManager = projectManager;
        this.config = this.getDefaultConfig();
    }

    /**
     * Initialize the manager by loading saved configuration
     */
    public async initialize(): Promise<void> {
        await this.loadConfig();
    }

    /**
     * Get the default action configuration
     */
    private getDefaultConfig(): EditActionConfig {
        return {
            version: 5,
            actions: [
                {
                    id: 'expand-details',
                    title: 'More Details',
                    prompt: 'Expand the following text with more details and examples. Return ONLY the expanded version without any introductory text or explanations:\n\n{{selected}}\n\nContext: {{content}}\nNode: {{title}}\n\nExpanded text:',
                    model: 'creator',
                    enabled: true,
                    order: 1,
                    description: 'Add more details and examples to the selected text'
                },
                {
                    id: 'simplify',
                    title: 'Simplify',
                    prompt: 'Take the following text and make it shorter and simpler. Use fewer words and simpler language. Remove unnecessary details. Return ONLY the simplified version, nothing else:\n\n{{selected}}\n\nSimplified version:',
                    model: 'editor',
                    enabled: true,
                    order: 2,
                    description: 'Make the selected text simpler and clearer'
                },
                {
                    id: 'improve-clarity',
                    title: 'Improve Clarity',
                    prompt: 'Rewrite the following text for better clarity and readability while maintaining its meaning. Return ONLY the improved version without any introductory text:\n\n{{selected}}\n\nFull context: {{content}}\n\nImproved text:',
                    model: 'editor',
                    enabled: true,
                    order: 3,
                    description: 'Improve clarity and readability'
                },
                {
                    id: 'add-examples',
                    title: 'Add Examples',
                    prompt: 'Add relevant examples to the following text. Return ONLY the text with examples integrated, without any introductory phrases:\n\n{{selected}}\n\nNode context: {{content}}\nProject: {{project_title}}\n\nText with examples:',
                    model: 'creator',
                    enabled: true,
                    order: 4,
                    description: 'Add practical examples to the content'
                },
                {
                    id: 'change',
                    title: 'Change',
                    prompt: 'Quality criteria for this project:\n{{criteria}}\n\nFull context for reference:\nNode: {{title}}\nContent: {{content}}\n\nAn instruction follows that should be applied to a text.\nWhen making changes, consider the quality criteria above.\nOnly return the result of that instruction, nothing more.\nInstruction: {{input "How should the text be changed?"}}\nText:\n{{selected}}',
                    model: 'creator',
                    enabled: true,
                    order: 5,
                    description: 'Change selected text according to custom instructions'
                },
                {
                    id: 'continue-cursor-end',
                    title: 'Continue (cursor at the end)',
                    prompt: 'Quality criteria for this project:\n{{criteria}}\n\nPlease continue the following text while adhering to the quality criteria above:\n\n{{content}}\n\nJust answer with the continuation.',
                    model: 'creator',
                    enabled: true,
                    order: 6,
                    description: 'Continue the text from where it ends'
                }
            ]
        };
    }

    /**
     * Load configuration from storage
     */
    private async loadConfig(): Promise<void> {
        try {
            const storage = await import('../StorageService').then(m => m.StorageService.getInstance());
            const savedConfig = await storage.get<EditActionConfig>(ReaderEditManager.CONFIG_STORAGE_KEY);
            
            // TEMPORARY: Force reset to fix prompt issues - increment version to invalidate old configs
            const currentVersion = 5; // Incremented to add criteria support
            
            if (savedConfig && savedConfig.version === currentVersion) {
                this.config = savedConfig;
                console.log('✅ Reader edit actions config loaded from storage', {
                    actionCount: this.config.actions.length,
                    version: this.config.version
                });
            } else {
                // Version mismatch or no config - use defaults and save
                console.log('📝 Using default reader edit actions config', {
                    reason: savedConfig ? 'version mismatch' : 'no saved config',
                    savedVersion: savedConfig?.version,
                    currentVersion
                });
                this.config.version = currentVersion;
                await this.saveConfig();
    
            }
        } catch (error) {
            console.error('❌ Failed to load reader edit actions config:', error);
            // Continue with default config
        }
    }

    /**
     * Save configuration to storage
     */
    private async saveConfig(): Promise<void> {
        try {
            const storage = await import('../StorageService').then(m => m.StorageService.getInstance());
            await storage.set(ReaderEditManager.CONFIG_STORAGE_KEY, this.config);
            console.log('✅ Reader edit actions config saved successfully', {
                actionCount: this.config.actions.length,
                version: this.config.version
            });
        } catch (error) {
            console.error('❌ Failed to save reader edit actions config:', error);
            throw error; // Re-throw to ensure callers are aware of the failure
        }
    }

    /**
     * Get all enabled actions sorted by order
     */
    public getEnabledActions(): ReaderEditAction[] {
        return this.config.actions
            .filter(action => action.enabled)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * Get all actions (for configuration UI)
     */
    public getAllActions(): ReaderEditAction[] {
        return [...this.config.actions].sort((a, b) => a.order - b.order);
    }

    /**
     * Add a new action
     */
    public async addAction(action: Omit<ReaderEditAction, 'id'>): Promise<string> {
        const id = `custom-${Date.now()}`;
        const newAction: ReaderEditAction = {
            ...action,
            id
        };
        
        this.config.actions.push(newAction);
        await this.saveConfig();
        
        return id;
    }

    /**
     * Update an existing action
     */
    public async updateAction(id: string, updates: Partial<ReaderEditAction>): Promise<boolean> {
        const index = this.config.actions.findIndex(action => action.id === id);
        if (index === -1) return false;
        
        // Ensure the action exists before updating
        const existingAction = this.config.actions[index];
        if (existingAction) {
            Object.assign(existingAction, updates);
        }
        await this.saveConfig();
        
        return true;
    }

    /**
     * Delete an action
     */
    public async deleteAction(id: string): Promise<boolean> {
        const index = this.config.actions.findIndex(action => action.id === id);
        if (index === -1) return false;
        
        this.config.actions.splice(index, 1);
        await this.saveConfig();
        
        return true;
    }

    /**
     * Execute an action on the given context
     */
    public async executeAction(actionId: string, context: EditContext): Promise<string> {
        const action = this.config.actions.find(a => a.id === actionId);
        if (!action) {
            throw new Error(`Action not found: ${actionId}`);
        }

        // Fill the prompt with context data
        const filledPrompt = await this.fillPrompt(action.prompt, context);
        
        // Check if action was canceled during prompt filling
        if (filledPrompt === '__CANCELED__') {
            throw new Error('ACTION_CANCELED'); // Throw cancellation error instead of returning empty
        }
        
        // Execute the prompt using OpenRouterClient directly
        const openRouterClient = this.getOpenRouterClient();
        const result = await openRouterClient.chat(action.model, filledPrompt);
        
        // Clean up the result to remove any AI fluff
        const cleanResult = this.cleanAIResponse(result);
        
        return cleanResult;
    }

    /**
     * Fill a prompt template with context data
     */
    private async fillPrompt(promptTemplate: string, context: EditContext): Promise<string> {
        try {
            // Build prompt context for centralized expansion
            const placeholders = await this.buildPlaceholders(context.node);
            const promptContext = PromptContextBuilder.fromLegacyParams(
                context.node ? this.projectManager.getSettingsManager() : { getLanguage: () => 'English', getCriteria: () => [] } as any,
                placeholders
            );
            
            // Add selected text to UI context
            if (context.selection?.text) {
                promptContext.ui = { selected: context.selection.text };
            }
            
            // Use centralized async expansion (handles both regular and interactive placeholders)
            const filledPrompt = await promptExpansionService.expandPromptAsync(promptTemplate, promptContext);
            return filledPrompt;
            
        } catch (error) {
            if (error instanceof Error && error.message === 'USER_CANCELLED') {
                return '__CANCELED__';
            }
            throw error;
        }
    }

    /**
     * Get OpenRouterClient from the project manager
     */
    private getOpenRouterClient(): OpenRouterClient {
        // Access via the generation service's dependencies or use reflection
        const generationService = this.projectManager.getGenerationService();
        return (generationService as any).deps.openRouterClient;
    }

    /**
     * Build placeholders for a node manually (since PromptService doesn't expose this)
     */
    private async buildPlaceholders(node: DocumentNode): Promise<Record<string, string>> {
        const treeService = this.projectManager.getTreeService();
        const contextService = this.projectManager.getContextService();
        
        // Build context similar to how GenerationService does it
        const context = contextService.compileNodeContext(node.id, this.projectManager.rootNode);
        const path = treeService.getNodePath(node.id, this.projectManager.rootNode);
        
        // Get criteria from settings manager
        const settingsManager = this.projectManager.getSettingsManager();
        const profile = settingsManager.getLastUsedProfile();
        const allCriteria = profile?.criteria || [];
        
        // Filter criteria for leaf nodes (most editing actions are on leaf content)
        const isLeafNode = !node.children || node.children.length === 0;
        const criteria = this.filterCriteriaForNodeType(allCriteria, isLeafNode);
        
        return {
            'content': node.content || '',
            'title': node.title,
            'path': path,
            'context': context,
            'project_title': this.projectManager.projectTitle,
            'parent_content': node.parentId ? 
                this.projectManager.findNodeById(node.parentId)?.content || '' : '',
            'child_level_name': node.childLevelName || '',
            'criteria': formatCriteriaAsJson(criteria)
        };
    }

    /**
     * Formats criteria as JSON for consistent presentation to AI models
     * (Same format as LoopOrchestrator)
     */


    /**
     * Filters criteria based on node type (leaf vs outline/branch).
     * @param criteria The full list of criteria.
     * @param isLeafNode Whether the node is a leaf node.
     * @returns Filtered criteria appropriate for the node type.
     */
    private filterCriteriaForNodeType(criteria: QualityCriterion[], isLeafNode: boolean): QualityCriterion[] {
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
     * Get available placeholders for prompt building UI
     */
    public async getAvailablePlaceholders(node?: DocumentNode): Promise<Record<string, string>> {
        const placeholders: Record<string, string> = {
            'selected': '[Selected text in the reader]'
        };
        
        if (node) {
            const nodePlaceholders = await this.buildPlaceholders(node);
            Object.assign(placeholders, nodePlaceholders);
        } else {
            // Default placeholders when no specific node
            placeholders['content'] = '[Current node content]';
            placeholders['title'] = '[Current node title]';
            placeholders['project_title'] = '[Project title]';
            placeholders['parent_content'] = '[Parent node content]';
            placeholders['context'] = '[Node context and hierarchy]';
            placeholders['criteria'] = '[Quality criteria for this project]';
        }
        
        return placeholders;
    }

    /**
     * Validate a prompt template
     */
    public validatePrompt(promptTemplate: string): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (!promptTemplate.trim()) {
            errors.push('Prompt cannot be empty');
        }
        
        if (!promptTemplate.includes('{{selected}}')) {
            errors.push('Prompt should include {{selected}} placeholder to use selected text');
        }
        
        // Check for unmatched braces
        const openBraces = (promptTemplate.match(/\{\{/g) || []).length;
        const closeBraces = (promptTemplate.match(/\}\}/g) || []).length;
        
        if (openBraces !== closeBraces) {
            errors.push('Unmatched placeholder braces - ensure all {{placeholder}} tags are properly closed');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Clean AI response to remove introductory fluff and formatting
     */
    private cleanAIResponse(response: string): string {
        let cleaned = response.trim();
        
        // Remove common AI introductory phrases (more comprehensive)
        const fluffPatterns = [
            /^Here'?s?\s+(an?\s+)?(expanded|improved|simplified|rewritten|clarified|shorter|concise)[^:]*:\s*/i,
            /^I'?ve\s+(expanded|improved|simplified|rewritten|clarified|made\s+it)[^:]*:\s*/i,
            /^The\s+(expanded|improved|simplified|rewritten|clarified|shorter)\s+(version|text)[^:]*:\s*/i,
            /^(Expanded|Improved|Simplified|Rewritten|Clarified|Shorter)\s+(text|version)[^:]*:\s*/i,
            /^(Here|Below)\s+is\s+(the\s+)?(simplified|shorter|improved)[^:]*:\s*/i,
            /^As\s+requested[^:]*:\s*/i,
            /^(Certainly|Sure|Of\s+course)[^:]*:\s*/i,
            /^Let\s+me\s+(simplify|improve|rewrite)[^:]*:\s*/i,
            /^I\s+can\s+(simplify|improve|rewrite)[^:]*:\s*/i,
            /^To\s+(simplify|improve|make\s+it\s+clearer)[^:]*:\s*/i,
            /^A\s+(simplified|shorter|improved)\s+version[^:]*:\s*/i,
            /^(Making\s+it\s+simpler|Simplifying)[^:]*:\s*/i
        ];
        
        for (const pattern of fluffPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        
        // Remove trailing explanatory text after the main content
        const trailingPatterns = [
            /\n\n(This\s+(expanded|improved|simplified|rewritten|clarified)\s+version|I\s+hope\s+this\s+helps|Let\s+me\s+know)[^]*$/i,
            /\n\n(This\s+is\s+(now\s+)?(simpler|shorter|clearer)|The\s+simplified\s+version)[^]*$/i,
            /\n\n(Is\s+this\s+what\s+you\s+were\s+looking\s+for|Does\s+this\s+work)[^]*$/i
        ];
        
        for (const pattern of trailingPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        
        // Remove any remaining colon artifacts at the beginning
        cleaned = cleaned.replace(/^:\s*/, '');
        
        // Clean up extra whitespace
        cleaned = cleaned.replace(/^\s+|\s+$/g, ''); // trim
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // normalize multiple line breaks
        
        return cleaned;
    }

    /**
     * Reset to default configuration
     */
    public async resetToDefaults(): Promise<void> {
        this.config = this.getDefaultConfig();
        await this.saveConfig();
    }
} 