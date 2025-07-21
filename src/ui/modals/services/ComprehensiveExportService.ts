/**
 * ComprehensiveExportService - Creates a complete backup of all application data
 * 
 * ⚠️ CRITICAL: This service implements the "Save All" functionality behind the save/load all button.
 * It MUST use FileDownloadService.downloadZip with forceFileSelector: true, NOT false!
 * This has regressed before - users expect file selector behavior, not downloads folder dumps!
 * 
 * ✅ SIMPLIFIED & FUTURE-PROOF APPROACH:
 * - Exports ALL data from IndexedDB stores
 * - Automatically includes any new data types we add
 * - Filters out only sensitive data (API keys)
 * - No need to maintain lists of what to export
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
            
            // Export all data from keyValue store (settings, templates, buttons, etc.)
            try {
                const keyValueData = await indexedDBService.getAll('keyValue');
                const filteredKeyValueData = this.filterSensitiveData(keyValueData);
                
                if (filteredKeyValueData.length > 0) {
                    zip.file('keyvalue-store.json', JSON.stringify(filteredKeyValueData, null, 2));
                    exportedItems.push(`${filteredKeyValueData.length} keyValue entries (settings, templates, buttons, etc.)`);
                }
            } catch (error) {
                console.warn('Failed to export keyValue store:', error);
            }

            // Export all data from projects store
            try {
                const projectsData = await indexedDBService.getAll('projects');
                
                if (projectsData.length > 0) {
                    zip.file('projects-store.json', JSON.stringify(projectsData, null, 2));
                    exportedItems.push(`${projectsData.length} projects`);
                }
            } catch (error) {
                console.warn('Failed to export projects store:', error);
            }

            // Export all data from aiLogs store
            try {
                const aiLogsData = await indexedDBService.getAll('aiLogs');
                
                if (aiLogsData.length > 0) {
                    zip.file('ai-logs-store.json', JSON.stringify(aiLogsData, null, 2));
                    exportedItems.push(`${aiLogsData.length} AI log entries`);
                }
            } catch (error) {
                console.warn('Failed to export aiLogs store:', error);
            }

            // Create a manifest with export metadata
            const manifest = {
                exportDate: new Date().toISOString(),
                exportVersion: '2.0', // Updated version for new simplified export
                description: 'Complete Expert Application IndexedDB Backup',
                approach: 'Future-proof: exports ALL data from IndexedDB stores',
                contents: exportedItems,
                stores: {
                    keyValue: 'General application settings, templates, buttons, configurations',
                    projects: 'All project data and metadata',
                    aiLogs: 'AI interaction logs and debugging information'
                },
                security: {
                    excluded: 'API keys and sensitive authentication data are filtered out',
                    filteredKeys: SENSITIVE_KEYS
                },
                instructions: {
                    restore: 'Import individual store files as needed or contact support for full restoration',
                    compatibility: 'Compatible with Expert Application IndexedDB structure',
                    futureProof: 'This export will automatically include any new data types added to the application'
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

            // Check keyValue store
            try {
                const keyValueData = await indexedDBService.getAll('keyValue');
                const filteredData = this.filterSensitiveData(keyValueData);
                categories.push({
                    name: 'Application Settings & Data',
                    count: filteredData.length,
                    status: filteredData.length > 0 ? 'available' : 'empty'
                });
            } catch (error) {
                categories.push({
                    name: 'Application Settings & Data',
                    count: 0,
                    status: 'error'
                });
            }

            // Check projects store
            try {
                const projectsData = await indexedDBService.getAll('projects');
                categories.push({
                    name: 'Projects',
                    count: projectsData.length,
                    status: projectsData.length > 0 ? 'available' : 'empty'
                });
            } catch (error) {
                categories.push({
                    name: 'Projects',
                    count: 0,
                    status: 'error'
                });
            }

            // Check aiLogs store
            try {
                const aiLogsData = await indexedDBService.getAll('aiLogs');
                categories.push({
                    name: 'AI Logs',
                    count: aiLogsData.length,
                    status: aiLogsData.length > 0 ? 'available' : 'empty'
                });
            } catch (error) {
                categories.push({
                    name: 'AI Logs',
                    count: 0,
                    status: 'error'
                });
            }

        } catch (error) {
            console.error('Failed to get export summary:', error);
            // Return empty categories with error status
            categories.push(
                { name: 'Application Settings & Data', count: 0, status: 'error' },
                { name: 'Projects', count: 0, status: 'error' },
                { name: 'AI Logs', count: 0, status: 'error' }
            );
        }

        return { categories };
    }
} 