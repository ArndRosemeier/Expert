import { BaseModal } from './core/BaseModal';
import { DocumentNode } from '../../DocumentNode';
import { DiffTool } from '../../DiffTool';
import { SettingsManager } from '../../SettingsManager';
import { OpenRouterClient } from '../../OpenRouterClient';
import { TaskModelService } from '../../services/TaskModelService';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { PromptContextBuilder } from '../../services/PromptContextBuilder';
import { formatContentForPreWrap } from '../../utils/TextFormattingUtils';
import * as state from '../../state';
import { QualityCriterion } from '../../types';

export interface PolishingButton {
    id: string;
    label: string;
    detail: string;
}

export interface PolishingOptions {
    detail: string;
    criteria: string;
}

export class PolisherModal extends BaseModal {
    private node: DocumentNode | null = null;
    private settingsManager: SettingsManager;
    private openRouterClient: OpenRouterClient;
    private taskModelService: TaskModelService;
    private isGenerating: boolean = false;
    private originalContent: string = ''; // Store original content for undo functionality
    private polishingInstructions: string = ''; // Store custom polishing instructions
    
    // Default polishing buttons
    private defaultButtons: PolishingButton[] = [
        { id: 'clarity', label: '✨ Clarity', detail: 'make the text clearer and more understandable' },
        { id: 'concise', label: '📝 Concise', detail: 'make the text more concise and to the point' },
        { id: 'engaging', label: '🎯 Engaging', detail: 'make the text more engaging and compelling' },
        { id: 'professional', label: '💼 Professional', detail: 'make the text more professional and formal' },
        { id: 'creative', label: '🎨 Creative', detail: 'make the text more creative and imaginative' },
        { id: 'direct', label: '⚡ Direct', detail: 'use more direct speech and active voice' },
        { id: 'gritty', label: '💪 Gritty', detail: 'make the text more gritty and realistic' },
        { id: 'detailed', label: '🔍 Detailed', detail: 'add more specific details and examples' },
        { id: 'custom', label: '🎯 Custom', detail: 'make the text more {{input "make the text more..."}}' }
    ];

    private polishingButtons: PolishingButton[] = [];

    constructor(settingsManager: SettingsManager, openRouterClient: OpenRouterClient) {
        super({ 
            id: 'polisher-modal',
            closable: true,
            backdrop: true,
            width: '92vw',
            height: '92vh',
            maxWidth: 'none',
            maxHeight: 'none'
        });
        this.settingsManager = settingsManager;
        this.openRouterClient = openRouterClient;
        this.taskModelService = new TaskModelService(settingsManager);
        this.polishingButtons = [...this.defaultButtons];
    }

    /**
     * Override buildContentStyle to remove BaseModal constraints
     */
    protected override buildContentStyle(): string {
        // Start with clean styles, removing BaseModal's max-height and padding constraints
        let style = `
            background-color: white;
            border-radius: 12px;
            overflow-x: hidden;
            box-sizing: border-box;
            padding: 0;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        `;
        
        // Apply our custom dimensions
        if (this.config.width) {
            style += `width: ${this.config.width};`;
        }
        if (this.config.height) {
            style += `height: ${this.config.height};`;
        }
        if (this.config.maxWidth) {
            style += `max-width: ${this.config.maxWidth};`;
        }
        if (this.config.maxHeight) {
            style += `max-height: ${this.config.maxHeight};`;
        }
        
        return style;
    }

    /**
     * Open modal with a node to polish
     */
    async openWithNode(node: DocumentNode): Promise<void> {
        this.node = node;
        this.isGenerating = false;
        
        // Store original content for undo functionality
        this.originalContent = node.content || '';
        this.polishingInstructions = '';
        
        // Prevent body scrolling while modal is open
        document.body.style.overflow = 'hidden';
        
        await super.open();
        this.setupEventListeners();
    }

    /**
     * Render method required by BaseModal
     */
    public render(): HTMLElement {
        const content = document.createElement('div');
        content.innerHTML = this.renderModalContent();
        return content;
    }

