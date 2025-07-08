/**
 * Component for selecting and managing settings profiles
 */

import { SettingsService, SettingsChangeEvent } from '../services/SettingsService';
import { SettingsProfile } from '../../../SettingsManager';
import { createElement } from '../core/modal-utils';

export interface ProfileSelectionEvent {
    profileName: string;
    profile: SettingsProfile | null;
}

export interface ProfileActionEvent {
    action: 'created' | 'deleted' | 'exported' | 'imported' | 'renamed' | 'duplicated';
    profileName: string;
    data?: any;
}

export class ProfileSelector {
    private container: HTMLElement;
    private settingsService: SettingsService;
    private selectionHandlers: ((event: ProfileSelectionEvent) => void)[] = [];
    private actionHandlers: ((event: ProfileActionEvent) => void)[] = [];
    private refreshCallback?: () => void;

    private profileSelect!: HTMLSelectElement;
    private newProfileInput!: HTMLInputElement;
    private currentProfileDisplay!: HTMLElement;

    constructor(container: HTMLElement, settingsService: SettingsService) {
        this.container = container;
        this.settingsService = settingsService;
        
        // Listen to settings service changes
        this.settingsService.onChange(this.handleSettingsChange.bind(this));
        
        this.render();
        this.populate();
    }

    /**
     * Gets the currently selected profile name
     */
    public getSelectedProfileName(): string {
        return this.profileSelect.value;
    }

    /**
     * Sets the selected profile
     */
    public setSelectedProfile(profileName: string): void {
        this.profileSelect.value = profileName;
        this.updateCurrentProfileDisplay(profileName);
    }

    /**
     * Refreshes the profile list
     */
    public refresh(): void {
        this.populate();
        if (this.refreshCallback) {
            this.refreshCallback();
        }
    }

    /**
     * Sets a callback to be called when profiles are refreshed
     */
    public onRefresh(callback: () => void): void {
        this.refreshCallback = callback;
    }

    /**
     * Registers a selection change handler
     */
    public onSelectionChange(handler: (event: ProfileSelectionEvent) => void): void {
        this.selectionHandlers.push(handler);
    }

    /**
     * Registers an action handler
     */
    public onAction(handler: (event: ProfileActionEvent) => void): void {
        this.actionHandlers.push(handler);
    }

    /**
     * Removes a selection handler
     */
    public offSelectionChange(handler: (event: ProfileSelectionEvent) => void): void {
        const index = this.selectionHandlers.indexOf(handler);
        if (index > -1) {
            this.selectionHandlers.splice(index, 1);
        }
    }

    /**
     * Removes an action handler
     */
    public offAction(handler: (event: ProfileActionEvent) => void): void {
        const index = this.actionHandlers.indexOf(handler);
        if (index > -1) {
            this.actionHandlers.splice(index, 1);
        }
    }

    /**
     * Shows profile statistics
     */
    public showProfileStats(profileName: string): void {
        const stats = this.settingsService.getProfileStats(profileName);
        if (stats) {
            const message = `Profile: ${profileName}\n\nCriteria: ${stats.criteriaCount}\nModels: ${stats.modelsCount}`;
            alert(message);
        } else {
            alert(`Profile "${profileName}" not found.`);
        }
    }

    /**
     * Resets all settings to defaults by programmatically clicking the reset buttons
     */
    public resetAllToDefaults(): void {
        // Find and click the criteria reset button
        const criteriaResetButtons = Array.from(document.querySelectorAll('.criteria-actions button'));
        for (const button of criteriaResetButtons) {
            if (button.textContent?.includes('Reset to Defaults')) {
                (button as HTMLButtonElement).click();
                break;
            }
        }

        // Find and click the prompts reset button
        const promptsResetButtons = Array.from(document.querySelectorAll('.prompt-actions button'));
        for (const button of promptsResetButtons) {
            if (button.textContent?.includes('Reset All Prompts to Defaults')) {
                (button as HTMLButtonElement).click();
                break;
            }
        }
    }

