/**
 * Centralized file download service that PRIORITIZES File System Access API
 * and eliminates unwanted direct downloads
 */

interface FileDownloadOptions {
    filename: string;
    mimeType: string;
    description?: string;
    extensions?: string[];
    forceFileSelector?: boolean; // New option to force file selector usage
}

interface FileTypeConfig {
    description: string;
    accept: Record<string, string[]>;
}

export interface FileDownloadResult {
    success: boolean;
    cancelled: boolean;
    actualFilename?: string;
    method: 'save-as' | 'download' | 'failed';
    error?: string;
}

export class FileDownloadService {
    /**
     * Downloads a blob as a file using File System Access API with strict preference
     * - ALWAYS tries File System Access API first (Chrome/Edge 86+) for "Save As" dialog
     * - Only falls back to traditional download if explicitly allowed and API unavailable
     * - Fails with clear error message if file selector requested but unavailable
     */
    public static async downloadBlob(blob: Blob, options: FileDownloadOptions): Promise<FileDownloadResult> {
        // Check if File System Access API is available
        const hasFileSystemAPI = 'showSaveFilePicker' in window;
        
        // If forceFileSelector is true and API not available, fail explicitly
        if (options.forceFileSelector && !hasFileSystemAPI) {
            console.error('❌ File selector requested but not available in this browser');
            return {
                success: false,
                cancelled: false,
                method: 'failed',
                error: 'File selector not supported in this browser. Please use Chrome/Edge 86+ or allow direct downloads.'
            };
        }

        // Try File System Access API if available
        if (hasFileSystemAPI) {
            try {
                const fileTypeConfig = this.getFileTypeConfig(options);
                
                console.log('🎯 Opening Save As dialog...');
                const fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: options.filename,
                    types: [fileTypeConfig]
                });
                
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log('✅ File saved using Save As dialog:', fileHandle.name);
                return {
                    success: true,
                    cancelled: false,
                    actualFilename: fileHandle.name,
                    method: 'save-as'
                };
        } catch (error: any) {
            // Check if user cancelled
            if (error.name === 'AbortError') {
                console.log('❌ User cancelled file save');
                return {
                    success: false,
                    cancelled: true,
                    method: 'failed'
                };
            }
                
                // Log detailed error for debugging
                console.error('💥 File System Access API failed:', error);
                
                // If forceFileSelector, don't fall back
                if (options.forceFileSelector) {
                    return {
                        success: false,
                        cancelled: false,
                        method: 'failed',
                        error: `File selector failed: ${error.message}`
                    };
                }
                
                // Otherwise, log that we're falling back
                console.warn('⚠️ File selector failed, falling back to direct download');
            }
        }
        
        // Fallback to traditional download (only if not forcing file selector)
        if (!options.forceFileSelector) {
            // Provide clear browser-specific guidance
            const browserInfo = this.getBrowserInfo();
            console.warn(`⚠️ File selector not available in ${browserInfo.name}. Using direct download to Downloads folder.`);
            console.info(`💡 For better file management, consider using Chrome 86+ or Edge 86+ which support file selectors.`);
            
        this.downloadBlobTraditional(blob, options.filename);
        return {
            success: true,
            cancelled: false,
            actualFilename: options.filename,
            method: 'download'
            };
        }
        
        // If we get here, file selector was required but failed
        return {
            success: false,
            cancelled: false,
            method: 'failed',
            error: 'File selector required but unavailable'
        };
    }

    /**
     * Downloads a string as a file with file selector preference
     */
    public static async downloadText(content: string, options: FileDownloadOptions): Promise<FileDownloadResult> {
        const blob = new Blob([content], { type: options.mimeType });
        return await this.downloadBlob(blob, options);
    }

    /**
     * Traditional download method (fallback only)
     * This should ONLY be used when File System Access API is not available
     */
    private static downloadBlobTraditional(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Gets the appropriate file type configuration for File System Access API
     */
    private static getFileTypeConfig(options: FileDownloadOptions): FileTypeConfig {
        // If custom extensions provided, use them
        if (options.extensions && options.extensions.length > 0) {
            return {
                description: options.description ?? 'File',
                accept: { [options.mimeType]: options.extensions }
            };
        }

        // Determine file type from filename extension
        const extension = this.getFileExtension(options.filename);
        
        switch (extension.toLowerCase()) {
            case '.json':
                return {
                    description: options.description ?? 'JSON File',
                    accept: { 'application/json': ['.json'] }
                };
            case '.html':
                return {
                    description: options.description ?? 'HTML Document',
                    accept: { 'text/html': ['.html'] }
                };
            case '.md':
                return {
                    description: options.description ?? 'Markdown Document',
                    accept: { 'text/markdown': ['.md'] }
                };
            case '.txt':
                return {
                    description: options.description ?? 'Text Document',
                    accept: { 'text/plain': ['.txt'] }
                };
            case '.zip':
                return {
                    description: options.description ?? 'ZIP Archive',
                    accept: { 'application/zip': ['.zip'] }
                };
            case '.epub':
                return {
                    description: options.description ?? 'EPUB eBook',
                    accept: { 'application/epub+zip': ['.epub'] }
                };
            default:
                return {
                    description: options.description ?? 'File',
                    accept: { [options.mimeType]: [extension] }
                };
        }
    }

    /**
     * Extracts file extension from filename
     */
    private static getFileExtension(filename: string): string {
        const lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex >= 0 ? filename.substring(lastDotIndex) : '';
    }

    /**
     * Convenience method for downloading export results with file selector preference
     */
    public static async downloadExportResult(content: string | Blob, filename: string, mimeType: string, description?: string): Promise<FileDownloadResult> {
        const options: FileDownloadOptions = {
            filename,
            mimeType,
            forceFileSelector: false // Allow fallback to direct download for browser compatibility
        };
        if (description) {
            options.description = description;
        }
        
        if (content instanceof Blob) {
            return await this.downloadBlob(content, options);
        } else {
            return await this.downloadText(content, options);
        }
    }

    /**
     * Convenience method for JSON exports with file selector preference
     */
    public static async downloadJson(data: any, filename: string, description?: string): Promise<FileDownloadResult> {
        const content = JSON.stringify(data, null, 2);
        return await this.downloadText(content, {
            filename,
            mimeType: 'application/json',
            description: description ?? 'JSON Export',
            forceFileSelector: false // Allow fallback for browser compatibility
        });
    }

    /**
     * Convenience method for ZIP downloads with file selector preference
     * 
     * ⚠️ CRITICAL: DO NOT CHANGE forceFileSelector TO false!
     * This method is used for save/load all functionality (comprehensive export/import).
     * Users expect to choose where their backup files are saved, not have them dumped to Downloads.
     * 
     * AI DEVELOPERS: This has regressed before. The user specifically wants file selector behavior
     * for the save/load all button functionality. Keep forceFileSelector: true!
     */
    public static async downloadZip(blob: Blob, filename: string, description?: string): Promise<FileDownloadResult> {
        return await this.downloadBlob(blob, {
            filename,
            mimeType: 'application/zip',
            description: description ?? 'ZIP Archive',
            forceFileSelector: true // CRITICAL: Force file selector for save/load all functionality - DO NOT CHANGE TO false!
        });
    }

    /**
     * Test file selector support and show detailed browser capability info
     * Useful for debugging file selector issues
     */
    public static testFileSelectorSupport(): { 
        supported: boolean; 
        details: string; 
        recommendation: string 
    } {
        const hasAPI = 'showSaveFilePicker' in window;
        const userAgent = navigator.userAgent;
        const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Edg');
        const isEdge = userAgent.includes('Edg');
        const isFirefox = userAgent.includes('Firefox');
        const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');

        let details = `Browser: ${userAgent}\n`;
        details += `File System Access API: ${hasAPI ? 'Available' : 'Not Available'}\n`;
        
        let recommendation = '';
        if (!hasAPI) {
            if (isFirefox) {
                recommendation = 'Firefox does not support File System Access API. Consider using Chrome or Edge for file selector functionality.';
            } else if (isSafari) {
                recommendation = 'Safari does not support File System Access API. Consider using Chrome or Edge for file selector functionality.';
            } else if (isChrome || isEdge) {
                recommendation = 'File System Access API should be supported. Check if browser needs to be updated or if security settings are blocking the API.';
            } else {
                recommendation = 'Unknown browser. For best file selector support, use Chrome 86+ or Edge 86+.';
            }
        } else {
            recommendation = 'File selector (Save As dialog) should work properly!';
        }

        return {
            supported: hasAPI,
            details,
            recommendation
        };
    }

    /**
     * Quick test of file selector functionality
     */
    public static async testFileSelector(): Promise<{ success: boolean; message: string }> {
        const testData = 'This is a test file for verifying file selector functionality.';
        const testBlob = new Blob([testData], { type: 'text/plain' });
        
        try {
            const result = await this.downloadBlob(testBlob, {
                filename: 'file-selector-test.txt',
                mimeType: 'text/plain',
                description: 'File Selector Test',
                forceFileSelector: true
            });

            if (result.success && result.method === 'save-as') {
                return { success: true, message: '✅ File selector working correctly!' };
            } else if (result.cancelled) {
                return { success: false, message: '❌ Test cancelled by user' };
            } else {
                return { success: false, message: `❌ File selector failed: ${result.error ?? 'Unknown error'}` };
            }
        } catch (error) {
            return { success: false, message: `❌ Test failed: ${error}` };
        }
    }

    /**
     * Show a user-friendly notification about browser file selector support
     * Useful for first-time users or when fallbacks are frequently used
     */
    public static showBrowserCompatibilityInfo(): void {
        const support = this.testFileSelectorSupport();
        const browserInfo = this.getBrowserInfo();
        
        if (support.supported) {
            console.info(`✅ ${browserInfo.name} ${browserInfo.version} supports file selectors - you can choose where to save files!`);
        } else {
            console.info(`📋 ${browserInfo.name} ${browserInfo.version} downloads files directly to Downloads folder.`);
            console.info(`💡 For better file management, consider using Chrome 86+ or Edge 86+ which let you choose save locations.`);
        }
    }

    /**
     * Helper to get browser information for fallback messages
     */
    private static getBrowserInfo(): { name: string; version: string } {
        const userAgent = navigator.userAgent;
        const browserName = userAgent.includes('Chrome') ? 'Chrome' :
                            userAgent.includes('Edg') ? 'Edge' :
                            userAgent.includes('Firefox') ? 'Firefox' :
                            userAgent.includes('Safari') ? 'Safari' : 'Unknown';
        const versionMatch = (userAgent.match(/Chrome\/(\d+)/) ?? userAgent.match(/Edg\/(\d+)/)) ?? userAgent.match(/Firefox\/(\d+)/) ?? userAgent.match(/Safari\/(\d+)/);
        const version = versionMatch ? (versionMatch[1] ?? 'Unknown') : 'Unknown';
        return { name: browserName, version };
    }
} 