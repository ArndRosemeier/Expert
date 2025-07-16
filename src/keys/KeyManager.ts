import { KeyCrypto } from './KeyCrypto.js';

export interface KeyData {
    customString: string;
    expirationDate: Date;
    createdAt: Date;
    version: number;
}

export interface KeyValidationResult {
    valid: boolean;
    reason?: string;
    data?: KeyData;
}

interface KeyCreationResult {
    key: string;
    data: KeyData;
}

/**
 * Key management utilities for creating and validating keys
 */
export class KeyManager {
    static async createKey(expirationDate: Date, customString: string, password: string): Promise<KeyCreationResult> {
        const data: KeyData = {
            customString,
            expirationDate,
            createdAt: new Date(),
            version: 2
        };
        
        const encryptedData = await KeyCrypto.encryptData(data, password);
        const key = `EXPERT_KEY_V2_${encryptedData}`;
        
        return { key, data };
    }
    
    static async validateKey(key: string, password: string): Promise<KeyValidationResult> {
        try {
            if (!key.startsWith('EXPERT_KEY_V2_')) {
                return { valid: false, reason: 'Invalid key format' };
            }
            
            const encryptedData = key.replace('EXPERT_KEY_V2_', '');
            const data = await KeyCrypto.decryptData(encryptedData, password);
            
            // Convert date strings back to Date objects
            data.expirationDate = new Date(data.expirationDate);
            data.createdAt = new Date(data.createdAt);
            
            const now = new Date();
            if (data.expirationDate <= now) {
                return { valid: false, reason: 'Key has expired', data };
            }
            
            return { valid: true, data };
        } catch (error) {
            return { valid: false, reason: (error as Error).message };
        }
    }
    
    static generateRandomString(length: number = 12): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
} 