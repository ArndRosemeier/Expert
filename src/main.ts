import { VersionService } from './VersionService.js';
import './ui/enhanced-layout.css';

// Log version info on startup (only in development or when explicitly requested)
// Check for development mode via URL parameter or localhost
const isDevelopment = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     new URLSearchParams(window.location.search).get('debug') === 'true';

if (isDevelopment) {
    VersionService.logVersionInfo();
}

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
        try {
            // Start the application directly without key validation
            await startApplication();
        } catch (error) {
            console.error('❌ Error during application startup:', error);
            alert('Failed to start the application. Please refresh the page and try again.');
        }
    })();
});

/**
 * Add version and build time info to the header
 */
function addVersionInfoToHeader(): void {
    const headerElement = document.querySelector('.main-header h1');
    if (headerElement) {
        const versionElement = document.createElement('span');
        versionElement.style.fontSize = '0.75rem';
        versionElement.style.fontWeight = '400';
        versionElement.style.color = '#6b7280';
        versionElement.style.marginLeft = '0.75rem';
        versionElement.style.fontFamily = 'Monaco, Menlo, Ubuntu Mono, monospace';
        versionElement.id = 'version-display';
        
        // Determine if we're in development mode
        const isDev = import.meta.env.DEV;
        
        if (isDev) {
            // In development: show version + server start time + live update time
            const buildDate = VersionService.getBuildDate();
            const startTime = buildDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const currentTime = new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            versionElement.innerHTML = `v${VersionService.getVersion()} <span style="color: #9ca3af;">(dev: ${startTime} → ${currentTime})</span>`;
            
            // Update the current time every 30 seconds during development
            setInterval(() => {
                const newCurrentTime = new Date().toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                versionElement.innerHTML = `v${VersionService.getVersion()} <span style="color: #9ca3af;">(dev: ${startTime} → ${newCurrentTime})</span>`;
            }, 30000);
        } else {
            // In production: show version + build time
            const buildDate = VersionService.getBuildDate();
            const formattedDate = buildDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
            });
            const formattedTime = buildDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            versionElement.textContent = `v${VersionService.getVersion()} (${formattedDate} ${formattedTime})`;
        }
        
        headerElement.appendChild(versionElement);
    }
}

/**
 * Start the main application after key validation is complete
 */
async function startApplication(): Promise<void> {

    
    // ⚠️ IMPORTANT: Initialize localStorage blocker to prevent accidental usage
    // This must happen early to catch any localStorage attempts during app startup
    try {
        const { LocalStorageBlocker } = await import('./LocalStorageBlocker');
        if (!LocalStorageBlocker.getConfig()) {
            // Only initialize if not already initialized
            LocalStorageBlocker.initialize({
                allowedKeys: [], // No localStorage usage allowed, use IndexedDB instead
                verbose: true,
                logAttempts: true
            });
        
        }
    } catch (error) {
        console.error('❌ Failed to initialize localStorage blocker:', error);
    }
    
    try {
        const { initialize } = await import('./event-handlers');
        const { setupEventListeners } = await import('./ui/project-ui');
        
        await initialize();
        
        // Set up event listeners
        await setupEventListeners();
        
        
        // Add version info to the header
        addVersionInfoToHeader();
        
        // Check for version mismatches and show dialog if needed
        await checkVersionMismatches();
        
        console.log('✅ Expert application started successfully');
        
        // Setup debug utilities for prompt verification
        const { SettingsModal } = await import('./ui/modals/SettingsModal');
        SettingsModal.setupDebugUtilities();
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
                    // Add a small delay to ensure all save operations complete before reload
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
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
async function analyzeSettingsCompatibility(_settingsManager: any, profile: any): Promise<boolean> {
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

// Expose startApplication to global scope for debugging purposes
(window as any).startApplication = startApplication; 