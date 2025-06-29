/**
 * Simple key cryptography utilities
 * Uses XOR encryption for demo purposes
 */
export class KeyCrypto {
    static async encryptData(data: any, password: string): Promise<string> {
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(JSON.stringify(data));
        const passwordBytes = encoder.encode(password);
        
        // XOR encryption
        const encrypted = new Uint8Array(dataBytes.length);
        for (let i = 0; i < dataBytes.length; i++) {
            encrypted[i] = dataBytes[i]! ^ passwordBytes[i % passwordBytes.length]!;
        }
        
        return btoa(String.fromCharCode(...encrypted));
    }
    
    static async decryptData(encryptedData: string, password: string): Promise<any> {
        try {
            const encrypted = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
            const passwordBytes = new TextEncoder().encode(password);
            
            const decrypted = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) {
                decrypted[i] = encrypted[i]! ^ passwordBytes[i % passwordBytes.length]!;
            }
            
            const jsonString = new TextDecoder().decode(decrypted);
            return JSON.parse(jsonString);
                } catch (error) {
            throw new Error('Decryption failed');
        }
    }
} 