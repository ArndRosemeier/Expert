import { KeyManager } from './KeyManager.js';
import { KeyStorage, type StoredKey } from './KeyStorage.js';
import { FileDownloadService } from '../utils/FileDownloadService';

export class KeysUI {
    private container: HTMLElement;
    private storedKeys: StoredKey[] = [];

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }
        this.container = container;
        void this.init();
    }

    private async loadStoredKeys(): Promise<void> {
        this.storedKeys = await KeyStorage.loadKeys();
    }

    private async init(): Promise<void> {
        void this.render();
        this.attachEventListeners();
        await this.loadStoredKeys();
        await this.updateKeysList();
        await this.updateStorageStats();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="keys-manager">
                <header class="keys-header">
                    <h1>🔑 Key Management System</h1>
                    <p>Create and manage secure keys with expiration dates</p>
                </header>

                <div class="keys-content">
                    <!-- Key Creation Section -->
                    <section class="key-creation">
                        <h2>Create New Key</h2>
                        <form id="create-key-form" class="key-form">
                            <div class="form-group">
                                <label for="nickname">Nickname (Optional):</label>
                                <input 
                                    type="text" 
                                    id="nickname" 
                                    placeholder="Give this key a name..."
                                    maxlength="50"
                                >
                                <small>Optional name to identify this key</small>
                            </div>

                            <div class="form-group">
                                <label for="custom-string">Custom String:</label>
                                <input 
                                    type="text" 
                                    id="custom-string" 
                                    required 
                                    placeholder="Enter your custom string..."
                                    maxlength="1000"
                                >
                                <small>The string to encode in the key</small>
                            </div>

                            <div class="form-group">
                                <label for="expiration-date">Expiration Date:</label>
                                <input 
                                    type="datetime-local" 
                                    id="expiration-date" 
                                    required
                                >
                                <small>When the key should expire</small>
                            </div>

                            <div class="form-group">
                                <label for="password">Password:</label>
                                <input 
                                    type="password" 
                                    id="password" 
                                    required
                                    value="ExperT"
                                    placeholder="Enter password to encrypt the key..."
                                    minlength="4"
                                >
                                <small>Password to encrypt the key (default: ExperT)</small>
                            </div>

                            <div class="form-actions">
                                <button type="submit" class="btn-primary">Generate Key</button>
                                <button type="button" id="random-string-btn" class="btn-secondary">Random String</button>
                                <button type="button" id="preset-expiry-btn" class="btn-secondary">+7 Days</button>
                            </div>
                        </form>
                    </section>

                    <!-- Key Validation Section -->
                    <section class="key-validation">
                        <h2>Validate Key</h2>
                        <div class="validation-form">
                            <div class="form-group">
                                <label for="validate-key">Key to Validate:</label>
                                <textarea 
                                    id="validate-key" 
                                    placeholder="Paste key here to validate..."
                                    rows="3"
                                ></textarea>
                            </div>
                            <div class="form-group">
                                <label for="validate-password">Password (for encrypted keys):</label>
                                <input 
                                    type="password" 
                                    id="validate-password" 
                                    value="ExperT"
                                    placeholder="Enter password to decrypt key..."
                                >
                                <small>Required for encrypted keys (default: ExperT)</small>
                            </div>
                            <button type="button" id="validate-btn" class="btn-primary">Validate Key</button>
                        </div>
                        <div id="validation-result" class="validation-result"></div>
                    </section>

                    <!-- Storage Statistics Section -->
                    <section class="storage-stats" style="grid-column: span 2; background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #e1e5e9; margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3 style="margin: 0; color: #2d3748;">Storage Overview</h3>
                            <div style="display: flex; gap: 0.5rem;">
                                <button id="cleanup-btn" style="padding: 0.5rem 1rem; background: #fbbf24; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">🧹 Cleanup Expired</button>
                                <button id="export-btn" style="padding: 0.5rem 1rem; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">📤 Export</button>
                                <button id="import-btn" style="padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">📥 Import</button>
                                <button id="debug-btn" style="padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">🐛 Debug Storage</button>
                            </div>
                        </div>
                        <div id="storage-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                            <!-- Stats will be populated by JavaScript -->
                        </div>
                    </section>

                    <!-- Created Keys Section -->
                    <section class="created-keys">
                        <h2>Stored Keys <span id="keys-count">(0)</span></h2>
                        <div id="keys-list" class="keys-list"></div>
                    </section>
                </div>
            </div>
        `;
    }

    private attachEventListeners(): void {
        // Form submission
        const form = document.getElementById('create-key-form') as HTMLFormElement;
        form.addEventListener('submit', async (e) => this.handleCreateKey(e));

        // Random string button
        const randomBtn = document.getElementById('random-string-btn') as HTMLButtonElement;
        randomBtn.addEventListener('click', () => this.generateRandomString());

        // Preset expiry button
        const presetBtn = document.getElementById('preset-expiry-btn') as HTMLButtonElement;
        presetBtn.addEventListener('click', () => this.setPresetExpiry());

        // Validation button
        const validateBtn = document.getElementById('validate-btn') as HTMLButtonElement;
        validateBtn.addEventListener('click', async () => this.validateKey());

        // Auto-validate on input
        const validateInput = document.getElementById('validate-key') as HTMLTextAreaElement;
        validateInput.addEventListener('input', () => void this.validateKey());

        // Storage management buttons
        const cleanupBtn = document.getElementById('cleanup-btn') as HTMLButtonElement;
        cleanupBtn.addEventListener('click', () => void this.cleanupExpiredKeys());

        const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
        exportBtn.addEventListener('click', () => void this.exportKeys());

        const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
        importBtn.addEventListener('click', () => this.importKeys());

        const debugBtn = document.getElementById('debug-btn') as HTMLButtonElement;
        debugBtn.addEventListener('click', () => this.debugStorage());
    }

    private async handleCreateKey(e: Event): Promise<void> {
        e.preventDefault();

        const nickname = (document.getElementById('nickname') as HTMLInputElement).value.trim();
        const customString = (document.getElementById('custom-string') as HTMLInputElement).value;
        const expirationDate = new Date((document.getElementById('expiration-date') as HTMLInputElement).value);
        const password = (document.getElementById('password') as HTMLInputElement).value;

        if (!customString || !expirationDate || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        if (password.length < 4) {
            this.showError('Password must be at least 4 characters long');
            return;
        }

        try {
            const result = await KeyManager.createKey(expirationDate, customString, password);
            
            // Store the key
            await KeyStorage.saveKey(result.key, result.data, nickname);
            
            // Refresh UI
            await this.loadStoredKeys();
            await this.updateKeysList();
            await this.updateStorageStats();
            
            // Clear form
            (document.getElementById('nickname') as HTMLInputElement).value = '';
            (document.getElementById('custom-string') as HTMLInputElement).value = '';
            (document.getElementById('expiration-date') as HTMLInputElement).value = '';
            
            this.showSuccess('Key created and stored successfully!');
        } catch (error) {
            console.error('Key creation failed:', error);
            this.showError('Failed to create key: ' + (error as Error).message);
        }
    }

    private generateRandomString(): void {
        const randomString = KeyManager.generateRandomString(32);
        (document.getElementById('custom-string') as HTMLInputElement).value = randomString;
    }

    private setPresetExpiry(): void {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        const isoString = date.toISOString().slice(0, 16);
        (document.getElementById('expiration-date') as HTMLInputElement).value = isoString;
    }

    private async validateKey(): Promise<void> {
        const keyInput = document.getElementById('validate-key') as HTMLTextAreaElement;
        const passwordInput = document.getElementById('validate-password') as HTMLInputElement;
        const resultDiv = document.getElementById('validation-result') as HTMLDivElement;

        const key = keyInput.value.trim();
        const password = passwordInput.value;

        if (!key) {
            resultDiv.innerHTML = '';
            return;
        }

        try {
            const result = await KeyManager.validateKey(key, password);

            if (result.valid && result.data) {
                const timeRemaining = this.getTimeRemaining(result.data.expirationDate);
                const keyLength = key.length;
                const estimatedBits = Math.floor(keyLength * 6); // Rough estimate for base64-like encoding
                
                resultDiv.innerHTML = `
                    <div class="validation-success">
                        <h3>✅ Valid Key</h3>
                        <p><strong>Content:</strong> "${result.data.customString}"</p>
                        <p><strong>Created:</strong> ${result.data.createdAt.toLocaleString()}</p>
                        <p><strong>Expires:</strong> ${result.data.expirationDate.toLocaleString()}</p>
                        <p><strong>Status:</strong> ${timeRemaining}</p>
                        <p><strong>Key Length:</strong> ${keyLength} characters</p>
                        <p><strong>Estimated Strength:</strong> ${estimatedBits} bits</p>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div class="validation-error">
                        <h3>❌ Invalid Key</h3>
                        <p>${result.reason || 'Key validation failed'}</p>
                    </div>
                `;
            }
        } catch (error) {
            resultDiv.innerHTML = `
                <div class="validation-error">
                    <h3>❌ Validation Error</h3>
                    <p>Failed to validate key: ${(error as Error).message}</p>
                </div>
            `;
        }
    }

    private async updateKeysList(): Promise<void> {
        const keysList = document.getElementById('keys-list') as HTMLDivElement;
        const keysCount = document.getElementById('keys-count') as HTMLSpanElement;
        
        keysCount.textContent = `(${this.storedKeys.length})`;

        if (this.storedKeys.length === 0) {
            keysList.innerHTML = '<p class="no-keys">No keys created yet</p>';
            return;
        }

        const keyItemsHTML = await Promise.all(this.storedKeys.map(async (item: StoredKey) => {
            const now = new Date();
            const isExpired = item.data.expirationDate <= now;
            const statusClass = isExpired ? 'expired' : 'valid';
            const keyLength = item.key.length;
            
            return `
                <div class="key-item ${statusClass}">
                    <div class="key-header">
                        <span class="key-status">${isExpired ? '❌' : '✅'}</span>
                        <span class="key-string">${item.nickname ? `"${item.nickname}"` : `"${item.data.customString}"`}</span>
                        <div class="key-actions">
                            <button class="copy-btn" data-key="${item.key}">📋 Copy</button>
                            <button class="delete-btn" data-id="${item.id}">🗑️ Delete</button>
                        </div>
                    </div>
                    <div class="key-details">
                        <div class="key-info">
                            ${item.nickname ? `<span>Content: "${item.data.customString}"</span>` : ''}
                            <span>Expires: ${item.data.expirationDate.toLocaleString()}</span>
                            <span>Length: ${keyLength} chars</span>
                            <span>${this.getTimeRemaining(item.data.expirationDate)}</span>
                        </div>
                        <div class="key-value">
                            <code>${item.key}</code>
                        </div>
                    </div>
                </div>
            `;
        }));

        keysList.innerHTML = keyItemsHTML.join('');
        this.attachKeyListEventHandlers();
    }

    private attachKeyListEventHandlers(): void {
        const keysList = document.getElementById('keys-list') as HTMLDivElement;
        
        const newKeysList = keysList.cloneNode(true) as HTMLDivElement;
        keysList.parentNode?.replaceChild(newKeysList, keysList);
        
        newKeysList.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement;
            
            if (target.classList.contains('copy-btn')) {
                e.preventDefault();
                const key = target.dataset['key'];
                if (key) {
                    try {
                        const textArea = document.createElement('textarea');
                        textArea.value = key;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-999999px';
                        textArea.style.top = '-999999px';
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        
                        target.textContent = '✅ Copied!';
                        void void setTimeout(() => {
                            target.textContent = '📋 Copy';
                        }, 2000);
                    } catch (error) {
                        console.error('Copy failed:', error);
                        this.showError('Failed to copy key');
                    }
                }
            }
            
            if (target.classList.contains('delete-btn')) {
                e.preventDefault();
                const keyId = target.dataset['id'];
                if (keyId && confirm('Are you sure you want to delete this key?')) {
                    if (await KeyStorage.deleteKey(keyId)) {
                        await this.loadStoredKeys();
                        await this.updateKeysList();
                        await this.updateStorageStats();
                        this.showSuccess('Key deleted successfully');
                    } else {
                        this.showError('Failed to delete key');
                    }
                }
            }
        });
    }

    private getTimeRemaining(expirationDate: Date): string {
        const now = new Date();
        const diff = expirationDate.getTime() - now.getTime();

        if (diff <= 0) {
            return 'Expired';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days}d ${hours}h remaining`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        } else {
            return `${minutes}m remaining`;
        }
    }

    private showSuccess(message: string): void {
        this.showMessage(message, 'success');
    }

    private showError(message: string): void {
        this.showMessage(message, 'error');
    }

    private showMessage(message: string, type: 'success' | 'error'): void {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        void void setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        void void setTimeout(() => {
            toast.classList.remove('show');
            void void setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    private async cleanupExpiredKeys(): Promise<void> {
        const removedCount = await KeyStorage.cleanupExpiredKeys();
        if (removedCount > 0) {
            await this.loadStoredKeys();
            await this.updateKeysList();
            await this.updateStorageStats();
            this.showSuccess(`Removed ${removedCount} expired key${removedCount > 1 ? 's' : ''}`);
        } else {
            this.showSuccess('No expired keys to remove');
        }
    }

    private async exportKeys(): Promise<void> {
        try {
            const exportData = await KeyStorage.exportKeys();
            const filename = `expert-keys-${new Date().toISOString().split('T')[0]}.json`;
            
            // Parse and re-stringify to ensure it's valid JSON for the centralized service
            const parsedData = JSON.parse(exportData);
            await FileDownloadService.downloadJson(parsedData, filename, 'Expert Keys Export');
            
            this.showSuccess('Keys exported successfully');
        } catch (error) {
            this.showError('Failed to export keys: ' + (error as Error).message);
        }
    }

    private importKeys(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const result = await KeyStorage.importKeys(text);
                
                if (result.success) {
                    await this.loadStoredKeys();
                    await this.updateKeysList();
                    await this.updateStorageStats();
                    
                    let message = `Imported ${result.imported} key${result.imported > 1 ? 's' : ''}`;
                    if (result.errors.length > 0) {
                        message += ` (${result.errors.length} error${result.errors.length > 1 ? 's' : ''})`;
                    }
                    this.showSuccess(message);
                } else {
                    this.showError('Import failed: ' + result.errors.join(', '));
                }
            } catch (error) {
                this.showError('Failed to read file: ' + (error as Error).message);
            }
        });
        
        input.click();
    }

    private async updateStorageStats(): Promise<void> {
        const statsContainer = document.getElementById('storage-stats');
        if (!statsContainer) return;
        
        const stats = await KeyStorage.getStorageStats();
        
        statsContainer.innerHTML = `
            <div style="background: #f0fff4; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #22543d;">${stats.totalKeys}</div>
                <div style="font-size: 0.8rem; color: #68d391;">Total Keys</div>
            </div>
            <div style="background: #f0f9ff; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #1e40af;">${stats.validKeys}</div>
                <div style="font-size: 0.8rem; color: #60a5fa;">Valid Keys</div>
            </div>
            <div style="background: #fef3c7; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #d97706;">${stats.expiredKeys}</div>
                <div style="font-size: 0.8rem; color: #fbbf24;">Expired Keys</div>
            </div>
            <div style="background: #f3f4f6; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #4b5563;">${(stats.storageSize / 1024).toFixed(1)}KB</div>
                <div style="font-size: 0.8rem; color: #6b7280;">Storage Used</div>
            </div>
        `;
    }

    private debugStorage(): void {
        console.log('🐛 Debug Storage called');
        
        try {
            console.log('Domain:', window.location.hostname);
            console.log('Path:', window.location.pathname);
            console.log('IndexedDB available:', typeof indexedDB !== 'undefined');
            
            KeyStorage.loadKeys().then(keys => {
                console.log('Loaded keys from StorageService:', keys.length);
                console.log('Keys:', keys);
                
                const info = [
                    `Domain: ${window.location.hostname}`,
                    `IndexedDB: ${typeof indexedDB !== 'undefined' ? 'Available' : 'NOT Available'}`,
                    `StorageService: Working`,
                    `Current keys: ${keys.length}`,
                    `Storage: IndexedDB (Expert app storage)`,
                    `\nCheck browser console for detailed logs`
                ].join('\n');
                
                alert('🐛 Storage Debug Info:\n\n' + info);
            }).catch(error => {
                console.error('StorageService test failed:', error);
                alert('🐛 Debug Error:\n\n' + error.message);
            });
            
        } catch (error) {
            console.error('Debug failed:', error);
            alert('🐛 Debug Error:\n\n' + (error as Error).message);
        }
    }
} 