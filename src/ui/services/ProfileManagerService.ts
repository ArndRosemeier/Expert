/**
 * Centralized Profile Management Service
 * 
 * Provides unified profile selection logic for both main UI and settings modal
 * to prevent inconsistencies and ensure model configurations are saved to the correct profile.
 */

import { SettingsProfile } from '../../SettingsManager';
import * as state from '../../state';

export interface ProfileChangeEvent {
    profileName: string;
    previousProfileName: string | null;
    profile: SettingsProfile | null;
}

export class ProfileManagerService {
    private changeHandlers: ((event: ProfileChangeEvent) => void)[] = [];
    private currentActiveProfile: string | null = null;
    
    constructor() {
        // Initialize with current profile from settings
        this.syncCurrentProfileFromSettings();
    }
    
    /**
     * Get the currently active profile name
     */
    getCurrentActiveProfile(): string | null {
        return this.currentActiveProfile;
    }
    
    /**
     * Switch to a different profile and update all UI components
     */
    async switchToProfile(profileName: string): Promise<SettingsProfile | null> {
        const settingsManager = state.getSettingsManager()!;
        const modelSelector = state.getModelSelector()!;
        
        const previousProfileName = this.currentActiveProfile;
        
        // Get the profile data
        const profile = settingsManager.getProfile(profileName);
        if (!profile) {
            throw new Error(`Profile "${profileName}" not found`);
        }
        
        // Update settings manager
        await settingsManager.setLastUsedProfile(profileName);
        
        // Load profile into model selector
        await modelSelector.loadFromCurrentProfile();
        
        // Update our internal state
        this.currentActiveProfile = profileName;
        
        // Update global state tracking
        state.setCurrentlyLoadedProfileName(profileName);
        
        console.log(`📋 Profile switched from "${previousProfileName}" to "${profileName}"`);
        
        // Notify all listeners
        this.notifyProfileChange({
            profileName,
            previousProfileName,
            profile
        });
        
        return profile;
    }
    
    /**
     * Get all available profile names
     */
    getAvailableProfiles(): string[] {
        const settingsManager = state.getSettingsManager()!;
        return settingsManager.getProfileNames();
    }
    
    /**
     * Get the current profile data
     */
    getCurrentProfile(): SettingsProfile | null {
        if (!this.currentActiveProfile) return null;
        
        const settingsManager = state.getSettingsManager()!;
        return settingsManager.getProfile(this.currentActiveProfile) ?? null;
    }
    
    /**
     * Save model configurations to the currently active profile
     * This fixes the bug where models were saved to wrong profile
     */
    async saveModelsToCurrentProfile(
        models: Record<string, string>, 
        webSearchEnabled?: Record<string, boolean>, 
        selectedProviders?: Record<string, string>
    ): Promise<void> {
        if (!this.currentActiveProfile) {
            throw new Error('No active profile - cannot save model configurations');
        }
        
        const settingsManager = state.getSettingsManager()!;
        const currentProfile = settingsManager.getProfile(this.currentActiveProfile);
        
        if (!currentProfile) {
            throw new Error(`Active profile "${this.currentActiveProfile}" not found`);
        }
        
        // Update the profile with new model configurations
        const updatedProfile: SettingsProfile = {
            ...currentProfile,
            selectedModels: models
        };
        
        if (webSearchEnabled) {
            updatedProfile.webSearchEnabled = webSearchEnabled;
        }
        
        if (selectedProviders) {
            updatedProfile.selectedProviders = selectedProviders;
        }
        
        // Save to the CURRENT active profile, not getLastUsedProfileName()
        await settingsManager.saveProfile(this.currentActiveProfile, updatedProfile);
        
        console.log(`✅ Models saved to active profile: ${this.currentActiveProfile}`);
    }
    
    /**
     * Sync current profile from settings manager (initialization)
     */
    private syncCurrentProfileFromSettings(): void {
        const settingsManager = state.getSettingsManager();
        if (settingsManager) {
            this.currentActiveProfile = settingsManager.getLastUsedProfileName() ?? 'default';
            state.setCurrentlyLoadedProfileName(this.currentActiveProfile);
        }
    }
    
    /**
     * Register profile change listener
     */
    onProfileChange(handler: (event: ProfileChangeEvent) => void): void {
        this.changeHandlers.push(handler);
    }
    
    /**
     * Remove profile change listener
     */
    removeProfileChangeListener(handler: (event: ProfileChangeEvent) => void): void {
        const index = this.changeHandlers.indexOf(handler);
        if (index > -1) {
            this.changeHandlers.splice(index, 1);
        }
    }
    
    /**
     * Notify all listeners of profile change
     */
    private notifyProfileChange(event: ProfileChangeEvent): void {
        this.changeHandlers.forEach(handler => {
            try {
                handler(event);
            } catch (error) {
                console.error('Error in profile change handler:', error);
            }
        });
    }
    
    /**
     * Force refresh all profile selectors to current state
     */
    refreshAllSelectors(): void {
        this.notifyProfileChange({
            profileName: this.currentActiveProfile!,
            previousProfileName: null,
            profile: this.getCurrentProfile()
        });
    }
}

// Global singleton instance
let globalProfileManager: ProfileManagerService | null = null;

/**
 * Get the global ProfileManagerService instance
 */
export function getProfileManagerService(): ProfileManagerService {
    globalProfileManager ??= new ProfileManagerService();
    return globalProfileManager;
} 