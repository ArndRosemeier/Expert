import { BaseModal } from './core/BaseModal.js';
import { KeyManager, KeyValidationResult, KeyData } from '../../keys/KeyManager.js';
import { AppKeyStorage } from '../../keys/AppKeyStorage.js';
import { ModalConfig } from './types/ModalTypes.js';
import { ComprehensiveImportService } from './services/ComprehensiveImportService.js';

export class KeyValidationModal extends BaseModal {
    private static readonly APP_PASSWORD = 'ExperT';
    private keyInput: HTMLTextAreaElement | null = null;
    private statusDiv: HTMLDivElement | null = null;
    private submitButton: HTMLButtonElement | null = null;
    private onValidKeyCallback: ((keyData: KeyData) => void) | null = null;

    constructor() {
        const config: ModalConfig = {
            id: 'key-validation-modal',
            title: 'Application Key Required',
            maxWidth: '600px',
            closable: false // Cannot be closed without valid key
        };
        super(config, {
            onOpen: () => { this.attachEventListeners(); }
        });
    }

    public render(): HTMLElement {
        const container = document.createElement('div');
        container.innerHTML = `
            <style>
            ${this.getModalStyles()}
            </style>
            <div class="key-validation-content">
                <div class="key-validation-header">
                    <h2>🔑 Enter Application Key</h2>
                    <p>A valid key is required to use the Expert application.</p>
                </div>
                
                <div class="key-input-section">
                    <label for="key-input">Application Key:</label>
                    <textarea 
                        id="key-input" 
                        class="key-input-field" 
                        placeholder="Enter your EXPERT_KEY_V2_... here"
                        rows="4"
                    ></textarea>
                    
                    <div id="key-status" class="key-status"></div>
                </div>
                
                <div class="key-actions">
                    <button type="button" id="validate-key-btn" class="btn btn-primary" disabled>
                        🔓 Validate Key
                    </button>
                    <button type="button" id="clear-stored-key-btn" class="btn btn-secondary">
                        🗑️ Clear Stored Key
                    </button>
                </div>
                
                <div class="key-import-section">
                    <div class="key-import-divider">
                        <span>OR</span>
                    </div>
                    <p class="key-import-description">
                        Restore your entire application state from a backup (includes API key, projects, sessions, and settings)
                    </p>
                    <button type="button" id="load-backup-btn" class="btn btn-secondary" style="width: 100%;">
                        📥 Load Backup
                    </button>
                </div>
                
                <div class="key-help">
                    <details>
                        <summary>Need help?</summary>
                        <p>
                            Keys can be generated at: <a href="/Expert/keys" target="_blank">Key Generator</a><br>
                            Keys have the format: <code>EXPERT_KEY_V2_...</code><br>
                            Make sure your key has not expired.
                        </p>
                    </details>
                </div>
            </div>
        `;
        return container;
    }

