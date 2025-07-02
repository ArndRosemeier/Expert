/**
 * AI Project Creator Component
 * 
 * Provides AI-powered project creation with natural language description
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import { ProjectGenerationService, ProjectGenerationRequest } from '../services/ProjectGenerationService';
import * as state from '../../../state';
import { SettingsManager } from '../../../SettingsManager';

export interface AIProjectCreatorConfig {
    onCreate: (title: string, template: ProjectTemplate, aiData?: any) => void;
    settingsManager?: SettingsManager;
}

export interface ProjectGenerationOptions {
    includeCharacters: boolean;  // Always true - automatically included for narrative projects
    includeStyleGuide: boolean;  // Always true - automatically included for all projects  
    detailedOutline: boolean;    // User choice - create comprehensive detailed outline
}

export class AIProjectCreator {
    private config: AIProjectCreatorConfig;
    private container: HTMLElement | null = null;
    private cleanupHandlers: (() => void)[] = [];
    private isGenerating: boolean = false;
    private generationService: ProjectGenerationService;

    constructor(config: AIProjectCreatorConfig) {
        this.config = config;
        // Initialize the generation service
        // Phase 1: Use without client (mock generation)
        // Phase 2: Will pass the actual OpenRouter client
        this.generationService = new ProjectGenerationService(undefined, config.settingsManager);
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
                    
                    .generation-options {
                        background-color: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 8px;
                        padding: 1.5rem;
                        margin-bottom: 1rem;
                        height: fit-content;
                    }
                    
                    .generation-options h4 {
                        margin: 0 0 1rem 0;
                        color: #495057;
                        font-size: 1rem;
                    }
                    
                    .option-group {
                        display: flex;
                        flex-direction: column;
                        gap: 0.75rem;
                    }
                    
                    .option-group label {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        font-weight: normal;
                        cursor: pointer;
                        color: #495057;
                        transition: color 0.2s ease;
                    }
                    
                    .option-group label:hover {
                        color: #007bff;
                    }
                    
                    .option-group input[type="checkbox"] {
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                    }
                    
                    .option-note {
                        margin-top: 1rem;
                        padding: 0.75rem;
                        background-color: #e7f3ff;
                        border: 1px solid #b3d7ff;
                        border-radius: 6px;
                        font-size: 0.9rem;
                        color: #0056b3;
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
                    <label for="ai-project-description">
                        🤖 Describe Your Project
                    </label>
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
                        <div class="generation-options">
                            <h4>🎯 Generation Options</h4>
                            <div class="option-group">
                                <label>
                                    <input type="checkbox" id="detailed-outline" checked>
                                    <span>📋 Create detailed project outline</span>
                                </label>
                            </div>
                            <div class="option-note">
                                <small>💡 <strong>Note:</strong> Style guides and character information (for stories) are automatically included based on your project type.</small>
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
            const generateHandler = () => this.handleGenerate();
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
                content: result.content,           // Project outline/structure
                context: result.context,          // Consolidated context (characters, style guides, etc.)
                generatedAt: result.metadata.generatedAt,
                projectType: result.metadata.projectType
            };
            
            // Use the generated title and template
            this.config.onCreate(result.title, result.template, aiData);
            
        } catch (error) {
            console.error('❌ AI Generation failed:', error);
            
            // Show the actual error message instead of a generic one
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'Unknown error occurred during project generation';
                
            alert(`Project generation failed:\n\n${errorMessage}\n\nCheck the browser console for detailed debugging information.`);
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
        if (!this.container) {
            return { includeCharacters: true, includeStyleGuide: true, detailedOutline: true };
        }
        
        return {
            includeCharacters: true,  // Always true, automatically included for narratives
            includeStyleGuide: true,  // Always true, automatically included for all projects
            detailedOutline: (this.container.querySelector('#detailed-outline') as HTMLInputElement)?.checked || false
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
} 