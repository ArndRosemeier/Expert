import { type KeyData } from './KeyManager.js';
import { StorageService } from '../StorageService.js';

export interface StoredKey {
    key: string;
    data: KeyData;
    id: string;
    nickname?: string;
}

export class KeyStorage {
    private static readonly STORAGE_KEY = 'expert_generated_keys';
    private static readonly MAX_KEYS = 100; // Prevent unlimited storage growth

    /**
     * Test localStorage functionality and log debug info
     */
    static testLocalStorage(): { working: boolean; info: string } {
        try {
            console.log('🔍 Testing localStorage...');
            console.log('Current domain:', window.location.hostname);
            console.log('Current path:', window.location.pathname);
            
            // Test if localStorage exists and is accessible
            if (typeof(Storage) === "undefined") {
                return { working: false, info: 'localStorage not supported by browser' };
            }

            // Test write/read
            const testKey = 'expert_test_key';
            const testValue = JSON.stringify({ test: 'value', timestamp: Date.now() });
            
            localStorage.setItem(testKey, testValue);
            const readValue = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            
            console.log('Test write/read:', readValue === testValue ? 'SUCCESS' : 'FAILED');
            
            // Check current storage
            const currentData = localStorage.getItem(this.STORAGE_KEY);
            let keyCount = 0;
            if (currentData !== null) {
                try {
                    const parsed = JSON.parse(currentData);
                    keyCount = Array.isArray(parsed) ? parsed.length : 0;
                } catch (e) {
                    console.warn('Failed to parse stored data:', e);
                }
            }
            console.log('Current stored keys:', currentData ? keyCount + ' keys' : 'No keys');
            console.log('Raw storage data:', currentData);
            
            return { 
                working: readValue === testValue, 
                info: `localStorage working, current keys: ${keyCount}` 
            };
            
        } catch (error) {
            console.error('localStorage test failed:', error);
            return { working: false, info: `Error: ${(error as Error).message}` };
        }
    }

    /**
     * Save a generated key to IndexedDB storage
     */
    static async saveKey(key: string, data: KeyData, nickname?: string): Promise<string> {
        try {
            console.log('💾 Saving key to IndexedDB...', { keyLength: key.length, data, nickname });
            
            const storedKey: StoredKey = {
                key,
                data,
                id: this.generateId(),
                ...(nickname && { nickname })
            };

            console.log('💾 Created stored key object:', storedKey);

            const existingKeys = await this.loadKeys();
            console.log('💾 Existing keys loaded:', existingKeys.length);
            
            existingKeys.unshift(storedKey);

            // Limit storage to prevent growth
            if (existingKeys.length > this.MAX_KEYS) {
                existingKeys.splice(this.MAX_KEYS);
            }

            console.log('💾 About to save to StorageService with key:', this.STORAGE_KEY);
            console.log('💾 Data to save:', existingKeys);
            
            const storage = await StorageService.getInstance();
            await storage.set(this.STORAGE_KEY, existingKeys);
            
            // Verify it was saved
            const verification = await storage.get<StoredKey[]>(this.STORAGE_KEY);
            console.log('💾 Verification read back:', verification ? 'SUCCESS' : 'FAILED');
            
            return storedKey.id;
        } catch (error) {
            console.error('💾 Failed to save key:', error);
            throw new Error('Failed to save key to storage');
        }
    }

    /**
     * Load all stored keys from IndexedDB storage
     */
    static async loadKeys(): Promise<StoredKey[]> {
        try {
            console.log('📖 Loading keys from IndexedDB...');
            const storage = await StorageService.getInstance();
            const stored = await storage.get<StoredKey[]>(this.STORAGE_KEY);
            console.log('📖 Raw stored data:', stored);
            
            if (!stored) {
                console.log('📖 No stored data found, returning empty array');
                return [];
            }

            console.log('📖 Loaded keys:', stored.length, 'items');
            
            // Convert date strings back to Date objects (in case they were serialized as strings)
            const convertedKeys = stored.map(key => ({
                ...key,
                data: {
                    ...key.data,
                    expirationDate: new Date(key.data.expirationDate),
                    createdAt: new Date(key.data.createdAt)
                }
            }));
            
            console.log('📖 Converted keys:', convertedKeys);
            return convertedKeys;
        } catch (error) {
            console.error('📖 Failed to load keys from storage:', error);
            return [];
        }
    }

