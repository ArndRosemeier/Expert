/**
 * Service for managing settings profiles and configurations
 */

import { SettingsManager, SettingsProfile, DEFAULT_CRITERIA } from '../../../SettingsManager';
import { ModelSelector } from '../../../ModelSelector';
import { QualityCriterion } from '../../../types';
import { OrchestratorPrompts, defaultPrompts } from '../../../PromptManager';
import { VersionService } from '../../../VersionService';
import { DEFAULT_MAX_ITERATIONS } from '../../../constants';

export interface ProfileImportResult {
    success: boolean;
    message: string;
    profileName?: string;
}

// Migration-related types
export interface PromptDifference {
    name: string;
    hasChanges: boolean;
    inSaved: boolean;
    inDefault: boolean;
    useDefault: boolean; // User's choice
}

export interface CriteriaDifference {
    name: string;
    hasChanges: boolean;
    inSaved: boolean;
    inDefault: boolean;
    isUserAdded: boolean;
    useDefault: boolean; // User's choice
    savedCriterion?: QualityCriterion;
    defaultCriterion?: QualityCriterion;
}

export interface MigrationAnalysis {
    profileName: string;
    savedVersion: string | undefined;
    currentVersion: string;
    prompts: PromptDifference[];
    criteria: CriteriaDifference[];
    hasChanges: boolean;
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
        return this.settingsManager.getProfile(name) || null;
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
        return this.settingsManager.getLastUsedProfile() || null;
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
                maxIterations: DEFAULT_MAX_ITERATIONS, // Will be filled by the UI component
                prompt: '', // Legacy field
                contextExtractionPrompt: '' // Legacy field
            };

            // Save the new profile
            await this.settingsManager.saveProfile(name, currentSettings);
            await this.settingsManager.setLastUsedProfile(name);

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

    /**
     * Analyze differences between saved profile and current defaults
     */
    public analyzeMigration(profileName: string): MigrationAnalysis | null {
        const profile = this.settingsManager.getProfile(profileName);
        if (!profile) return null;

        const currentPrompts = defaultPrompts;
        const savedPrompts = this.settingsManager.getPrompts();
        const currentCriteria = DEFAULT_CRITERIA;
        const savedCriteria = profile.criteria;

        // Analyze prompt differences
        const promptDiffs: PromptDifference[] = [];
        const allPromptNames = new Set([
            ...Object.keys(currentPrompts),
            ...Object.keys(savedPrompts)
        ]);

        for (const promptName of allPromptNames) {
            const inSaved = promptName in savedPrompts;
            const inDefault = promptName in currentPrompts;
            
            // Skip deprecated prompts (in saved but not in defaults)
            if (inSaved && !inDefault) continue;

            const hasChanges = inSaved && inDefault && 
                savedPrompts[promptName as keyof OrchestratorPrompts] !== currentPrompts[promptName as keyof OrchestratorPrompts];

            promptDiffs.push({
                name: promptName,
                hasChanges,
                inSaved,
                inDefault,
                useDefault: true // Default to using new defaults
            });
        }

        // Analyze criteria differences
        const criteriaDiffs: CriteriaDifference[] = [];
        const allCriteriaNames = new Set([
            ...currentCriteria.map((c: QualityCriterion) => c.name),
            ...savedCriteria.map((c: QualityCriterion) => c.name)
        ]);

        for (const criterionName of allCriteriaNames) {
            const savedCriterion = savedCriteria.find((c: QualityCriterion) => c.name === criterionName);
            const defaultCriterion = currentCriteria.find((c: QualityCriterion) => c.name === criterionName);
            
            const inSaved = !!savedCriterion;
            const inDefault = !!defaultCriterion;
            const isUserAdded = inSaved && !inDefault;
            
            let hasChanges = false;
            if (inSaved && inDefault) {
                hasChanges = JSON.stringify(savedCriterion) !== JSON.stringify(defaultCriterion);
            }

            criteriaDiffs.push({
                name: criterionName,
                hasChanges,
                inSaved,
                inDefault,
                isUserAdded,
                useDefault: inDefault, // Use default for standard criteria, preserve user-added
                savedCriterion: savedCriterion,
                defaultCriterion: defaultCriterion
            });
        }

        const hasChanges = promptDiffs.some(p => p.hasChanges) || 
                          criteriaDiffs.some(c => c.hasChanges || c.isUserAdded);

        return {
            profileName,
            savedVersion: profile.version,
            currentVersion: VersionService.getBuildNumber(),
            prompts: promptDiffs,
            criteria: criteriaDiffs,
            hasChanges
        };
    }

    /**
     * Apply migration choices to create updated profile
     */
    public async applyMigration(
        profileName: string, 
        analysis: MigrationAnalysis,
        preserveModels?: { selectedModels?: Record<string, string>; webSearchEnabled?: Record<string, boolean> }
    ): Promise<boolean> {
        try {
            const currentPrompts = { ...defaultPrompts };
            const currentCriteria = [...DEFAULT_CRITERIA];

            // Apply prompt choices
            const finalPrompts = { ...currentPrompts };
            for (const promptDiff of analysis.prompts) {
                if (!promptDiff.useDefault && promptDiff.inSaved) {
                    const savedPrompts = this.settingsManager.getPrompts();
                    const savedPromptValue = savedPrompts[promptDiff.name as keyof OrchestratorPrompts];
                    if (savedPromptValue) {
                        (finalPrompts as any)[promptDiff.name] = savedPromptValue;
                    }
                }
            }

            // Apply criteria choices
            const finalCriteria: QualityCriterion[] = [];
            for (const criteriaDiff of analysis.criteria) {
                if (criteriaDiff.useDefault && criteriaDiff.defaultCriterion) {
                    finalCriteria.push(criteriaDiff.defaultCriterion);
                } else if (!criteriaDiff.useDefault && criteriaDiff.savedCriterion) {
                    finalCriteria.push(criteriaDiff.savedCriterion);
                }
            }

            // Get current profile for non-migrated settings
            const currentProfile = this.settingsManager.getProfile(profileName);
            if (!currentProfile) return false;

            // Create updated profile
            const updatedProfile: SettingsProfile = {
                prompt: currentProfile.prompt, // Keep user's main prompt
                criteria: finalCriteria,
                maxIterations: currentProfile.maxIterations || DEFAULT_MAX_ITERATIONS,
                selectedModels: preserveModels?.selectedModels || currentProfile.selectedModels || {},
                webSearchEnabled: preserveModels?.webSearchEnabled || currentProfile.webSearchEnabled || {},
                contextExtractionPrompt: currentProfile.contextExtractionPrompt || currentPrompts.context_extraction_user || '',
                version: analysis.currentVersion
            };

            // Save updated profile and prompts
            console.log('🔄 Saving updated profile with version:', analysis.currentVersion);
            await this.settingsManager.saveProfile(profileName, updatedProfile);
            console.log('✅ Profile saved successfully');
            
            console.log('🔄 Saving updated prompts...');
            await this.settingsManager.savePrompts(finalPrompts);
            console.log('✅ Prompts saved successfully');

            // Force a small delay to ensure storage operations complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            console.log('✅ Migration save operations completed');
            return true;
        } catch (error) {
            console.error('Failed to apply migration:', error);
            return false;
        }
    }
} 