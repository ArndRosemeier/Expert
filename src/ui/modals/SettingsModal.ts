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
// EventEmitter import removed - no longer used
import { VersionService } from '../../VersionService';
import { DEFAULT_MAX_ITERATIONS, MIN_MAX_ITERATIONS, MAX_MAX_ITERATIONS } from '../../constants';
import { TaskModelEditor } from '../components/TaskModelEditor';
import { OpenRouterClient } from '../../OpenRouterClient';


export interface SettingsModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    modelSelector: ModelSelector;
    refreshGlobalProfileSelector?: () => void;
}

export class SettingsModal extends BaseModal {
    private settingsManager: SettingsManager;
    private modelSelector: ModelSelector;
    private refreshGlobalProfileSelector: (() => void) | undefined;
    
    // Services
    private promptService: PromptManagementService;
    private settingsService: SettingsService;
    
    // Components
    private criteriaEditor?: CriteriaEditor;
    private profileSelector?: ProfileSelector;
    private taskModelEditor?: TaskModelEditor;
    
    // State
    private hasUnsavedChanges: boolean = false;
    private saveTimeout: number | null = null;
    private autoSaveEnabled: boolean = true;
    private isUILocked: boolean = false;
    
    // UI Elements
    private maxIterationsInput?: HTMLInputElement;
    private unsavedIndicator?: HTMLElement;
    private currentProfileDisplay?: HTMLElement;
    private aiLoggingCheckbox?: HTMLInputElement;
    private debugGenerationCheckbox?: HTMLInputElement;

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
    private emit(_eventName: string, _data?: unknown): void {
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
        void setTimeout(async () => {
            await this.initializeComponents();
        }, 0);

        return container;
    }

