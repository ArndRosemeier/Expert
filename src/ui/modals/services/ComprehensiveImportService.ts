/**
 * ComprehensiveImportService - Restores complete application data from backup files
 * 
 * ✅ COMPLETE RESTORATION APPROACH:
 * - Imports ALL data from comprehensive backup ZIP files
 * - Clears IndexedDB stores before import (preserves sensitive keys)
 * - Validates backup format and structure
 * - Provides detailed feedback on import process
 * - Integrates with Smart Migration Service for version compatibility
 * 
 * 🔄 SMART MIGRATION INTEGRATION:
 * - Detects when imported settings are from older app versions
 * - Automatically triggers migration dialog if version mismatches found
 * - Preserves user customizations while updating system defaults
 * - Handles prompt updates and criteria evolution seamlessly
 */

import JSZip from 'jszip';
import { StorageService } from '../../../StorageService';
import { IndexedDBService } from '../../../IndexedDBService';

export interface ComprehensiveImportResult {
    success: boolean;
    message: string;
    importedItems: string[];
    errors: string[];
    needsMigration?: boolean;
    migrationProfileName?: string | undefined;
}

export interface ImportValidation {
    isValid: boolean;
    errors: string[];
    manifest?: any;
    files: {
        keyValueStore?: any[];
        projectsStore?: any[];
        aiLogsStore?: any[];
        manifest?: any;
    };
}

// Keys that should be preserved during import (not overwritten)
const PRESERVED_KEYS = [
    'expert_generated_keys',  // App validation keys must not be overwritten
    'openrouter_api_key',     // OpenRouter API key should be preserved
];

export class ComprehensiveImportService {
    
