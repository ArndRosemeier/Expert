import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { NodeCreationService, NodeSuggestion, INodeCreationService } from './services/NodeCreationService';
import { createElement } from './core/modal-utils';

export interface AddChildNodeModalConfig extends ModalConfig {
    parentNodeId: string;
    parentNode: DocumentNode;
    projectManager: ProjectManager;
    mode?: 'simple' | 'ai'; // Default: 'ai'
}

interface ChildNodeModalState {
    mode: 'simple' | 'ai';
    isGenerating: boolean;
    suggestions: NodeSuggestion[];
    selectedSuggestion: NodeSuggestion | null;
    manualTitle: string;
    updateParent: boolean;
    error: string | null;
    isCreating: boolean;
    creationStep: string | null;
}

export class AddChildNodeModal extends BaseModal {
    private childModalConfig: AddChildNodeModalConfig;
    private nodeCreationService: INodeCreationService;
    private childModalState: ChildNodeModalState;

    constructor(config: AddChildNodeModalConfig, hooks: ModalHooks = {}) {
        super(config, hooks);
        this.childModalConfig = config;
        
        // Initialize modal state
        this.childModalState = {
            mode: config.mode || 'ai',
            isGenerating: false,
            suggestions: [],
            selectedSuggestion: null,
            manualTitle: '',
            updateParent: true,
            error: null,
            isCreating: false,
            creationStep: null
        };

        // Create the node creation service
        this.nodeCreationService = new NodeCreationService(
            (config.projectManager as any).openRouterClient, // Access private property
            config.projectManager.getSettingsManager(),
            config.projectManager.getContextService(),
            config.projectManager.getTreeService(),
            config.projectManager
        );
    }

    public override render(): HTMLElement {
        console.log('🎨 render() called - creating modal HTML');
        console.log('📊 Initial modal state:', this.childModalState);
        
        const container = createElement('div', {
            classes: ['add-child-node-modal'],
            attributes: { style: this.getModalStyles() }
        });

        // Header
        const header = createElement('div', {
            classes: ['modal-header'],
            content: `<h2>Add ${this.childModalConfig.parentNode.childLevelName || 'Child'} to "${this.childModalConfig.parentNode.title}"</h2>`
        });
        container.appendChild(header);

        // Mode selector
        const modeSelector = this.createModeSelector();
        container.appendChild(modeSelector);

        // Content area
        const contentArea = createElement('div', { classes: ['modal-content-area'] });
        
        if (this.childModalState.mode === 'ai') {
            contentArea.appendChild(this.createAIMode());
        } else {
            contentArea.appendChild(this.createSimpleMode());
        }

        container.appendChild(contentArea);

        // Footer with parent update checkbox
        console.log('🦶 Creating initial footer with event listeners');
        const footer = this.createFooter();
        container.appendChild(footer);

        // Show creation loading overlay if creating
        if (this.childModalState.isCreating) {
            const creationOverlay = this.createCreationLoadingState();
            container.appendChild(creationOverlay);
        }

        console.log('✅ Modal HTML created successfully');
        return container;
    }

    private createModeSelector(): HTMLElement {
        const selector = createElement('div', {
            classes: ['mode-selector'],
            attributes: { style: 'margin-bottom: 20px; display: flex; gap: 10px;' }
        });

        const isDisabled = this.childModalState.isCreating || this.childModalState.isGenerating;

        const aiButton = createElement('button', {
            content: '🤖 AI Suggestions',
            classes: this.childModalState.mode === 'ai' ? ['mode-btn', 'active'] : ['mode-btn'],
            attributes: { 
                style: this.getModeButtonStyle(this.childModalState.mode === 'ai', isDisabled),
                disabled: isDisabled ? 'disabled' : ''
            }
        });

        const simpleButton = createElement('button', {
            content: '✏️ Manual Input',
            classes: this.childModalState.mode === 'simple' ? ['mode-btn', 'active'] : ['mode-btn'],
            attributes: { 
                style: this.getModeButtonStyle(this.childModalState.mode === 'simple', isDisabled),
                disabled: isDisabled ? 'disabled' : ''
            }
        });

        aiButton.addEventListener('click', () => {
            if (!isDisabled) this.switchMode('ai');
        });
        simpleButton.addEventListener('click', () => {
            if (!isDisabled) this.switchMode('simple');
        });

        selector.appendChild(aiButton);
        selector.appendChild(simpleButton);

        return selector;
    }

