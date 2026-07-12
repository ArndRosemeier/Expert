import { KeyManager, type KeyData } from './KeyManager.js';
import { AppKeyStorage } from './AppKeyStorage.js';
import { KeyValidationModal } from '../ui/modals/KeyValidationModal.js';

/**
 * Service to handle application key validation at startup
 */
export class AppKeyService {
    private static readonly APP_PASSWORD = 'ExperT';
    private static instance: AppKeyService | null = null;
    
    public static getInstance(): AppKeyService {
        this.instance ??= new AppKeyService();
        return this.instance;
    }
    
    /**
     * Check if app should start based on valid key
     * Returns true if app can start, false if key validation is needed
     */
    public async checkAppAccess(): Promise<boolean> {

        
        // Check if we have a stored valid key
        const hasValidKey = await AppKeyStorage.hasValidKey();
        if (hasValidKey) {

            return true;
        }
        
        console.log('❌ No valid key found, requesting key validation');
        
        // Show key validation modal
        await this.requestKeyValidation();
        return false; // Will be handled by modal callback
    }
    
    /**
     * Show the key validation modal and wait for valid key
     */
    private async requestKeyValidation(): Promise<void> {
        return new Promise((resolve) => {
            const modal = new KeyValidationModal();
            
            modal.setOnValidKeyCallback((keyData) => {
                console.log('✅ Key validated successfully:', keyData);
                resolve();
                // Trigger app startup
                void this.startApp();
            });
            
            void modal.open();
        });
    }
    
    /**
     * Validate a key manually
     */
    public async validateKey(key: string): Promise<{ valid: boolean; reason?: string; data?: KeyData }> {
        try {
            const result = KeyManager.validateKey(key, AppKeyService.APP_PASSWORD);
            
            if (result.valid && result.data) {
                // Store the valid key
                await AppKeyStorage.saveAppKey(key, result.data);
                console.log('🔑 Key stored successfully');
                return { valid: true, data: result.data };
            } else {
                return { valid: false, reason: result.reason ?? 'Unknown validation error' };
            }
        } catch (error) {
            return { valid: false, reason: (error as Error).message };
        }
    }
    
    /**
     * Get stored key information
     */
    public async getStoredKeyInfo(): Promise<{ hasKey: boolean; expirationDate?: Date; customString?: string }> {
        const storedKey = await AppKeyStorage.loadAppKey();
        
        if (!storedKey) {
            return { hasKey: false };
        }
        
        return {
            hasKey: true,
            expirationDate: storedKey.data.expirationDate,
            customString: storedKey.data.customString
        };
    }
    
    /**
     * Clear stored key (for logout/reset)
     */
    public async clearStoredKey(): Promise<void> {
        await AppKeyStorage.clearAppKey();
        console.log('🗑️ Stored key cleared');
    }
    
    /**
     * Start the main application by calling the global startup function
     */
    private async startApp(): Promise<void> {
        console.log('🚀 Triggering application startup after key validation...');
        
        // Call the main startup function that was defined in main.ts
        // We need to access it from the global window object
        if (window.startApplication) {
            await window.startApplication();
        } else {
            console.error('❌ startApplication function not found on window object');
            const { initialize } = await import('../event-handlers.js');
            const { setupEventListeners } = await import('../ui/project-ui.js');
            
            await initialize();
            void setupEventListeners();
        }
    }
} 