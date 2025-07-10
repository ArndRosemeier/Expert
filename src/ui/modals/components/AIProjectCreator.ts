/**
 * AI Project Creator Component
 * 
 * Provides AI-powered project creation with natural language description
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import { ProjectGenerationService, ProjectGenerationRequest } from '../services/ProjectGenerationService';
// import * as state from '../../../state'; // Not used currently
import { SettingsManager } from '../../../SettingsManager';
import { StorageService } from '../../../StorageService';

export interface AIProjectCreatorConfig {
    onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
    settingsManager?: SettingsManager;
}

export interface ProjectGenerationOptions {
    includeCharacters: boolean;  // Always true - automatically included for narrative projects
    includeStyleGuide: boolean;  // Always true - automatically included for all projects
}

export class AIProjectCreator {
    private config: AIProjectCreatorConfig;
    private container: HTMLElement | null = null;
    private cleanupHandlers: (() => void)[] = [];
    private isGenerating: boolean = false;
    private generationService: ProjectGenerationService;
    private static readonly CREATION_PROMPTS_KEY = 'ai_creation_prompts';
    private cachedPrompts: string[] = [];

    constructor(config: AIProjectCreatorConfig) {
        this.config = config;
        // Initialize the generation service
        // Phase 1: Use without client (mock generation)
        // Phase 2: Will pass the actual OpenRouter client
        this.generationService = new ProjectGenerationService(undefined, config.settingsManager);
        // Load cached prompts
        this.loadCachedPrompts();
    }

    public render(): string {
        return `
            <div class="ai-project-creator">
                <style>
                    .ai-project-creator {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    
                    .description-section {
                        width: 100%;
                        margin-bottom: 2rem;
                    }
                    
                    .bottom-content {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 2rem;
                    }
                    
                    @media (max-width: 768px) {
                        .bottom-content {
                            grid-template-columns: 1fr;
                            gap: 1rem;
                        }
                    }
                    
                    .left-column, .right-column {
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .description-section label {
                        display: block;
                        font-weight: bold;
                        margin-bottom: 0.5rem;
                        color: #333;
                        font-size: 1.1rem;
                    }
                    
                    .description-section textarea {
                        width: 100%;
                        min-height: 140px;
                        padding: 1rem;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-family: inherit;
                        font-size: 1rem;
                        line-height: 1.5;
                        resize: vertical;
                        transition: border-color 0.2s ease;
                        box-sizing: border-box;
                    }
                    
                    .description-section textarea:focus {
                        outline: none;
                        border-color: #007bff;
                        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
                    }
                    
                    .helper-text {
                        margin-top: 0.5rem;
                        font-size: 0.9rem;
                        color: #6c757d;
                        font-style: italic;
                    }
                    
                    .generation-info {
                        background-color: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 8px;
                        padding: 1.5rem;
                        margin-bottom: 1rem;
                        height: fit-content;
                    }
                    
                    .generation-info h4 {
                        margin: 0 0 1rem 0;
                        color: #495057;
                        font-size: 1rem;
                    }
                    
                    .info-content {
                        display: flex;
                        flex-direction: column;
                        gap: 0.75rem;
                    }
                    
                    .info-content p {
                        margin: 0;
                        font-size: 0.9rem;
                        color: #495057;
                        line-height: 1.4;
                    }
                    
                    .action-buttons {
                        display: flex;
                        justify-content: center;
                        gap: 1rem;
                        margin-top: 1.5rem;
                    }
                    
                    .progress-section {
                        background-color: #e7f3ff;
                        border: 1px solid #b3d7ff;
                        border-radius: 8px;
                        padding: 1.5rem;
                        text-align: center;
                        margin-top: 1.5rem;
                    }
                    
                    .progress-bar {
                        width: 100%;
                        height: 8px;
                        background-color: #e9ecef;
                        border-radius: 4px;
                        overflow: hidden;
                        margin: 1rem 0;
                    }
                    
                    .progress-fill {
                        height: 100%;
                        background: linear-gradient(90deg, #007bff, #0056b3);
                        border-radius: 4px;
                        transition: width 0.3s ease;
                        animation: progress-pulse 2s infinite;
                    }
                    
                    @keyframes progress-pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.7; }
                    }
                    
                    .progress-text {
                        font-weight: bold;
                        color: #0056b3;
                        margin-bottom: 0.5rem;
                    }
                    
                    .progress-detail {
                        font-size: 0.9rem;
                        color: #6c757d;
                    }
                    
                    .examples-section {
                        background-color: #f1f3f4;
                        border-left: 4px solid #007bff;
                        padding: 1.5rem;
                        border-radius: 0 4px 4px 0;
                        height: fit-content;
                    }
                    
                    .examples-section h4 {
                        margin: 0 0 0.5rem 0;
                        color: #495057;
                        font-size: 0.95rem;
                    }
                    
                    .examples-list {
                        font-size: 0.9rem;
                        color: #6c757d;
                        line-height: 1.5;
                        margin: 0;
                    }
                </style>
                
                <div class="description-section">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                        <label for="ai-project-description" style="margin: 0;">
                            🤖 Describe Your Project
                        </label>
                        <div class="prompt-dropdown-container" style="position: relative;">
                            <button id="saved-prompts-btn" type="button" style="padding: 0.5rem 1rem; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;">
                                📋 Saved Prompts
                                <span style="color: #666;">▼</span>
                            </button>
                            <div id="prompts-dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 1000; min-width: 300px; max-width: 500px; max-height: 300px; overflow-y: auto;">
                                <!-- Prompts will be populated here -->
                            </div>
                        </div>
                    </div>
                    <textarea 
                        id="ai-project-description" 
                        placeholder="Example: A fantasy novel about a young wizard discovering ancient magic in modern Tokyo. The story should have 5 main characters, follow a 3-act structure, and blend Japanese folklore with contemporary urban setting. Include themes of tradition vs. modernity and coming of age..."
                        rows="6"></textarea>
                    <div class="helper-text">
                        💡 Be as detailed as possible! Include genre, themes, structure preferences, character count, setting, target audience, or any specific requirements.
                    </div>
                </div>
                
                <div class="bottom-content">
                    <div class="left-column">
                        <div class="generation-info">
                            <h4>🎯 What's Generated</h4>
                            <div class="info-content">
                                <p>✨ Your project will include creative brainstorming and conceptual ideas to inspire your writing</p>
                                <p>📝 Style guides and character information are automatically included based on your project type</p>
                            </div>
                        </div>
                        
                        <div class="action-buttons">
                            <button id="ai-cancel-btn" class="button button-secondary">Cancel</button>
                            <button id="ai-generate-btn" class="button button-primary">
                                🚀 Generate Project Structure
                            </button>
                        </div>
                        
                        <div id="ai-generation-progress" class="progress-section" style="display: none;">
                            <div class="progress-text">Generating your project...</div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: 0%"></div>
                            </div>
                            <div class="progress-detail">
                                <span id="progress-stage">Analyzing project requirements...</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="right-column">
                        <div class="examples-section">
                            <h4>💭 Example Descriptions:</h4>
                            <div class="examples-list">
                                • "A business plan for a sustainable coffee shop with 3 main sections covering market analysis, operations, and financials"<br><br>
                                • "A mystery novel set in Victorian London with 3 acts, featuring a detective duo and themes of social justice"
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    public setupEventListeners(container: HTMLElement): void {
        this.container = container;
        
        // Generate project button
        const generateBtn = container.querySelector('#ai-generate-btn') as HTMLButtonElement;
        const cancelBtn = container.querySelector('#ai-cancel-btn') as HTMLButtonElement;
        
        if (generateBtn) {
            const generateHandler = async () => this.handleGenerate();
            generateBtn.addEventListener('click', generateHandler);
            this.cleanupHandlers.push(() => generateBtn.removeEventListener('click', generateHandler));
        }
        
        if (cancelBtn) {
            const cancelHandler = () => this.handleCancel();
            cancelBtn.addEventListener('click', cancelHandler);
            this.cleanupHandlers.push(() => cancelBtn.removeEventListener('click', cancelHandler));
        }

        // Auto-resize textarea
        const textarea = container.querySelector('#ai-project-description') as HTMLTextAreaElement;
        if (textarea) {
            const resizeHandler = () => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            };
            textarea.addEventListener('input', resizeHandler);
            this.cleanupHandlers.push(() => textarea.removeEventListener('input', resizeHandler));
        }

        // Setup prompt dropdown functionality
        this.setupPromptDropdownListeners(container);
    }

    private async handleGenerate(): Promise<void> {
        if (this.isGenerating || !this.container) return;
        
        const description = this.getDescription();
        const options = this.getGenerationOptions();
        
        // Validate input
        const validation = this.validateInput();
        if (!validation.isValid) {
            alert(validation.errors.join('\n'));
            return;
        }
        
        // Validate with generation service
        const request: ProjectGenerationRequest = { description, options };
        const serviceValidation = this.generationService.validateRequest(request);
        if (!serviceValidation.isValid) {
            alert(serviceValidation.errors.join('\n'));
            return;
        }
        
        this.isGenerating = true;
        this.showProgress();
        
        try {
            // Use the generation service instead of mock simulation
            const result = await this.generationService.generateProject(
                request,
                (progress) => {
                    // Update progress UI
                    const progressElement = this.container?.querySelector('#progress-stage');
                    const progressFill = this.container?.querySelector('.progress-fill') as HTMLElement;
                    
                    if (progressElement) {
                        progressElement.textContent = progress.message || '';
                    }
                    
                    if (progressFill) {
                        progressFill.style.width = `${progress.progress}%`;
                    }
                }
            );
            
            // Create AI data object with all the generated information
            const aiData = {
                description: result.metadata.description,
                options: result.metadata.options,
                isAIGenerated: true,
                content: result.content,           // Project concept/structure
                context: result.context,          // Consolidated context (characters, style guides, etc.)
                generatedAt: result.metadata.generatedAt,
                projectType: result.metadata.projectType
            };
            
            // Save the prompt to cache for future use
            await this.savePromptToCache(description);
            
            // Use the generated title and template
            this.config.onCreate(result.title, result.template, aiData);
            
        } catch (error) {
            console.error('❌ AI Generation failed:', error);
            
            // Show detailed error modal instead of alert
            if (error instanceof Error) {
                import('../').then(({ GenerationErrorService }) => {
                    const errorService = GenerationErrorService.getInstance();
                    void errorService.showProjectGenerationError(error, this.getDescription());
                }).catch(console.error);
            } else {
                // Fallback for non-Error objects
                const errorMessage = 'Unknown error occurred during project generation';
                alert(`Project generation failed:\n\n${errorMessage}\n\nCheck the browser console for detailed debugging information.`);
            }
        } finally {
            this.isGenerating = false;
            this.hideProgress();
        }
    }

    private getDescription(): string {
        const textarea = this.container?.querySelector('#ai-project-description') as HTMLTextAreaElement;
        return textarea?.value?.trim() || '';
    }

    private getGenerationOptions(): ProjectGenerationOptions {
        return {
            includeCharacters: true,  // Always true, automatically included for narratives
            includeStyleGuide: true   // Always true, automatically included for all projects
        };
    }

    private showProgress(): void {
        const progressSection = this.container?.querySelector('#ai-generation-progress') as HTMLElement;
        const generateBtn = this.container?.querySelector('#ai-generate-btn') as HTMLButtonElement;
        
        if (progressSection) {
            progressSection.style.display = 'block';
        }
        
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';
        }
    }

    private hideProgress(): void {
        const progressSection = this.container?.querySelector('#ai-generation-progress') as HTMLElement;
        const generateBtn = this.container?.querySelector('#ai-generate-btn') as HTMLButtonElement;
        
        if (progressSection) {
            progressSection.style.display = 'none';
        }
        
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = '🚀 Generate Project Structure';
        }
    }

    private handleCancel(): void {
        if (this.isGenerating) {
            const confirmCancel = confirm('Are you sure you want to cancel the AI generation in progress?');
            if (!confirmCancel) return;
        }
        
        // Cancel will be handled by the parent modal
        const event = new CustomEvent('ai-cancel');
        this.container?.dispatchEvent(event);
    }

    public cleanup(): void {
        this.cleanupHandlers.forEach(cleanup => cleanup());
        this.cleanupHandlers = [];
        this.container = null;
        this.isGenerating = false;
    }

    public validateInput(): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        const description = this.getDescription();
        
        if (!description) {
            errors.push('Project description is required');
        } else if (description.length < 20) {
            errors.push('Please provide a more detailed description (at least 20 characters)');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Load cached prompts from storage
     */
    private async loadCachedPrompts(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const prompts = await storage.get<string[]>(AIProjectCreator.CREATION_PROMPTS_KEY);
            this.cachedPrompts = prompts || [];
        } catch (error) {
            console.error('Failed to load cached prompts:', error);
            this.cachedPrompts = [];
        }
    }

    /**
     * Save a new prompt to the cached list
     */
    private async savePromptToCache(prompt: string): Promise<void> {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt || this.cachedPrompts.includes(trimmedPrompt)) {
            return; // Don't add empty or duplicate prompts
        }

        this.cachedPrompts.unshift(trimmedPrompt); // Add to beginning of list
        
        // Keep only the most recent 20 prompts
        if (this.cachedPrompts.length > 20) {
            this.cachedPrompts = this.cachedPrompts.slice(0, 20);
        }

        try {
            const storage = await StorageService.getInstance();
            await storage.set(AIProjectCreator.CREATION_PROMPTS_KEY, this.cachedPrompts);
        } catch (error) {
            console.error('Failed to save prompt to cache:', error);
        }
    }

    /**
     * Remove a prompt from the cached list
     */
    private async removePromptFromCache(prompt: string): Promise<void> {
        const index = this.cachedPrompts.indexOf(prompt);
        if (index === -1) return;

        this.cachedPrompts.splice(index, 1);

        try {
            const storage = await StorageService.getInstance();
            await storage.set(AIProjectCreator.CREATION_PROMPTS_KEY, this.cachedPrompts);
            this.updatePromptDropdown(); // Refresh the dropdown after deletion
        } catch (error) {
            console.error('Failed to remove prompt from cache:', error);
        }
    }

    /**
     * Abbreviate a prompt to 40 characters
     */
    private abbreviatePrompt(prompt: string): string {
        if (prompt.length <= 40) return prompt;
        return prompt.substring(0, 37) + '...';
    }

    /**
     * Update the prompt dropdown with current cached prompts
     */
    private updatePromptDropdown(): void {
        const menu = document.getElementById('prompts-dropdown-menu');
        if (!menu) return;

        // Clear existing content
        menu.innerHTML = '';

        if (this.cachedPrompts.length === 0) {
            menu.innerHTML = '<div style="padding: 1rem; text-align: center; color: #666; font-style: italic;">No saved prompts yet</div>';
            return;
        }

        // Add cached prompts with individual delete buttons
        this.cachedPrompts.forEach((prompt, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; align-items: center; padding: 0.5rem; border-bottom: 1px solid #eee; cursor: pointer;';
            item.dataset['fullPrompt'] = prompt;
            
            item.innerHTML = `
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${prompt.replace(/"/g, '&quot;')}">
                    ${this.abbreviatePrompt(prompt)}
                </div>
                <button type="button" class="delete-prompt-btn" data-index="${index}" style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; background: #ff4444; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8rem;">
                    ✕
                </button>
            `;

            // Handle prompt selection
            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).classList.contains('delete-prompt-btn')) {
                    e.stopPropagation();
                    return; // Don't select when deleting
                }
                const textarea = document.getElementById('ai-project-description') as HTMLTextAreaElement;
                if (textarea) {
                    textarea.value = prompt;
                    this.hidePromptDropdown();
                }
            });

            // Handle delete button
            const deleteBtn = item.querySelector('.delete-prompt-btn') as HTMLButtonElement;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const confirmDelete = confirm(`Delete this prompt?\n\n"${this.abbreviatePrompt(prompt)}"`);
                if (confirmDelete) {
                    this.removePromptFromCache(prompt);
                }
            });

            menu.appendChild(item);
        });
    }

    /**
     * Show the prompt dropdown menu
     */
    private showPromptDropdown(): void {
        const menu = document.getElementById('prompts-dropdown-menu');
        if (menu) {
            menu.style.display = 'block';
            this.updatePromptDropdown();
        }
    }

    /**
     * Hide the prompt dropdown menu
     */
    private hidePromptDropdown(): void {
        const menu = document.getElementById('prompts-dropdown-menu');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    /**
     * Setup event listeners for the prompt dropdown
     */
    private setupPromptDropdownListeners(container: HTMLElement): void {
        const button = container.querySelector('#saved-prompts-btn') as HTMLButtonElement;
        const menu = container.querySelector('#prompts-dropdown-menu') as HTMLElement;

        if (!button || !menu) return;

        // Handle button click to toggle dropdown
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = menu.style.display === 'block';
            if (isVisible) {
                this.hidePromptDropdown();
            } else {
                this.showPromptDropdown();
            }
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target as Node)) {
                this.hidePromptDropdown();
            }
        });

        // Initialize with current prompts
        this.updatePromptDropdown();
    }
} 