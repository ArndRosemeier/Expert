/**
 * Comprehensive Export Modal - Modal for exporting all application data as a ZIP backup
 */

import { BaseModal } from './core/BaseModal';
import { ComprehensiveExportService } from './services/ComprehensiveExportService';
import { ComprehensiveImportService } from './services/ComprehensiveImportService';

import { ModalConfig } from './types/ModalTypes';
import { createElement } from './core/modal-utils';
import { AI_ASSISTANT_EMOJI } from '../../constants';

export interface ComprehensiveExportModalConfig extends ModalConfig {
    // No specific config needed for comprehensive export
}

export class ComprehensiveExportModal extends BaseModal {
    private exportButton?: HTMLButtonElement;
    private importButton?: HTMLButtonElement;
    private summaryContainer?: HTMLElement;
    private isLoading: boolean = false;

    constructor(config: ComprehensiveExportModalConfig = { id: 'comprehensive-export-modal' }) {
        super({
            ...config,
            title: '📦 Complete Application Backup & Restore',
            id: 'comprehensive-export-modal',
            width: '600px',
            maxWidth: '90vw'
        });
    }

    /**
     * Implements IModal render method
     */
    public render(): HTMLElement {
        return this.renderContent();
    }

    /**
     * Renders the modal content
     */
    protected renderContent(): HTMLElement {
        const container = createElement('div', {
            classes: ['comprehensive-export-modal-container']
        });

        this.addStyles(container);

        const header = this.createHeader();
        const body = this.createBody();
        const footer = this.createFooter();

        container.appendChild(header);
        container.appendChild(body);
        container.appendChild(footer);

        // Load and display summary on render
        void this.loadExportSummary();

        return container;
    }