    /**
     * Render modal content
     */
    private renderModalContent(): string {
        if (!this.node) {
            return '<p>No node selected for polishing.</p>';
        }

        const nodeTitle = this.node.title || 'Untitled Node';
        const nodeContent = this.node.content || ''; // No need to trim - handled by DocumentNode
        
        return `
            <style>
                /* CSS for nested container structure */
                .polisher-modal-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    min-height: 0;
                }
                
                .modal-header {
                    flex-shrink: 0;
                    padding: 1.5rem 1.5rem 0;
                    background-color: white;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .modal-body.polisher-body {
                    display: flex;
                    flex-direction: row;
                    flex: 1;
                    min-height: 0;
                    padding: 1rem 1.5rem;
                    gap: 1.5rem;
                }
                
                .polisher-controls {
                    flex-shrink: 0;
                    width: 300px;
                    margin-bottom: 0;
                }
                
                .polisher-control-section {
                    margin-bottom: 1.5rem;
                }
                
                .polisher-control-section h3 {
                    margin: 0 0 0.75rem 0;
                    font-size: 1.1rem;
                    color: #374151;
                }
                
                .task-config-display {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.5rem;
                    padding: 1rem;
                    margin-bottom: 1rem;
                }
                
                .config-item {
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                    color: #374151;
                }
                
                .config-item:last-child {
                    margin-bottom: 0;
                }
                
                .config-note {
                    margin-top: 0.75rem;
                    padding-top: 0.75rem;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                }
                
                .polisher-content {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    flex: 1;
                }
                
                .content-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .content-comparison {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }
                
                .content-comparison .content-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .content-box {
                    overflow-y: auto;
                    padding: 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background-color: #fafafa;
                    font-family: 'Source Code Pro', monospace;
                    font-size: 0.875rem;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    box-sizing: border-box;
                    flex: 1;
                    min-height: 200px;
                }
                
                .diff-content {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                
                .diff-content ins {
                    background-color: #d4edda;
                    color: #155724;
                    text-decoration: none;
                }
                
                .diff-content del {
                    background-color: #f8d7da;
                    color: #721c24;
                    text-decoration: line-through;
                }
                
                .diff-summary-section {
                    flex-shrink: 0;
                    margin-bottom: 1rem;
                }
                
                .modal-actions.polisher-actions {
                    flex-shrink: 0;
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e5e7eb;
                    background-color: white;
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                
                .polishing-loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(255, 255, 255, 0.9);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10;
                }
                
                .polishing-instructions-section {
                    margin-top: 1rem;
                }
                
                .polishing-instructions-textarea {
                    width: 100%;
                    min-height: 120px;
                    padding: 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background-color: #fafafa;
                    font-family: 'Source Code Pro', monospace;
                    font-size: 0.875rem;
                    line-height: 1.5;
                    resize: vertical;
                    box-sizing: border-box;
                    transition: border-color 0.2s ease;
                }
                
                .polishing-instructions-textarea:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .polishing-instructions-textarea:disabled {
                    background-color: #f3f4f6;
                    color: #6b7280;
                    cursor: not-allowed;
                }
                
                .polishing-action-buttons {
                    display: flex;
                    gap: 1rem;
                    margin-top: 1rem;
                    align-items: center;
                }
                
                .polishing-action-buttons .button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            </style>
            <div class="polisher-modal-container">
                <div class="modal-header">
                    <h2>🎨 Text Polisher</h2>
                    <p class="polisher-subtitle">Enhance: <strong>${this.escapeHtml(nodeTitle)}</strong></p>
                </div>
                
                <div class="modal-body polisher-body">
                    ${this.renderControls()}
                    ${this.renderContent(nodeContent)}
                </div>
                
                <div class="modal-actions polisher-actions">
                    ${this.renderActionButtons()}
                </div>
            </div>
        `;
    }

