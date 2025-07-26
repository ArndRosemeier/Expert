import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { NodeCreationService, NodeSuggestion, INodeCreationService, NodeCreationConfig } from './services/NodeCreationService';
import { createElement } from './core/modal-utils';
import { OpenRouterClient } from '../../OpenRouterClient';
import { AI_ASSISTANT_EMOJI } from '../../constants';

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
    manualDraft: string;
    userDirection: string;
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
            creationStep: null,
            manualDraft: '',
            userDirection: ''
        };

        // Create the node creation service
        const openRouterClient = OpenRouterClient.getInstance();
        openRouterClient.setSettingsManager(config.projectManager.getSettingsManager());
        
        this.nodeCreationService = new NodeCreationService(
            openRouterClient,
            config.projectManager.getSettingsManager(),
            config.projectManager.getContextService(),
            config.projectManager.getTreeService(),
            config.projectManager
        );
    }

    public override render(): HTMLElement {
        const container = createElement('div', {
            classes: ['add-child-node-modal'],
            attributes: { style: this.getModalStyles() }
        });

        // Header
        const header = createElement('div', {
            classes: ['modal-header'],
            innerHTML: `<h2>Add ${this.childModalConfig.parentNode.childLevelName || 'Child'} to "${this.childModalConfig.parentNode.title}"</h2>`
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

        // Footer - create directly here with immediate event attachment
        const footer = createElement('div', {
            classes: ['modal-footer'],
            attributes: { style: 'margin-top: 20px; border-top: 1px solid #eee; padding-top: 16px;' }
        });

        // Update parent checkbox - show in AI mode or in manual mode when there's draft content
        const showCheckbox = this.childModalState.mode === 'ai' || (this.childModalState.mode === 'simple' && this.childModalState.manualDraft.trim() !== '');
        const checkboxContainer = createElement('label', {
            attributes: { 
                style: `display: ${showCheckbox ? 'flex' : 'none'}; align-items: center; margin-bottom: 16px; cursor: pointer;`
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

        // Action buttons - create directly here
        const buttonContainer = createElement('div', {
            attributes: { style: 'display: flex; gap: 10px; justify-content: flex-end;' }
        });

        const isCreating = this.childModalState.isCreating;
        const canCreate = this.canCreate();

        // Cancel button
        const cancelButton = createElement('button', {
            content: 'Cancel',
            attributes: { 
                style: 'padding: 8px 16px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px; cursor: pointer;'
            }
        }) as HTMLButtonElement;

        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.childModalState.isCreating) {
                void this.close();
            }
        });

        // Create button
        const createButton = createElement('button', {
            content: isCreating ? '⚙️ Creating...' : `Create ${this.childModalConfig.parentNode.childLevelName || 'Child'}`,
            attributes: { 
                style: `padding: 8px 16px; border: none; background: ${canCreate && !isCreating ? '#4CAF50' : '#ccc'}; color: white; border-radius: 4px; cursor: ${canCreate && !isCreating ? 'pointer' : 'not-allowed'};`,
                ...(canCreate && !isCreating ? {} : { disabled: 'disabled' })
            }
        }) as HTMLButtonElement;

        createButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (this.canCreate() && !this.childModalState.isCreating) {
                this.createNode();
            }
        });

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(createButton);

        footer.appendChild(checkboxContainer);
        footer.appendChild(buttonContainer);
        container.appendChild(footer);

        // Show creation loading overlay if creating
        if (this.childModalState.isCreating) {
            const creationOverlay = this.createCreationLoadingState();
            container.appendChild(creationOverlay);
        }

        return container;
    }

    private createModeSelector(): HTMLElement {
        const selector = createElement('div', {
            classes: ['mode-selector'],
            attributes: { style: 'margin-bottom: 20px; display: flex; gap: 10px;' }
        });

        const isDisabled = this.childModalState.isCreating || this.childModalState.isGenerating;

        const aiButton = createElement('button', {
                            content: `${AI_ASSISTANT_EMOJI} AI Suggestions`,
            classes: this.childModalState.mode === 'ai' ? ['mode-btn', 'active'] : ['mode-btn'],
            attributes: {
                style: this.getModeButtonStyle(this.childModalState.mode === 'ai', isDisabled),
                ...(isDisabled ? { disabled: 'disabled' } : {})
            }
        });

        const simpleButton = createElement('button', {
            content: '✏️ Manual Input',
            classes: this.childModalState.mode === 'simple' ? ['mode-btn', 'active'] : ['mode-btn'],
            attributes: {
                style: this.getModeButtonStyle(this.childModalState.mode === 'simple', isDisabled),
                ...(isDisabled ? { disabled: 'disabled' } : {})
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
                value: this.childModalState.manualTitle,
                'data-manual-input': 'true'
            }
        }) as HTMLInputElement;

        titleInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            const newValue = target.value;
            const oldCanCreate = this.canCreate();
            
            this.childModalState.manualTitle = newValue;
            
            const newCanCreate = this.canCreate();
            
            // Only refresh if the button state changed (empty to non-empty or vice versa)
            if (oldCanCreate !== newCanCreate) {
                // Save the current cursor position
                const cursorPosition = target.selectionStart;
                this.refreshContent();
                // Restore focus and cursor position after refresh
                void void setTimeout(() => {
                    const newInput = this.element?.querySelector('[data-manual-input="true"]') as HTMLInputElement;
                    if (newInput) {
                        newInput.focus();
                        newInput.setSelectionRange(cursorPosition || 0, cursorPosition || 0);
                    }
                }, 0);
            }
        });

        // Ensure the input has the current value
        titleInput.value = this.childModalState.manualTitle;

        container.appendChild(titleLabel);
        container.appendChild(titleInput);

        // Draft input field
        const draftLabel = createElement('label', {
            content: 'Draft Content (optional):',
            attributes: { style: 'display: block; margin-bottom: 8px; font-weight: bold;' }
        });

        const draftTextarea = createElement('textarea', {
            attributes: {
                placeholder: 'Enter draft content for the new child node...',
                style: 'width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px; min-height: 100px; resize: vertical;',
                value: this.childModalState.manualDraft,
                'data-manual-draft': 'true'
            }
        }) as HTMLTextAreaElement;

        draftTextarea.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            const newValue = target.value;
            const oldHasDraft = this.childModalState.manualDraft.trim() !== '';
            
            this.childModalState.manualDraft = newValue;
            
            const newHasDraft = newValue.trim() !== '';
            
            // Refresh if draft presence changed (affects checkbox visibility)
            if (oldHasDraft !== newHasDraft) {
                // Save the current cursor position
                const cursorPosition = target.selectionStart;
                this.refreshContent();
                // Restore focus and cursor position after refresh
                void void setTimeout(() => {
                    const newTextarea = this.element?.querySelector('[data-manual-draft="true"]') as HTMLTextAreaElement;
                    if (newTextarea) {
                        newTextarea.focus();
                        newTextarea.setSelectionRange(cursorPosition || 0, cursorPosition || 0);
                    }
                }, 0);
            }
        });

        // Ensure the textarea has the current value
        draftTextarea.value = this.childModalState.manualDraft;

        container.appendChild(draftLabel);
        container.appendChild(draftTextarea);

        return container;
    }

    private createEmptyAIState(): HTMLElement {
        const container = createElement('div', {
            classes: ['empty-ai-state'],
            attributes: { style: 'text-align: center; padding: 40px;' }
        });

        const icon = createElement('div', {
            content: AI_ASSISTANT_EMOJI,
            attributes: { style: 'font-size: 48px; margin-bottom: 16px; opacity: 0.6;' }
        });

        const title = createElement('div', {
            content: 'Generate AI Suggestions',
            attributes: { style: 'font-size: 18px; font-weight: bold; margin-bottom: 8px; color: #333;' }
        });

        const description = createElement('div', {
            content: 'Optionally provide direction for the AI suggestions, then click generate.',
            attributes: { style: 'font-size: 14px; color: #666; margin-bottom: 16px; line-height: 1.4;' }
        });

        // User direction input area
        const directionLabel = createElement('label', {
            content: 'Direction (optional):',
            attributes: { style: 'display: block; font-size: 14px; font-weight: bold; color: #333; margin-bottom: 8px; text-align: left;' }
        });

        const directionTextarea = createElement('textarea', {
            attributes: { 
                placeholder: 'e.g., "Focus on character development", "Include a conflict scene", "Explore the theme of redemption"...',
                style: 'width: 100%; height: 80px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px; font-family: inherit; resize: vertical; margin-bottom: 16px; box-sizing: border-box;'
            }
        }) as HTMLTextAreaElement;

        // Update state when user types
        directionTextarea.addEventListener('input', () => {
            this.childModalState.userDirection = directionTextarea.value;
        });

        // Set initial value
        directionTextarea.value = this.childModalState.userDirection;

        // Focus styling
        directionTextarea.addEventListener('focus', () => {
            directionTextarea.style.borderColor = '#4CAF50';
        });
        directionTextarea.addEventListener('blur', () => {
            directionTextarea.style.borderColor = '#e0e0e0';
        });

        const generateButton = createElement('button', {
            content: '✨ Generate Suggestions',
            attributes: { 
                style: 'background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold;' 
            }
        });

        generateButton.addEventListener('click', () => {
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
        container.appendChild(directionLabel);
        container.appendChild(directionTextarea);
        container.appendChild(generateButton);

        return container;
    }

    private createLoadingState(): HTMLElement {
        const container = createElement('div', {
            classes: ['loading-state'],
            attributes: { style: 'text-align: center; padding: 40px;' }
        });

        const icon = createElement('div', {
            content: AI_ASSISTANT_EMOJI,
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

        retryButton.addEventListener('click', async () => this.generateSuggestions());
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

    private createSuggestionCard(suggestion: NodeSuggestion, _index: number): HTMLElement {
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

    private async generateSuggestions(): Promise<void> {
        this.childModalState.isGenerating = true;
        this.childModalState.error = null;
        this.childModalState.suggestions = [];
        this.childModalState.selectedSuggestion = null;
        this.refreshContent();

        try {
            const suggestions = await this.nodeCreationService.generateSuggestions(
                this.childModalConfig.parentNode, 
                5, 
                this.childModalState.userDirection
            );
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
        this.refreshContent();
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
        if (!this.canCreate() || this.childModalState.isCreating) {
            return;
        }

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
            } else {
                title = this.childModalState.manualTitle.trim();
                // If there's manual draft content, use it directly (service will add "Draft: " prefix)
                if (this.childModalState.manualDraft.trim()) {
                    draft = this.childModalState.manualDraft.trim();
                }
            }

            // Step 1: Creating child node
            this.childModalState.creationStep = 'Creating child node...';
            this.refreshContent();
            
            const createConfig: NodeCreationConfig = {
                parentNodeId: this.childModalConfig.parentNodeId,
                title,
                updateParent: (this.childModalState.mode === 'ai' || (this.childModalState.mode === 'simple' && this.childModalState.manualDraft.trim() !== '')) && this.childModalState.updateParent && !!this.childModalConfig.parentNode.content
            };
            
            if (draft) {
                createConfig.draft = draft;
            }

            // Show different step if updating parent
            if ((this.childModalState.mode === 'ai' || (this.childModalState.mode === 'simple' && this.childModalState.manualDraft.trim() !== '')) && this.childModalState.updateParent && this.childModalConfig.parentNode.content) {
                this.childModalState.creationStep = 'Updating parent content with AI...';
                this.refreshContent();
            }
            
            await this.nodeCreationService.createNode(createConfig);

            // Step 3: Saving to storage
            this.childModalState.creationStep = 'Saving changes...';
            this.refreshContent();

            // Brief delay to show the final step
            await new Promise(resolve => void void setTimeout(resolve, 500));
            
            // Reset creation state
            this.childModalState.isCreating = false;
            this.childModalState.creationStep = null;
            
            // Emit success and close
            await this.handleAction('created', { title, draft });
            
            await this.close();

        } catch (error) {
            this.childModalState.isCreating = false;
            this.childModalState.creationStep = null;
            this.childModalState.error = error instanceof Error ? error.message : 'Failed to create node';
            this.refreshContent();
        }
    }

    private refreshContent(): void {
        if (!this.element) return;
        const contentContainer = this.element.querySelector('.modal-content');
        if (!contentContainer) return;
        const newContent = this.render();
        const oldContent = contentContainer.querySelector('.add-child-node-modal');
        if (oldContent) {
            contentContainer.replaceChild(newContent, oldContent);
        } else {
            contentContainer.appendChild(newContent);
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