    /**
     * Creates the modal header
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['modal-header']
        });

        const title = createElement('h2', {
            content: '📦 Complete Application Backup & Restore'
        });

        header.appendChild(title);
        return header;
    }

    /**
     * Creates the modal body
     */
    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['modal-body']
        });

        // Description section
        const description = createElement('div', {
            classes: ['export-description']
        });
        description.innerHTML = `
            <p><strong>Export:</strong> Create a complete backup of all your application data in a ZIP file.</p>
            <p><strong>Import:</strong> Restore all application data from a previously created backup ZIP file.</p>
            <ul>
                <li>🗂️ All projects and their content</li>
                <li>⚙️ All settings profiles and configurations</li>
                <li>📝 All custom prompts and templates</li>
                <li>${AI_ASSISTANT_EMOJI} Reader AI button configurations</li>
                <li>✨ Polish text button configurations</li>
                <li>🔧 Application preferences and settings</li>
            </ul>
            <p><strong>Note:</strong> API keys and sensitive data are preserved during import.</p>
        `;

        // Summary section
        this.summaryContainer = createElement('div', {
            classes: ['export-summary']
        });

        body.appendChild(description);
        body.appendChild(this.summaryContainer);

        return body;
    }

    /**
     * Creates the modal footer
     */
    private createFooter(): HTMLElement {
        const footer = createElement('div', {
            classes: ['modal-footer']
        });

        this.exportButton = createElement('button', {
            classes: ['button', 'button-primary'],
            content: '📦 Create Backup ZIP'
        }) as HTMLButtonElement;

        this.importButton = createElement('button', {
            classes: ['button', 'button-success'],
            content: '📥 Import Backup ZIP'
        }) as HTMLButtonElement;



        const cancelButton = createElement('button', {
            classes: ['button', 'button-secondary'],
            content: 'Cancel'
        }) as HTMLButtonElement;

        // Event listeners
        this.exportButton.addEventListener('click', async () => this.handleExport());
        this.importButton.addEventListener('click', async () => this.handleImport());

        cancelButton.addEventListener('click', async () => this.close());

        footer.appendChild(cancelButton);
        footer.appendChild(this.importButton);
        footer.appendChild(this.exportButton);

        return footer;
    }

    /**
     * Loads and displays the export summary
     */
    private async loadExportSummary(): Promise<void> {
        if (!this.summaryContainer) return;

        try {
            this.summaryContainer.innerHTML = '<p>📊 Analyzing data...</p>';
            
            const summary = await ComprehensiveExportService.getExportSummary();
            
            let summaryHTML = '<h3>📊 Export Summary</h3><div class="summary-grid">';
            
            summary.categories.forEach(category => {
                const statusIcon = category.status === 'available' ? '✅' : 
                                 category.status === 'empty' ? '⚪' : '❌';
                const statusText = category.status === 'available' ? 'Ready' : 
                                 category.status === 'empty' ? 'Empty' : 'Error';
                
                summaryHTML += `
                    <div class="summary-item summary-item-${category.status}">
                        <span class="summary-icon">${statusIcon}</span>
                        <span class="summary-name">${category.name}</span>
                        <span class="summary-count">${category.count}</span>
                        <span class="summary-status">${statusText}</span>
                    </div>
                `;
            });
            
            summaryHTML += '</div>';
            
            // Add total count
            const totalItems = summary.categories.reduce((sum, cat) => sum + cat.count, 0);
            const availableCategories = summary.categories.filter(cat => cat.status === 'available').length;
            
            summaryHTML += `
                <div class="summary-totals">
                    <p><strong>Total:</strong> ${totalItems} items across ${availableCategories} categories ready for export</p>
                </div>
            `;
            
            this.summaryContainer.innerHTML = summaryHTML;
            
        } catch (error) {
            this.summaryContainer.innerHTML = `
                <div class="error-message">
                    ❌ Error loading export summary: ${error instanceof Error ? error.message : 'Unknown error'}
                </div>
            `;
        }
    }

    /**
     * Handles the export action
     */
    private async handleExport(): Promise<void> {
        if (!this.exportButton || this.isLoading) return;

        this.isLoading = true;
        this.exportButton.disabled = true;
        this.exportButton.textContent = '📁 Choose save location...';

        try {
            // CRITICAL: Get file handle immediately while we still have user gesture
            // The File System Access API requires direct user interaction
            let fileHandle: any = null;
            const hasFileSystemAPI = 'showSaveFilePicker' in window;
            
            if (hasFileSystemAPI) {
                try {
                    const timestamp = new Date().toISOString().split('T')[0];
                    const filename = `expert-app-complete-backup-${timestamp}.zip`;
                    
                    fileHandle = await (window as any).showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Expert Application Backup',
                            accept: { 'application/zip': ['.zip'] }
                        }]
                    });
                } catch (error) {
                    // User cancelled or picker failed
                    this.isLoading = false;
                    this.exportButton.disabled = false;
                    this.exportButton.textContent = '💾 Export All Data';
                    
                    if (error instanceof Error && error.name === 'AbortError') {
                        console.log('Export cancelled by user');
                        return;
                    }
                    
                    console.error('File picker failed:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    alert(`Failed to open file picker: ${errorMessage}\n\nPlease try again or use a supported browser (Chrome/Edge 86+).`);
                    return;
                }
            }

            this.exportButton.textContent = '⏳ Creating backup...';
            
            const result = await ComprehensiveExportService.createComprehensiveBackup(fileHandle);
            
            if (result.success) {
                // Show success message
                const successHTML = `
                    <div class="success-message">
                        <h3>✅ Backup Created Successfully!</h3>
                        <p><strong>Filename:</strong> ${result.filename}</p>
                        <p><strong>Exported:</strong> ${result.exportedItems.join(', ')}</p>
                        <p>The backup ZIP file has been downloaded to your computer.</p>
                    </div>
                `;
                
                if (this.summaryContainer) {
                    this.summaryContainer.innerHTML = successHTML;
                }
                
                // Close modal after short delay
                void void setTimeout(() => {
                    void this.close();
                }, 3000);
                
            } else {
                throw new Error(result.message);
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (this.summaryContainer) {
                this.summaryContainer.innerHTML = `
                    <div class="error-message">
                        <h3>❌ Backup Failed</h3>
                        <p>${errorMessage}</p>
                        <p>Please try again or contact support if the problem persists.</p>
                    </div>
                `;
            }
            
            alert(`Backup failed: ${errorMessage}`);
            
        } finally {
            this.isLoading = false;
            if (this.exportButton) {
                this.exportButton.disabled = false;
                this.exportButton.textContent = '📦 Create Backup ZIP';
            }
        }
    }

    /**
     * Handles the import action
     */
    private async handleImport(): Promise<void> {
        if (!this.importButton || this.isLoading) return;

        try {
            // Show file picker dialog
            const file = await ComprehensiveImportService.showFilePickerDialog();
            if (!file) {
                // User cancelled file selection
                return;
            }

            this.isLoading = true;
            this.importButton.disabled = true;
            this.importButton.textContent = '⏳ Analyzing backup...';

            // Get import summary to show what will be imported
            const summary = await ComprehensiveImportService.getImportSummary(file);
            
            if (!summary.isValid) {
                throw new Error(`Invalid backup file: ${summary.errors.join(', ')}`);
            }

            // Show confirmation dialog with import summary
            const confirmationHTML = `
                <div style="max-width: 500px;">
                    <h3>📥 Import Confirmation</h3>
                    <p><strong>File:</strong> ${file.name}</p>
                    <p><strong>Export Date:</strong> ${summary.manifest?.exportDate ? new Date(summary.manifest.exportDate).toLocaleString() : 'Unknown'}</p>
                    
                    <h4>Data to import:</h4>
                    <ul>
                        ${summary.summary.map(item => 
                            `<li>${item.status === 'available' ? '✅' : '❌'} ${item.name}: ${item.count} items</li>`
                        ).join('')}
                    </ul>
                    
                    <div style="background: #ffe6e6; padding: 1rem; border-radius: 6px; margin: 1rem 0; border-left: 4px solid #dc3545;">
                        <strong>⚠️ IMPORTANT WARNING:</strong> This will completely replace ALL current application data!
                        <br><br>
                        <strong>What will happen:</strong>
                        <ul style="margin: 0.5rem 0;">
                            <li>All current projects, settings, and templates will be deleted</li>
                            <li>Your API keys will be preserved for security</li>
                            <li>Application will restart with the imported data</li>
                        </ul>
                        <strong>💡 Recommendation:</strong> Export your current settings first if you're unsure!
                    </div>
                    
                    <p>Do you want to proceed with the import?</p>
                </div>
            `;

            const confirmed = confirm(confirmationHTML.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' '));
            
            if (!confirmed) {
                return;
            }

            // Perform the import
            this.importButton.textContent = '⏳ Importing data...';
            
            const result = await ComprehensiveImportService.importComprehensiveBackup(file);
            
            if (result.success) {
                // Show success message
                const successHTML = `
                    <div class="success-message">
                        <h3>✅ Import Completed Successfully!</h3>
                        <p><strong>Imported:</strong> ${result.importedItems.join(', ')}</p>
                        ${result.errors.length > 0 ? `<p><strong>Warnings:</strong> ${result.errors.join(', ')}</p>` : ''}
                        <p>The application will refresh to load the imported data.</p>
                    </div>
                `;
                
                if (this.summaryContainer) {
                    this.summaryContainer.innerHTML = successHTML;
                }
                
                // Reload the page after import to refresh all data. Imported
                // settings are self-healed and version-stamped on the next load.
                void setTimeout(() => {
                    window.location.reload();
                }, 3000);
                
            } else {
                throw new Error(result.message);
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (this.summaryContainer) {
                this.summaryContainer.innerHTML = `
                    <div class="error-message">
                        <h3>❌ Import Failed</h3>
                        <p>${errorMessage}</p>
                        <p>Please check your backup file and try again.</p>
                    </div>
                `;
            }
            
            alert(`Import failed: ${errorMessage}`);
            
        } finally {
            this.isLoading = false;
            if (this.importButton) {
                this.importButton.disabled = false;
                this.importButton.textContent = '📥 Import Backup ZIP';
            }
        }
    }

    /**
     * Adds custom styles for the modal
     */
    private addStyles(container: HTMLElement): void {
        const style = document.createElement('style');
        style.textContent = `
            .comprehensive-export-modal-container {
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }
            
            .comprehensive-export-modal-container .modal-header {
                padding: 1.5rem;
                border-bottom: 1px solid #e5e5e5;
                background: #f8f9fa;
            }
            
            .comprehensive-export-modal-container .modal-header h2 {
                margin: 0;
                color: #2c3e50;
            }
            
            .comprehensive-export-modal-container .modal-body {
                padding: 1.5rem;
                flex: 1;
                overflow-y: auto;
            }
            
            .export-description {
                margin-bottom: 2rem;
                padding: 1rem;
                background: #f8f9fa;
                border-radius: 8px;
                border-left: 4px solid #007bff;
            }
            
            .export-description ul {
                margin: 1rem 0;
                padding-left: 1.5rem;
            }
            
            .export-description li {
                margin: 0.5rem 0;
            }
            
            .export-summary h3 {
                margin: 0 0 1rem 0;
                color: #2c3e50;
            }
            
            .summary-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 0.75rem;
                margin-bottom: 1rem;
            }
            
            .summary-item {
                display: grid;
                grid-template-columns: auto 1fr auto auto;
                gap: 1rem;
                align-items: center;
                padding: 0.75rem;
                border-radius: 6px;
                border: 1px solid #e5e5e5;
            }
            
            .summary-item-available {
                background: #f8fff8;
                border-color: #28a745;
            }
            
            .summary-item-empty {
                background: #f8f9fa;
                border-color: #6c757d;
            }
            
            .summary-item-error {
                background: #fff8f8;
                border-color: #dc3545;
            }
            
            .summary-icon {
                font-size: 1.2rem;
            }
            
            .summary-name {
                font-weight: 500;
            }
            
            .summary-count {
                font-family: monospace;
                font-weight: bold;
                text-align: right;
            }
            
            .summary-status {
                font-size: 0.875rem;
                text-align: right;
            }
            
            .summary-totals {
                padding: 1rem;
                background: #e7f3ff;
                border-radius: 6px;
                border-left: 4px solid #007bff;
            }
            
            .summary-totals p {
                margin: 0;
                font-weight: 500;
            }
            
            .success-message, .error-message {
                padding: 1.5rem;
                border-radius: 8px;
                margin: 1rem 0;
            }
            
            .success-message {
                background: #f8fff8;
                border: 1px solid #28a745;
                color: #155724;
            }
            
            .error-message {
                background: #fff8f8;
                border: 1px solid #dc3545;
                color: #721c24;
            }
            
            .success-message h3, .error-message h3 {
                margin: 0 0 1rem 0;
            }
            
            .comprehensive-export-modal-container .modal-footer {
                padding: 1rem 1.5rem;
                border-top: 1px solid #e5e5e5;
                background: #f8f9fa;
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
            }
            
            .button-success {
                background-color: #28a745;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 0.375rem;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .button-success:hover {
                background-color: #218838;
            }
            
            .button-success:disabled {
                background-color: #6c757d;
                cursor: not-allowed;
            }
            
            @media (max-width: 768px) {
                .comprehensive-export-modal-container {
                    width: 95vw;
                    max-width: 95vw;
                }
                
                .summary-item {
                    grid-template-columns: auto 1fr;
                    gap: 0.5rem;
                }
                
                .summary-count, .summary-status {
                    grid-column: 1 / -1;
                    text-align: left;
                    margin-top: 0.25rem;
                    font-size: 0.875rem;
                    opacity: 0.8;
                }
            }
        `;
        container.appendChild(style);
    }
} 