    /**
     * Render control panel
     */
    private renderControls(): string {
        const taskConfig = this.taskModelService.getTaskConfigDisplay('text_polishing');
        
        return `
            <div class="polisher-controls">
                <div class="polisher-control-section">
                    <h3>Model Configuration</h3>
                    <div class="task-config-display">
                        <div class="config-item">
                            <strong>Outline Nodes:</strong> ${taskConfig.outline.purpose} (${taskConfig.outline.model})
                        </div>
                        <div class="config-item">
                            <strong>Prose Nodes:</strong> ${taskConfig.prose.purpose} (${taskConfig.prose.model})
                        </div>
                        <div class="config-note">
                            <small>💡 Configure these settings in Settings → Task Model Configuration</small>
                        </div>
                    </div>
                </div>
                
                <div class="polisher-control-section">
                    <h3>Polishing Style</h3>
                    <div class="polishing-buttons">
                        ${this.renderPolishingButtons()}
                    </div>
                    <button class="button button-secondary polisher-edit-buttons-btn" id="edit-polishing-buttons" 
                            ${this.isGenerating ? 'disabled' : ''}>
                        ⚙️ Edit Buttons
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render polishing buttons
     */
    private renderPolishingButtons(): string {
        return this.polishingButtons.map(button => `
            <button class="button button-secondary polishing-style-btn" 
                    data-detail="${this.escapeHtmlAttribute(button.detail)}"
                    ${this.isGenerating ? 'disabled' : ''}>
                ${button.label}
            </button>
        `).join('');
    }

    /**
     * Render action buttons - simplified for iterative polishing workflow
     */
    private renderActionButtons(): string {
        return `<button class="button button-secondary" id="close-polisher-btn">Close</button>`;
    }

    /**
     * Render content area - shows single view initially, then splits to diff view after polishing
     */
    private renderContent(currentContent: string): string {
        // Determine if we should show diff view (content has been polished)
        const showDiffView = currentContent !== this.originalContent;
        
        const baseContent = showDiffView ? `
            <div class="polisher-content">
                <div class="content-comparison">
                    <div class="content-section">
                        <h4>Original Content</h4>
                        <div class="content-box original-content diff-content">${DiffTool.compare(this.originalContent, currentContent).originalHtml}</div>
                    </div>
                    
                    <div class="content-section">
                        <h4>Polished Content</h4>
                        <div class="content-box polished-content diff-content">${DiffTool.compare(this.originalContent, currentContent).modifiedHtml}</div>
                    </div>
                </div>
                
                <div class="content-section polishing-instructions-section">
                    <h3>Polishing Instructions</h3>
                    <textarea 
                        id="polishing-instructions" 
                        class="polishing-instructions-textarea"
                        placeholder="Enter specific instructions for how you want the content to be polished..."
                        ${this.isGenerating ? 'disabled' : ''}>${formatContentForPreWrap(this.polishingInstructions)}</textarea>
                    
                    <div class="polishing-action-buttons">
                        <button 
                            class="button button-primary" 
                            id="execute-polishing-btn"
                            ${this.isGenerating || !this.polishingInstructions.trim() ? 'disabled' : ''}
                        >
                            🎨 Execute Now
                        </button>
                        <button 
                            class="button button-secondary" 
                            id="undo-changes-btn"
                            ${this.isGenerating || currentContent === this.originalContent ? 'disabled' : ''}
                        >
                            ↶ Undo
                        </button>
                    </div>
                </div>
            </div>
        ` : `
            <div class="polisher-content">
                <div class="content-section">
                    <h3>Content</h3>
                    <div class="content-box original-content">${formatContentForPreWrap(currentContent)}</div>
                </div>
                
                <div class="content-section polishing-instructions-section">
                    <h3>Polishing Instructions</h3>
                    <textarea 
                        id="polishing-instructions" 
                        class="polishing-instructions-textarea"
                        placeholder="Enter specific instructions for how you want the content to be polished..."
                        ${this.isGenerating ? 'disabled' : ''}>${formatContentForPreWrap(this.polishingInstructions)}</textarea>
                    
                    <div class="polishing-action-buttons">
                        <button 
                            class="button button-primary" 
                            id="execute-polishing-btn"
                            ${this.isGenerating || !this.polishingInstructions.trim() ? 'disabled' : ''}
                        >
                            🎨 Execute Now
                        </button>
                        <button 
                            class="button button-secondary" 
                            id="undo-changes-btn"
                            ${this.isGenerating || currentContent === this.originalContent ? 'disabled' : ''}
                        >
                            ↶ Undo
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add loading overlay if generating
        const loadingOverlay = this.isGenerating ? `
            <div class="polishing-loading-overlay">
                <div class="polishing-loading">
                    <div class="loading-spinner"></div>
                    <h3>🎨 Polishing Content...</h3>
                    <p>AI is enhancing your text. This may take a few moments.</p>
                </div>
            </div>
        ` : '';

        return baseContent + loadingOverlay;
    }

    /**
     * Get filtered criteria based on node type
     */
    private getFilteredCriteria(): QualityCriterion[] {
        const currentProfile = this.settingsManager.getLastUsedProfile();
        if (!currentProfile || !this.node) return [];
        
        const allCriteria = currentProfile.criteria ?? [];
        return this.filterCriteriaForNodeType(allCriteria, this.node.isLeaf);
    }

