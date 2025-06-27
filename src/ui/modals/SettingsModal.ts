/**
 * Settings Modal - Complete modal implementation using Phase 2 services and components
 */

import { BaseModal } from './core/BaseModal';
import { PromptManagementService } from './services/PromptManagementService';
import { SettingsService } from './services/SettingsService';
import { CriteriaEditor } from './components/CriteriaEditor';
import { ProfileSelector } from './components/ProfileSelector';
import { SettingsManager } from '../../SettingsManager';
import { ModelSelector } from '../../ModelSelector';
import { ModalConfig } from './types/ModalTypes';
import { createElement } from './core/modal-utils';
import { EventEmitter } from '../../EventEmitter';

export interface SettingsModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    modelSelector: ModelSelector;
    refreshGlobalProfileSelector?: () => void;
}

export interface SettingsModalEvents {
    settingsChanged: { type: string; data: any };
    profileChanged: { profileName: string };
    saved: void;
    cancelled: void;
}

export class SettingsModal extends BaseModal {
    private settingsManager: SettingsManager;
    private modelSelector: ModelSelector;
    private refreshGlobalProfileSelector?: () => void;
    
    // Services
    private promptService: PromptManagementService;
    private settingsService: SettingsService;
    
    // Components
    private criteriaEditor?: CriteriaEditor;
    private profileSelector?: ProfileSelector;
    
    // State
    private hasUnsavedChanges: boolean = false;
    private saveTimeout: number | null = null;
    
    // UI Elements
    private maxIterationsInput?: HTMLInputElement;
    private unsavedIndicator?: HTMLElement;
    private currentProfileDisplay?: HTMLElement;
    private aiLoggingCheckbox?: HTMLInputElement;

    constructor(config: SettingsModalConfig) {
        super({
            ...config,
            title: 'Settings',
            id: 'settings-modal',
            closable: false // Disable BaseModal's automatic close button since we have our own
        });

        this.settingsManager = config.settingsManager;
        this.modelSelector = config.modelSelector;
        this.refreshGlobalProfileSelector = config.refreshGlobalProfileSelector;

        // Initialize services
        this.promptService = new PromptManagementService(this.settingsManager, {
            autoSave: false, // We'll handle saving ourselves
            showDescriptions: true,
            showPlaceholders: true
        });

        this.settingsService = new SettingsService(this.settingsManager, this.modelSelector);

        // Setup service event handlers
        this.setupServiceEventHandlers();
    }

    // Simple emit method for compatibility
    private emit(eventName: string, data?: any): void {
        // Silent event emitter stub
    }

    /**
     * Implements IModal render method
     */
    public render(): HTMLElement {
        return this.renderContent();
    }

    /**
     * Renders the modal content
     */
    protected renderContent(): HTMLElement {
        const container = createElement('div', {
            classes: ['settings-modal-container']
        });

        // Add styles
        this.addStyles(container);

        // Create modal structure
        const header = this.createHeader();
        const body = this.createBody();
        const footer = this.createFooter();

        container.appendChild(header);
        container.appendChild(body);
        container.appendChild(footer);

        // Initialize components after DOM is ready
        setTimeout(() => this.initializeComponents(), 0);

        return container;
    }