    /**
     * Validates profile name for creation
     */
    public validateProfileName(name: string): { valid: boolean; error?: string } {
        if (!name.trim()) {
            return { valid: false, error: 'Profile name cannot be empty' };
        }

        if (this.settingsService.getProfile(name)) {
            return { valid: false, error: `Profile "${name}" already exists` };
        }

        // Check for invalid characters
        if (/[<>:"/\\|?*]/.test(name)) {
            return { valid: false, error: 'Profile name contains invalid characters' };
        }

        if (name.length > 50) {
            return { valid: false, error: 'Profile name is too long (max 50 characters)' };
        }

        return { valid: true };
    }

    /**
     * Renders the profile selector UI
     */
    private render(): void {
        this.container.innerHTML = '';
        this.addStyles();

        // Profile selection section
        const selectionSection = createElement('div', {
            classes: ['profile-selection']
        });

        const selectionLabel = createElement('label', {
            content: 'Active Profile:',
            attributes: { for: 'profile-select' }
        });

        this.profileSelect = createElement('select', {
            attributes: { id: 'profile-select' }
        }) as HTMLSelectElement;

        this.profileSelect.addEventListener('change', async () => {
            const profileName = this.profileSelect.value;
            const profile = await this.settingsService.switchToProfile(profileName);
            this.updateCurrentProfileDisplay(profileName);
            this.emitSelection(profileName, profile);
        });

        this.currentProfileDisplay = createElement('span', {
            classes: ['current-profile'],
            content: ''
        });

        selectionSection.appendChild(selectionLabel);
        selectionSection.appendChild(this.profileSelect);
        selectionSection.appendChild(this.currentProfileDisplay);

        // Profile creation section
        const creationSection = createElement('div', {
            classes: ['profile-creation']
        });

        const creationLabel = createElement('label', {
            content: 'Create New Profile:',
            attributes: { for: 'new-profile-input' }
        });

        this.newProfileInput = createElement('input', {
            attributes: {
                id: 'new-profile-input',
                type: 'text',
                placeholder: 'Enter profile name...'
            }
        }) as HTMLInputElement;

        this.newProfileInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void this.createProfile();
            }
        });

        const createButton = createElement('button', {
            classes: ['btn-primary'],
            content: 'Create Profile'
        });

        createButton.addEventListener('click', () => this.createProfile());

        creationSection.appendChild(creationLabel);
        const inputGroup = createElement('div', {
            classes: ['input-group']
        });
        inputGroup.appendChild(this.newProfileInput);
        inputGroup.appendChild(createButton);
        creationSection.appendChild(inputGroup);

        // Profile actions section
        const actionsSection = createElement('div', {
            classes: ['profile-actions']
        });

        const actionsLabel = createElement('label', {
            content: 'Profile Actions:'
        });

        const actionsGroup = createElement('div', {
            classes: ['action-buttons']
        });

        const deleteButton = createElement('button', {
            classes: ['btn-danger'],
            content: 'Delete'
        });
        deleteButton.addEventListener('click', () => this.deleteProfile());

        const exportButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Export'
        });
        exportButton.addEventListener('click', () => void this.exportProfile());

        const importButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Import'
        });
        importButton.addEventListener('click', () => this.importProfile());

        const duplicateButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Duplicate'
        });
        duplicateButton.addEventListener('click', () => this.duplicateProfile());

        const renameButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Rename'
        });
        renameButton.addEventListener('click', () => this.renameProfile());

        const resetToDefaultsButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Reset to Defaults'
        });
        resetToDefaultsButton.addEventListener('click', () => this.resetAllToDefaults());

        actionsGroup.appendChild(deleteButton);
        actionsGroup.appendChild(exportButton);
        actionsGroup.appendChild(importButton);
        actionsGroup.appendChild(duplicateButton);
        actionsGroup.appendChild(renameButton);
        actionsGroup.appendChild(resetToDefaultsButton);

        actionsSection.appendChild(actionsLabel);
        actionsSection.appendChild(actionsGroup);

        // Hidden file input for import
        const fileInput = createElement('input', {
            attributes: {
                type: 'file',
                accept: '.json',
                style: 'display: none;'
            }
        }) as HTMLInputElement;

        fileInput.addEventListener('change', (e) => this.handleFileImport(e));

        this.container.appendChild(selectionSection);
        this.container.appendChild(creationSection);
        this.container.appendChild(actionsSection);
        this.container.appendChild(fileInput);
    }

    /**
     * Populates the profile selector with available profiles
     */
    private populate(): void {
        const profiles = this.settingsService.getProfileNames();
        const lastUsed = this.settingsService.getLastUsedProfileName();
        
        this.profileSelect.innerHTML = profiles
            .map(name => `<option value="${name}" ${name === lastUsed ? 'selected' : ''}>${name}</option>`)
            .join('');
        
        this.updateCurrentProfileDisplay(lastUsed || '');
    }

    /**
     * Updates the current profile display
     */
    private updateCurrentProfileDisplay(profileName: string): void {
        if (this.currentProfileDisplay && profileName) {
            this.currentProfileDisplay.textContent = `(${profileName})`;
        }
    }

    /**
     * Creates a new profile
     */
    private async createProfile(): Promise<void> {
        const profileName = this.newProfileInput.value.trim();
        const validation = this.validateProfileName(profileName);
        
        if (!validation.valid) {
            alert(validation.error);
            this.newProfileInput.focus();
            return;
        }

        try {
            const result = await this.settingsService.createProfile(profileName);
            
            if (result.success) {
                this.newProfileInput.value = '';
                this.refresh();
                this.setSelectedProfile(profileName);
                
                this.emitAction({
                    action: 'created',
                    profileName,
                    data: result
                });
                
                alert(result.message);
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Failed to create profile:', error);
            alert('Failed to create profile. Please try again.');
        }
    }

    /**
     * Deletes the selected profile
     */
    private async deleteProfile(): Promise<void> {
        const profileName = this.getSelectedProfileName();
        if (!profileName) return;

        const confirmed = confirm(`Are you sure you want to delete the profile "${profileName}"?`);
        if (!confirmed) return;

        try {
            const result = await this.settingsService.deleteProfile(profileName);
            
            if (result.success) {
                this.refresh();
                
                // Switch to default profile
                const defaultProfile = this.settingsService.getProfile('default');
                if (defaultProfile) {
                    this.setSelectedProfile('default');
                    this.emitSelection('default', defaultProfile);
                }
                
                this.emitAction({
                    action: 'deleted',
                    profileName,
                    data: result
                });
                
                alert(result.message);
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Failed to delete profile:', error);
            alert('Failed to delete profile. Please try again.');
        }
    }

    /**
     * Exports the selected profile
     */
    private async exportProfile(): Promise<void> {
        const profileName = this.getSelectedProfileName();
        if (!profileName) {
            alert('Please select a profile to export.');
            return;
        }

        try {
            const result = await this.settingsService.exportProfile(profileName);
            
            this.emitAction({
                action: 'exported',
                profileName,
                data: result
            });
            
            if (result.success) {
                // Success message is handled by the browser download
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export profile. Please try again.');
        }
    }

    /**
     * Triggers profile import
     */
    private importProfile(): void {
        const fileInput = this.container.querySelector('input[type="file"]') as HTMLInputElement;
        fileInput.click();
    }

    /**
     * Handles file import
     */
    private async handleFileImport(event: Event): Promise<void> {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files?.[0];
        if (!file) return;

        try {
            const result = await this.settingsService.importProfileFromFile(
                file,
                async (profileName: string) => {
                    return confirm(`Profile "${profileName}" already exists. Do you want to overwrite it?\n\nNote: Your existing OpenRouter API key will be preserved.`);
                }
            );

            if (result.success) {
                this.refresh();
                
                // Switch to imported profile if available
                if (result.profileName) {
                    this.setSelectedProfile(result.profileName);
                    const profile = this.settingsService.getProfile(result.profileName);
                    this.emitSelection(result.profileName, profile);
                }
                
                this.emitAction({
                    action: 'imported',
                    profileName: result.profileName || '',
                    data: result
                });
                
                alert(result.message);
            } else {
                alert(`Import failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import profile. Please check the file format and try again.');
        }

        // Clear the file input for future use
        fileInput.value = '';
    }

    /**
     * Duplicates the selected profile
     */
    private async duplicateProfile(): Promise<void> {
        const sourceProfileName = this.getSelectedProfileName();
        if (!sourceProfileName) return;

        const newProfileName = prompt(`Enter a name for the duplicate of "${sourceProfileName}":`);
        if (!newProfileName) return;

        const validation = this.validateProfileName(newProfileName);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        try {
            const result = await this.settingsService.duplicateProfile(sourceProfileName, newProfileName);
            
            if (result.success) {
                this.refresh();
                this.setSelectedProfile(newProfileName);
                
                this.emitAction({
                    action: 'duplicated',
                    profileName: newProfileName,
                    data: { sourceProfileName, newProfileName }
                });
                
                alert(result.message);
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Failed to duplicate profile:', error);
            alert('Failed to duplicate profile. Please try again.');
        }
    }

    /**
     * Renames the selected profile
     */
    private async renameProfile(): Promise<void> {
        const oldName = this.getSelectedProfileName();
        if (!oldName) return;

        const newName = prompt(`Enter a new name for "${oldName}":`);
        if (!newName) return;

        const validation = this.validateProfileName(newName);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        try {
            const result = await this.settingsService.renameProfile(oldName, newName);
            
            if (result.success) {
                this.refresh();
                this.setSelectedProfile(newName);
                
                this.emitAction({
                    action: 'renamed',
                    profileName: newName,
                    data: { oldName, newName }
                });
                
                alert(result.message);
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Failed to rename profile:', error);
            alert('Failed to rename profile. Please try again.');
        }
    }

    /**
     * Handles settings service changes
     */
    private handleSettingsChange(event: SettingsChangeEvent): void {
        if (event.type === 'profile' && event.data.action === 'switched') {
            this.updateCurrentProfileDisplay(event.data.profileName);
        }
    }

    /**
     * Emits a selection event
     */
    private emitSelection(profileName: string, profile: SettingsProfile | null): void {
        this.selectionHandlers.forEach(handler => {
            handler({ profileName, profile });
        });
    }

    /**
     * Emits an action event
     */
    private emitAction(event: ProfileActionEvent): void {
        this.actionHandlers.forEach(handler => {
            handler(event);
        });
    }

    /**
     * Adds component styles
     */
    private addStyles(): void {
        const style = createElement('style', {
            innerHTML: `
                .profile-selection,
                .profile-creation,
                .profile-actions {
                    margin-bottom: 1.5rem;
                    padding: 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background-color: #f9fafb;
                }
                
                .profile-selection label,
                .profile-creation label,
                .profile-actions label {
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: #374151;
                }
                
                .profile-selection select {
                    width: 100%;
                    max-width: 300px;
                    padding: 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    background-color: white;
                    font-size: 0.9rem;
                }
                
                .current-profile {
                    margin-left: 0.5rem;
                    font-style: italic;
                    color: #6b7280;
                }
                
                .input-group {
                    display: flex;
                    gap: 0.5rem;
                    align-items: center;
                }
                
                .input-group input {
                    flex: 1;
                    padding: 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 0.9rem;
                }
                
                .input-group input:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .action-buttons {
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                
                .btn-primary,
                .btn-secondary,
                .btn-danger,
                .btn-info {
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.875rem;
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
                
                .btn-info {
                    background-color: #06b6d4;
                    color: white;
                }
                
                .btn-info:hover {
                    background-color: #0891b2;
                }
            `
        });

        // Add styles to document head if not already present
        const existingStyle = document.querySelector('#profile-selector-styles');
        if (!existingStyle) {
            style.id = 'profile-selector-styles';
            document.head.appendChild(style);
        }
    }
} 