    private createAIMode(): HTMLElement {
        const container = createElement('div', { classes: ['ai-mode'] });

        if (this.childModalState.isGenerating) {
            container.appendChild(this.createLoadingState());
        } else if (this.childModalState.error) {
            container.appendChild(this.createErrorState());
        } else if (this.childModalState.suggestions.length > 0) {
            container.appendChild(this.createSuggestionsView());
        } else {
            // Initial state - show empty state with generate button
            container.appendChild(this.createEmptyAIState());
        }

        return container;
    }

    private createSimpleMode(): HTMLElement {
        const container = createElement('div', { classes: ['simple-mode'] });

        const titleLabel = createElement('label', {
            content: 'Child Node Title:',
            attributes: { style: 'display: block; margin-bottom: 8px; font-weight: bold;' }
        });

        const titleInput = createElement('input', {
            attributes: {
                type: 'text',
                placeholder: 'Enter the title for the new child node...',
                style: 'width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px;',
                value: this.childModalState.manualTitle
            }
        }) as HTMLInputElement;

        titleInput.addEventListener('input', () => {
            this.childModalState.manualTitle = titleInput.value;
            console.log('✏️ Manual title updated:', titleInput.value);
            // Update button state in place
            this.updateCreateButtonState();
        });

        container.appendChild(titleLabel);
        container.appendChild(titleInput);

        return container;
    }

    private createEmptyAIState(): HTMLElement {
        const container = createElement('div', {
            classes: ['empty-ai-state'],
            attributes: { style: 'text-align: center; padding: 40px;' }
        });

        const icon = createElement('div', {
            content: '🤖',
            attributes: { style: 'font-size: 48px; margin-bottom: 16px; opacity: 0.6;' }
        });

        const title = createElement('div', {
            content: 'Generate AI Suggestions',
            attributes: { style: 'font-size: 18px; font-weight: bold; margin-bottom: 8px; color: #333;' }
        });

        const description = createElement('div', {
            content: 'Click the button below to generate AI-powered suggestions for your next child node.',
            attributes: { style: 'font-size: 14px; color: #666; margin-bottom: 24px; line-height: 1.4;' }
        });

        const generateButton = createElement('button', {
            content: '✨ Generate Suggestions',
            attributes: { 
                style: 'background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold;' 
            }
        });

        generateButton.addEventListener('click', () => {
            console.log('🎯 Generate suggestions button clicked');
            this.generateSuggestions();
        });

        // Hover effect
        generateButton.addEventListener('mouseenter', () => {
            generateButton.style.background = '#45a049';
        });
        generateButton.addEventListener('mouseleave', () => {
            generateButton.style.background = '#4CAF50';
        });

        container.appendChild(icon);
        container.appendChild(title);
        container.appendChild(description);
        container.appendChild(generateButton);

        return container;
    }

    private createLoadingState(): HTMLElement {
        const container = createElement('div', {
            classes: ['loading-state'],
            attributes: { style: 'text-align: center; padding: 40px;' }
        });

        const icon = createElement('div', {
            content: '🤖',
            attributes: { style: 'font-size: 24px; margin-bottom: 16px;' }
        });

        const message = createElement('div', {
            content: 'Generating AI suggestions...',
            attributes: { style: 'font-size: 16px; margin-bottom: 8px;' }
        });

        const detail = createElement('div', {
            content: 'Analyzing parent content and context',
            attributes: { style: 'font-size: 14px; color: #666; margin-top: 8px;' }
        });

        container.appendChild(icon);
        container.appendChild(message);
        container.appendChild(detail);

        return container;
    }

