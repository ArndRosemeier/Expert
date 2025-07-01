import { AppKeyService } from './keys/AppKeyService.js';
import { VersionService } from './VersionService.js';

// Log version info on startup
VersionService.logVersionInfo();

// --- Fresh Start Debug Logic ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('clean') === 'true') {
    // Clear all storage using the new storage service
    void (async () => {
        try {
            const { StorageService } = await import('./StorageService');
            const storage = await StorageService.getInstance();
            await storage.clear();
    
    // Redirect to the same page without the query parameter
    window.location.href = window.location.pathname;
        } catch (error) {
            console.error('Failed to clear storage:', error);
            alert('Failed to clear application data. Please try again or contact support.');
        }
    })();
}

document.addEventListener('DOMContentLoaded', () => {
    void (async () => {
        // Check for valid application key before starting the app
        console.log('🔑 Expert Application starting - checking key validation...');
        
        const appKeyService = AppKeyService.getInstance();
        
        try {
            // Check if we have a valid key stored in IndexedDB at keyValue/expert_app_key
            const hasValidKey = await appKeyService.checkAppAccess();
            
            if (hasValidKey) {
                // Valid key found - start the app normally
                console.log('✅ Valid key found in keyValue/expert_app_key - starting application');
                await startApplication();
            } else {
                // No valid key - AppKeyService will handle showing the validation modal
                // The modal will call startApplication() once a valid key is provided
                console.log('⏳ Waiting for valid key validation...');
            }
        } catch (error) {
            console.error('❌ Error during key validation:', error);
            alert('Failed to validate application key. Please refresh the page and try again.');
        }
    })();
});

/**
 * Start the main application after key validation is complete
 */
async function startApplication(): Promise<void> {
    console.log('🚀 Initializing Expert application...');
    
    try {
        const { initialize } = await import('./event-handlers');
        const { setupEventListeners } = await import('./ui/project-ui');
        
        await initialize();
        
        // 🔧 NEW: Initialize EventManager for robust event handling
        console.log('🔧 Setting up EventManager for robust event handling...');
        const { eventManager } = await import('./ui/event-manager');
        
        // Set up both regular and enhanced event listeners
        setupEventListeners();
        
        // Initialize EventManager for DOM mutation tracking
        console.log('✅ EventManager initialized successfully');
        console.log('📊 Event Manager status:', eventManager.getDebugInfo());
        
        // Check for version mismatches and show dialog if needed
        await checkVersionMismatches();
        
        console.log('✅ Expert application started successfully');
    } catch (error) {
        console.error('❌ Failed to start application:', error);
        alert('Failed to start the application. Please refresh the page and try again.');
    }
}

/**
 * Check for version mismatches in settings and show modal if needed
 */
async function checkVersionMismatches(): Promise<void> {
    try {
        const { MigrationSelectionModal } = await import('./ui/modals/MigrationSelectionModal');
        const { getModalRegistry } = await import('./ui/modals/core/ModalRegistry');
        const { VersionService } = await import('./VersionService');
        const state = await import('./state');
        
        // Get settings manager and model selector instances
        const settingsManager = state.getSettingsManager();
        const modelSelector = state.getModelSelector();
        
        if (!settingsManager || !settingsManager.hasVersionMismatchDetected()) {
            console.log('✅ Settings version is current - no migration needed');
            return;
        }

        console.log('⚠️ Version mismatch detected in settings - analyzing compatibility...');
        
        const currentProfileName = settingsManager.getLastUsedProfileName() || 'default';
        const currentProfile = settingsManager.getProfile(currentProfileName);
        const currentVersion = VersionService.getBuildNumber();
        
        /**
         * Internal function to show migration dialog with proper imports
         */
        const showMigrationDialogInternal = async (): Promise<void> => {
            const analysis = {
                profileName: currentProfileName,
                savedVersion: currentProfile?.version,
                currentVersion: currentVersion,
                hasChanges: true
            };

            // Create migration selection modal
            const modal = new MigrationSelectionModal({
                id: 'migration-selection-modal',
                settingsManager: settingsManager,
                ...(modelSelector && { modelSelector }),
                analysis,
                onMigrationComplete: () => {
                    console.log('✅ Migration completed, reloading UI...');
                    // Refresh the page to reload with new settings
                    window.location.reload();
                }
            });

            // Register modal
            const registry = getModalRegistry();
            registry.register(modal);
            
            // Open modal
            await modal.open();
        };

        if (!currentProfile) {
            console.log('⚠️ No profile found, showing migration dialog');
            await showMigrationDialogInternal();
            return;
        }

        // Analyze if there are actual meaningful differences
        const hasRealChanges = await analyzeSettingsCompatibility(settingsManager, currentProfile);
        
        if (!hasRealChanges) {
            // Settings are compatible - silently update version
            console.log('✅ Settings are compatible with new version - updating version silently');
            await silentVersionUpdate(settingsManager, currentProfileName, currentProfile, currentVersion);
        } else {
            // There are meaningful changes - show migration dialog
            console.log('⚠️ Settings have compatibility issues - showing migration dialog');
            await showMigrationDialogInternal();
        }
        
    } catch (error) {
        console.error('❌ Failed to check version mismatches:', error);
        // Don't block the app if version check fails
    }
}

/**
 * Analyzes if settings have meaningful compatibility issues
 */
async function analyzeSettingsCompatibility(settingsManager: any, profile: any): Promise<boolean> {
    // For now, implement basic compatibility check
    // In the future, this could be expanded to check:
    // - Missing required criteria
    // - Deprecated prompt formats
    // - Invalid model configurations
    // - Changed API structures
    
    try {
        // Check if profile has basic required structure
        if (!profile.criteria || !Array.isArray(profile.criteria)) {
            return true; // Needs migration
        }
        
        if (!profile.prompt || typeof profile.prompt !== 'string') {
            return true; // Needs migration
        }
        
        // Check if criteria have required properties
        for (const criterion of profile.criteria) {
            if (!criterion.name || typeof criterion.name !== 'string' ||
                typeof criterion.goal !== 'number') {
                return true; // Needs migration
            }
        }
        
        // Profile looks compatible
        return false;
        
    } catch (error) {
        console.error('Error analyzing compatibility:', error);
        return true; // Be safe and show migration dialog on error
    }
}

/**
 * Silently updates the version of compatible settings
 */
async function silentVersionUpdate(settingsManager: any, profileName: string, profile: any, newVersion: string): Promise<void> {
    try {
        // Update profile with new version
        const updatedProfile = {
            ...profile,
            version: newVersion
        };
        
        // Save updated profile
        await settingsManager.saveProfile(profileName, updatedProfile);
        
        // Clear version mismatch flag
        settingsManager.clearVersionMismatchFlag();
        
        console.log(`✅ Settings for profile "${profileName}" updated to version ${newVersion}`);
        
    } catch (error) {
        console.error('Failed to update settings version:', error);
        // If silent update fails, don't throw - let the app continue
    }
}

// Expose startApplication to global scope so AppKeyService can call it
(window as any).startApplication = startApplication; 