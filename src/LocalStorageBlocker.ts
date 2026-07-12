/**
 * LocalStorageBlocker - Prevents localStorage usage in the Expert application
 * 
 * ⚠️ IMPORTANT: localStorage is FORBIDDEN in this application!
 * 
 * WHY localStorage IS FORBIDDEN:
 * - Limited to ~5-10MB storage across entire domain
 * - Synchronous API blocks UI thread
 * - No structured data support
 * - No transactions or advanced querying
 * - Poor performance with large datasets
 * - Can be cleared by browser storage management
 * 
 * WHAT TO USE INSTEAD:
 * - Use StorageService (wraps IndexedDB) for ALL application data storage
 * - Import: import { StorageService } from './StorageService'
 * - Usage: const storage = await StorageService.getInstance()
 * - Store: await storage.set('key', data)
 * - Retrieve: await storage.get('key')
 * - Remove: await storage.delete('key')
 * 
 * EXCEPTIONS (only these are allowed):
 * - expert_generated_keys: App validation keys (security requirement)
 * - Temporary browser-specific flags (session data only)
 * 
 * This blocker serves as documentation and prevents accidental localStorage usage.
 */

export class LocalStorageForbiddenError extends Error {
    readonly forbiddenMethod: string;
    readonly forbiddenKey?: string;
    readonly suggestedSolution = 'Use StorageService instead of localStorage';

    constructor(message: string, forbiddenMethod: string, forbiddenKey?: string) {
        super(message);
        this.name = 'LocalStorageForbiddenError';
        this.forbiddenMethod = forbiddenMethod;
        if (forbiddenKey !== undefined) {
            this.forbiddenKey = forbiddenKey;
        }
    }
}

export interface LocalStorageBlockerConfig {
    /** Keys that are explicitly allowed to use localStorage */
    allowedKeys: string[];
    /** Whether to show detailed error messages */
    verbose: boolean;
    /** Whether to log all localStorage access attempts */
    logAttempts: boolean;
}

export class LocalStorageBlocker {
    private static instance: LocalStorageBlocker | null = null;
    private config: LocalStorageBlockerConfig;
    private originalLocalStorage: Storage;
    private isBlocked: boolean = false;

    private constructor(config: LocalStorageBlockerConfig) {
        this.config = config;
        // Store reference to original localStorage before we override it
        this.originalLocalStorage = window.localStorage;
    }

    /**
     * Initialize the localStorage blocker
     */
    public static initialize(config: Partial<LocalStorageBlockerConfig> = {}): LocalStorageBlocker {
        if (LocalStorageBlocker.instance) {
            return LocalStorageBlocker.instance;
        }

        const fullConfig: LocalStorageBlockerConfig = {
            allowedKeys: [
                'expert_generated_keys'  // App validation keys must use localStorage for security
            ],
            verbose: true,
            logAttempts: true,
            ...config
        };

        LocalStorageBlocker.instance = new LocalStorageBlocker(fullConfig);
        LocalStorageBlocker.instance.blockLocalStorage();
        

        
        return LocalStorageBlocker.instance;
    }

    /**
     * Block localStorage usage by overriding its methods
     */
    private blockLocalStorage(): void {
        if (this.isBlocked) return;

        const blocker = this;
        
        // Override localStorage methods to throw errors
        Object.defineProperty(window, 'localStorage', {
            get() {
                return {
                    // Override setItem to throw error or allow specific keys
                    setItem(key: string, value: string): void {
                        if (blocker.config.logAttempts) {
                            console.warn(`🚫 localStorage.setItem('${key}') attempted`);
                        }
                        
                        if (blocker.config.allowedKeys.includes(key)) {
                            // Allow specific keys
                            blocker.originalLocalStorage.setItem(key, value);
                            return;
                        }
                        
                        blocker.throwForbiddenError('setItem', key);
                    },

                    // Override getItem to throw error or allow specific keys
                    getItem(key: string): string | null {
                        if (blocker.config.logAttempts) {
                            console.warn(`🚫 localStorage.getItem('${key}') attempted`);
                        }
                        
                        if (blocker.config.allowedKeys.includes(key)) {
                            // Allow specific keys
                            return blocker.originalLocalStorage.getItem(key);
                        }
                        
                        blocker.throwForbiddenError('getItem', key);
                        return null; // Never reached
                    },

                    // Override removeItem to throw error or allow specific keys
                    removeItem(key: string): void {
                        if (blocker.config.logAttempts) {
                            console.warn(`🚫 localStorage.removeItem('${key}') attempted`);
                        }
                        
                        if (blocker.config.allowedKeys.includes(key)) {
                            // Allow specific keys
                            blocker.originalLocalStorage.removeItem(key);
                            return;
                        }
                        
                        blocker.throwForbiddenError('removeItem', key);
                    },

                    // Override clear to throw error
                    clear(): void {
                        if (blocker.config.logAttempts) {
                            console.warn('🚫 localStorage.clear() attempted');
                        }
                        blocker.throwForbiddenError('clear');
                    },

                    // Override key to throw error
                    key(index: number): string | null {
                        if (blocker.config.logAttempts) {
                            console.warn(`🚫 localStorage.key(${index}) attempted`);
                        }
                        blocker.throwForbiddenError('key');
                        return null; // Never reached
                    },

                    // Override length getter to throw error
                    get length(): number {
                        if (blocker.config.logAttempts) {
                            console.warn('🚫 localStorage.length accessed');
                        }
                        blocker.throwForbiddenError('length');
                        return 0; // Never reached
                    }
                };
            },
            configurable: false
        });

        this.isBlocked = true;
    }

