import { KeysUI } from './keys-ui.js';
import './keys.css';

// Initialize the keys system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    try {
        new KeysUI('keys-container');
        console.log('🔑 Key Management System initialized');
    } catch (error) {
        console.error('Failed to initialize Key Management System:', error);
        
        // Show error to user
        const container = document.getElementById('keys-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #e53e3e;">
                    <h2>❌ Failed to load Key Management System</h2>
                    <p>Please refresh the page or contact support.</p>
                    <pre style="color: #718096; margin-top: 1rem;">${error}</pre>
                </div>
            `;
        }
    }
});

/**
 * Key management system exports
 */

export { KeyCrypto } from './KeyCrypto.js';
export { KeyManager } from './KeyManager.js';
export { AppKeyStorage } from './AppKeyStorage.js';
export { AppKeyService } from './AppKeyService.js';

export type { 
    KeyData, 
    KeyValidationResult, 
    KeyCreationResult 
} from './KeyManager.js';

export type { 
    StoredAppKey 
} from './AppKeyStorage.js';

// Export for direct use
export { KeysUI } from './keys-ui.js';
export { KeyStorage } from './KeyStorage.js'; 