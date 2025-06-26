/**
 * Service for managing settings profiles and configurations
 */

import { SettingsManager, SettingsProfile } from '../../../SettingsManager';
import { ModelSelector } from '../../../ModelSelector';
import { QualityCriterion } from '../../../types';

export interface ProfileImportResult {
    success: boolean;
    message: string;
    profileName?: string;
}

export interface SettingsChangeEvent {
    type: 'profile' | 'models' | 'criteria' | 'iterations' | 'aiLogging';
    data: any;
}

export class SettingsService {
    private settingsManager: SettingsManager;
    private modelSelector: ModelSelector;
    private changeHandlers: ((event: SettingsChangeEvent) => void)[] = [];
    private saveHandlers: (() => void)[] = [];

    constructor(settingsManager: SettingsManager, modelSelector: ModelSelector) {
        this.settingsManager = settingsManager;
        this.modelSelector = modelSelector;
    }

    /**
     * Gets all available profile names
     */
    public getProfileNames(): string[] {
        return this.settingsManager.getProfileNames();
    }

    /**
     * Gets a specific profile by name
     */
    public getProfile(name: string): SettingsProfile | null {
        return this.settingsManager.getProfile(name);
    }

    /**
     * Gets the last used profile name
     */
    public getLastUsedProfileName(): string | null {
        return this.settingsManager.getLastUsedProfileName();
    }

    /**
     * Gets the last used profile
     */
    public getLastUsedProfile(): SettingsProfile | null {
        return this.settingsManager.getLastUsedProfile();
    }

    /**
     * Creates a new profile with current settings
     */
    public async createProfile(name: string): Promise<{ success: boolean; message: string }> {
        if (!name.trim()) {
            return { success: false, message: 'Please enter a name for the new profile.' };
        }

        // Check if profile already exists
        if (this.settingsManager.getProfile(name)) {
            return { success: false, message: `A profile named "${name}" already exists.` };
        }

        try {
            // Get current settings
            const currentSettings: SettingsProfile = {
                selectedModels: this.modelSelector.getSelectedModels(),
                criteria: [], // Will be filled by the UI component
                maxIterations: 5, // Will be filled by the UI component
                prompt: '', // Legacy field
                contextExtractionPrompt: '' // Legacy field
            };

            // Save the new profile
            await this.settingsManager.saveProfile(name, currentSettings);
            this.settingsManager.setLastUsedProfile(name);

            this.emitChange({
                type: 'profile',
                data: { action: 'created', profileName: name }
            });

            return { success: true, message: `Profile "${name}" created and activated.` };
        } catch (error) {
            console.error('Failed to create profile:', error);
            return { success: false, message: 'Failed to create profile. Please try again.' };
        }
    }

    /**
     * Saves current settings to the specified profile
     */
    public async saveCurrentSettingsToProfile(
        profileName: string,
        criteria: QualityCriterion[],
        maxIterations: number
    ): Promise<void> {
        const currentSettings: SettingsProfile = {
            selectedModels: this.modelSelector.getSelectedModels(),
            criteria,
            maxIterations,
            prompt: '', // Legacy field
            contextExtractionPrompt: '' // Legacy field
        };

        await this.settingsManager.saveProfile(profileName, currentSettings);
        
        this.emitChange({
            type: 'profile',
            data: { action: 'saved', profileName }
        });

        this.saveHandlers.forEach(handler => handler());
    }

    /**
     * Switches to a different profile
     */
    public switchToProfile(profileName: string): SettingsProfile | null {
        const profile = this.settingsManager.getProfile(profileName);
        if (profile) {
            this.settingsManager.setLastUsedProfile(profileName);
            
            this.emitChange({
                type: 'profile',
                data: { action: 'switched', profileName, profile }
            });
        }
        return profile;
    }

    /**
     * Deletes a profile
     */
    public async deleteProfile(profileName: string): Promise<{ success: boolean; message: string }> {
        if (!profileName) {
            return { success: false, message: 'No profile selected for deletion.' };
        }

        try {
            this.settingsManager.deleteProfile(profileName);
            
            this.emitChange({
                type: 'profile',
                data: { action: 'deleted', profileName }
            });

            return { success: true, message: `Profile "${profileName}" deleted.` };
        } catch (error) {
            console.error('Failed to delete profile:', error);
            return { success: false, message: 'Failed to delete profile. Please try again.' };
        }
    }

    /**
     * Exports a profile for download
     */
    public exportProfile(profileName: string): { success: boolean; message: string } {
        if (!profileName) {
            return { success: false, message: 'Please select a profile to export.' };
        }

        try {
            this.settingsManager.downloadProfileExport(profileName);
            return { success: true, message: `Profile "${profileName}" exported successfully.` };
        } catch (error) {
            console.error('Export failed:', error);
            return { success: false, message: 'Failed to export profile. Please try again.' };
        }
    }

    /**
     * Imports a profile from a file
     */
    public async importProfileFromFile(
        file: File,
        confirmOverwrite: (profileName: string) => Promise<boolean>
    ): Promise<ProfileImportResult> {
        try {
            const result = await this.settingsManager.importProfileFromFile(file, confirmOverwrite);
            
            if (result.success) {
                this.emitChange({
                    type: 'profile',
                    data: { action: 'imported', profileName: result.profileName }
                });
            }

            return result;
        } catch (error) {
            console.error('Import failed:', error);
            return {
                success: false,
                message: 'Failed to import profile. Please check the file format and try again.'
            };
        }
    }

