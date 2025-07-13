import { BaseModal } from './core/BaseModal';
import { createElement } from './core/modal-utils';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { UnifiedGenerationService } from '../../project/UnifiedGenerationService';

export interface ConversationalGenerationModalConfig {
    projectManager: ProjectManager;
    node: DocumentNode;
}

export class ConversationalGenerationModal extends BaseModal {
    private projectManager: ProjectManager;
    private node: DocumentNode;
    private isGenerating: boolean = false;

    // State for generation settings
    private draftLevel: number = -1;
    private contentLevel: number = -1;
    private contextPruneLevel: number = -1;
    private coherenceLevel: number = -1;
    private autofixSeverity: number = -1;

    constructor(config: ConversationalGenerationModalConfig) {
        super({
            id: 'conversational-generation-modal',
            title: '🤖 Smart Generation Assistant',
            closable: true,
            backdrop: true,
            width: '90vw',
            height: '85vh',
            maxWidth: '1200px',
            maxHeight: '900px'
        });

        this.projectManager = config.projectManager;
        this.node = config.node;

        // Initialize with sensible defaults
        this.draftLevel = this.node.level;
        this.contentLevel = this.node.level;
        this.contextPruneLevel = -1;
        this.coherenceLevel = -1;
        this.autofixSeverity = -1;
    }

    /**
     * Get the display name for a template level
     */
    private getLevelDisplayName(level: number): string {
        if (level < 0 || level >= this.node.template.length) return 'Unknown';
        const levelName = this.node.template[level];
        if (!levelName) return 'Unknown';
        return levelName.match(/^(\w+)(?:\s+\d+)?$/)?.[1] || levelName;
    }

    /**
     * Get available levels from current node down
     */
    private getAvailableLevels(): Array<{ value: number; name: string }> {
        const levels: Array<{ value: number; name: string }> = [];
        
        for (let i = this.node.level; i < this.node.template.length; i++) {
            levels.push({
                value: i,
                name: this.getLevelDisplayName(i)
            });
        }
        
        return levels;
    }

    /**
     * Get coherence levels (parent levels only)
     */
    private getCoherenceLevels(): Array<{ value: number; name: string }> {
        const levels: Array<{ value: number; name: string }> = [];
        
        // Coherence level must be less than draft level
        for (let i = this.node.level; i < this.node.template.length - 1; i++) {
            levels.push({
                value: i,
                name: this.getLevelDisplayName(i + 1) // Show child level name for UI
            });
        }
        
        return levels;
    }