    /**
     * Filter criteria based on node type (leaf vs outline/branch)
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
     * Format criteria as text for the prompt
     */
    private formatCriteriaAsText(): string {
        const criteria = this.getFilteredCriteria();
        return criteria.map(c => c.name + (c.description ? ': ' + c.description : '')).join('\n');
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Close button
        const closeBtn = document.getElementById('close-polisher-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => { void this.close(); });
        }

        // Polishing style buttons
        const styleButtons = document.querySelectorAll('.polishing-style-btn');
        styleButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                void this.handleStyleButtonClick(e);
            });
        });

        // Edit buttons
        const editButtonsBtn = document.getElementById('edit-polishing-buttons');
        if (editButtonsBtn) {
            editButtonsBtn.addEventListener('click', () => { this.openEditButtonsModal(); });
        }

        // Custom polishing instructions
        this.setupCustomPolishingListeners();

        // ESC key handler
        document.addEventListener('keydown', this.handleEscKey.bind(this));
    }

    private async handleStyleButtonClick(e: Event): Promise<void> {
        const button = e.target;
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }
        const detail = button.dataset['detail'] ?? '';
        const processedDetail = await this.processInputPlaceholders(detail);
        if (processedDetail === '__CANCELED__') {
            return;
        }
        await this.generatePolishedContentWithDetail(processedDetail);
    }

    /**
     * Process {{input}} placeholders in detail text using centralized system
     */
    private async processInputPlaceholders(detail: string): Promise<string> {
        try {
            // Build prompt context for centralized expansion
            const promptContext = PromptContextBuilder.forUI(this.settingsManager);
            
            // Get settings manager from active project
            const activeProject = state.getActiveProject();
            if (!activeProject) {
                throw new Error('No active project for polishing');
            }
            const settingsManager = activeProject.getSettingsManager();
            const expansionService = createPromptExpansionService(settingsManager);
            
            const processedDetail = await expansionService.expandPromptAsync(detail, promptContext);
            return processedDetail;
            
        } catch (error) {
            if (error instanceof Error && error.message === 'USER_CANCELLED') {
                return '__CANCELED__';
            }
            throw error;
        }
    }



    /**
     * Setup custom polishing instructions listeners
     */
    private setupCustomPolishingListeners(): void {
        // Polishing instructions textarea
        const instructionsTextarea = document.getElementById('polishing-instructions');
        if (instructionsTextarea instanceof HTMLTextAreaElement) {
            instructionsTextarea.addEventListener('input', () => {
                this.polishingInstructions = instructionsTextarea.value;
                this.updateExecuteButtonState();
            });
        }

        // Execute polishing button
        const executeBtn = document.getElementById('execute-polishing-btn');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => {
                if (this.polishingInstructions.trim()) {
                    void this.generatePolishedContentWithDetail(this.polishingInstructions.trim());
                }
            });
        }

        // Undo changes button
        const undoBtn = document.getElementById('undo-changes-btn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => { this.undoChanges(); });
        }
    }

    /**
     * Update the execute button state based on instructions content
     */
    private updateExecuteButtonState(): void {
        const executeBtn = document.getElementById('execute-polishing-btn');
        if (executeBtn instanceof HTMLButtonElement) {
            const hasInstructions = this.polishingInstructions.trim().length > 0;
            executeBtn.disabled = this.isGenerating || !hasInstructions;
        }
    }

    /**
     * Undo changes and restore original content
     */
    private undoChanges(): void {
        if (!this.node) return;

        // Restore original content to the node
        this.node.setContentWithTags(this.originalContent, ['edited', 'content_edited', 'undo']);
        
        // Save to storage
        void import('../../state').then(({ getActiveProject }) => {
            const project = getActiveProject();
            if (project) {
                void project.saveToStorage();
            }
        });

        // Refresh UI
        this.refresh();
        
        // Show confirmation
        console.log('Content restored to original state');
    }

    /**
     * Generate polished content with specific detail
     */
    private async generatePolishedContentWithDetail(detail: string): Promise<void> {
        try {
            this.isGenerating = true;
            this.refresh();
            
            const criteria = this.formatCriteriaAsText();
            
            const options: PolishingOptions = {
                detail,
                criteria
            };
            
            const polishedContent = await this.performPolishing(options);
            
            // Apply the polished content directly to the node for iterative polishing
            if (this.node) {
                this.node.setContent(polishedContent, 'polished');
                
                // Save to storage
                void import('../../state').then(({ getActiveProject }) => {
                    const project = getActiveProject();
                    if (project) {
                        void project.saveToStorage();
                    }
                });
                
                // Trigger UI update
                const event = new CustomEvent('nodeContentChanged', {
                    detail: { nodeId: this.node.id }
                });
                document.dispatchEvent(event);
            }
            
            this.isGenerating = false;
            this.refresh();
            
        } catch (error) {
            console.error('Error generating polished content:', error);
            this.isGenerating = false;
            this.refresh();
        }
    }

    /**
     * Perform the actual polishing
     */
    private async performPolishing(options: PolishingOptions): Promise<string> {
        if (!this.node) {
            throw new Error('No node selected for polishing');
        }

        const prompt = this.createPolishingPrompt(options);
        console.log('Polishing prompt:', prompt);

        try {
            // Use configurable model based on template-defined leaf status, not current children count
            const isLeaf = this.node.isLeaf;
            const modelPurpose = this.taskModelService.getModelPurposeForTask('text_polishing', isLeaf);
            
            console.log(`🎨 Using ${modelPurpose} model for polishing ${isLeaf ? 'template-leaf' : 'template-branch'} node "${this.node.title}"`);

            const response = await this.openRouterClient.chat(
                modelPurpose,
                prompt
            );

            if (!response) {
                throw new Error('Empty response from AI');
            }

            return response;
        } catch (error) {
            console.error('Error in performPolishing:', error);
            throw error;
        }
    }

    /**
     * Create the polishing prompt
     */
    private createPolishingPrompt(options: PolishingOptions): string {
        if (!this.node) {
            throw new Error('No node selected for polishing');
        }

        const content = this.node.content || '';
        
        // Use the text_polishing prompt template
        const promptTemplate = `You are an expert text polisher and editor. Your task is to enhance the provided text to ${options.detail}.

INSTRUCTIONS:
1. Enhance the text while preserving its core meaning and structure
2. Focus specifically on: ${options.detail}
3. Ensure the enhanced text meets all the quality criteria above
4. Maintain the original tone and style unless the enhancement requires changes
5. Return ONLY the enhanced text, no explanations or meta-commentary

Your response will be evaluated against these criteria:
- ${options.criteria}

Please provide the full enhanced version of the text, this is for an automated workflow, so no questions or comments please.
Text:
${content}`;

        return promptTemplate;
    }



    /**
     * Refresh modal content
     */
    private refresh(): void {
        const modalContent = document.querySelector(`[data-modal-id="${this.id}"] .modal-content`);
        if (modalContent) {
            modalContent.innerHTML = this.renderModalContent();
            
            // Let BaseModal recreate the close button properly if this modal is closable
            if (this.config.closable) {
                this.addCloseButton(modalContent as HTMLElement);
            }
            
            this.setupEventListeners();
        }
    }

    /**
     * Open edit buttons modal
     */
    private openEditButtonsModal(): void {
        // Create simple overlay modal for editing buttons
        const overlay = document.createElement('div');
        overlay.className = 'polisher-edit-overlay';
        overlay.innerHTML = `
            <div class="polisher-edit-modal">
                <div class="polisher-edit-header">
                    <h3>Edit Polishing Buttons</h3>
                    <button class="polisher-edit-close">&times;</button>
                </div>
                <div class="polisher-edit-body">
                    ${this.renderButtonEditor()}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.setupButtonEditorListeners(overlay);
    }

    /**
     * Render button editor
     */
    private renderButtonEditor(): string {
        return `
            <div class="button-editor-help">
                <p>💡 Tip: Use <code>{{input}}</code> as the detail to make a button open custom instructions.</p>
            </div>
            <div class="button-editor-list">
        ` + this.polishingButtons.map((button, index) => `
                <div class="button-editor-row">
                    <input type="text" class="button-label-input" value="${this.escapeHtmlAttribute(button.label)}" 
                           data-index="${index}" data-field="label" placeholder="Button label (e.g., ✨ Clarity)">
                    <input type="text" class="button-detail-input" value="${this.escapeHtmlAttribute(button.detail)}" 
                           data-index="${index}" data-field="detail" placeholder="Polishing instruction (or {{input}} for custom)">
                    <button class="button button-danger button-sm remove-button-btn" data-index="${index}">×</button>
                </div>
        `).join('') + `
            </div>
            <div class="button-editor-add-section">
                <button class="button button-secondary button-add-new" id="add-new-button">
                    <span>+</span> Add New Button
                </button>
                <div class="button-editor-actions">
                    <button class="button button-secondary" id="reset-default-buttons">Reset to Default</button>
                    <button class="button button-primary" id="save-polishing-buttons">Save Changes</button>
                </div>
            </div>
        `;
    }

    /**
     * Setup button editor listeners
     */
    private setupButtonEditorListeners(overlay: HTMLElement): void {
        // Close button
        const closeBtn = overlay.querySelector('.polisher-edit-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
        }

        // Input change handlers
        const inputs = overlay.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                const index = parseInt(target.dataset['index'] ?? '0');
                const field = target.dataset['field'] as 'label' | 'detail';
                const buttonEntry = this.polishingButtons[index];
                if (!buttonEntry) {
                    throw new Error(`Polishing button not found at index ${index}`);
                }
                buttonEntry[field] = target.value;
            });
        });

        // Remove button handlers
        const removeButtons = overlay.querySelectorAll('.remove-button-btn');
        removeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.target as HTMLElement).dataset['index'] ?? '0');
                this.polishingButtons.splice(index, 1);
                this.refreshButtonEditor(overlay);
            });
        });

        // Add new button
        const addBtn = overlay.querySelector('#add-new-button');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.polishingButtons.push({
                    id: `custom_${Date.now()}`,
                    label: '🆕 New Style',
                    detail: 'make it more...'
                });
                this.refreshButtonEditor(overlay);
            });
        }

        // Reset to default
        const resetBtn = overlay.querySelector('#reset-default-buttons');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset all buttons to default? This will lose any custom buttons.')) {
                    this.polishingButtons = [...this.defaultButtons];
                    this.refreshButtonEditor(overlay);
                }
            });
        }

        // Save changes
        const saveBtn = overlay.querySelector('#save-polishing-buttons');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => { void this.saveButtonEditorChanges(overlay); });
        }
    }

    private async saveButtonEditorChanges(overlay: HTMLElement): Promise<void> {
        await this.savePolishingButtons();
        document.body.removeChild(overlay);
        this.refresh();
    }

    /**
     * Refresh button editor content
     */
    private refreshButtonEditor(overlay: HTMLElement): void {
        const body = overlay.querySelector('.polisher-edit-body');
        if (body) {
            body.innerHTML = this.renderButtonEditor();
            this.setupButtonEditorListeners(overlay);
        }
    }

    /**
     * Save polishing buttons to IndexedDB
     */
    private async savePolishingButtons(): Promise<void> {
        try {
            const { StorageService } = await import('../../StorageService');
            const storage = await StorageService.getInstance();
            await storage.set('polisher_buttons', this.polishingButtons);
            console.log('✅ Polisher buttons saved to IndexedDB');
        } catch (error) {
            console.error('❌ Failed to save polisher buttons to IndexedDB:', error);
        }
    }

    /**
     * Load polishing buttons from IndexedDB
     */
    private async loadPolishingButtons(): Promise<void> {
        try {
            const { StorageService } = await import('../../StorageService');
            const storage = await StorageService.getInstance();
            const saved = await storage.get('polisher_buttons');
            
            if (Array.isArray(saved)) {
                this.polishingButtons = saved as PolishingButton[];
                console.log('✅ Loaded polisher buttons from IndexedDB');
            } else {
                this.polishingButtons = [...this.defaultButtons];
                console.log('🔄 No saved polisher buttons found, using defaults');
            }
        } catch (error) {
            console.error('❌ Failed to load polisher buttons from IndexedDB:', error);
            this.polishingButtons = [...this.defaultButtons];
        }
    }

    /**
     * Handle ESC key press
     */
    private handleEscKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            void this.close();
        }
    }

    /**
     * Initialize modal (called after construction)
     */
    public async initialize(): Promise<void> {
        await this.loadPolishingButtons();
    }

    /**
     * Close modal and cleanup
     */
    override async close(): Promise<void> {
        // Remove any edit overlays
        const overlays = document.querySelectorAll('.polisher-edit-overlay');
        overlays.forEach(overlay => { overlay.remove(); });
        
        // Restore body scrolling
        document.body.style.overflow = '';
        
        // Refresh the main UI to show the updated content
        try {
            const { renderMultiProjectTree, renderNodeDetails } = await import('../project-ui');
            renderMultiProjectTree();
            void renderNodeDetails();
            console.log('✅ Main UI refreshed after polishing');
        } catch (refreshError) {
            console.warn('⚠️ Failed to refresh main UI after polishing:', refreshError);
            // Don't fail the modal close if UI refresh fails
        }
        
        await super.close();
    }

    /**
     * Escape HTML characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Escape HTML characters for use in HTML attributes
     */
    private escapeHtmlAttribute(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}