    /**
     * Delete a specific key by ID
     */
    static async deleteKey(id: string): Promise<boolean> {
        try {
            const keys = await this.loadKeys();
            const filteredKeys = keys.filter(key => key.id !== id);
            
            if (filteredKeys.length === keys.length) {
                return false; // Key not found
            }

            const storage = await StorageService.getInstance();
            await storage.set(this.STORAGE_KEY, filteredKeys);
            return true;
        } catch (error) {
            console.error('Failed to delete key:', error);
            return false;
        }
    }

    /**
     * Update key nickname
     */
    static async updateKeyNickname(id: string, nickname: string): Promise<boolean> {
        try {
            const keys = await this.loadKeys();
            const keyIndex = keys.findIndex(key => key.id === id);
            
            if (keyIndex === -1) {
                return false;
            }

            const key = keys[keyIndex];
            if (!key) {
                return false;
            }
            key.nickname = nickname;
            const storage = await StorageService.getInstance();
            await storage.set(this.STORAGE_KEY, keys);
            return true;
        } catch (error) {
            console.error('Failed to update key nickname:', error);
            return false;
        }
    }

    /**
     * Clear all stored keys
     */
    static async clearAllKeys(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            await storage.delete(this.STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear keys:', error);
        }
    }

    /**
     * Get storage statistics
     */
    static async getStorageStats(): Promise<{
        totalKeys: number;
        validKeys: number;
        expiredKeys: number;
        storageSize: number;
    }> {
        try {
            const keys = await this.loadKeys();
            const now = new Date();
            
            const validKeys = keys.filter(key => new Date(key.data.expirationDate) > now);
            const expiredKeys = keys.filter(key => new Date(key.data.expirationDate) <= now);
            
            // For IndexedDB, we'll estimate storage size based on serialized data
            const estimatedSize = new Blob([JSON.stringify(keys)]).size;

            return {
                totalKeys: keys.length,
                validKeys: validKeys.length,
                expiredKeys: expiredKeys.length,
                storageSize: estimatedSize
            };
        } catch (error) {
            console.error('Failed to get storage stats:', error);
            return {
                totalKeys: 0,
                validKeys: 0,
                expiredKeys: 0,
                storageSize: 0
            };
        }
    }

    /**
     * Clean up expired keys
     */
    static async cleanupExpiredKeys(): Promise<number> {
        try {
            const keys = await this.loadKeys();
            const now = new Date();
            const validKeys = keys.filter(key => new Date(key.data.expirationDate) > now);
            const removedCount = keys.length - validKeys.length;

            if (removedCount > 0) {
                const storage = await StorageService.getInstance();
                await storage.set(this.STORAGE_KEY, validKeys);
            }

            return removedCount;
        } catch (error) {
            console.error('Failed to cleanup expired keys:', error);
            return 0;
        }
    }

    /**
     * Generate a unique ID for a key
     */
    private static generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Export keys as JSON
     */
    static async exportKeys(): Promise<string> {
        const keys = await this.loadKeys();
        return JSON.stringify(keys, null, 2);
    }

    /**
     * Import keys from JSON
     */
    static async importKeys(jsonData: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
        try {
            const importedKeys = JSON.parse(jsonData) as StoredKey[];
            const errors: string[] = [];
            let imported = 0;

            const existingKeys = await this.loadKeys();
            
            for (const importedKey of importedKeys) {
                try {
                    // Validate key structure
                    if (!importedKey.key || !importedKey.data || !importedKey.id) {
                        errors.push(`Invalid key structure: ${importedKey.id || 'unknown'}`);
                        continue;
                    }

                    // Check for duplicates
                    const duplicate = existingKeys.find(existing => existing.key === importedKey.key);
                    if (duplicate) {
                        errors.push(`Duplicate key skipped: ${importedKey.nickname ?? importedKey.id}`);
                        continue;
                    }

                    // Convert dates
                    importedKey.data.expirationDate = new Date(importedKey.data.expirationDate);
                    importedKey.data.createdAt = new Date(importedKey.data.createdAt);

                    existingKeys.push(importedKey);
                    imported++;
                } catch (keyError) {
                    errors.push(`Failed to import key ${importedKey.id || 'unknown'}: ${keyError}`);
                }
            }

            // Limit total keys
            if (existingKeys.length > this.MAX_KEYS) {
                existingKeys.splice(this.MAX_KEYS);
            }

            const storage = await StorageService.getInstance();
            await storage.set(this.STORAGE_KEY, existingKeys);

            return { success: true, imported, errors };
        } catch (error) {
            return { 
                success: false, 
                imported: 0, 
                errors: [`Failed to parse import data: ${error}`] 
            };
        }
    }
} 