    private getModalStyles(): string {
        return `
            .key-validation-content {
                padding: 1rem;
            }
            
            .key-validation-header {
                text-align: center;
                margin-bottom: 2rem;
            }
            
            .key-validation-header h2 {
                margin: 0 0 0.5rem 0;
                color: #1e40af;
            }
            
            .key-validation-header p {
                margin: 0;
                color: #6b7280;
            }
            
            .key-input-section {
                margin-bottom: 2rem;
            }
            
            .key-input-section label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 600;
                color: #374151;
            }
            
            .key-input-field {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #d1d5db;
                border-radius: 0.5rem;
                font-family: 'Courier New', monospace;
                font-size: 0.875rem;
                resize: vertical;
                min-height: 100px;
            }
            
            .key-input-field:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .key-status {
                margin-top: 1rem;
                padding: 0.75rem;
                border-radius: 0.5rem;
                font-weight: 500;
                min-height: 1.5rem;
            }
            
            .key-status.success {
                background-color: #d1fae5;
                border: 1px solid #a7f3d0;
                color: #065f46;
            }
            
            .key-status.error {
                background-color: #fee2e2;
                border: 1px solid #fecaca;
                color: #dc2626;
            }
            
            .key-status.info {
                background-color: #dbeafe;
                border: 1px solid #bfdbfe;
                color: #1d4ed8;
            }
            
            .key-actions {
                display: flex;
                gap: 1rem;
                justify-content: center;
                margin-bottom: 1.5rem;
            }
            
            .key-import-section {
                margin-bottom: 2rem;
                padding-top: 1.5rem;
                border-top: 1px solid #e5e7eb;
            }
            
            .key-import-divider {
                text-align: center;
                position: relative;
                margin-bottom: 1rem;
                color: #9ca3af;
                font-weight: 600;
                font-size: 0.875rem;
            }
            
            .key-import-description {
                text-align: center;
                color: #6b7280;
                font-size: 0.875rem;
                margin-bottom: 1rem;
                line-height: 1.5;
            }
            
            .key-help {
                border-top: 1px solid #e5e7eb;
                padding-top: 1rem;
            }
            
            .key-help details {
                color: #6b7280;
                font-size: 0.875rem;
            }
            
            .key-help summary {
                cursor: pointer;
                font-weight: 500;
                color: #374151;
            }
            
            .key-help code {
                background-color: #f3f4f6;
                padding: 0.125rem 0.25rem;
                border-radius: 0.25rem;
                font-family: 'Courier New', monospace;
            }
            
            .key-help a {
                color: #3b82f6;
                text-decoration: none;
            }
            
            .key-help a:hover {
                text-decoration: underline;
            }
        `;
    }

    private attachEventListeners(): void {
        const keyInput = this.element?.querySelector('#key-input');
        const statusDiv = this.element?.querySelector('#key-status');
        const submitButton = this.element?.querySelector('#validate-key-btn');

        if (!(keyInput instanceof HTMLTextAreaElement)) {
            throw new Error('Key input not found');
        }
        if (!(statusDiv instanceof HTMLDivElement)) {
            throw new Error('Key status element not found');
        }
        if (!(submitButton instanceof HTMLButtonElement)) {
            throw new Error('Validate key button not found');
        }

        this.keyInput = keyInput;
        this.statusDiv = statusDiv;
        this.submitButton = submitButton;

        keyInput.addEventListener('input', () => { this.onKeyInput(); });
        keyInput.addEventListener('paste', () => {
            setTimeout(() => { this.onKeyInput(); }, 100);
        });

        submitButton.addEventListener('click', () => void this.validateKey());

        const clearButton = this.element?.querySelector('#clear-stored-key-btn');
        if (!(clearButton instanceof HTMLButtonElement)) {
            throw new Error('Clear stored key button not found');
        }
        clearButton.addEventListener('click', () => void this.clearStoredKey());

        const loadBackupButton = this.element?.querySelector('#load-backup-btn');
        if (!(loadBackupButton instanceof HTMLButtonElement)) {
            throw new Error('Load backup button not found');
        }
        loadBackupButton.addEventListener('click', () => void this.handleLoadBackup());
    }

    private onKeyInput(): void {
        const key = this.keyInput?.value.trim() ?? '';
        const isValidFormat = key.startsWith('EXPERT_KEY_V2_') && key.length > 20;
        
        if (this.submitButton) {
            this.submitButton.disabled = !isValidFormat;
        }
        
        if (this.statusDiv) {
            if (key === '') {
                this.statusDiv.className = 'key-status';
                this.statusDiv.textContent = '';
            } else if (!isValidFormat) {
                this.statusDiv.className = 'key-status error';
                this.statusDiv.textContent = '❌ Invalid key format. Key must start with EXPERT_KEY_V2_';
            } else {
                this.statusDiv.className = 'key-status info';
                this.statusDiv.textContent = '⏳ Ready to validate...';
            }
        }
    }