    /**
     * Import complete application data from a comprehensive backup ZIP file
     */
    public static async importComprehensiveBackup(file: File): Promise<ComprehensiveImportResult> {
        try {
            console.log('🔄 Starting comprehensive import from:', file.name);
            
            // Step 1: Read and validate the ZIP file
            const validation = await this.validateBackupFile(file);
            if (!validation.isValid) {
                return {
                    success: false,
                    message: `Invalid backup file: ${validation.errors.join(', ')}`,
                    importedItems: [],
                    errors: validation.errors
                };
            }
            
            console.log('✅ Backup file validation passed');
            
            // Step 2: Clear existing data (preserving sensitive keys)
            await this.clearExistingData();
            console.log('✅ Existing data cleared (sensitive keys preserved)');
            
            // Step 3: Import data into IndexedDB stores
            const importedItems: string[] = [];
            const errors: string[] = [];
            
            // Get IndexedDB service for direct store access
            const indexedDBService = await this.getIndexedDBService();
            
            // Import keyValue store data
            if (validation.files.keyValueStore && validation.files.keyValueStore.length > 0) {
                try {
                    await this.importKeyValueStore(indexedDBService, validation.files.keyValueStore);
                    importedItems.push(`${validation.files.keyValueStore.length} keyValue entries (settings, templates, buttons)`);
                    console.log(`✅ Imported ${validation.files.keyValueStore.length} keyValue entries`);
                } catch (error) {
                    const errorMsg = `Failed to import keyValue store: ${error instanceof Error ? error.message : error}`;
                    errors.push(errorMsg);
                    console.error('❌', errorMsg);
                }
            }
            
            // Import projects store data
            if (validation.files.projectsStore && validation.files.projectsStore.length > 0) {
                try {
                    await this.importProjectsStore(indexedDBService, validation.files.projectsStore);
                    importedItems.push(`${validation.files.projectsStore.length} projects`);
                    console.log(`✅ Imported ${validation.files.projectsStore.length} projects`);
                } catch (error) {
                    const errorMsg = `Failed to import projects store: ${error instanceof Error ? error.message : error}`;
                    errors.push(errorMsg);
                    console.error('❌', errorMsg);
                }
            }
            
            // Import aiLogs store data
            if (validation.files.aiLogsStore && validation.files.aiLogsStore.length > 0) {
                try {
                    await this.importAILogsStore(indexedDBService, validation.files.aiLogsStore);
                    importedItems.push(`${validation.files.aiLogsStore.length} AI log entries`);
                    console.log(`✅ Imported ${validation.files.aiLogsStore.length} AI log entries`);
                } catch (error) {
                    const errorMsg = `Failed to import AI logs store: ${error instanceof Error ? error.message : error}`;
                    errors.push(errorMsg);
                    console.error('❌', errorMsg);
                }
            }
            
            // Determine success based on whether we imported anything successfully
            const success = importedItems.length > 0;
            const message = success 
                ? `Successfully imported ${importedItems.length} data categories${errors.length > 0 ? ` (${errors.length} errors)` : ''}`
                : `Import failed: ${errors.join(', ')}`;
            
            console.log(success ? '🎉 Import completed successfully' : '❌ Import failed');
            
            // Step 4: Check if migration is needed after import
            let needsMigration = false;
            let migrationProfileName: string | undefined;
            
            if (success) {
                try {
                    const migrationCheck = await this.checkForMigrationNeeds();
                    needsMigration = migrationCheck.needsMigration;
                    migrationProfileName = migrationCheck.profileName;
                    
                    if (needsMigration) {
                        console.log(`⚠️ Import completed but migration needed for profile: ${migrationProfileName}`);
                    }
                } catch (error) {
                    console.warn('⚠️ Could not check migration needs after import:', error);
                    // Don't fail the import just because migration check failed
                }
            }
            
            return {
                success,
                message: needsMigration 
                    ? `${message} Settings migration will be required to update to current version.`
                    : message,
                importedItems,
                errors,
                needsMigration,
                migrationProfileName
            };
            
        } catch (error) {
            console.error('❌ Comprehensive import failed:', error);
            return {
                success: false,
                message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                importedItems: [],
                errors: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }
    
    /**
     * Validate the backup file structure and content
     */
    private static async validateBackupFile(file: File): Promise<ImportValidation> {
        const errors: string[] = [];
        const files: ImportValidation['files'] = {};
        
        try {
            // Check file type
            if (!file.name.toLowerCase().endsWith('.zip')) {
                errors.push('File must be a ZIP archive');
            }
            
            // Read ZIP file
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            // Check for optional data files
            const optionalFiles = ['keyvalue-store.json', 'projects-store.json', 'ai-logs-store.json'];
            
            // Validate manifest exists
            if (!zipContent.files['manifest.json']) {
                errors.push('Missing manifest.json file');
            } else {
                try {
                    const manifestContent = await zipContent.files['manifest.json'].async('string');
                    files.manifest = JSON.parse(manifestContent);
                    
                    // Validate manifest structure
                    if (!files.manifest.exportDate || !files.manifest.exportVersion) {
                        errors.push('Invalid manifest format');
                    }
                } catch (error) {
                    errors.push('Invalid manifest.json file');
                }
            }
            
            // Load and validate optional data files
            for (const fileName of optionalFiles) {
                if (zipContent.files[fileName]) {
                    try {
                        const content = await zipContent.files[fileName].async('string');
                        const data = JSON.parse(content);
                        
                        if (fileName === 'keyvalue-store.json') {
                            if (Array.isArray(data)) {
                                files.keyValueStore = data;
                            } else {
                                errors.push('keyvalue-store.json must contain an array');
                            }
                        } else if (fileName === 'projects-store.json') {
                            if (Array.isArray(data)) {
                                files.projectsStore = data;
                            } else {
                                errors.push('projects-store.json must contain an array');
                            }
                        } else if (fileName === 'ai-logs-store.json') {
                            if (Array.isArray(data)) {
                                files.aiLogsStore = data;
                            } else {
                                errors.push('ai-logs-store.json must contain an array');
                            }
                        }
                    } catch (error) {
                        errors.push(`Invalid ${fileName} format`);
                    }
                }
            }
            
            // Check that we have at least one data file
            if (!files.keyValueStore && !files.projectsStore && !files.aiLogsStore) {
                errors.push('No valid data files found in backup');
            }
            
        } catch (error) {
            errors.push('Failed to read ZIP file');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            manifest: files.manifest,
            files
        };
    }
    
    /**
     * Clear existing data from IndexedDB stores (preserving sensitive keys)
     */
    private static async clearExistingData(): Promise<void> {
        console.log('🧹 Clearing existing data...');
        
        const indexedDBService = await this.getIndexedDBService();
        
        // Clear keyValue store but preserve sensitive keys
        await this.clearKeyValueStoreWithPreservation(indexedDBService);
        
        // Clear projects store completely
        await indexedDBService.clear('projects');
        console.log('✅ Cleared projects store');
        
        // Clear aiLogs store completely
        await indexedDBService.clear('aiLogs');
        console.log('✅ Cleared aiLogs store');
    }
    
    /**
     * Clear keyValue store while preserving sensitive keys
     */
    private static async clearKeyValueStoreWithPreservation(indexedDBService: IndexedDBService): Promise<void> {
        // Get all current data
        const allData = await indexedDBService.getAll('keyValue');
        
        // Find items to preserve
        const preservedItems = allData.filter((item: unknown): item is { key: string; [k: string]: any } => {
            if (!item || typeof item !== 'object' || item === null) {
                return false;
            }
            const obj = item as { [k: string]: any };
            return 'key' in obj && typeof obj['key'] === 'string' && PRESERVED_KEYS.includes(obj['key']);
        });
        
        console.log(`🔒 Found ${preservedItems.length} sensitive keys to preserve:`, preservedItems.map((item) => item.key));
        
        // Clear the entire store
        await indexedDBService.clear('keyValue');
        
        // Restore preserved items
        for (const item of preservedItems) {
            await indexedDBService.set('keyValue', item.key, item);
        }
        
        console.log(`✅ Cleared keyValue store (preserved ${preservedItems.length} sensitive keys)`);
    }
    
    /**
     * Import data into keyValue store
     */
    private static async importKeyValueStore(indexedDBService: IndexedDBService, data: any[]): Promise<void> {
        for (const item of data) {
            if (item && typeof item === 'object' && 'key' in item) {
                // Skip sensitive keys (they should remain as preserved)
                if (!PRESERVED_KEYS.includes(item.key)) {
                    await indexedDBService.set('keyValue', item.key, item);
                }
            }
        }
    }
    
    /**
     * Import data into projects store
     */
    private static async importProjectsStore(indexedDBService: IndexedDBService, data: any[]): Promise<void> {
        for (const item of data) {
            if (item && typeof item === 'object' && 'id' in item) {
                await indexedDBService.set('projects', item.id, item);
            }
        }
    }
    
    /**
     * Import data into aiLogs store
     */
    private static async importAILogsStore(indexedDBService: IndexedDBService, data: any[]): Promise<void> {
        for (const item of data) {
            if (item && typeof item === 'object' && 'id' in item) {
                await indexedDBService.set('aiLogs', item.id, item);
            }
        }
    }
    
    /**
     * Get access to the IndexedDB service for direct store access
     */
    private static async getIndexedDBService(): Promise<IndexedDBService> {
        const storage = await StorageService.getInstance();
        
        if (!storage.getIndexedDBService) {
            throw new Error('Storage service does not support IndexedDB direct access');
        }
        
        const indexedDBService = storage.getIndexedDBService();
        
        if (!indexedDBService) {
            throw new Error('Could not access IndexedDB service for import');
        }
        
        return indexedDBService;
    }
    
    /**
     * Show file picker dialog for selecting backup file
     */
    public static showFilePickerDialog(): Promise<File | null> {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.zip';
            input.style.display = 'none';
            
            input.onchange = () => {
                const file = input.files?.[0] || null;
                document.body.removeChild(input);
                resolve(file);
            };
            
            input.oncancel = () => {
                document.body.removeChild(input);
                resolve(null);
            };
            
            document.body.appendChild(input);
            input.click();
        });
    }
    