    private createCreationLoadingState(): HTMLElement {
        const container = createElement('div', {
            classes: ['creation-loading-state'],
            attributes: { style: 'text-align: center; padding: 30px; background: #f8f9fa; border-radius: 8px; margin: 20px 0;' }
        });

        const icon = createElement('div', {
            content: '⚙️',
            attributes: { style: 'font-size: 32px; margin-bottom: 16px; animation: spin 2s linear infinite;' }
        });

        const title = createElement('div', {
            content: 'Creating Child Node...',
            attributes: { style: 'font-size: 16px; font-weight: bold; margin-bottom: 8px; color: #333;' }
        });

        const step = createElement('div', {
            content: this.childModalState.creationStep || 'Initializing...',
            attributes: { style: 'font-size: 14px; color: #666;' }
        });

        // Add CSS animation for the spinning icon
        const style = createElement('style', {
            content: `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `
        });

        container.appendChild(style);
        container.appendChild(icon);
        container.appendChild(title);
        container.appendChild(step);

        return container;
    }

    private createErrorState(): HTMLElement {
        const container = createElement('div', {
            classes: ['error-state'],
            attributes: { style: 'text-align: center; padding: 20px;' }
        });

        const errorMessage = createElement('div', {
            content: `❌ ${this.childModalState.error}`,
            attributes: { style: 'color: #d32f2f; margin-bottom: 16px;' }
        });

        const retryButton = createElement('button', {
            content: '🔄 Retry',
            attributes: { style: 'margin-right: 10px; padding: 8px 16px;' }
        });

        const fallbackButton = createElement('button', {
            content: '✏️ Use Manual Input',
            attributes: { style: 'padding: 8px 16px;' }
        });

        retryButton.addEventListener('click', () => this.generateSuggestions());
        fallbackButton.addEventListener('click', () => this.switchMode('simple'));

        container.appendChild(errorMessage);
        container.appendChild(retryButton);
        container.appendChild(fallbackButton);

        return container;
    }

    private createSuggestionsView(): HTMLElement {
        const container = createElement('div', { classes: ['suggestions-view'] });

        const title = createElement('h3', {
            content: 'Select a suggestion:',
            attributes: { style: 'margin-bottom: 16px;' }
        });
        container.appendChild(title);

        // Suggestions list
        const suggestionsList = createElement('div', {
            classes: ['suggestions-list'],
            attributes: { style: 'margin-bottom: 16px;' }
        });

        this.childModalState.suggestions.forEach((suggestion, index) => {
            const suggestionCard = this.createSuggestionCard(suggestion, index);
            suggestionsList.appendChild(suggestionCard);
        });

        container.appendChild(suggestionsList);

        // Regenerate button
        const regenerateButton = createElement('button', {
            content: '🔄 Regenerate Suggestions',
            attributes: { 
                style: 'padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 8px;' 
            }
        });
        
        regenerateButton.addEventListener('click', () => {
            console.log('🔄 Regenerate suggestions clicked');
            this.generateSuggestions();
        });
        
        // Hover effect
        regenerateButton.addEventListener('mouseenter', () => {
            regenerateButton.style.background = '#1976D2';
        });
        regenerateButton.addEventListener('mouseleave', () => {
            regenerateButton.style.background = '#2196F3';
        });
        
        container.appendChild(regenerateButton);

        return container;
    }