    private async validateKey(): Promise<void> {
        const key = this.keyInput?.value.trim() ?? '';
        
        if (!key) {
            this.showStatus('error', '❌ Please enter a key');
            return;
        }
        
        if (this.submitButton) {
            this.submitButton.disabled = true;
            this.submitButton.textContent = '⏳ Validating...';
        }
        
        try {
            const result: KeyValidationResult = KeyManager.validateKey(key, KeyValidationModal.APP_PASSWORD);
            
            if (result.valid && result.data) {
                // Key is valid, store it
                await AppKeyStorage.saveAppKey(key, result.data);
                
                this.showStatus('success', `✅ Key validated successfully! Expires: ${result.data.expirationDate.toLocaleDateString()}`);
                
                // Call the callback and close modal
                if (this.onValidKeyCallback) {
                    this.onValidKeyCallback(result.data);
                }
                
                // Close modal after a short delay
                setTimeout(() => {
                    void this.close();
                }, 1500);
                
            } else {
                this.showStatus('error', `❌ ${result.reason ?? 'Invalid key'}`);
            }
        } catch (error) {
            this.showStatus('error', `❌ Validation failed: ${(error as Error).message}`);
        } finally {
            if (this.submitButton) {
                this.submitButton.disabled = false;
                this.submitButton.textContent = '🔓 Validate Key';
            }
        }
    }

    private async clearStoredKey(): Promise<void> {
        await AppKeyStorage.clearAppKey();
        this.showStatus('info', '🗑️ Stored key cleared');
    }

    private showStatus(type: 'success' | 'error' | 'info', message: string): void {
        if (this.statusDiv) {
            this.statusDiv.className = `key-status ${type}`;
            this.statusDiv.textContent = message;
        }
    }

    public setOnValidKeyCallback(callback: (keyData: KeyData) => void): void {
        this.onValidKeyCallback = callback;
    }

    private async handleLoadBackup(): Promise<void> {
        try {
            this.showStatus('info', '📂 Opening file picker...');
            
            // Show file picker dialog
            const file = await ComprehensiveImportService.showFilePickerDialog();
            if (!file) {
                // User cancelled file selection
                this.showStatus('info', 'Import cancelled');
                return;
            }

            this.showStatus('info', '⏳ Analyzing backup file...');

            // Get import summary to show what will be imported
            const summary = await ComprehensiveImportService.getImportSummary(file);
            
            if (!summary.isValid) {
                throw new Error(`Invalid backup file: ${summary.errors.join(', ')}`);
            }

            // Show confirmation dialog with import summary
            const summaryText = summary.summary
                .map(item => `${item.status === 'available' ? '✅' : '❌'} ${item.name}: ${item.count} items`)
                .join('\n');

            const confirmed = confirm(
                `📥 Import Backup\n\n` +
                `File: ${file.name}\n` +
                `Export Date: ${summary.manifest?.exportDate ? new Date(summary.manifest.exportDate).toLocaleString() : 'Unknown'}\n\n` +
                `Data to import:\n${summaryText}\n\n` +
                `⚠️ IMPORTANT WARNING:\n` +
                `This will completely replace ALL current application data!\n\n` +
                `What will happen:\n` +
                `• All current projects, settings, and templates will be deleted\n` +
                `• Your API keys will be restored from the backup\n` +
                `• Application will restart with the imported data\n\n` +
                `Do you want to proceed with the import?`
            );
            
            if (!confirmed) {
                this.showStatus('info', 'Import cancelled');
                return;
            }

            // Perform the import
            this.showStatus('info', '⏳ Importing data from backup...');
            
            const result = await ComprehensiveImportService.importComprehensiveBackup(file);
            
            if (result.success) {
                this.showStatus('success', 
                    `✅ Import completed! Imported: ${result.importedItems.join(', ')}. ` +
                    `Application will reload in 3 seconds...`
                );
                
                // Reload the page after import to refresh all data. Imported
                // settings are self-healed and version-stamped on the next load.
                setTimeout(() => {
                    window.location.reload();
                }, 3000);
                
            } else {
                throw new Error(result.message);
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.showStatus('error', `❌ Import failed: ${errorMessage}`);
            console.error('Backup import failed:', error);
        }
    }
} 