    /**
     * Get summary of what would be imported from a backup file
     */
    public static async getImportSummary(file: File): Promise<{
        isValid: boolean;
        summary: { name: string; count: number; status: 'available' | 'error' }[];
        errors: string[];
        manifest?: any;
    }> {
        const validation = await this.validateBackupFile(file);
        const summary: { name: string; count: number; status: 'available' | 'error' }[] = [];
        
        if (validation.isValid) {
            if (validation.files.keyValueStore) {
                summary.push({
                    name: 'Application Settings & Data',
                    count: validation.files.keyValueStore.length,
                    status: 'available'
                });
            }
            
            if (validation.files.projectsStore) {
                summary.push({
                    name: 'Projects',
                    count: validation.files.projectsStore.length,
                    status: 'available'
                });
            }
            
            if (validation.files.aiLogsStore) {
                summary.push({
                    name: 'AI Logs',
                    count: validation.files.aiLogsStore.length,
                    status: 'available'
                });
            }
        } else {
            // Add error entries for invalid file
            summary.push(
                { name: 'Application Settings & Data', count: 0, status: 'error' },
                { name: 'Projects', count: 0, status: 'error' },
                { name: 'AI Logs', count: 0, status: 'error' }
            );
        }
        
        return {
            isValid: validation.isValid,
            summary,
            errors: validation.errors,
            manifest: validation.manifest
        };
    }