    /**
     * Creates the modal header
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['modal-header']
        });

        const title = createElement('h2', {
            content: 'Settings'
        });

        const closeButton = createElement('button', {
            classes: ['close-button'],
            innerHTML: '&times;'
        });

        closeButton.addEventListener('click', () => {
            this.handleClose();
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        return header;
    }

    /**
     * Creates the modal body
     */
    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['modal-body']
        });

        // Profile Management Section
        const profileSection = this.createProfileSection();
        body.appendChild(profileSection);

        // Models Section
        const modelsSection = this.createModelsSection();
        body.appendChild(modelsSection);

        // Criteria Section
        const criteriaSection = this.createCriteriaSection();
        body.appendChild(criteriaSection);

        // Max Iterations Section
        const iterationsSection = this.createIterationsSection();
        body.appendChild(iterationsSection);

        // Prompts Section
        const promptsSection = this.createPromptsSection();
        body.appendChild(promptsSection);

        // AI Logging Section
        const loggingSection = this.createLoggingSection();
        body.appendChild(loggingSection);

        return body;
    }

    /**
     * Creates the profile management section
     */
    private createProfileSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'Profile Management'
        });

        this.currentProfileDisplay = createElement('div', {
            classes: ['current-profile-info']
        });

        const profileContainer = createElement('div', {
            classes: ['profile-container']
        });

        section.appendChild(title);
        section.appendChild(this.currentProfileDisplay);
        section.appendChild(profileContainer);

        return section;
    }

    /**
     * Creates the models section
     */
    private createModelsSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'AI Models'
        });

        const modelsContainer = createElement('div', {
            attributes: { id: 'settings-models-container' }
        });

        section.appendChild(title);
        section.appendChild(modelsContainer);

        return section;
    }

    /**
     * Creates the criteria section
     */
    private createCriteriaSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'Quality Criteria'
        });

        const criteriaContainer = createElement('div', {
            classes: ['criteria-container']
        });

        section.appendChild(title);
        section.appendChild(criteriaContainer);

        return section;
    }

    /**
     * Creates the max iterations section
     */
    private createIterationsSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'Generation Settings'
        });

        const label = createElement('label', {
            content: 'Max Iterations:',
            attributes: { for: 'modal-max-iterations' }
        });

        this.maxIterationsInput = createElement('input', {
            attributes: {
                type: 'number',
                id: 'modal-max-iterations',
                min: '1',
                max: '10',
                value: '5'
            }
        }) as HTMLInputElement;

        this.maxIterationsInput.addEventListener('input', () => {
            this.autoSave();
        });

        section.appendChild(title);
        section.appendChild(label);
        section.appendChild(this.maxIterationsInput);

        return section;
    }

    /**
     * Creates the prompts section
     */
    private createPromptsSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'AI Prompts'
        });

        const promptsContainer = createElement('div', {
            attributes: { id: 'settings-prompts-container' }
        });

        section.appendChild(title);
        section.appendChild(promptsContainer);

        return section;
    }

    /**
     * Creates the AI logging section
     */
    private createLoggingSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'AI Logging'
        });

        const checkboxContainer = createElement('div', {
            classes: ['checkbox-container']
        });

        this.aiLoggingCheckbox = createElement('input', {
            attributes: {
                type: 'checkbox',
                id: 'ai-logging-checkbox'
            }
        }) as HTMLInputElement;

        const label = createElement('label', {
            content: 'Enable AI conversation logging',
            attributes: { for: 'ai-logging-checkbox' }
        });

        const viewLogsButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'View AI Logs',
            attributes: { id: 'view-ai-logs-btn' }
        });

        this.aiLoggingCheckbox.addEventListener('change', async () => {
            await this.settingsService.setAILoggingEnabled(this.aiLoggingCheckbox!.checked);
            this.autoSave();
        });

        viewLogsButton.addEventListener('click', async () => {
            // Import and open the AI Log modal directly
            const { openAILogModal } = await import('../modal-manager');
            openAILogModal();
        });

        checkboxContainer.appendChild(this.aiLoggingCheckbox);
        checkboxContainer.appendChild(label);

        section.appendChild(title);
        section.appendChild(checkboxContainer);
        section.appendChild(viewLogsButton);

        return section;
    }

    /**
     * Creates the modal footer
     */
    private createFooter(): HTMLElement {
        const footer = createElement('div', {
            classes: ['modal-footer']
        });

        const leftSection = createElement('div', {
            classes: ['footer-left']
        });

        this.unsavedIndicator = createElement('div', {
            classes: ['unsaved-indicator'],
            content: 'Unsaved changes'
        });

        leftSection.appendChild(this.unsavedIndicator);

        const rightSection = createElement('div', {
            classes: ['footer-right']
        });

        const cancelButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Cancel'
        });

        const saveButton = createElement('button', {
            classes: ['btn-primary'],
            content: 'Save & Close'
        });

        cancelButton.addEventListener('click', () => {
            this.handleCancel();
        });

        saveButton.addEventListener('click', () => {
            this.handleSave();
        });

        rightSection.appendChild(cancelButton);
        rightSection.appendChild(saveButton);

        footer.appendChild(leftSection);
        footer.appendChild(rightSection);

        return footer;
    }

    /**
     * Initializes the components after DOM is ready
     */
    private initializeComponents(): void {
        // Initialize profile selector
        const profileContainer = this.element?.querySelector('.profile-container') as HTMLElement;
        if (profileContainer) {
            this.profileSelector = new ProfileSelector(profileContainer, this.settingsService);
            this.profileSelector.onSelectionChange((event) => {
                this.applyProfileToUI(event.profile);
                this.updateCurrentProfileDisplay(event.profileName);
                this.emit('profileChanged', event.profileName);
                
                // Refresh the global profile selector to maintain consistency
                if (this.refreshGlobalProfileSelector) {
                    this.refreshGlobalProfileSelector();
                }
            });

            this.profileSelector.onAction((event) => {
                if (this.refreshGlobalProfileSelector) {
                    this.refreshGlobalProfileSelector();
                }
            });
        }

        // Initialize criteria editor
        const criteriaContainer = this.element?.querySelector('.criteria-container') as HTMLElement;
        if (criteriaContainer) {
            this.criteriaEditor = new CriteriaEditor(criteriaContainer);
            this.criteriaEditor.onChange(() => {
                this.autoSave();
            });
        }

        // Initialize model selector
        const modelsContainer = this.element?.querySelector('#settings-models-container') as HTMLElement;
        if (modelsContainer) {
            this.modelSelector.render(modelsContainer);
            modelsContainer.addEventListener('change', () => this.autoSave());
            modelsContainer.addEventListener('input', () => this.autoSave());
        }

        // Initialize prompt management
        const promptsContainer = this.element?.querySelector('#settings-prompts-container') as HTMLElement;
        if (promptsContainer) {
            this.promptService.renderEditor(promptsContainer);
            this.promptService.onPromptChange(() => {
                this.autoSave();
            });
        }

        // Load current settings
        this.loadCurrentSettings();
    }

    /**
     * Loads current settings into the UI
     */
    private loadCurrentSettings(): void {
        const lastUsedProfile = this.settingsService.getLastUsedProfile();
        if (lastUsedProfile) {
            this.applyProfileToUI(lastUsedProfile);
        }

        if (this.aiLoggingCheckbox) {
            this.aiLoggingCheckbox.checked = this.settingsService.isAILoggingEnabled();
        }

        this.updateCurrentProfileDisplay(this.settingsService.getLastUsedProfileName() || '');
        this.updateUnsavedIndicator(false);
    }

    /**
     * Applies a profile to the UI components
     */
    private applyProfileToUI(profile: any): void {
        if (!profile) return;

        // Clear pending auto-save to prevent race conditions
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        // Apply to model selector
        if (profile.selectedModels) {
            this.modelSelector.setSelectedModels(profile.selectedModels);
        }

        // Apply to criteria editor
        if (this.criteriaEditor && profile.criteria) {
            this.criteriaEditor.setCriteria(profile.criteria);
        }

        // Apply max iterations
        if (this.maxIterationsInput) {
            this.maxIterationsInput.value = String(profile.maxIterations || 5);
        }

        this.updateUnsavedIndicator(false);
    }

    /**
     * Updates the current profile display
     */
    private updateCurrentProfileDisplay(profileName: string): void {
        if (this.currentProfileDisplay) {
            this.currentProfileDisplay.innerHTML = `
                <strong>Active Profile:</strong> ${profileName}
                <div style="margin-top: 0.25rem; font-size: 0.8em; opacity: 0.8;">
                    Changes are automatically saved to this profile
                </div>
            `;
        }
    }

    /**
     * Updates the unsaved changes indicator
     */
    private updateUnsavedIndicator(show: boolean): void {
        this.hasUnsavedChanges = show;
        if (this.unsavedIndicator) {
            this.unsavedIndicator.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Auto-save with debouncing
     */
    private autoSave(): void {
        this.updateUnsavedIndicator(true);

        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = window.setTimeout(async () => {
            await this.saveCurrentSettingsToProfile();
            this.updateUnsavedIndicator(false);
        }, 2000);
    }

    /**
     * Saves current settings to the active profile
     */
    private async saveCurrentSettingsToProfile(): Promise<void> {
        const activeProfileName = this.settingsService.getLastUsedProfileName();
        if (!activeProfileName) return;

        const criteria = this.criteriaEditor?.getCriteria() || [];
        const maxIterations = parseInt(this.maxIterationsInput?.value || '5', 10);

        await this.settingsService.saveCurrentSettingsToProfile(
            activeProfileName,
            criteria,
            maxIterations
        );

        this.emit('settingsChanged', { 
            type: 'saved', 
            data: { profileName: activeProfileName, criteria, maxIterations } 
        });
    }

    /**
     * Handles the save action
     */
    private async handleSave(): Promise<void> {
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }
        
        await this.saveCurrentSettingsToProfile();
        this.updateUnsavedIndicator(false);
        this.emit('saved');
        this.close();
    }

    /**
     * Handles the cancel action
     */
    private handleCancel(): void {
        if (this.hasUnsavedChanges) {
            const confirmed = confirm('You have unsaved changes. Are you sure you want to cancel?');
            if (!confirmed) return;
        }

        this.emit('cancelled');
        this.close();
    }

    /**
     * Handles the close action
     */
    private handleClose(): void {
        if (this.hasUnsavedChanges) {
            const confirmed = confirm('You have unsaved changes. Are you sure you want to close?');
            if (!confirmed) return;
        }

        this.close();
    }



    /**
     * Setup service event handlers
     */
    private setupServiceEventHandlers(): void {
        this.settingsService.onChange((event) => {
            this.emit('settingsChanged', { type: event.type, data: event.data });
        });

        this.promptService.onSave(() => {
            this.emit('settingsChanged', { type: 'promptsSaved', data: {} });
        });
    }

    /**
     * Cleanup when modal is destroyed
     */
    public destroy(): void {
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }
        super.destroy();
    }

    /**
     * Adds styles for the settings modal
     */
    private addStyles(container: HTMLElement): void {
        const style = createElement('style', {
            innerHTML: `
                .settings-modal-container {
                    width: 80vw;
                    max-width: 1200px;
                    display: flex;
                    flex-direction: column;
                    max-height: 90vh;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                
                .settings-modal-container .modal-header {
                    padding: 1.5rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e5e7eb;
                    flex-shrink: 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .settings-modal-container .modal-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #111827;
                }
                
                .settings-modal-container .close-button {
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
                    transition: background-color 0.2s;
                }
                
                .settings-modal-container .close-button:hover {
                    background-color: #dc2626;
                }
                
                .settings-modal-container .modal-body {
                    padding: 1.5rem 2rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    overflow-y: auto;
                    flex: 1;
                }
                
                .settings-modal-container .modal-footer {
                    padding: 1rem 2rem 1.5rem 2rem;
                    border-top: 1px solid #e5e7eb;
                    flex-shrink: 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                }
                
                .settings-modal-container .footer-left {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    font-size: 0.875rem;
                    color: #6b7280;
                }
                
                .settings-modal-container .footer-right {
                    display: flex;
                    gap: 0.75rem;
                }
                
                .settings-modal-container .unsaved-indicator {
                    display: none;
                    color: #f59e0b;
                    font-weight: 500;
                    align-items: center;
                    gap: 0.5rem;
                }
                
                .settings-modal-container .unsaved-indicator::before {
                    content: "●";
                    font-size: 1.2em;
                }
                
                .settings-modal-container .settings-section {
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 1.5rem;
                }
                
                .settings-modal-container .settings-section h3 {
                    margin-top: 0;
                    margin-bottom: 1rem;
                    color: #111827;
                    font-size: 1.125rem;
                    font-weight: 600;
                }
                
                .settings-modal-container .current-profile-info {
                    padding: 0.75rem 1rem;
                    background-color: #eff6ff;
                    border: 1px solid #bfdbfe;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    color: #1e40af;
                    margin-bottom: 1rem;
                }
                
                .settings-modal-container .checkbox-container {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                
                .settings-modal-container .checkbox-container input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }
                
                .settings-modal-container .checkbox-container label {
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #374151;
                }
                
                .settings-modal-container input[type="number"] {
                    padding: 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    width: 80px;
                }
                
                .settings-modal-container input[type="number"]:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .settings-modal-container label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    color: #374151;
                }
                
                .btn-primary,
                .btn-secondary,
                .btn-danger {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-primary {
                    background-color: #3b82f6;
                    color: white;
                }
                
                .btn-primary:hover {
                    background-color: #2563eb;
                }
                
                .btn-secondary {
                    background-color: #6b7280;
                    color: white;
                }
                
                .btn-secondary:hover {
                    background-color: #4b5563;
                }
                
                .btn-danger {
                    background-color: #ef4444;
                    color: white;
                }
                
                .btn-danger:hover {
                    background-color: #dc2626;
                }
            `
        });

        container.appendChild(style);
    }
} 