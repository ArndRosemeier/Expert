/**
 * ComprehensiveExportService - Creates a complete backup of all application data
 * 
 * ⚠️ CRITICAL: This service implements the "Save All" functionality behind the save/load all button.
 * It MUST use FileDownloadService.downloadZip with forceFileSelector: true, NOT false!
 * This has regressed before - users expect file selector behavior, not downloads folder dumps!
 * 
 * ✅ SIMPLIFIED & FUTURE-PROOF APPROACH:
 * - Enumerates every IndexedDB object store from the database config and exports each
 * - Automatically includes any new store added to the database, with no edits here
 * - Records each store's name/keyPath/file in manifest.storeManifest for generic restore
 * - Filters out only sensitive data (API keys)
 */

import JSZip from 'jszip';
import { StorageService } from '../../../StorageService';
import { IndexedDBService } from '../../../IndexedDBService';
import { FileDownloadService } from '../../../utils/FileDownloadService';

interface ComprehensiveExportResult {
    success: boolean;
    filename: string;
    message: string;
    exportedItems: string[];
}

// Keys that should be excluded from export for security reasons
const SENSITIVE_KEYS = [
    'openrouter_api_key',
    'expert_generated_keys',
    // Add any other sensitive keys here as needed
];

export class ComprehensiveExportService {

    // Friendly nouns used in the "contents" list (e.g. "5 projects").
    // Unknown stores fall back to "<storeName> records" so new stores still
    // produce sensible text without requiring an entry here.
    private static readonly STORE_NOUNS: Record<string, string> = {
        keyValue: 'keyValue entries (settings, templates, buttons, etc.)',
        projects: 'projects',
        aiLogs: 'AI log entries',
        rpg_lite_sessions: 'RPG Lite sessions',
        rpg_lite_start_presets: 'RPG Lite templates',
        rpg_lite_action_buttons: 'RPG Lite quick actions'
    };

    // Friendly titles used in the export summary UI. Unknown stores fall back
    // to the raw store name so new stores are still listed.
    private static readonly STORE_LABELS: Record<string, string> = {
        keyValue: 'Application Settings & Data',
        projects: 'Projects',
        aiLogs: 'AI Logs',
        rpg_lite_sessions: 'RPG Lite Sessions',
        rpg_lite_start_presets: 'RPG Lite Templates',
        rpg_lite_action_buttons: 'RPG Lite Quick Actions'
    };

    private static getStoreNoun(storeName: string): string {
        return this.STORE_NOUNS[storeName] ?? `${storeName} records`;
    }

    private static getStoreLabel(storeName: string): string {
        return this.STORE_LABELS[storeName] ?? storeName;
    }

