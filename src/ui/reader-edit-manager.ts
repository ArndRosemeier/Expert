import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { OpenRouterClient } from '../OpenRouterClient';
import { 
    ReaderEditAction, 
    EditActionConfig, 
    EditContext 
} from '../types/ReaderEditingTypes';

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
            version: 2,
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
            const currentVersion = 2; // Incremented from 1 to force refresh
            
            if (savedConfig && savedConfig.version === currentVersion) {
                this.config = savedConfig;
            } else {
                // Version mismatch or no config - use defaults and save
                this.config.version = currentVersion;
                await this.saveConfig();
                console.log('Reset reader actions to defaults due to version change');
            }
        } catch (error) {
            console.warn('Failed to load reader edit actions config:', error);
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
        } catch (error) {
            console.warn('Failed to save reader edit actions config:', error);
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
    public addAction(action: Omit<ReaderEditAction, 'id'>): string {
        const id = `custom-${Date.now()}`;
        const newAction: ReaderEditAction = {
            ...action,
            id
        };
        
        this.config.actions.push(newAction);
        this.saveConfig();
        
        return id;
    }

    /**
     * Update an existing action
     */
    public updateAction(id: string, updates: Partial<ReaderEditAction>): boolean {
        const index = this.config.actions.findIndex(action => action.id === id);
        if (index === -1) return false;
        
        this.config.actions[index] = { ...this.config.actions[index], ...updates };
        this.saveConfig();
        
        return true;
    }

    /**
     * Delete an action
     */
    public deleteAction(id: string): boolean {
        const index = this.config.actions.findIndex(action => action.id === id);
        if (index === -1) return false;
        
        this.config.actions.splice(index, 1);
        this.saveConfig();
        
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
        let filledPrompt = promptTemplate;
        
        // Replace {{selected}} with selected text or empty if no selection
        const selectedText = context.selection?.text || '';
        filledPrompt = filledPrompt.replace(/\{\{selected\}\}/g, selectedText);
        
        // Get all available placeholders by manually building them
        const placeholders = await this.buildPlaceholders(context.node);
        
        // Replace each placeholder
        for (const [placeholder, value] of Object.entries(placeholders)) {
            const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
            filledPrompt = filledPrompt.replace(regex, value as string);
        }
        
        return filledPrompt;
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
        
        return {
            'content': node.content || '',
            'title': node.title,
            'path': path,
            'context': context,
            'project_title': this.projectManager.projectTitle,
            'parent_content': node.parentId ? 
                this.projectManager.findNodeById(node.parentId)?.content || '' : '',
            'child_level_name': node.childLevelName || '',
            'children_summary': this.getChildrenSummary(node)
        };
    }

    /**
     * Get a summary of child nodes
     */
    private getChildrenSummary(node: DocumentNode): string {
        if (node.children.length === 0) return '';
        
        return node.children
            .map(child => `- ${child.title}${child.content ? ': ' + child.content.substring(0, 100) + '...' : ''}`)
            .join('\n');
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
            placeholders['children_summary'] = '[Summary of child nodes]';
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