    private createSuggestionCard(suggestion: NodeSuggestion, index: number): HTMLElement {
        const isSelected = this.childModalState.selectedSuggestion === suggestion;
        
        const card = createElement('div', {
            classes: ['suggestion-card'],
            attributes: {
                style: `
                    border: 2px solid ${isSelected ? '#2196F3' : '#e0e0e0'};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    background: ${isSelected ? '#f3f9ff' : '#fff'};
                    transition: all 0.2s ease;
                `
            }
        });

        const title = createElement('div', {
            content: suggestion.title,
            attributes: { 
                style: 'font-weight: bold; margin-bottom: 8px; color: #333;' 
            }
        });

        const draft = createElement('div', {
            content: suggestion.draft,
            attributes: { 
                style: 'font-size: 14px; color: #666; line-height: 1.4;' 
            }
        });

        card.addEventListener('click', () => this.selectSuggestion(suggestion));
        card.addEventListener('mouseover', () => {
            if (!isSelected) {
                card.style.borderColor = '#bbb';
                card.style.background = '#f9f9f9';
            }
        });
        card.addEventListener('mouseout', () => {
            if (!isSelected) {
                card.style.borderColor = '#e0e0e0';
                card.style.background = '#fff';
            }
        });

        card.appendChild(title);
        card.appendChild(draft);

        return card;
    }

    private createButtonsWithListeners(): { cancelButton: HTMLButtonElement, createButton: HTMLButtonElement } {
        const canCreate = this.canCreate();
        const isCreating = this.childModalState.isCreating;
        
        const cancelButton = createElement('button', {
            content: 'Cancel',
            attributes: { 
                style: `padding: 8px 16px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px; cursor: ${isCreating ? 'not-allowed' : 'pointer'};`,
                disabled: isCreating ? 'disabled' : ''
            }
        }) as HTMLButtonElement;

        const createButtonContent = isCreating ? '⚙️ Creating...' : `Create ${this.childModalConfig.parentNode.childLevelName || 'Child'}`;
        const createButton = createElement('button', {
            content: createButtonContent,
            attributes: { 
                style: `
                    padding: 8px 16px; 
                    border: none; 
                    background: ${canCreate && !isCreating ? '#4CAF50' : '#ccc'}; 
                    color: white; 
                    border-radius: 4px; 
                    cursor: ${canCreate && !isCreating ? 'pointer' : 'not-allowed'};
                `,
                disabled: canCreate && !isCreating ? '' : 'disabled'
            }
        }) as HTMLButtonElement;

        console.log('🔗 Attaching button event listeners', { canCreate, isCreating });
        
        cancelButton.addEventListener('click', () => {
            if (!isCreating) {
                console.log('❌ Cancel button clicked');
                this.close();
            }
        });
        
        createButton.addEventListener('click', (e) => {
            console.log('🚀 Create button clicked - event triggered');
            e.preventDefault();
            e.stopPropagation();
            this.createNode();
        });

        return { cancelButton, createButton };
    }

    private createFooter(): HTMLElement {
        const footer = createElement('div', {
            classes: ['modal-footer'],
            attributes: { style: 'margin-top: 20px; border-top: 1px solid #eee; padding-top: 16px;' }
        });

        // Update parent checkbox
        const checkboxContainer = createElement('label', {
            attributes: { 
                style: 'display: flex; align-items: center; margin-bottom: 16px; cursor: pointer;' 
            }
        });

        const checkbox = createElement('input', {
            attributes: {
                type: 'checkbox',
                checked: this.childModalState.updateParent ? 'checked' : '',
                style: 'margin-right: 8px;'
            }
        }) as HTMLInputElement;

        const checkboxLabel = createElement('span', {
            content: 'Update parent content to reference new child section'
        });

        checkbox.addEventListener('change', () => {
            this.childModalState.updateParent = checkbox.checked;
        });

        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(checkboxLabel);

        // Action buttons
        const buttonContainer = createElement('div', {
            attributes: { style: 'display: flex; gap: 10px; justify-content: flex-end;' }
        });

        const { cancelButton, createButton } = this.createButtonsWithListeners();
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(createButton);

        footer.appendChild(checkboxContainer);
        footer.appendChild(buttonContainer);

        return footer;
    }

