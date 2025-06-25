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
            version: 3,
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
                    prompt: 'Full context for reference:\nNode: {{title}}\nContent: {{content}}\n\nAn instruction follows that should be applied to a text.\nOnly return the result of that instruction, nothing more.\nInstruction: {{input "How should the text be changed?"}}\nText:\n{{selected}}',
                    model: 'creator',
                    enabled: true,
                    order: 5,
                    description: 'Change selected text according to custom instructions'
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
            const currentVersion = 3; // Incremented to add Change action with input placeholder
            
            if (savedConfig && savedConfig.version === currentVersion) {
                this.config = savedConfig;
            } else {
                // Version mismatch or no config - use defaults and save
                this.config.version = currentVersion;
                await this.saveConfig();
    
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
        
        // Handle {{input "Title"}} placeholders first
        const inputMatches = filledPrompt.match(/\{\{input\s+"([^"]+)"\}\}/g);
        if (inputMatches) {
            for (const match of inputMatches) {
                const titleMatch = match.match(/\{\{input\s+"([^"]+)"\}\}/);
                if (titleMatch) {
                    const title = titleMatch[1];
                    const userInput = await this.showInputModal(title);
                    filledPrompt = filledPrompt.replace(match, userInput);
                }
            }
        }
        
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
     * Show an input modal and return the user's input
     */
    private async showInputModal(title: string): Promise<string> {
        return new Promise((resolve) => {
            // Import modal manager dynamically to avoid circular dependencies
            import('./modal-manager').then(({ openGenericModal, closeGenericModal }) => {
                const modalContent = `
                    <style>
                        .input-modal {
                            width: 400px;
                            max-width: 90vw;
                        }
                        .input-modal-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 1.5rem;
                            padding-bottom: 1rem;
                            border-bottom: 1px solid #e5e7eb;
                        }
                        .input-modal-title {
                            margin: 0;
                            color: #1f2937;
                            font-size: 1.25rem;
                            font-weight: 600;
                        }
                        .input-modal-close {
                            background: #ef4444;
                            color: white;
                            border: none;
                            border-radius: 50%;
                            width: 32px;
                            height: 32px;
                            cursor: pointer;
                            font-size: 1.2rem;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .input-modal-close:hover {
                            background: #dc2626;
                        }
                        .input-modal-body {
                            margin-bottom: 1.5rem;
                        }
                        .input-modal-field {
                            margin-bottom: 1rem;
                        }
                        .input-modal-label {
                            display: block;
                            font-weight: 500;
                            color: #374151;
                            margin-bottom: 0.5rem;
                        }
                        .input-modal-input {
                            width: 100%;
                            padding: 0.75rem;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            font-size: 0.875rem;
                            transition: border-color 0.2s;
                        }
                        .input-modal-input:focus {
                            outline: none;
                            border-color: #3b82f6;
                            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                        }
                        .input-modal-actions {
                            display: flex;
                            gap: 0.75rem;
                            justify-content: flex-end;
                        }
                        .input-modal-btn {
                            padding: 0.75rem 1.5rem;
                            border: none;
                            border-radius: 8px;
                            font-size: 0.875rem;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        .input-modal-btn-primary {
                            background-color: #3b82f6;
                            color: white;
                        }
                        .input-modal-btn-primary:hover {
                            background-color: #2563eb;
                        }
                        .input-modal-btn-secondary {
                            background-color: #6b7280;
                            color: white;
                        }
                        .input-modal-btn-secondary:hover {
                            background-color: #4b5563;
                        }
                    </style>
                    <div class="input-modal">
                        <div class="input-modal-header">
                            <h3 class="input-modal-title">${title}</h3>
                            <button id="input-modal-close" class="input-modal-close">&times;</button>
                        </div>
                        <div class="input-modal-body">
                            <div class="input-modal-field">
                                <label class="input-modal-label" for="user-input">Please provide your input:</label>
                                <input type="text" id="user-input" class="input-modal-input" placeholder="Enter your instruction..." autofocus>
                            </div>
                        </div>
                        <div class="input-modal-actions">
                            <button id="input-modal-cancel" class="input-modal-btn input-modal-btn-secondary">Cancel</button>
                            <button id="input-modal-submit" class="input-modal-btn input-modal-btn-primary">OK</button>
                        </div>
                    </div>
                `;

                openGenericModal(modalContent, () => {
                    const input = document.getElementById('user-input') as HTMLInputElement;
                    const submitBtn = document.getElementById('input-modal-submit') as HTMLButtonElement;
                    const cancelBtn = document.getElementById('input-modal-cancel') as HTMLButtonElement;
                    const closeBtn = document.getElementById('input-modal-close') as HTMLButtonElement;

                    const handleSubmit = () => {
                        const value = input.value.trim();
                        if (value) {
                            closeGenericModal();
                            resolve(value);
                        } else {
                            input.focus();
                        }
                    };

                    const handleCancel = () => {
                        closeGenericModal();
                        resolve(''); // Return empty string on cancel
                    };

                    // Event listeners
                    submitBtn.addEventListener('click', handleSubmit);
                    cancelBtn.addEventListener('click', handleCancel);
                    closeBtn.addEventListener('click', handleCancel);

                    // Enter key to submit
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSubmit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancel();
                        }
                    });

                    // Focus the input
                    setTimeout(() => input.focus(), 100);
                });
            });
        });
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