/**
 * LocalStorageCleanupService - Utility to clean up old localStorage entries
 * that have been migrated to IndexedDB
 */

export interface CleanupResult {
    removedKeys: string[];
    remainingKeys: string[];
    totalCleaned: number;
}

export class LocalStorageCleanupService {
    
    /**
     * List of localStorage keys that should be cleaned up (migrated to IndexedDB)
     */
    private static readonly KEYS_TO_CLEANUP = [
        'expert_app_collapsed_nodes',      // Now stored per-node in DocumentNode.collapsed
        'expert_app_criteria',             // Moved to settings profiles
        'expert_app_current_project',      // Moved to IndexedDB projects
        'expert_app_last_used_profile',    // Moved to IndexedDB via SettingsManager
        'expert_app_main_prompt',          // Moved to prompts in IndexedDB
        'expert_app_project_templates',    // Moved to IndexedDB
        'expert_app_settings_profiles',    // Moved to IndexedDB via SettingsManager
        'openrouter_api_key',              // Moved to IndexedDB via ModelSelector
        'openrouter_model_purposes',       // Moved to IndexedDB via ModelSelector
        'openrouter_web_search_preferences', // Moved to IndexedDB via ModelSelector
        'world_a',                         // Unknown old entry
        'reader_edit_actions',             // Will be moved to IndexedDB
        'polisher_buttons'                 // Will be moved to IndexedDB
    ];

    /**
     * Keys that should be preserved (legitimate localStorage usage)
     */
    private static readonly KEYS_TO_PRESERVE = [
        'expert_generated_keys'    // App keys are intentionally in localStorage for security
    ];

    /**
     * Get a summary of what localStorage keys exist and their status
     */
    public static getCleanupSummary(): {
        toCleanup: { key: string; size: number; hasData: boolean }[];
        toPreserve: { key: string; size: number; hasData: boolean }[];
        unknown: { key: string; size: number; hasData: boolean }[];
    } {
        const toCleanup: { key: string; size: number; hasData: boolean }[] = [];
        const toPreserve: { key: string; size: number; hasData: boolean }[] = [];
        const unknown: { key: string; size: number; hasData: boolean }[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            const value = localStorage.getItem(key);
            const size = value ? new Blob([value]).size : 0;
            const hasData = value !== null && value !== '';

            const keyInfo = { key, size, hasData };

            if (this.KEYS_TO_CLEANUP.includes(key)) {
                toCleanup.push(keyInfo);
            } else if (this.KEYS_TO_PRESERVE.includes(key)) {
                toPreserve.push(keyInfo);
            } else if (key.startsWith('expert_') || key.startsWith('openrouter_')) {
                // Unknown expert/openrouter keys
                unknown.push(keyInfo);
            }
        }

        return { toCleanup, toPreserve, unknown };
    }

    /**
     * Perform the cleanup of old localStorage entries
     */
    public static performCleanup(options: {
        dryRun?: boolean;
        includeUnknown?: boolean;
        customKeysToRemove?: string[];
    } = {}): CleanupResult {
        const { dryRun = false, includeUnknown = false, customKeysToRemove = [] } = options;
        const removedKeys: string[] = [];
        const remainingKeys: string[] = [];

        // Get all keys to potentially remove
        let keysToRemove = [...this.KEYS_TO_CLEANUP, ...customKeysToRemove];
        
        if (includeUnknown) {
            const summary = this.getCleanupSummary();
            keysToRemove.push(...summary.unknown.map(item => item.key));
        }

        // Remove duplicates
        keysToRemove = [...new Set(keysToRemove)];

        for (const key of keysToRemove) {
            const value = localStorage.getItem(key);
            if (value !== null) {
                if (!dryRun) {
                    localStorage.removeItem(key);
                    console.log(`🧹 Removed localStorage key: ${key}`);
                }
                removedKeys.push(key);
            }
        }

        // Check what remains
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('expert_') || key.startsWith('openrouter_'))) {
                remainingKeys.push(key);
            }
        }

        return {
            removedKeys,
            remainingKeys,
            totalCleaned: removedKeys.length
        };
    }

    /**
     * Create a backup of localStorage before cleanup
     */
    public static createLocalStorageBackup(): string {
        const backup: Record<string, string> = {};
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('expert_') || key.startsWith('openrouter_'))) {
                const value = localStorage.getItem(key);
                if (value) {
                    backup[key] = value;
                }
            }
        }

        return JSON.stringify(backup, null, 2);
    }

    /**
     * Show an interactive cleanup dialog
     */
    public static showCleanupDialog(): void {
        const summary = this.getCleanupSummary();
        
        let message = '🧹 **localStorage Cleanup Report**\n\n';
        
        if (summary.toCleanup.length > 0) {
            message += `**${summary.toCleanup.length} old entries found (safe to remove):**\n`;
            summary.toCleanup.forEach(item => {
                message += `- ${item.key} (${(item.size / 1024).toFixed(1)}KB)\n`;
            });
            message += '\n';
        }
        
        if (summary.toPreserve.length > 0) {
            message += `**${summary.toPreserve.length} entries will be preserved:**\n`;
            summary.toPreserve.forEach(item => {
                message += `- ${item.key} (${(item.size / 1024).toFixed(1)}KB)\n`;
            });
            message += '\n';
        }
        
        if (summary.unknown.length > 0) {
            message += `**${summary.unknown.length} unknown entries found:**\n`;
            summary.unknown.forEach(item => {
                message += `- ${item.key} (${(item.size / 1024).toFixed(1)}KB)\n`;
            });
            message += '\n';
        }

        if (summary.toCleanup.length === 0) {
            alert('✅ No old localStorage entries found. Everything looks clean!');
            return;
        }

        message += `\nWould you like to clean up the old entries?\n`;
        message += `This will free up ${(summary.toCleanup.reduce((sum, item) => sum + item.size, 0) / 1024).toFixed(1)}KB of storage.`;

        if (confirm(message)) {
            // Perform cleanup
            const result = this.performCleanup({ dryRun: false, includeUnknown: false });
            
            let resultMessage = `✅ **Cleanup Complete!**\n\n`;
            resultMessage += `Removed ${result.totalCleaned} old localStorage entries:\n`;
            result.removedKeys.forEach(key => {
                resultMessage += `- ${key}\n`;
            });
            
            if (result.remainingKeys.length > 0) {
                resultMessage += `\n${result.remainingKeys.length} entries preserved:\n`;
                result.remainingKeys.forEach(key => {
                    resultMessage += `- ${key}\n`;
                });
            }
            
            alert(resultMessage);
        }
    }
} 