    private async generateSuggestions(): Promise<void> {
        this.childModalState.isGenerating = true;
        this.childModalState.error = null;
        this.childModalState.suggestions = [];
        this.childModalState.selectedSuggestion = null;
        this.refreshContent();

        try {
            const suggestions = await this.nodeCreationService.generateSuggestions(this.childModalConfig.parentNode, 5);
            this.childModalState.suggestions = suggestions;
            this.childModalState.isGenerating = false;
            this.refreshContent();
        } catch (error) {
            this.childModalState.isGenerating = false;
            this.childModalState.error = error instanceof Error ? error.message : 'Failed to generate suggestions';
            this.refreshContent();
        }
    }

    private switchMode(mode: 'simple' | 'ai'): void {
        this.childModalState.mode = mode;
        this.childModalState.selectedSuggestion = null;
        this.refreshContent();
    }

    private selectSuggestion(suggestion: NodeSuggestion): void {
        this.childModalState.selectedSuggestion = suggestion;
        console.log('🎯 Suggestion selected:', suggestion.title);
        
        // Update UI to show selected state
        if (this.element) {
            const suggestionCards = this.element.querySelectorAll('.suggestion-card');
            suggestionCards.forEach((card) => {
                const titleElement = card.querySelector('div');
                const isSelected = titleElement?.textContent === suggestion.title;
                
                if (isSelected) {
                    (card as HTMLElement).style.borderColor = '#2196F3';
                    (card as HTMLElement).style.background = '#f3f9ff';
                } else {
                    (card as HTMLElement).style.borderColor = '#e0e0e0';
                    (card as HTMLElement).style.background = '#fff';
                }
            });
        }
        
        // Update button state
        this.updateCreateButtonState();
    }

    private canCreate(): boolean {
        if (this.childModalState.isCreating || this.childModalState.isGenerating) {
            return false;
        }
        
        return this.childModalState.mode === 'ai' 
            ? this.childModalState.selectedSuggestion !== null
            : this.childModalState.manualTitle.trim() !== '';
    }

    private async createNode(): Promise<void> {
        console.log('🚀 Create node button clicked');
        console.log('📊 Modal state:', this.childModalState);
        console.log('✅ Can create:', this.canCreate());
        
        if (!this.canCreate() || this.childModalState.isCreating) {
            console.log('❌ Cannot create - validation failed or already creating');
            return;
        }

        console.log('✅ Validation passed, proceeding with node creation');

        // Start creation loading state
        this.childModalState.isCreating = true;
        this.childModalState.error = null;
        this.childModalState.creationStep = 'Preparing node creation...';
        this.refreshContent();

        try {
            let title: string;
            let draft: string | undefined = undefined;

            if (this.childModalState.mode === 'ai' && this.childModalState.selectedSuggestion) {
                title = this.childModalState.selectedSuggestion.title;
                draft = this.childModalState.selectedSuggestion.draft;
                console.log('🤖 Using AI suggestion:', { title, draft });
            } else {
                title = this.childModalState.manualTitle.trim();
                console.log('✏️ Using manual title:', title);
            }

            // Step 1: Creating child node
            this.childModalState.creationStep = 'Creating child node...';
            this.refreshContent();
            
            const createConfig: any = {
                parentNodeId: this.childModalConfig.parentNodeId,
                title,
                updateParent: this.childModalState.updateParent && this.childModalConfig.parentNode.content
            };
            
            if (draft) {
                createConfig.draft = draft;
            }

            // Show different step if updating parent
            if (this.childModalState.updateParent && this.childModalConfig.parentNode.content) {
                this.childModalState.creationStep = 'Updating parent content with AI...';
                this.refreshContent();
            }
            
            console.log('🔧 Calling NodeCreationService.createNode...');
            await this.nodeCreationService.createNode(createConfig);

            // Step 3: Saving to storage
            this.childModalState.creationStep = 'Saving changes...';
            this.refreshContent();

            // Brief delay to show the final step
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log('✅ Node created successfully');
            console.log('📤 Emitting success action...');
            
            // Reset creation state
            this.childModalState.isCreating = false;
            this.childModalState.creationStep = null;
            
            // Emit success and close
            await this.handleAction('created', { title, draft });
            
            console.log('🚪 Closing modal...');
            await this.close();

        } catch (error) {
            console.error('❌ Failed to create child node:', error);
            this.childModalState.isCreating = false;
            this.childModalState.creationStep = null;
            this.childModalState.error = error instanceof Error ? error.message : 'Failed to create node';
            this.refreshContent();
        }
    }

