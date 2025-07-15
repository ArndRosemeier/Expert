/**
 * Centralized file download service that supports modern File System Access API
 * with fallback to traditional downloads for maximum browser compatibility
 */

export interface FileDownloadOptions {
    filename: string;
    mimeType: string;
    description?: string;
    extensions?: string[];
}

export interface FileTypeConfig {
    description: string;
    accept: Record<string, string[]>;
}

export interface FileDownloadResult {
    success: boolean;
    cancelled: boolean;
    actualFilename?: string;
    method: 'save-as' | 'download' | 'failed';
}

export class FileDownloadService {
    /**
     * Downloads a blob as a file using the best available method
     * - Tries File System Access API first (Chrome/Edge 86+) for "Save As" dialog
     * - Falls back to traditional download to Downloads folder
     */
    public static async downloadBlob(blob: Blob, options: FileDownloadOptions): Promise<FileDownloadResult> {
        try {
            // Try modern File System Access API first
            if ('showSaveFilePicker' in window) {
                const fileTypeConfig = this.getFileTypeConfig(options);
                
                const fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: options.filename,
                    types: [fileTypeConfig]
                });
                
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log('✅ File saved using Save As dialog');
                return {
                    success: true,
                    cancelled: false,
                    actualFilename: fileHandle.name,
                    method: 'save-as'
                };
            }
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
            // API not supported or other error - fall back to download
            console.log('💡 Save As not available, using Downloads folder');
        }
        
        // Fallback: Traditional download to Downloads folder
        this.downloadBlobTraditional(blob, options.filename);
        console.log('📁 File downloaded to Downloads folder');
        return {
            success: true,
            cancelled: false,
            actualFilename: options.filename,
            method: 'download'
        };
    }

    /**
     * Downloads a string as a file
     */
    public static async downloadText(content: string, options: FileDownloadOptions): Promise<FileDownloadResult> {
        const blob = new Blob([content], { type: options.mimeType });
        return await this.downloadBlob(blob, options);
    }

    /**
     * Traditional download method (fallback)
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
                description: options.description || 'File',
                accept: { [options.mimeType]: options.extensions }
            };
        }

        // Determine file type from filename extension
        const extension = this.getFileExtension(options.filename);
        
        switch (extension.toLowerCase()) {
            case '.json':
                return {
                    description: options.description || 'JSON File',
                    accept: { 'application/json': ['.json'] }
                };
            case '.html':
                return {
                    description: options.description || 'HTML Document',
                    accept: { 'text/html': ['.html'] }
                };
            case '.md':
                return {
                    description: options.description || 'Markdown Document',
                    accept: { 'text/markdown': ['.md'] }
                };
            case '.txt':
                return {
                    description: options.description || 'Text Document',
                    accept: { 'text/plain': ['.txt'] }
                };
            case '.zip':
                return {
                    description: options.description || 'ZIP Archive',
                    accept: { 'application/zip': ['.zip'] }
                };
            default:
                return {
                    description: options.description || 'File',
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
     * Convenience method for downloading export results
     */
    public static async downloadExportResult(content: string | Blob, filename: string, mimeType: string, description?: string): Promise<FileDownloadResult> {
        const options: FileDownloadOptions = {
            filename,
            mimeType
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
     * Convenience method for JSON exports
     */
    public static async downloadJson(data: any, filename: string, description?: string): Promise<FileDownloadResult> {
        const content = JSON.stringify(data, null, 2);
        return await this.downloadText(content, {
            filename,
            mimeType: 'application/json',
            description: description || 'JSON Export'
        });
    }

    /**
     * Convenience method for ZIP downloads
     */
    public static async downloadZip(blob: Blob, filename: string, description?: string): Promise<FileDownloadResult> {
        return await this.downloadBlob(blob, {
            filename,
            mimeType: 'application/zip',
            description: description || 'ZIP Archive'
        });
    }
} 