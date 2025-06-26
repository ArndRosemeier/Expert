/**
 * Storage Service - IndexedDB-only storage service for the Expert application.
 * Provides virtually unlimited storage capacity with ACID transactions.
 */

import { IndexedDBService, IDBDatabaseConfig } from './IndexedDBService';

export interface IStorageService {
  // Generic operations
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  
  // Bulk operations
  getAll<T>(prefix?: string): Promise<Record<string, T>>;
  clear(): Promise<void>;
  
  // Storage info
  getUsage(): Promise<{quota: number, usage: number}>;
  isIndexedDB(): boolean;
}

class IndexedDBStorageService implements IStorageService {
  private indexedDBService: IndexedDBService;
  private storeName = 'keyValue';

  constructor(indexedDBService: IndexedDBService) {
    this.indexedDBService = indexedDBService;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await this.indexedDBService.get<{ key: string; value: T }>(this.storeName, key);
      return result?.value;
    } catch (error) {
      console.error('IndexedDB get error:', error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.indexedDBService.set(this.storeName, key, { key, value });
    } catch (error) {
      console.error('IndexedDB set error:', error);
      throw new Error(`Failed to save to IndexedDB: ${error}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.indexedDBService.delete(this.storeName, key);
    } catch (error) {
      console.error('IndexedDB delete error:', error);
    }
  }

  async getAll<T>(prefix?: string): Promise<Record<string, T>> {
    const result: Record<string, T> = {};
    
    try {
      const allItems = await this.indexedDBService.getAll<{ key: string; value: T }>(this.storeName);
      for (const item of allItems) {
        if (!prefix || item.key.startsWith(prefix)) {
          result[item.key] = item.value;
        }
      }
    } catch (error) {
      console.error('IndexedDB getAll error:', error);
    }
    
    return result;
  }

  async clear(): Promise<void> {
    try {
      await this.indexedDBService.clear(this.storeName);
    } catch (error) {
      console.error('IndexedDB clear error:', error);
    }
  }

  async getUsage(): Promise<{quota: number, usage: number}> {
    try {
      return await this.indexedDBService.getStorageEstimate();
    } catch (error) {
      console.error('Error getting IndexedDB usage:', error);
      return { quota: 0, usage: 0 };
    }
  }

  isIndexedDB(): boolean {
    return true;
  }
}

/**
 * Storage Service Factory - Creates the appropriate storage service
 * based on browser capabilities and availability
 */
export class StorageService {
  private static instance: IStorageService | null = null;
  private static initPromise: Promise<IStorageService> | null = null;

  /**
   * Get the singleton storage service instance
   */
  static async getInstance(): Promise<IStorageService> {
    if (StorageService.instance) {
      return StorageService.instance;
    }

    if (StorageService.initPromise) {
      return StorageService.initPromise;
    }

    StorageService.initPromise = StorageService.createStorageService();
    StorageService.instance = await StorageService.initPromise;
    StorageService.initPromise = null;

    return StorageService.instance;
  }

  /**
   * Create the IndexedDB storage service
   */
  private static async createStorageService(): Promise<IStorageService> {
    // Check if IndexedDB is available
    if (!StorageService.isIndexedDBSupported()) {
      throw new Error('IndexedDB is not supported in this browser. This application requires IndexedDB for data storage.');
    }

    // Configure IndexedDB with the database schema
    const dbConfig: IDBDatabaseConfig = {
      name: 'ExpertAppDB',
      version: 3, // Increment version to force schema upgrade
      stores: [
        {
          name: 'keyValue',
          keyPath: 'key'
        },
        {
          name: 'projects',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-lastModified',
              keyPath: 'lastModified'
            },
            {
              name: 'by-template',
              keyPath: 'templateName'
            }
          ]
        },
        {
          name: 'aiLogs',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-timestamp',
              keyPath: 'timestamp'
            },
            {
              name: 'by-purpose',
              keyPath: 'purpose'
            }
          ]
        }
      ]
    };

    let indexedDBService = new IndexedDBService(dbConfig);
    
    try {
      await indexedDBService.initialize();
    } catch (initError) {
      console.warn('IndexedDB initialization failed, attempting database reset:', initError);
      
      // Close any existing connection
      indexedDBService.close();
      
      // Delete the database and try again
      await StorageService.deleteDatabase(dbConfig.name);
      
      // Create new service and try again
      indexedDBService = new IndexedDBService(dbConfig);
      await indexedDBService.initialize();
    }

            // IndexedDB initialized successfully
    return new IndexedDBStorageService(indexedDBService);
  }

  /**
   * Check if IndexedDB is supported in the current browser
   */
  private static isIndexedDBSupported(): boolean {
    return typeof window !== 'undefined' && 
           'indexedDB' in window && 
           window.indexedDB !== null;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  static reset(): void {
    StorageService.instance = null;
    StorageService.initPromise = null;
  }

  /**
   * Delete an IndexedDB database
   */
  private static deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(); // No IndexedDB support, nothing to delete
        return;
      }

      const deleteRequest = indexedDB.deleteDatabase(name);
      
      deleteRequest.onsuccess = () => {
                    // Database deleted successfully
        resolve();
      };
      
      deleteRequest.onerror = () => {
        console.error(`Failed to delete database '${name}':`, deleteRequest.error);
        reject(new Error(`Failed to delete database: ${deleteRequest.error?.message}`));
      };
      
      deleteRequest.onblocked = () => {
        console.warn(`Database deletion blocked. Close all tabs and try again.`);
        // Wait a bit and resolve anyway - the deletion will happen when other tabs close
        setTimeout(resolve, 1000);
      };
    });
  }

  /**
   * Get storage information without initializing the service
   */
  static async getStorageInfo(): Promise<{
    type: 'indexedDB';
    available: boolean;
    quota?: number;
    usage?: number;
  }> {
    if (StorageService.isIndexedDBSupported()) {
      try {
        const service = await StorageService.getInstance();
        const usage = await service.getUsage();
        return {
          type: 'indexedDB',
          available: true,
          quota: usage.quota,
          usage: usage.usage
        };
      } catch (error) {
        return {
          type: 'indexedDB',
          available: false
        };
      }
    } else {
      return {
        type: 'indexedDB',
        available: false
      };
    }
  }
} 