    private updateCreateButtonState(): void {
        if (this.element) {
            const buttons = Array.from(this.element.querySelectorAll('button'));
            const createButton = buttons.find(btn => 
                btn.textContent?.includes('Creating...') || btn.textContent?.startsWith('Create ')
            ) as HTMLButtonElement;
            
            if (createButton) {
                const canCreate = this.canCreate();
                const isCreating = this.childModalState.isCreating;
                
                createButton.disabled = !(canCreate && !isCreating);
                createButton.style.background = (canCreate && !isCreating) ? '#4CAF50' : '#ccc';
                createButton.style.cursor = (canCreate && !isCreating) ? 'pointer' : 'not-allowed';
                createButton.textContent = isCreating ? '⚙️ Creating...' : `Create ${this.childModalConfig.parentNode.childLevelName || 'Child'}`;
                
                console.log('🔄 Updated create button state:', { 
                    canCreate, 
                    isCreating,
                    mode: this.childModalState.mode,
                    selectedSuggestion: this.childModalState.selectedSuggestion?.title || 'none',
                    manualTitle: this.childModalState.manualTitle
                });
            } else {
                console.warn('⚠️ Create button not found');
            }
        }
    }

    private refreshContent(): void {
        console.log('🔄 refreshContent() called');
        
        if (this.element) {
            const contentArea = this.element.querySelector('.modal-content-area');
            
            if (contentArea) {
                contentArea.innerHTML = '';
                if (this.childModalState.mode === 'ai') {
                    contentArea.appendChild(this.createAIMode());
                } else {
                    contentArea.appendChild(this.createSimpleMode());
                }
                console.log('🔄 Content area refreshed');
            }

            // Handle creation loading overlay
            const existingOverlay = this.element.querySelector('.creation-loading-state');
            if (this.childModalState.isCreating && !existingOverlay) {
                // Add creation loading overlay
                const creationOverlay = this.createCreationLoadingState();
                this.element.appendChild(creationOverlay);
            } else if (!this.childModalState.isCreating && existingOverlay) {
                // Remove creation loading overlay
                existingOverlay.remove();
            } else if (this.childModalState.isCreating && existingOverlay) {
                // Update existing overlay with current step
                const stepElement = existingOverlay.querySelector('div:last-child');
                if (stepElement) {
                    stepElement.textContent = this.childModalState.creationStep || 'Processing...';
                }
            }

            // DON'T recreate footer - just update button state
            this.updateCreateButtonState();
        }
    }

    private getModalStyles(): string {
        return `
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            padding: 24px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        `;
    }

    private getModeButtonStyle(isActive: boolean, isDisabled: boolean = false): string {
        return `
            padding: 8px 16px;
            border: 2px solid ${isActive ? '#2196F3' : '#ccc'};
            background: ${isActive ? '#2196F3' : '#f5f5f5'};
            color: ${isActive ? 'white' : '#333'};
            border-radius: 4px;
            cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
            font-weight: ${isActive ? 'bold' : 'normal'};
            transition: all 0.2s ease;
            opacity: ${isDisabled ? '0.6' : '1'};
        `;
    }
} 