    /**
     * Creates the modal header
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['modal-header']
        });

        const titleContainer = createElement('div', {
            classes: ['header-title-container']
        });

        const title = createElement('h2', {
            content: 'Settings'
        });

        const versionInfo = createElement('div', {
            classes: ['version-info'],
            content: `Version: ${VersionService.getFullVersion()}`
        });

        const closeButton = createElement('button', {
            classes: ['close-button'],
            innerHTML: '&times;'
        });

        closeButton.addEventListener('click', () => {
            this.handleClose();
        });

        titleContainer.appendChild(title);
        titleContainer.appendChild(versionInfo);
        header.appendChild(titleContainer);
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

        // Task Model Configuration Section
        const taskModelSection = this.createTaskModelSection();
        body.appendChild(taskModelSection);

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

        // Debug Generation Section  
        const debugSection = this.createDebugSection();
        body.appendChild(debugSection);

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
     * Creates the task model configuration section
     */
    private createTaskModelSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'Task Model Configuration'
        });

        const taskModelContainer = createElement('div', {
            attributes: { id: 'settings-task-models-container' }
        });

        section.appendChild(title);
        section.appendChild(taskModelContainer);

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
                min: String(MIN_MAX_ITERATIONS),
                max: String(MAX_MAX_ITERATIONS),
                value: String(DEFAULT_MAX_ITERATIONS)
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
            // Import and open the modern AI Log modal
            const { openAILogModal } = await import('./AILogModal');
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
     * Creates the debug generation section
     */
    private createDebugSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['settings-section']
        });

        const title = createElement('h3', {
            content: 'Debug Settings'
        });

        const checkboxContainer = createElement('div', {
            classes: ['checkbox-container']
        });

        this.debugGenerationCheckbox = createElement('input', {
            attributes: {
                type: 'checkbox',
                id: 'debug-generation-checkbox'
            }
        }) as HTMLInputElement;

        const label = createElement('label', {
            content: 'Enable debug logging for stateless generation',
            attributes: { for: 'debug-generation-checkbox' }
        });

        const description = createElement('div', {
            content: 'Shows detailed console logs during generation to help diagnose issues',
            attributes: { 
                style: 'font-size: 0.9em; color: #666; margin-top: 5px;'
            }
        });

        this.debugGenerationCheckbox.addEventListener('change', async () => {
            await this.settingsService.setDebugGenerationEnabled(this.debugGenerationCheckbox!.checked);
            this.autoSave();
        });

        checkboxContainer.appendChild(this.debugGenerationCheckbox);
        checkboxContainer.appendChild(label);
        checkboxContainer.appendChild(description);

        section.appendChild(title);
        section.appendChild(checkboxContainer);

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
            void this.handleSave();
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
    private async initializeComponents(): Promise<void> {
        // Initialize profile selector
        const profileContainer = this.element?.querySelector('.profile-container') as HTMLElement;
        if (profileContainer) {
            this.profileSelector = new ProfileSelector(profileContainer, this.settingsService);
            this.profileSelector.onSelectionChange(async (event) => {
                // Lock UI and disable auto-save during profile switch
                this.disableAutoSave();
                this.setUILocked(true);
                
                try {
                    // Apply profile changes synchronously
                    await this.applyProfileToUI(event.profile);
                this.updateCurrentProfileDisplay(event.profileName);
                    
                    // Emit events
                this.emit('profileChanged', event.profileName);
                
                // Refresh the global profile selector to maintain consistency
                this.refreshGlobalProfileSelector?.();
                    
                } finally {
                    // Always re-enable UI and auto-save
                    this.setUILocked(false);
                    this.enableAutoSave();
                }
            });

            this.profileSelector.onAction((_event) => {
                this.refreshGlobalProfileSelector?.();
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
            // Check if OpenRouterClient has active operations
            const openRouterClient = OpenRouterClient.getInstance();
            const activeOperationCount = openRouterClient.getActiveOperationCount();
            
            if (activeOperationCount > 0) {
                // Disable model configurator when AI operations are active
                modelsContainer.innerHTML = `
                    <div style="
                        padding: 1rem;
                        background-color: #fef3c7;
                        border: 1px solid #f59e0b;
                        border-radius: 8px;
                        color: #92400e;
                        text-align: center;
                    ">
                        <div style="font-weight: 600; margin-bottom: 0.5rem;">
                            ⚡ Model Configuration Disabled
                        </div>
                        <div style="font-size: 0.875rem;">
                            ${activeOperationCount} AI operation${activeOperationCount !== 1 ? 's' : ''} currently running.<br/>
                            Model settings cannot be changed while AI operations are in progress<br/>
                            to prevent configuration conflicts.
                        </div>
                        <div style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;">
                            Please wait for operations to complete and reopen settings.
                        </div>
                    </div>
                `;
            } else {
                // Normal model selector initialization
            // Wait for ModelSelector initialization before rendering
            await this.modelSelector.waitForInitialization();
            this.modelSelector.render(modelsContainer);
            modelsContainer.addEventListener('change', () => this.autoSave());
            modelsContainer.addEventListener('input', () => this.autoSave());
            }
        }

        // Initialize task model editor
        const taskModelContainer = this.element?.querySelector('#settings-task-models-container') as HTMLElement;
        if (taskModelContainer) {
            this.taskModelEditor = new TaskModelEditor(
                taskModelContainer,
                this.settingsManager,
                {
                    onChange: () => this.autoSave(),
                    showDescriptions: true
                }
            );
            this.taskModelEditor.render();
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
        await this.loadCurrentSettings();
    }

    /**
     * Loads current settings into the UI
     */
    private async loadCurrentSettings(): Promise<void> {
        const lastUsedProfile = this.settingsService.getLastUsedProfile();
        if (lastUsedProfile) {
            await this.applyProfileToUI(lastUsedProfile);
        }

        if (this.aiLoggingCheckbox) {
            this.aiLoggingCheckbox.checked = this.settingsService.isAILoggingEnabled();
        }

        if (this.debugGenerationCheckbox) {
            this.debugGenerationCheckbox.checked = this.settingsService.isDebugGenerationEnabled();
        }

        this.updateCurrentProfileDisplay(this.settingsService.getLastUsedProfileName() || '');
        this.updateUnsavedIndicator(false);
    }

    /**
     * Applies a profile to the UI components
     */
    private async applyProfileToUI(profile: any): Promise<void> {
        if (!profile) return;

        // Clear pending auto-save to prevent race conditions
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        // Load all settings from the profile (models, web search, providers)
        await this.modelSelector.loadFromCurrentProfile();

        // Apply to criteria editor
        if (this.criteriaEditor && profile.criteria) {
            this.criteriaEditor.setCriteria(profile.criteria);
        }

        // Apply max iterations
        if (this.maxIterationsInput) {
            this.maxIterationsInput.value = String(profile.maxIterations || DEFAULT_MAX_ITERATIONS);
        }

        // Refresh task model editor
        if (this.taskModelEditor) {
            this.taskModelEditor.render();
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
        // Skip auto-save if disabled or UI is locked
        if (!this.autoSaveEnabled || this.isUILocked) {
            return;
        }

        this.updateUnsavedIndicator(true);

        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = window.setTimeout(async () => {
            // Double-check auto-save is still enabled before executing
            if (!this.autoSaveEnabled || this.isUILocked) {
                return;
            }

            console.log('🔄 Auto-saving settings and prompts...');
            
            // Save profile settings (criteria, models, etc.)
            await this.saveCurrentSettingsToProfile();
            
            // CRITICAL FIX: Also save prompt changes during auto-save
            await this.promptService.saveToStorage();
            
            console.log('✅ Auto-save completed');
            this.updateUnsavedIndicator(false);
        }, 2000);
    }

    /**
     * Disables auto-save and clears any pending saves
     */
    public disableAutoSave(): void {
        this.autoSaveEnabled = false;
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
    }

    /**
     * Re-enables auto-save
     */
    public enableAutoSave(): void {
        this.autoSaveEnabled = true;
    }

    /**
     * Locks/unlocks the UI to prevent user interaction during operations
     */
    public setUILocked(locked: boolean): void {
        this.isUILocked = locked;
        
        // Simply disable interactive elements without visual changes
        const interactiveElements = this.element?.querySelectorAll('input, select, button, textarea');
        interactiveElements?.forEach(element => {
            if (element instanceof HTMLInputElement || 
                element instanceof HTMLSelectElement || 
                element instanceof HTMLButtonElement || 
                element instanceof HTMLTextAreaElement) {
                element.disabled = locked;
            }
        });

        // Show/hide simple loading text instead of overlay
        if (locked) {
            this.showSimpleLoadingState();
        } else {
            this.hideSimpleLoadingState();
        }
    }

    /**
     * Shows simple loading state without overlay
     */
    private showSimpleLoadingState(): void {
        // Just update the profile display to show loading
        if (this.currentProfileDisplay) {
            this.currentProfileDisplay.textContent = '(switching...)';
            this.currentProfileDisplay.style.fontStyle = 'italic';
            this.currentProfileDisplay.style.color = '#6b7280';
        }
    }

    /**
     * Hides simple loading state
     */
    private hideSimpleLoadingState(): void {
        // Profile display will be updated by the normal flow
        if (this.currentProfileDisplay) {
            this.currentProfileDisplay.style.fontStyle = '';
            this.currentProfileDisplay.style.color = '';
        }
    }

    /**
     * Saves current settings to the active profile
     */
    private async saveCurrentSettingsToProfile(): Promise<void> {
        const activeProfileName = this.settingsService.getLastUsedProfileName();
        if (!activeProfileName) return;

        const criteria = this.criteriaEditor?.getCriteria() || [];
        const maxIterations = parseInt(this.maxIterationsInput?.value || String(DEFAULT_MAX_ITERATIONS), 10);

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
        
        console.log('💾 Saving settings and prompts...');
        
        // Save profile settings (criteria, models, etc.)
        await this.saveCurrentSettingsToProfile();
        
        // CRITICAL FIX: Save prompt changes to storage
        await this.promptService.saveToStorage();
        
        console.log('✅ Settings and prompts saved successfully');
        
        // DEBUG: Log current prompts to verify they're saved
        const savedPrompts = this.settingsManager.getPrompts();
        console.log('🔍 Verification - Current prompts in SettingsManager:', Object.keys(savedPrompts));
        
        this.updateUnsavedIndicator(false);
        this.emit('saved');
        void this.close();
    }

    /**
     * DEBUG UTILITY: Global function to verify prompt changes are working
     * Users can call this from browser console: window.debugPrompts()
     */
    public static setupDebugUtilities(): void {
        (window as any).debugPrompts = () => {
            const state = require('../../state');
            const activeProject = state.getActiveProject();
            if (!activeProject) {
                console.log('❌ No active project found');
                return;
            }
            
            const settingsManager = activeProject.getSettingsManager();
            const prompts = settingsManager.getPrompts();
            
            console.log('🔍 PROMPT DEBUG INFORMATION');
            console.log('==========================================');
            console.log('📋 Available prompts:', Object.keys(prompts));
            console.log('');
            console.log('🎯 Key prompts for content generation:');
            console.log('- content_generation_user:', prompts.content_generation_user?.substring(0, 100) + '...');
            console.log('- branch_content_generation_user:', prompts.branch_content_generation_user?.substring(0, 100) + '...');
            console.log('- expand_text_user:', prompts.expand_text_user?.substring(0, 100) + '...');
            console.log('');
            console.log('💡 If you just changed prompts, these should reflect your changes');
            console.log('💡 If they show old values, the prompt saving bug may still exist');
            
            return prompts;
        };
        

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
        void this.close();
    }

    /**
     * Handles the close action
     */
    private handleClose(): void {
        if (this.hasUnsavedChanges) {
            const confirmed = confirm('You have unsaved changes. Are you sure you want to close?');
            if (!confirmed) return;
        }

        void this.close();
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
    public override destroy(): void {
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }
        

        
        void super.destroy();
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
                
                .settings-modal-container .header-title-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                
                .settings-modal-container .modal-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #111827;
                }
                
                .settings-modal-container .key-info {
                    font-size: 0.875rem;
                    opacity: 0.8;
                }
                
                .settings-modal-container .key-status.key-valid {
                    color: #059669;
                }
                
                .settings-modal-container .key-status.key-expiring {
                    color: #d97706;
                }
                
                .settings-modal-container .key-status.key-expired,
                .settings-modal-container .key-status.key-missing,
                .settings-modal-container .key-status.key-error {
                    color: #dc2626;
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