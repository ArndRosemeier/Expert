import { StorageService } from '../StorageService.js';
import { KeyData } from './KeyManager.js';

export interface StoredAppKey {
    key: string;
    data: KeyData;
    storedAt: Date;
}

/**
 * Storage service for the app's valid key
 */
export class AppKeyStorage {
    private static readonly STORAGE_KEY = 'expert_app_key';
    
    static async saveAppKey(key: string, data: KeyData): Promise<void> {
        const storedKey: StoredAppKey = {
            key,
            data,
            storedAt: new Date()
        };
        
        const storage = await StorageService.getInstance();
        await storage.set(this.STORAGE_KEY, storedKey);
    }
    
    static async loadAppKey(): Promise<StoredAppKey | null> {
        try {
            const storage = await StorageService.getInstance();
            const storedKey = await storage.get<StoredAppKey>(this.STORAGE_KEY);
            
            if (!storedKey) {
                return null;
            }
            
            // Convert date strings back to Date objects
            return {
                ...storedKey,
                data: {
                    ...storedKey.data,
                    expirationDate: new Date(storedKey.data.expirationDate),
                    createdAt: new Date(storedKey.data.createdAt)
                },
                storedAt: new Date(storedKey.storedAt)
            };
        } catch (error) {
            console.warn('Failed to load app key:', error);
            return null;
        }
    }
    
    static async clearAppKey(): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.delete(this.STORAGE_KEY);
    }
    
    static async hasValidKey(): Promise<boolean> {
        const storedKey = await this.loadAppKey();
        if (!storedKey) {
            return false;
        }
        
        // Check if key is still valid (not expired)
        const now = new Date();
        return storedKey.data.expirationDate > now;
    }
} 