    /**
     * Throws a helpful error when localStorage usage is attempted
     */
    private throwForbiddenError(method: string, key?: string): never {
        const keyInfo = key ? ` for key '${key}'` : '';
        
        let errorMessage = `🚫 FORBIDDEN: localStorage.${method}()${keyInfo} is not allowed in Expert application!\n\n`;
        
        if (this.config.verbose) {
            errorMessage += `❌ WHY localStorage IS FORBIDDEN:\n`;
            errorMessage += `   • Limited storage capacity (~5-10MB for entire domain)\n`;
            errorMessage += `   • Synchronous API blocks UI thread and causes performance issues\n`;
            errorMessage += `   • No structured data support or advanced querying\n`;
            errorMessage += `   • Can be cleared by browser storage management\n`;
            errorMessage += `   • No transaction support for data integrity\n\n`;
            
            errorMessage += `✅ USE THIS INSTEAD:\n`;
            errorMessage += `   import { StorageService } from './StorageService';\n`;
            errorMessage += `   \n`;
            errorMessage += `   // Get storage instance\n`;
            errorMessage += `   const storage = await StorageService.getInstance();\n`;
            errorMessage += `   \n`;
            errorMessage += `   // Store data\n`;
            errorMessage += `   await storage.set('your_key', yourData);\n`;
            errorMessage += `   \n`;
            errorMessage += `   // Retrieve data\n`;
            errorMessage += `   const data = await storage.get('your_key');\n`;
            errorMessage += `   \n`;
            errorMessage += `   // Remove data\n`;
            errorMessage += `   await storage.delete('your_key');\n\n`;
            
            errorMessage += `💡 BENEFITS OF StorageService:\n`;
            errorMessage += `   • Large storage capacity (hundreds of MB+)\n`;
            errorMessage += `   • Asynchronous API doesn't block UI\n`;
            errorMessage += `   • Structured data support with TypeScript types\n`;
            errorMessage += `   • Transaction support for data integrity\n`;
            errorMessage += `   • Better performance with large datasets\n`;
            errorMessage += `   • Consistent API across the entire application\n\n`;
            
            if (key) {
                let storageMethod = 'delete';
                if (method === 'getItem') {
                    storageMethod = 'get';
                } else if (method === 'setItem') {
                    storageMethod = 'set';
                }
                const storageArgs = method === 'setItem' ? ', data' : '';
                errorMessage += `🔧 FOR KEY '${key}' SPECIFICALLY:\n`;
                errorMessage += `   Replace: localStorage.${method}('${key}', ...)\n`;
                errorMessage += `   With: await storage.${storageMethod}('${key}'${storageArgs})\n\n`;
            }
            
            errorMessage += `📚 DOCUMENTATION:\n`;
            errorMessage += `   See StorageService.ts for complete API documentation\n`;
            errorMessage += `   All existing localStorage usage has been migrated to StorageService\n`;
        }
        
        throw new LocalStorageForbiddenError(errorMessage, method, key);
    }

    /**
     * Temporarily allow localStorage access for specific operations
     * USE WITH EXTREME CAUTION - only for legitimate exceptions
     */
    public static withLocalStorageAccess<T>(
        operation: (localStorage: Storage) => T,
        reason: string
    ): T {
        if (!LocalStorageBlocker.instance) {
            throw new Error('LocalStorageBlocker not initialized');
        }
        
        console.warn(`⚠️ Temporarily allowing localStorage access: ${reason}`);
        
        try {
            return operation(LocalStorageBlocker.instance.originalLocalStorage);
        } finally {
            console.warn(`✅ localStorage access completed: ${reason}`);
        }
    }

    /**
     * Check if a key is in the allowed list
     */
    public static isKeyAllowed(key: string): boolean {
        return LocalStorageBlocker.instance?.config.allowedKeys.includes(key) ?? false;
    }

    /**
     * Get current configuration
     */
    public static getConfig(): LocalStorageBlockerConfig | null {
        return LocalStorageBlocker.instance?.config ?? null;
    }
} 