    public override render(): HTMLElement {
        const availableLevels = this.getAvailableLevels();
        const coherenceLevels = this.getCoherenceLevels();
        const currentLevelName = this.getLevelDisplayName(this.node.level);

        const container = createElement('div');
        container.innerHTML = `
            <div class="conversational-generation-container">
                <style>
                    .conversational-generation-container {
                        max-width: 1000px;
                        margin: 0 auto;
                        padding: 2rem;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.6;
                        color: #374151;
                    }

                    .conversation-text {
                        font-size: 1.1rem;
                        line-height: 1.7;
                        margin: 1.5rem 0;
                    }

                    .conversation-text strong {
                        color: #1f2937;
                        font-weight: 600;
                    }

                    .inline-control {
                        display: inline-block;
                        margin: 0 0.25rem;
                        padding: 0.4rem 0.8rem;
                        border: 2px solid #3b82f6;
                        border-radius: 8px;
                        background: #eff6ff;
                        color: #1e40af;
                        font-weight: 600;
                        min-width: 120px;
                        text-align: center;
                    }

                    .inline-control select {
                        border: none;
                        background: transparent;
                        color: inherit;
                        font-weight: inherit;
                        font-size: inherit;
                        cursor: pointer;
                        width: 100%;
                    }

                    .inline-control select:focus {
                        outline: none;
                    }

                    .inline-control.disabled {
                        background: #f3f4f6;
                        border-color: #d1d5db;
                        color: #6b7280;
                    }

                    .inline-control.none-selected {
                        background: #f9fafb;
                        border-color: #e5e7eb;
                        color: #6b7280;
                    }

                    .node-info-card {
                        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        padding: 1.5rem;
                        margin: 2rem 0;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }

                    .node-title {
                        font-size: 1.3rem;
                        font-weight: 700;
                        color: #1e293b;
                        margin-bottom: 0.5rem;
                    }

                    .node-path {
                        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                        font-size: 0.9rem;
                        color: #64748b;
                        background: #ffffff;
                        padding: 0.25rem 0.5rem;
                        border-radius: 4px;
                        display: inline-block;
                    }

                    .control-section {
                        background: #ffffff;
                        border: 1px solid #e5e7eb;
                        border-radius: 12px;
                        padding: 1.5rem;
                        margin: 1.5rem 0;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                    }

                    .section-title {
                        font-size: 1.1rem;
                        font-weight: 600;
                        color: #1f2937;
                        margin-bottom: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                    }

                    .advanced-toggle {
                        margin: 1.5rem 0;
                        text-align: center;
                    }

                    .advanced-toggle button {
                        background: #f9fafb;
                        border: 1px solid #d1d5db;
                        color: #6b7280;
                        padding: 0.5rem 1rem;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 0.9rem;
                        transition: all 0.2s;
                    }

                    .advanced-toggle button:hover {
                        background: #f3f4f6;
                        border-color: #9ca3af;
                    }

                    .advanced-options {
                        display: none;
                        animation: fadeIn 0.3s ease-in;
                    }

                    .advanced-options.show {
                        display: block;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    .generation-actions {
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                        margin: 2rem 0;
                        padding: 1.5rem;
                        background: #f8fafc;
                        border-radius: 12px;
                        border: 1px solid #e2e8f0;
                    }

                    .generation-actions button {
                        padding: 0.75rem 2rem;
                        border-radius: 8px;
                        font-weight: 600;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: 2px solid transparent;
                    }

                    .btn-primary {
                        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                        color: white;
                        border-color: #2563eb;
                    }

                    .btn-primary:hover:not(:disabled) {
                        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                    }

                    .btn-primary:disabled {
                        background: #9ca3af;
                        border-color: #9ca3af;
                        cursor: not-allowed;
                        transform: none;
                        box-shadow: none;
                    }

                    .btn-secondary {
                        background: #ffffff;
                        color: #6b7280;
                        border-color: #d1d5db;
                    }

                    .btn-secondary:hover {
                        background: #f9fafb;
                        border-color: #9ca3af;
                    }

                    .help-text {
                        background: #fffbeb;
                        border: 1px solid #fbbf24;
                        border-radius: 8px;
                        padding: 1rem;
                        margin: 1rem 0;
                        font-size: 0.95rem;
                        color: #92400e;
                    }

                    .help-text strong {
                        color: #78350f;
                    }

                    .validation-message {
                        background: #fee2e2;
                        border: 1px solid #fca5a5;
                        border-radius: 8px;
                        padding: 0.75rem;
                        margin: 1rem 0;
                        color: #dc2626;
                        font-size: 0.9rem;
                        display: none;
                    }

                    .validation-message.show {
                        display: block;
                    }

                    .progress-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.8);
                        display: none;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                    }

                    .progress-overlay.show {
                        display: flex;
                    }

                    .progress-content {
                        background: white;
                        border-radius: 12px;
                        padding: 2rem;
                        text-align: center;
                        max-width: 400px;
                        width: 90%;
                    }

                    .progress-spinner {
                        width: 40px;
                        height: 40px;
                        border: 4px solid #e5e7eb;
                        border-top: 4px solid #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    }

                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>

                <!-- Current Node Information -->
                <div class="node-info-card">
                    <div class="node-title">📄 ${this.node.title}</div>
                    <div class="node-path">${this.projectManager.getNodePath(this.node.id)}</div>
                </div>

                <!-- Main Conversation Text -->
                <div class="conversation-text">
                    Welcome to the <strong>Smart Generation Assistant</strong>! This tool will help you generate content for your project in a way that's easy to understand and configure.
                </div>

                <div class="conversation-text">
                    I'll help you generate content for your <strong>${currentLevelName}</strong> node. Let's walk through the options step by step.
                </div>

                <!-- Primary Generation Settings -->
                <div class="control-section">
                    <div class="section-title">
                        🏗️ Structure Creation
                    </div>
                    <div class="conversation-text">
                        First, I can create child nodes (the structure) down to the 
                        <span class="inline-control">
                            <select id="draft-level-select" onchange="window.conversationalModal.updateDraftLevel(this.value)">
                                <option value="-1">Don't create children</option>
                                ${availableLevels.map(level => 
                                    `<option value="${level.value}" ${this.draftLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                ).join('')}
                            </select>
                        </span>
                        level.
                    </div>
                    
                    <div class="help-text">
                        💡 <strong>Structure Creation</strong> means the AI will analyze your current content and create child nodes with titles and brief descriptions. For example, if you're at the "Book" level, it might create "Chapter 1", "Chapter 2", etc.
                    </div>
                </div>

