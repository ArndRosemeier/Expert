/**
 * Service for managing settings profiles and configurations
 */

import { SettingsManager, SettingsProfile } from '../../../SettingsManager';
import { ModelSelector } from '../../../ModelSelector';
import { QualityCriterion } from '../../../types';
import { DEFAULT_MAX_ITERATIONS } from '../../../constants';
import * as state from '../../../state';

// NEW: Import our settings utilities to eliminate duplication
import { 
    ProfileOperations,
    ProfileValidation,
    ProfileMessages
} from '../../utils/SettingsUtils';

export interface ProfileImportResult {
    success: boolean;
    message: string;
    profileName?: string;
}

export interface SettingsChangeEvent {
    type: 'profile' | 'models' | 'criteria' | 'iterations' | 'aiLogging' | 'debugGeneration';
    data: unknown;
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
        const profile = this.settingsManager.getProfile(name);
        // Return null if profile doesn't exist - this is expected behavior for profile existence checking
        return profile ?? null;
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
        const profile = this.settingsManager.getLastUsedProfile();
        if (profile === undefined) {
            throw new Error("No profile has been used yet - initialize profiles or select a default profile first");
        }
        return profile;
    }

    /**
     * Creates a new profile by copying the currently active profile - REFACTORED using SettingsUtils
     */
    public async createProfile(name: string): Promise<{ success: boolean; message: string }> {
            // Get the current active profile to copy from
            const currentProfile = this.getLastUsedProfile();
            const sourceProfileName = currentProfile ? (this.getLastUsedProfileName() ?? undefined) : undefined;
            
            let newProfileSettings: SettingsProfile;
            
            if (currentProfile?.criteria) {
                // Deep copy all settings from the current profile to prevent contamination
                newProfileSettings = {
                    selectedModels: { ...(currentProfile.selectedModels || {}) },
                    selectedProviders: { ...(currentProfile.selectedProviders ?? {}) },
                    webSearchEnabled: { ...(currentProfile.webSearchEnabled ?? {}) },
                    criteria: [...(currentProfile.criteria || [])],
                    maxIterations: currentProfile.maxIterations || DEFAULT_MAX_ITERATIONS,
                    contextExtractionPrompt: currentProfile.contextExtractionPrompt || '',
                    version: currentProfile.version ?? ''
                };
                
                // Deep copy taskModelConfigs if present
                if (currentProfile.taskModelConfigs) {
                    newProfileSettings.taskModelConfigs = { ...currentProfile.taskModelConfigs };
                }
                
                console.log(`🔄 Profile "${name}" created by deep copying from "${sourceProfileName}"`);
                console.log(`📋 Original selectedModels:`, currentProfile.selectedModels);
                console.log(`📋 New profile selectedModels:`, newProfileSettings.selectedModels);
            } else {
                // Fallback: create with current component settings if no active profile
                newProfileSettings = {
                    selectedModels: this.modelSelector.getSelectedModels(),
                    selectedProviders: this.modelSelector.getSelectedProviders(),
                    webSearchEnabled: this.modelSelector.getWebSearchEnabled(),
                    criteria: [], // Will be filled by the UI component
                    maxIterations: DEFAULT_MAX_ITERATIONS, // Will be filled by the UI component
                    contextExtractionPrompt: '' // Legacy field
                };
            }

        const result = await ProfileOperations.create(
            this.settingsManager,
            name,
            newProfileSettings,
            (event) => { this.emitChange(event); }
        );
        
        return {
            success: result.success,
            message: result.success ? ProfileMessages.created(name, sourceProfileName) : result.message
        };
    }

    /**
     * Saves current settings to the specified profile
     */
    public async saveCurrentSettingsToProfile(
        profileName: string,
        criteria: QualityCriterion[],
        maxIterations: number
    ): Promise<void> {
        // Get the existing profile to preserve fields we're not updating
        const existingProfile = this.settingsManager.getProfile(profileName);
        
        const currentSettings: SettingsProfile = {
            selectedModels: this.modelSelector.getSelectedModels(),
            selectedProviders: this.modelSelector.getSelectedProviders(),
            webSearchEnabled: this.modelSelector.getWebSearchEnabled(),
            criteria,
            maxIterations,
            contextExtractionPrompt: existingProfile?.contextExtractionPrompt ?? '' // Preserve existing context extraction prompt
        };

        // Add optional properties only if they exist
        // Language is project-level, not profile-level - skip copying
        if (existingProfile?.taskModelConfigs) {
            currentSettings.taskModelConfigs = existingProfile.taskModelConfigs;
        }

        await this.settingsManager.saveProfile(profileName, currentSettings);
        
        this.emitChange({
            type: 'profile',
            data: { action: 'saved', profileName }
        });

        this.saveHandlers.forEach(handler => { handler(); });
    }

    /**
     * Switches to a different profile
     */
    public async switchToProfile(profileName: string): Promise<SettingsProfile | null> {
        const profile = this.settingsManager.getProfile(profileName);
        if (profile) {
            // Wait for the profile to be saved before proceeding
            await this.settingsManager.setLastUsedProfile(profileName);
            
            // Apply the profile settings to UI components immediately
            this.applyProfileToComponents(profile);
            
            this.emitChange({
                type: 'profile',
                data: { action: 'switched', profileName, profile }
            });
            return profile;
        }
        return null;
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
    public async exportProfile(profileName: string): Promise<{ success: boolean; message: string }> {
        if (!profileName) {
            return { success: false, message: 'Please select a profile to export.' };
        }

        try {
            return await this.settingsManager.downloadProfileExport(profileName);
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
            const result = await this.settingsManager.importProfileFromFile(file, confirmOverwrite) as ProfileImportResult;
            
            if (result.success && result.profileName) {
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
            } as ProfileImportResult;
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
     * Gets debug generation status
     */
    public isDebugGenerationEnabled(): boolean {
        return this.settingsManager.isDebugGenerationEnabled();
    }

    /**
     * Sets debug generation status
     */
    public async setDebugGenerationEnabled(enabled: boolean): Promise<void> {
        await this.settingsManager.setDebugGenerationEnabled(enabled);
        
        this.emitChange({
            type: 'debugGeneration',
            data: { enabled }
        });
    }

    /**
     * Applies a profile's settings to the UI components
     */
    public applyProfileToComponents(profile: SettingsProfile | null): void {
        if (!profile) return;

        // Load all settings from the profile (models, web search, providers)
        void this.modelSelector.loadFromCurrentProfile();
            
            // Update global state to track which profile is actually loaded
            const profileName = this.getLastUsedProfileName();
            if (profileName) {
                state.setCurrentlyLoadedProfileName(profileName);
            console.log(`📋 Profile "${profileName}" loaded into ModelSelector`);
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
            selectedProviders: this.modelSelector.getSelectedProviders(),
            webSearchEnabled: this.modelSelector.getWebSearchEnabled(),
            criteria,
            maxIterations,
            contextExtractionPrompt: '' // Legacy field
        };
    }

    /**
     * Validates profile data - REFACTORED using SettingsUtils
     */
    public validateProfile(profile: unknown): { valid: boolean; errors: string[] } {
        const validation = ProfileValidation.validateStructure(profile);
        return {
            valid: validation.isValid,
            errors: validation.errors
        };
    }

    /**
     * Duplicates an existing profile with a new name - REFACTORED using SettingsUtils
     */
    public async duplicateProfile(
        sourceProfileName: string, 
        newProfileName: string
    ): Promise<{ success: boolean; message: string }> {
        return ProfileOperations.duplicate(
            this.settingsManager,
            sourceProfileName,
            newProfileName,
            (event) => { this.emitChange(event); }
        );
    }

    /**
     * Renames an existing profile - REFACTORED using SettingsUtils
     */
    public async renameProfile(
        oldName: string, 
        newName: string
    ): Promise<{ success: boolean; message: string }> {
        return ProfileOperations.rename(
            this.settingsManager,
            oldName,
            newName,
            (event) => { this.emitChange(event); }
        );
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
        this.changeHandlers.forEach(handler => { handler(event); });
    }

    /**
     * Gets profile statistics
     */
    public getProfileStats(profileName: string): { criteriaCount: number; modelsCount: number } | null {
        const profile = this.getProfile(profileName);
        if (!profile) return null;

        return {
            criteriaCount: profile.criteria?.length ?? 0,
            modelsCount: Object.keys(profile.selectedModels || {}).length || 0
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