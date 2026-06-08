/**
 * ComprehensiveImportService - Restores complete application data from backup files
 * 
 * ⚠️ CRITICAL: This service implements the "Load All" functionality behind the save/load all button.
 * It MUST use modern file selector APIs (showOpenFilePicker) when available, NOT hidden input elements!
 * This has regressed before - do not revert to the old approach!
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

interface ComprehensiveImportResult {
    success: boolean;
    message: string;
    importedItems: string[];
    errors: string[];
    needsMigration?: boolean;
    migrationProfileName?: string | undefined;
}

interface ImportStore {
    name: string;
    keyPath: string;
    records: any[];
}

interface ImportValidation {
    isValid: boolean;
    errors: string[];
    manifest?: any;
    stores: ImportStore[];
}

// Keys that should be preserved during import (not overwritten)
const PRESERVED_KEYS = [
    'expert_generated_keys',  // App validation keys must not be overwritten
    'openrouter_api_key',     // OpenRouter API key should be preserved
];

// Backward-compatible mapping for legacy (pre-3.0) backup ZIPs that used fixed
// file names and did not record a storeManifest. New backups carry their own
// store list in the manifest and do not rely on this table.
const LEGACY_FILE_MAP: Array<{ file: string; name: string; keyPath: string }> = [
    { file: 'keyvalue-store.json', name: 'keyValue', keyPath: 'key' },
    { file: 'projects-store.json', name: 'projects', keyPath: 'id' },
    { file: 'ai-logs-store.json', name: 'aiLogs', keyPath: 'id' },
    { file: 'rpg-lite-sessions-store.json', name: 'rpg_lite_sessions', keyPath: 'id' },
    { file: 'rpg-lite-presets-store.json', name: 'rpg_lite_start_presets', keyPath: 'id' },
    { file: 'rpg-lite-action-buttons-store.json', name: 'rpg_lite_action_buttons', keyPath: 'id' }
];

// Friendly titles used in the import summary UI. Unknown stores fall back to
// the raw store name so new stores are still listed.
const STORE_LABELS: Record<string, string> = {
    keyValue: 'Application Settings & Data',
    projects: 'Projects',
    aiLogs: 'AI Logs',
    rpg_lite_sessions: 'RPG Lite Sessions',
    rpg_lite_start_presets: 'RPG Lite Templates',
    rpg_lite_action_buttons: 'RPG Lite Quick Actions'
};

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
            
            // Get IndexedDB service for direct store access
            const indexedDBService = await this.getIndexedDBService();
            
            // Step 2: Clear exactly the stores present in the backup (preserving
            // sensitive keys). Stores that are not part of the backup are left
            // untouched so restoring a partial backup never wipes unrelated data.
            await this.clearStores(indexedDBService, validation.stores.map(store => store.name));
            console.log('✅ Existing data cleared for backed-up stores (sensitive keys preserved)');
            
            // Step 3: Restore every store generically using its recorded keyPath.
            const importedItems: string[] = [];
            const errors: string[] = [];
            
            for (const store of validation.stores) {
                if (store.records.length === 0) {
                    continue;
                }
                try {
                    const written = await this.importStoreRecords(indexedDBService, store);
                    importedItems.push(`${written} ${this.getStoreLabel(store.name)}`);
                    console.log(`✅ Imported ${written} records into '${store.name}'`);
                } catch (error) {
                    const errorMsg = `Failed to import store '${store.name}': ${error instanceof Error ? error.message : error}`;
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
     * Validate the backup file structure and content.
     *
     * Produces a single, store-agnostic list of stores to restore. New (3.0+)
     * backups carry a `storeManifest` describing every store, keyPath and file,
     * which makes restore fully future-proof. Older backups are still supported
     * via the fixed LEGACY_FILE_MAP table.
     */
    private static async validateBackupFile(file: File): Promise<ImportValidation> {
        const errors: string[] = [];
        const stores: ImportStore[] = [];
        let manifest: any;
        
        try {
            // Check file type
            if (!file.name.toLowerCase().endsWith('.zip')) {
                errors.push('File must be a ZIP archive');
            }
            
            // Read ZIP file
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            // Validate manifest exists
            if (!zipContent.files['manifest.json']) {
                errors.push('Missing manifest.json file');
            } else {
                try {
                    const manifestContent = await zipContent.files['manifest.json'].async('string');
                    manifest = JSON.parse(manifestContent);
                    
                    // Validate manifest structure
                    if (!manifest.exportDate || !manifest.exportVersion) {
                        errors.push('Invalid manifest format');
                    }
                } catch (error) {
                    errors.push('Invalid manifest.json file');
                }
            }
            
            // Determine the list of stores to read. Prefer the explicit, future-proof
            // storeManifest; fall back to the legacy fixed file names otherwise.
            const storeManifest: Array<{ name: string; keyPath: string; file: string }> =
                manifest && Array.isArray(manifest.storeManifest) ? manifest.storeManifest : [];
            const entries = storeManifest.length > 0
                ? storeManifest.map(entry => ({ file: entry.file, name: entry.name, keyPath: entry.keyPath }))
                : LEGACY_FILE_MAP;
            
            for (const entry of entries) {
                const zipFile = zipContent.files[entry.file];
                if (!zipFile) {
                    continue;
                }
                try {
                    const data = JSON.parse(await zipFile.async('string'));
                    if (!Array.isArray(data)) {
                        errors.push(`${entry.file} must contain an array`);
                        continue;
                    }
                    if (typeof entry.name !== 'string' || typeof entry.keyPath !== 'string') {
                        errors.push(`Invalid store descriptor for ${entry.file}`);
                        continue;
                    }
                    stores.push({ name: entry.name, keyPath: entry.keyPath, records: data });
                } catch (error) {
                    errors.push(`Invalid ${entry.file} format`);
                }
            }
            
            // Check that we have at least one data file
            if (stores.length === 0) {
                errors.push('No valid data files found in backup');
            }
            
        } catch (error) {
            errors.push('Failed to read ZIP file');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            manifest,
            stores
        };
    }
    
    /**
     * Clear the given object stores before restore (preserving sensitive keys).
     * The keyValue store keeps PRESERVED_KEYS; all other stores are cleared fully.
     */
    private static async clearStores(indexedDBService: IndexedDBService, storeNames: string[]): Promise<void> {
        console.log('🧹 Clearing existing data for stores:', storeNames);
        
        for (const storeName of storeNames) {
            if (storeName === 'keyValue') {
                await this.clearKeyValueStoreWithPreservation(indexedDBService);
            } else {
                await indexedDBService.clear(storeName);
                console.log(`✅ Cleared '${storeName}' store`);
            }
        }
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
     * Restore one store's records generically using its keyPath. Each record is
     * an object whose key field (keyPath) is the store key. Records that are not
     * objects or are missing their key field are a hard error (loud, not skipped).
     * For the keyValue store, PRESERVED_KEYS are skipped so they keep their
     * existing (preserved) values. Returns the number of records written.
     */
    private static async importStoreRecords(indexedDBService: IndexedDBService, store: ImportStore): Promise<number> {
        let written = 0;
        for (const item of store.records) {
            if (!item || typeof item !== 'object') {
                throw new Error(`Record in store '${store.name}' is not an object`);
            }
            if (!(store.keyPath in item)) {
                throw new Error(`Record in store '${store.name}' is missing key field '${store.keyPath}'`);
            }
            const key = (item as Record<string, unknown>)[store.keyPath];
            if (typeof key !== 'string') {
                throw new Error(`Record in store '${store.name}' has a non-string key for '${store.keyPath}'`);
            }
            if (store.name === 'keyValue' && PRESERVED_KEYS.includes(key)) {
                continue;
            }
            await indexedDBService.set(store.name, key, item);
            written++;
        }
        return written;
    }

    /**
     * Friendly title for a store, used in import logs and the summary UI.
     * Unknown stores fall back to the raw store name so new stores still appear.
     */
    private static getStoreLabel(storeName: string): string {
        return STORE_LABELS[storeName] ?? storeName;
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
     * 
     * ⚠️ CRITICAL: This MUST use the modern File System Access API (showOpenFilePicker)!
     * DO NOT revert to the old hidden input element approach!
     * 
     * AI DEVELOPERS: This has regressed before. The user specifically wants file selector behavior
     * for the save/load all button functionality, not the old hidden file input approach.
     * Always use showOpenFilePicker when available, with proper fallback messaging.
     */
    public static async showFilePickerDialog(): Promise<File | null> {
        try {
            // CRITICAL: Use modern File System Access API when available - DO NOT REMOVE!
            if ('showOpenFilePicker' in window) {
                const [fileHandle] = await (window as any).showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: 'Expert Application Backup',
                        accept: { 'application/zip': ['.zip'] }
                    }]
                });
                return await fileHandle.getFile();
            } else {
                // Silent fallback for input - no user message needed since behavior is identical
                console.warn('⚠️ File System Access API not available, using fallback file input');
                
                const isSecureContext = window.isSecureContext;
                const protocol = window.location.protocol;
                const userAgent = navigator.userAgent;
                
                console.warn(`🔍 Debug info: SecureContext=${isSecureContext}, Protocol=${protocol}, UserAgent=${userAgent}`);
                
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
        } catch (error) {
            console.error('❌ File picker failed:', error);
            return null;
        }
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
            for (const store of validation.stores) {
                summary.push({
                    name: this.getStoreLabel(store.name),
                    count: store.records.length,
                    status: 'available'
                });
            }
        } else {
            // Surface the failure loudly as a single error entry.
            summary.push({ name: 'IndexedDB', count: 0, status: 'error' });
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