    /**
     * Gets AI logging status
     */
    public isAILoggingEnabled(): boolean {
        return this.settingsManager.isAILoggingEnabled();
    }

    /**
     * Sets AI logging status
     */
    public async setAILoggingEnabled(enabled: boolean): Promise<void> {
        await this.settingsManager.setAILoggingEnabled(enabled);
        
        this.emitChange({
            type: 'aiLogging',
            data: { enabled }
        });
    }

    /**
     * Applies a profile's settings to the UI components
     */
    public applyProfileToComponents(profile: SettingsProfile | null): void {
        if (!profile) return;

        // Apply models
        if (profile.selectedModels) {
            this.modelSelector.setSelectedModels(profile.selectedModels);
        }

        this.emitChange({
            type: 'profile',
            data: { action: 'applied', profile }
        });
    }

    /**
     * Gets current settings from UI components
     */
    public getCurrentSettings(criteria: QualityCriterion[], maxIterations: number): SettingsProfile {
        return {
            selectedModels: this.modelSelector.getSelectedModels(),
            criteria,
            maxIterations,
            prompt: '', // Legacy field
            contextExtractionPrompt: '' // Legacy field
        };
    }

    /**
     * Validates profile data
     */
    public validateProfile(profile: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!profile) {
            errors.push('Profile data is missing');
            return { valid: false, errors };
        }

        if (!Array.isArray(profile.selectedModels)) {
            errors.push('Selected models must be an array');
        }

        if (!Array.isArray(profile.criteria)) {
            errors.push('Criteria must be an array');
        }

        if (typeof profile.maxIterations !== 'number' || profile.maxIterations < 1) {
            errors.push('Max iterations must be a positive number');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Duplicates an existing profile with a new name
     */
    public async duplicateProfile(
        sourceProfileName: string, 
        newProfileName: string
    ): Promise<{ success: boolean; message: string }> {
        const sourceProfile = this.getProfile(sourceProfileName);
        if (!sourceProfile) {
            return { success: false, message: `Source profile "${sourceProfileName}" not found.` };
        }

        if (this.getProfile(newProfileName)) {
            return { success: false, message: `A profile named "${newProfileName}" already exists.` };
        }

        try {
            await this.settingsManager.saveProfile(newProfileName, { ...sourceProfile });
            
            this.emitChange({
                type: 'profile',
                data: { action: 'duplicated', sourceProfileName, newProfileName }
            });

            return { success: true, message: `Profile "${newProfileName}" created from "${sourceProfileName}".` };
        } catch (error) {
            console.error('Failed to duplicate profile:', error);
            return { success: false, message: 'Failed to duplicate profile. Please try again.' };
        }
    }

    /**
     * Renames an existing profile
     */
    public async renameProfile(
        oldName: string, 
        newName: string
    ): Promise<{ success: boolean; message: string }> {
        const profile = this.getProfile(oldName);
        if (!profile) {
            return { success: false, message: `Profile "${oldName}" not found.` };
        }

        if (this.getProfile(newName)) {
            return { success: false, message: `A profile named "${newName}" already exists.` };
        }

        try {
            // Save with new name
            await this.settingsManager.saveProfile(newName, profile);
            
            // Delete old profile
            this.settingsManager.deleteProfile(oldName);
            
            // Update last used if it was the renamed profile
            if (this.getLastUsedProfileName() === oldName) {
                this.settingsManager.setLastUsedProfile(newName);
            }

            this.emitChange({
                type: 'profile',
                data: { action: 'renamed', oldName, newName }
            });

            return { success: true, message: `Profile renamed from "${oldName}" to "${newName}".` };
        } catch (error) {
            console.error('Failed to rename profile:', error);
            return { success: false, message: 'Failed to rename profile. Please try again.' };
        }
    }

    /**
     * Registers a change handler
     */
    public onChange(handler: (event: SettingsChangeEvent) => void): void {
        this.changeHandlers.push(handler);
    }

    /**
     * Registers a save handler
     */
    public onSave(handler: () => void): void {
        this.saveHandlers.push(handler);
    }

    /**
     * Removes a change handler
     */
    public offChange(handler: (event: SettingsChangeEvent) => void): void {
        const index = this.changeHandlers.indexOf(handler);
        if (index > -1) {
            this.changeHandlers.splice(index, 1);
        }
    }

    /**
     * Removes a save handler
     */
    public offSave(handler: () => void): void {
        const index = this.saveHandlers.indexOf(handler);
        if (index > -1) {
            this.saveHandlers.splice(index, 1);
        }
    }

    /**
     * Emits a change event
     */
    private emitChange(event: SettingsChangeEvent): void {
        this.changeHandlers.forEach(handler => handler(event));
    }

    /**
     * Gets profile statistics
     */
    public getProfileStats(profileName: string): { criteriaCount: number; modelsCount: number } | null {
        const profile = this.getProfile(profileName);
        if (!profile) return null;

        return {
            criteriaCount: profile.criteria?.length || 0,
            modelsCount: profile.selectedModels?.length || 0
        };
    }

    /**
     * Validates that required profiles exist and creates defaults if needed
     */
    public async ensureDefaultProfiles(): Promise<void> {
        const profiles = this.getProfileNames();
        
        // Ensure 'default' profile exists
        if (!profiles.includes('default')) {
            await this.createProfile('default');
        }
    }
} 