                <div class="control-section">
                    <div class="section-title">
                        ✍️ Content Writing
                    </div>
                    <div class="conversation-text">
                        Then, I can write actual content for all nodes down to the 
                        <span class="inline-control ${this.contentLevel === -1 ? 'none-selected' : ''}">
                            <select id="content-level-select" onchange="window.conversationalModal.updateContentLevel(this.value)">
                                <option value="-1">Don't write content</option>
                                ${availableLevels.map(level => 
                                    `<option value="${level.value}" ${this.contentLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                ).join('')}
                            </select>
                        </span>
                        level.
                    </div>
                    
                    <div class="help-text">
                        💡 <strong>Content Writing</strong> means the AI will generate the actual written content for each node. This includes detailed paragraphs, dialogue, descriptions, etc. - the "meat" of your project.
                    </div>
                </div>

                <!-- Advanced Options Toggle -->
                <div class="advanced-toggle">
                    <button onclick="window.conversationalModal.toggleAdvanced()">
                        🔧 Advanced Options (Optional)
                    </button>
                </div>

                <div id="advanced-options" class="advanced-options">
                    <div class="control-section">
                        <div class="section-title">
                            🧹 Context Cleaning
                        </div>
                        <div class="conversation-text">
                            For better focus, I can automatically clean up inherited context down to the 
                            <span class="inline-control ${this.contextPruneLevel === -1 ? 'none-selected' : ''}">
                                <select id="context-prune-level-select" onchange="window.conversationalModal.updateContextPruneLevel(this.value)">
                                    <option value="-1">Don't clean context</option>
                                    ${availableLevels.map(level => 
                                        `<option value="${level.value}" ${this.contextPruneLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                    ).join('')}
                                </select>
                            </span>
                            level.
                        </div>
                        
                        <div class="help-text">
                            💡 <strong>Context Cleaning</strong> removes irrelevant background information that might confuse the AI. For example, when writing a specific scene, it removes context about unrelated chapters.
                        </div>
                    </div>

                    <div class="control-section">
                        <div class="section-title">
                            🔍 Quality Checking
                        </div>
                        <div class="conversation-text">
                            I can check for contradictions between outlines and content at the 
                            <span class="inline-control ${this.coherenceLevel === -1 ? 'none-selected' : ''}">
                                <select id="coherence-level-select" onchange="window.conversationalModal.updateCoherenceLevel(this.value)">
                                    <option value="-1">Don't check coherence</option>
                                    ${coherenceLevels.map(level => 
                                        `<option value="${level.value}" ${this.coherenceLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                    ).join('')}
                                </select>
                            </span>
                            level.
                        </div>
                        
                        <div class="help-text">
                            💡 <strong>Quality Checking</strong> ensures that detailed content matches the original outline. If contradictions are found, you'll be shown them and can choose how to fix them.
                        </div>
                    </div>
                </div>

                <!-- Validation Messages -->
                <div id="validation-message" class="validation-message">
                    <!-- Validation errors will appear here -->
                </div>

                <!-- Action Buttons -->
                <div class="generation-actions">
                    <button class="btn-secondary" onclick="window.conversationalModal.close()">
                        Cancel
                    </button>
                    <button id="start-generation-btn" class="btn-primary" onclick="window.conversationalModal.startGeneration()" ${this.isGenerating ? 'disabled' : ''}>
                        ${this.isGenerating ? '⏳ Generating...' : '🚀 Start Generation'}
                    </button>
                </div>

                <!-- Progress Overlay -->
                <div id="progress-overlay" class="progress-overlay">
                    <div class="progress-content">
                        <div class="progress-spinner"></div>
                        <h3>Generating Content...</h3>
                        <p id="progress-message">Preparing generation process...</p>
                        <button class="btn-secondary" onclick="window.conversationalModal.cancelGeneration()" style="margin-top: 1rem;">
                            Stop Generation
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        return container;
    }

    /**
     * Setup event handlers after modal is opened
     */
    public override async open(): Promise<void> {
        await super.open();
        
        // Expose modal instance to window for event handlers
        (window as any).conversationalModal = this;
        
        this.updateValidation();
    }

    /**
     * Update draft level
     */
    public updateDraftLevel(value: string): void {
        this.draftLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update content level
     */
    public updateContentLevel(value: string): void {
        this.contentLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update context prune level
     */
    public updateContextPruneLevel(value: string): void {
        this.contextPruneLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update coherence level
     */
    public updateCoherenceLevel(value: string): void {
        this.coherenceLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Toggle advanced options
     */
    public toggleAdvanced(): void {
        const advancedOptions = document.getElementById('advanced-options');
        if (advancedOptions) {
            advancedOptions.classList.toggle('show');
        }
    }

    /**
     * Update inline control styles based on selection
     */
    private updateInlineControlStyles(): void {
        const updateControlStyle = (selectId: string, value: number) => {
            const select = document.getElementById(selectId) as HTMLSelectElement;
            if (select) {
                const control = select.closest('.inline-control');
                if (control) {
                    control.classList.toggle('none-selected', value === -1);
                }
            }
        };

        updateControlStyle('draft-level-select', this.draftLevel);
        updateControlStyle('content-level-select', this.contentLevel);
        updateControlStyle('context-prune-level-select', this.contextPruneLevel);
        updateControlStyle('coherence-level-select', this.coherenceLevel);
    }

    /**
     * Validate current settings
     */
    private updateValidation(): void {
        const validationMessage = document.getElementById('validation-message');
        const startButton = document.getElementById('start-generation-btn') as HTMLButtonElement;
        
        if (!validationMessage || !startButton) return;

        let errors: string[] = [];

        // Check if content level > draft level
        if (this.contentLevel > this.draftLevel && this.draftLevel !== -1) {
            errors.push('Content level cannot be higher than structure creation level.');
        }

        // Check if coherence level >= draft level
        if (this.coherenceLevel >= this.draftLevel && this.draftLevel !== -1) {
            errors.push('Quality checking level must be less than structure creation level.');
        }

        // Check if any work needs to be done
        if (this.draftLevel === -1 && this.contentLevel === -1 && this.contextPruneLevel === -1 && this.coherenceLevel === -1) {
            errors.push('Please select at least one option for generation.');
        }

        if (errors.length > 0) {
            validationMessage.innerHTML = errors.map(error => `⚠️ ${error}`).join('<br>');
            validationMessage.classList.add('show');
            startButton.disabled = true;
        } else {
            validationMessage.classList.remove('show');
            startButton.disabled = this.isGenerating;
        }
    }

    /**
     * Start the generation process
     */
    public async startGeneration(): Promise<void> {
        if (this.isGenerating) return;

        this.isGenerating = true;
        
        // Show progress overlay
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.add('show');
        }

        // Update button state
        const startButton = document.getElementById('start-generation-btn') as HTMLButtonElement;
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = '⏳ Generating...';
        }

        try {
            // Update progress message
            this.updateProgressMessage('Starting generation process...');

            // Import UnifiedGenerationService
            const { UnifiedGenerationService } = await import('../../project/UnifiedGenerationService');

            // Create service dependencies
            const unifiedService = new UnifiedGenerationService({
                treeService: this.projectManager.getTreeService(),
                contextService: this.projectManager.getContextService(),
                promptService: this.projectManager.getPromptService(),
                generationController: this.projectManager.getGenerationController(),
                generationCoordinator: this.projectManager.getGenerationCoordinator(),
                loopOrchestrator: (this.projectManager as any).loopOrchestrator,
                settingsManager: this.projectManager.getSettingsManager(),
                openRouterClient: (this.projectManager as any).openRouterClient,
                eventEmitter: this.projectManager,
                saveToStorage: () => this.projectManager.saveToStorage(),
                rootNode: this.projectManager.rootNode
            });

            // Define generation levels
            const levels = {
                draftLevel: this.draftLevel,
                contentLevel: this.contentLevel,
                contextPruneLevel: this.contextPruneLevel,
                coherenceLevel: this.coherenceLevel,
                autofixSeverity: this.autofixSeverity
            };

            this.updateProgressMessage('Generating content with AI...');

            // Start unified generation
            await unifiedService.generateWithLevels(this.node.id, levels);

            // Save to storage
            await this.projectManager.saveToStorage();

            this.updateProgressMessage('Generation completed successfully!');

            // Close modal after short delay
            setTimeout(() => {
                this.close();
            }, 1500);

        } catch (error) {
            console.error('Generation failed:', error);
            this.updateProgressMessage(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // Show error for a few seconds then hide progress
            setTimeout(() => {
                this.hideProgress();
            }, 3000);
        }
    }

    /**
     * Cancel the generation process
     */
    public cancelGeneration(): void {
        // Request abort through generation controller
        this.projectManager.getGenerationController().requestAbort();
        this.hideProgress();
    }

    /**
     * Update progress message
     */
    private updateProgressMessage(message: string): void {
        const progressMessage = document.getElementById('progress-message');
        if (progressMessage) {
            progressMessage.textContent = message;
        }
    }

    /**
     * Hide progress overlay and reset state
     */
    private hideProgress(): void {
        this.isGenerating = false;
        
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.remove('show');
        }

        const startButton = document.getElementById('start-generation-btn') as HTMLButtonElement;
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = '🚀 Start Generation';
        }
    }

    /**
     * Cleanup when modal is closed
     */
    public override async close(): Promise<void> {
        // Clean up window reference
        delete (window as any).conversationalModal;
        await super.close();
    }
} 