    /**
     * Creates a comprehensive backup of ALL application data from IndexedDB
     * This is future-proof - any new data we add will automatically be included
     * 
     * @param fileHandle Optional file handle for direct writing (preserves user gesture)
     */
    public static async createComprehensiveBackup(fileHandle?: any): Promise<ComprehensiveExportResult> {
        try {
            const zip = new JSZip();
            const exportedItems: string[] = [];
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `expert-app-complete-backup-${timestamp}.zip`;

            // Get direct access to IndexedDB service for complete data export
            const indexedDBService = await this.getIndexedDBService();
            
            // Dynamically export every IndexedDB object store. The store list is
            // read straight from the database config, so any store added to the
            // database in the future is included automatically with no changes here.
            const storeManifest: Array<{ name: string; keyPath: string; file: string; count: number }> = [];

            for (const storeConfig of indexedDBService.getStoreConfigs()) {
                if (storeConfig.keyPath === undefined) {
                    throw new Error(`Cannot export store '${storeConfig.name}': stores without an inline keyPath are not supported by the comprehensive backup`);
                }

                const records = this.filterSensitiveData(await indexedDBService.getAll(storeConfig.name));
                if (records.length === 0) {
                    continue;
                }

                const file = `store-${storeConfig.name}.json`;
                zip.file(file, JSON.stringify(records, null, 2));
                storeManifest.push({ name: storeConfig.name, keyPath: storeConfig.keyPath, file, count: records.length });
                exportedItems.push(`${records.length} ${this.getStoreNoun(storeConfig.name)}`);
            }

            // Create a manifest with export metadata. `storeManifest` records the
            // exact store name, keyPath and file name for each exported store so
            // the import side can restore generically with no hardcoded knowledge.
            const manifest = {
                exportDate: new Date().toISOString(),
                exportVersion: '3.0', // Dynamic, store-agnostic backup format
                description: 'Complete Expert Application IndexedDB Backup',
                approach: 'Future-proof: dynamically exports every IndexedDB object store',
                contents: exportedItems,
                storeManifest,
                security: {
                    excluded: 'API keys and sensitive authentication data are filtered out',
                    filteredKeys: SENSITIVE_KEYS
                },
                instructions: {
                    restore: 'Restore via the in-app Load All function, which reads storeManifest and rewrites each store',
                    compatibility: 'Compatible with Expert Application IndexedDB structure',
                    futureProof: 'This export automatically includes any new object store added to the application'
                }
            };
            zip.file('manifest.json', JSON.stringify(manifest, null, 2));

            // Generate ZIP file with maximum compression and trigger download
            const zipBlob = await zip.generateAsync({ 
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 9  // Maximum compression (1-9, where 9 is best compression)
                }
            });
            
            // Handle file writing - use provided file handle or fall back to download service
            let actualFilename = filename;
            
            if (fileHandle) {
                // Write directly to the provided file handle (preserves user gesture)
                try {
                    const writable = await fileHandle.createWritable();
                    await writable.write(zipBlob);
                    await writable.close();
                    actualFilename = fileHandle.name || filename;
                    console.log('✅ Backup saved using file handle:', actualFilename);
                } catch (writeError) {
                    console.error('❌ Failed to write to file handle:', writeError);
                    return {
                        success: false,
                        filename: '',
                        message: `Failed to save backup file: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`,
                        exportedItems: []
                    };
                }
            } else {
                // Fallback to download service (for browsers without File System Access API)
                // CRITICAL: FileDownloadService.downloadZip MUST use forceFileSelector: true for save/load all functionality
                // DO NOT change the downloadZip method to use forceFileSelector: false - users expect file selector behavior!
                const downloadResult = await FileDownloadService.downloadZip(zipBlob, filename, 'Expert Application Backup');
                
                // Check if user cancelled or download failed
                if (!downloadResult.success || downloadResult.cancelled) {
                    return {
                        success: false,
                        filename: '',
                        message: downloadResult.cancelled 
                            ? 'Export cancelled by user' 
                            : downloadResult.error 
                                ? `Export failed: ${downloadResult.error}` 
                                : 'Export failed to save file',
                        exportedItems: []
                    };
                }
                
                actualFilename = downloadResult.actualFilename || filename;
            }

            return {
                success: true,
                filename: actualFilename,
                message: `Successfully exported complete IndexedDB backup with ${exportedItems.length} data categories`,
                exportedItems
            };

        } catch (error) {
            console.error('Comprehensive export failed:', error);
            return {
                success: false,
                filename: '',
                message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                exportedItems: []
            };
        }
    }

    /**
     * Get access to the IndexedDB service for direct store access
     */
    private static async getIndexedDBService(): Promise<IndexedDBService> {
        // Get the storage service instance
        const storage = await StorageService.getInstance();
        
        // Access the underlying IndexedDB service using the proper method
        if (!storage.getIndexedDBService) {
            throw new Error('Storage service does not support IndexedDB direct access');
        }
        
        const indexedDBService = storage.getIndexedDBService();
        
        if (!indexedDBService) {
            throw new Error('Could not access IndexedDB service for complete export');
        }
        
        return indexedDBService;
    }

    /**
     * Filter out sensitive data from the export
     */
    private static filterSensitiveData(data: any[]): any[] {
        return data.filter(item => {
            // Filter out items with sensitive keys
            if (item && typeof item === 'object' && 'key' in item) {
                return !SENSITIVE_KEYS.includes(item.key);
            }
            return true;
        });
    }



    /**
     * Get a summary of what will be exported (simplified version)
     */
    public static async getExportSummary(): Promise<{ 
        categories: { name: string; count: number; status: 'available' | 'empty' | 'error' }[] 
    }> {
        const categories: { name: string; count: number; status: 'available' | 'empty' | 'error' }[] = [];

        try {
            const indexedDBService = await this.getIndexedDBService();

            // Report one category per object store, derived dynamically from the
            // database config so new stores appear here automatically.
            for (const storeConfig of indexedDBService.getStoreConfigs()) {
                const records = this.filterSensitiveData(await indexedDBService.getAll(storeConfig.name));
                categories.push({
                    name: this.getStoreLabel(storeConfig.name),
                    count: records.length,
                    status: records.length > 0 ? 'available' : 'empty'
                });
            }
        } catch (error) {
            console.error('Failed to get export summary:', error);
            // Surface the failure loudly as a single error category rather than
            // pretending each individual store failed.
            categories.push({ name: 'IndexedDB', count: 0, status: 'error' });
        }

        return { categories };
    }
} 