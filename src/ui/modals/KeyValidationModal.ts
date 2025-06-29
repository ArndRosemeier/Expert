import { BaseModal } from './core/BaseModal.js';
import { KeyManager, KeyValidationResult } from '../../keys/KeyManager.js';
import { AppKeyStorage } from '../../keys/AppKeyStorage.js';
import { ModalConfig } from './types/ModalTypes.js';

export class KeyValidationModal extends BaseModal {
    private static readonly APP_PASSWORD = 'ExperT';
    private keyInput: HTMLInputElement | null = null;
    private statusDiv: HTMLDivElement | null = null;
    private submitButton: HTMLButtonElement | null = null;
    private onValidKeyCallback: ((keyData: any) => void) | null = null;

    constructor() {
        const config: ModalConfig = {
            id: 'key-validation-modal',
            title: 'Application Key Required',
            maxWidth: '600px',
            closable: false // Cannot be closed without valid key
        };
        super(config, {
            onOpen: () => this.attachEventListeners()
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
                margin-bottom: 2rem;
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
        this.keyInput = this.element?.querySelector('#key-input') as HTMLInputElement;
        this.statusDiv = this.element?.querySelector('#key-status') as HTMLDivElement;
        this.submitButton = this.element?.querySelector('#validate-key-btn') as HTMLButtonElement;
        
        if (this.keyInput) {
            this.keyInput.addEventListener('input', () => this.onKeyInput());
            this.keyInput.addEventListener('paste', () => {
                // Delay to allow paste to complete
                setTimeout(() => this.onKeyInput(), 100);
            });
        }
        
        if (this.submitButton) {
            this.submitButton.addEventListener('click', () => void this.validateKey());
        }
        
        const clearButton = this.element?.querySelector('#clear-stored-key-btn') as HTMLButtonElement;
        if (clearButton) {
            clearButton.addEventListener('click', () => void this.clearStoredKey());
        }
    }

    private onKeyInput(): void {
        const key = this.keyInput?.value.trim() || '';
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
        const key = this.keyInput?.value.trim() || '';
        
        if (!key) {
            this.showStatus('error', '❌ Please enter a key');
            return;
        }
        
        if (this.submitButton) {
            this.submitButton.disabled = true;
            this.submitButton.textContent = '⏳ Validating...';
        }
        
        try {
            const result: KeyValidationResult = await KeyManager.validateKey(key, KeyValidationModal.APP_PASSWORD);
            
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
                this.showStatus('error', `❌ ${result.reason || 'Invalid key'}`);
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

    public setOnValidKeyCallback(callback: (keyData: any) => void): void {
        this.onValidKeyCallback = callback;
    }
}
