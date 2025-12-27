/**
 * Storage Service - IndexedDB-only storage service for the Expert application.
 * Provides virtually unlimited storage capacity with ACID transactions.
 * 
 * ⚠️ IMPORTANT: localStorage is FORBIDDEN in this application!
 * The localStorage API has been overridden to throw errors when used.
 * ALWAYS use StorageService for all data storage needs.
 * 
 * Benefits over localStorage:
 * - Large storage capacity (hundreds of MB+) vs localStorage (~5-10MB)
 * - Asynchronous API that doesn't block UI thread
 * - Transaction support for data integrity
 * - Structured data support with TypeScript types
 * - Better performance with large datasets
 * 
 * Usage:
 * ```typescript
 * const storage = await StorageService.getInstance();
 * await storage.set('key', data);
 * const data = await storage.get('key');
 * await storage.delete('key');
 * ```
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
  
  // Advanced operations for exports
  getIndexedDBService?(): IndexedDBService;
  
  // RPG-specific operations
  saveRPGSession<T>(session: T): Promise<void>;
  loadRPGSession<T>(sessionId: string): Promise<T | null>;
  deleteRPGSession(sessionId: string): Promise<void>;
  listRPGSessions<T>(): Promise<T[]>;
  saveRPGSnapshot<T>(snapshot: T): Promise<void>;
  loadRPGSnapshot<T>(snapshotId: string): Promise<T | null>;
  deleteRPGSnapshot(snapshotId: string): Promise<void>;
  listRPGSnapshots<T>(): Promise<T[]>;
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
      throw new Error(`Failed to get data from storage: ${error instanceof Error ? error.message : error}`);
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
      throw new Error(`Failed to delete data from storage: ${error instanceof Error ? error.message : error}`);
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
      throw new Error(`Failed to get all data from storage: ${error instanceof Error ? error.message : error}`);
    }
    
    return result;
  }

  async clear(): Promise<void> {
    try {
      await this.indexedDBService.clear(this.storeName);
    } catch (error) {
      console.error('IndexedDB clear error:', error);
      throw new Error(`Failed to clear storage: ${error instanceof Error ? error.message : error}`);
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

  /**
   * Get the underlying IndexedDB service for advanced operations like complete data export
   * This method is used by the export service to access all stores directly
   */
  getIndexedDBService(): IndexedDBService {
    return this.indexedDBService;
  }

  // ========================================
  // RPG-specific methods
  // ========================================

  /**
   * Save an RPG game session
   */
  async saveRPGSession<T>(session: T): Promise<void> {
    try {
      const sessionWithId = session as { id: string };
      await this.indexedDBService.set('rpg_sessions', sessionWithId.id, session);
    } catch (error) {
      console.error('Failed to save RPG session:', error);
      throw new Error(`Failed to save RPG session: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Load an RPG game session by ID
   */
  async loadRPGSession<T>(sessionId: string): Promise<T | null> {
    try {
      const session = await this.indexedDBService.get<T>('rpg_sessions', sessionId);
      return session || null;
    } catch (error) {
      console.error('Failed to load RPG session:', error);
      throw new Error(`Failed to load RPG session: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Delete an RPG game session
   */
  async deleteRPGSession(sessionId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('rpg_sessions', sessionId);
    } catch (error) {
      console.error('Failed to delete RPG session:', error);
      throw new Error(`Failed to delete RPG session: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * List all RPG game sessions
   */
  async listRPGSessions<T>(): Promise<T[]> {
    try {
      return await this.indexedDBService.getAll<T>('rpg_sessions');
    } catch (error) {
      console.error('Failed to list RPG sessions:', error);
      throw new Error(`Failed to list RPG sessions: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Save an RPG snapshot
   */
  async saveRPGSnapshot<T>(snapshot: T): Promise<void> {
    try {
      const snapshotWithId = snapshot as { id: string };
      await this.indexedDBService.set('rpg_snapshots', snapshotWithId.id, snapshot);
    } catch (error) {
      console.error('Failed to save RPG snapshot:', error);
      throw new Error(`Failed to save RPG snapshot: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Load an RPG snapshot by ID
   */
  async loadRPGSnapshot<T>(snapshotId: string): Promise<T | null> {
    try {
      const snapshot = await this.indexedDBService.get<T>('rpg_snapshots', snapshotId);
      return snapshot || null;
    } catch (error) {
      console.error('Failed to load RPG snapshot:', error);
      throw new Error(`Failed to load RPG snapshot: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Delete an RPG snapshot
   */
  async deleteRPGSnapshot(snapshotId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('rpg_snapshots', snapshotId);
    } catch (error) {
      console.error('Failed to delete RPG snapshot:', error);
      throw new Error(`Failed to delete RPG snapshot: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * List all RPG snapshots (optionally filtered by session ID via tag or state inspection)
   */
  async listRPGSnapshots<T>(): Promise<T[]> {
    try {
      return await this.indexedDBService.getAll<T>('rpg_snapshots');
    } catch (error) {
      console.error('Failed to list RPG snapshots:', error);
      throw new Error(`Failed to list RPG snapshots: ${error instanceof Error ? error.message : error}`);
    }
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
      version: 4, // Increment version to add RPG stores
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
        },
        {
          name: 'rpg_sessions',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-createdAt',
              keyPath: 'createdAt'
            },
            {
              name: 'by-updatedAt',
              keyPath: 'updatedAt'
            }
          ]
        },
        {
          name: 'rpg_snapshots',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-timestamp',
              keyPath: 'timestamp'
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
  private static async deleteDatabase(name: string): Promise<void> {
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