    /**
     * Check if imported data needs migration to current app version
     */
    private static async checkForMigrationNeeds(): Promise<{
        needsMigration: boolean;
        profileName?: string;
    }> {
        try {
            // Get current app state to check for version mismatches
            const state = await import('../../../state');
            const settingsManager = state.getSettingsManager();
            
            if (!settingsManager) {
                console.warn('⚠️ SettingsManager not available for migration check');
                return { needsMigration: false };
            }

            // Check if there are version mismatches detected
            if (settingsManager.hasVersionMismatchDetected && settingsManager.hasVersionMismatchDetected()) {
                const lastUsedProfileName = settingsManager.getLastUsedProfileName() || 'default';
                const profile = settingsManager.getProfile(lastUsedProfileName);
                
                if (profile) {
                    // Import the VersionService to check versions
                    const { VersionService } = await import('../../../VersionService');
                    const currentVersion = VersionService.getBuildNumber();
                    
                    // Check if profile version differs from current version
                    if (profile.version !== currentVersion) {
                        console.log(`🔄 Profile "${lastUsedProfileName}" version mismatch: ${profile.version} vs ${currentVersion}`);
                        return { 
                            needsMigration: true, 
                            profileName: lastUsedProfileName 
                        };
                    }
                }
            }

            return { needsMigration: false };
            
        } catch (error) {
            console.error('❌ Error checking migration needs:', error);
            // Return false to not block the import process
            return { needsMigration: false };
        }
    }

    /**
     * Trigger the migration process for imported settings
     */
    public static async triggerMigrationIfNeeded(result: ComprehensiveImportResult): Promise<void> {
        if (!result.needsMigration || !result.migrationProfileName) {
            return;
        }

        try {
            console.log(`🔄 Triggering migration for profile: ${result.migrationProfileName}`);
            
            // Import the migration modal
            const { MigrationSelectionModal } = await import('../MigrationSelectionModal');
            const { getModalRegistry } = await import('../core/ModalRegistry');
            const { VersionService } = await import('../../../VersionService');
            const state = await import('../../../state');
            
            const settingsManager = state.getSettingsManager();
            const modelSelector = state.getModelSelector();
            const currentVersion = VersionService.getBuildNumber();
            const profile = settingsManager?.getProfile(result.migrationProfileName);
            
            if (!settingsManager || !profile) {
                console.warn('⚠️ Cannot trigger migration - missing SettingsManager or profile');
                return;
            }

            const analysis = {
                profileName: result.migrationProfileName,
                savedVersion: profile.version,
                currentVersion: currentVersion,
                hasChanges: true
            };

            // Create migration selection modal
            const modal = new MigrationSelectionModal({
                id: 'post-import-migration-modal',
                settingsManager: settingsManager,
                ...(modelSelector && { modelSelector }),
                analysis,
                onMigrationComplete: () => {
                    console.log('✅ Post-import migration completed');
                    // Don't reload page - let user continue working
                }
            });

            // Register and open modal
            const registry = getModalRegistry();
            registry.register(modal);
            await modal.open();
            
        } catch (error) {
            console.error('❌ Failed to trigger migration:', error);
            // Don't throw - migration failure shouldn't block the user
        }
    }
} 