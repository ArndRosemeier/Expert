/**
 * IndexedDB Service - Provides a clean interface for IndexedDB operations
 * with proper error handling, transaction management, and database versioning.
 */

export interface IDBStoreConfig {
  name: string;
  keyPath?: string;
  autoIncrement?: boolean;
  indexes?: Array<{
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }>;
}

export interface IDBDatabaseConfig {
  name: string;
  version: number;
  stores: IDBStoreConfig[];
}

export class IndexedDBService {
  private db: IDBDatabase | null = null;
  private config: IDBDatabaseConfig;

  constructor(config: IDBDatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize the IndexedDB connection and create/upgrade database schema
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this browser'));
        return;
      }

      const request = indexedDB.open(this.config.name, this.config.version);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        
        // Handle unexpected version changes
        this.db.onversionchange = () => {
          this.db?.close();
          console.warn('IndexedDB version changed, please reload the page');
        };

        // Verify that all required stores exist
        const missingStores = this.config.stores.filter(
          storeConfig => !this.db!.objectStoreNames.contains(storeConfig.name)
        );

        if (missingStores.length > 0) {
          const storeNames = missingStores.map(s => s.name).join(', ');
          console.error(`Missing object stores: ${storeNames}. Database may need to be recreated.`);
          this.db.close();
          reject(new Error(`Missing object stores: ${storeNames}. Please clear browser data and try again.`));
          return;
        }

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        const newVersion = (event as IDBVersionChangeEvent).newVersion;
        
        console.log(`IndexedDB upgrade needed: ${oldVersion} -> ${newVersion}`);
        
        // Create object stores and indexes
        for (const storeConfig of this.config.stores) {
          let objectStore: IDBObjectStore;
          
          if (db.objectStoreNames.contains(storeConfig.name)) {
            console.log(`Store '${storeConfig.name}' already exists, skipping`);
            continue;
          }
          
          console.log(`Creating object store: ${storeConfig.name}`);
          objectStore = db.createObjectStore(storeConfig.name, {
            keyPath: storeConfig.keyPath,
            autoIncrement: storeConfig.autoIncrement
          });

          // Create indexes
          if (storeConfig.indexes) {
            for (const indexConfig of storeConfig.indexes) {
              console.log(`Creating index: ${indexConfig.name} on ${storeConfig.name}`);
              objectStore.createIndex(
                indexConfig.name,
                indexConfig.keyPath,
                indexConfig.options
              );
            }
          }
        }
        
        console.log('IndexedDB upgrade completed');
      };
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get a value from a specific object store
   */
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get data: ${request.error?.message}`));
      };
    });
  }

  /**
   * Set a value in a specific object store
   */
  async set<T>(storeName: string, key: string, value: T): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const data = store.keyPath ? { [store.keyPath as string]: key, ...value } : value;
      const request = store.put(data, store.keyPath ? undefined : key);

      // Wait for the transaction to complete, not just the request
      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to set data: ${transaction.error?.message}`));
      };

      request.onerror = () => {
        reject(new Error(`Failed to set data: ${request.error?.message}`));
      };
    });
  }

  /**
   * Delete a value from a specific object store
   */
  async delete(storeName: string, key: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete data: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get all values from a specific object store
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all data: ${request.error?.message}`));
      };
    });
  }

  /**
   * Clear all data from a specific object store
   */
  async clear(storeName: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to clear store: ${request.error?.message}`));
      };
    });
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async bulkSet<T>(storeName: string, items: Array<{ key: string; value: T }>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      

      const total = items.length;

      if (total === 0) {
        resolve();
        return;
      }

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Bulk operation failed: ${transaction.error?.message}`));
      };

      for (const item of items) {
        const data = store.keyPath 
          ? { [store.keyPath as string]: item.key, ...item.value }
          : item.value;
        const request = store.put(data, store.keyPath ? undefined : item.key);

        request.onerror = () => {
          reject(new Error(`Failed to set item ${item.key}: ${request.error?.message}`));
        };
      }
    });
  }

  /**
   * Get storage quota information
   */
  async getStorageEstimate(): Promise<{ quota: number; usage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        quota: estimate.quota || 0,
        usage: estimate.usage || 0
      };
    }
    
    return { quota: 0, usage: 0 };
  }

  /**
   * Check if the database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }
} 