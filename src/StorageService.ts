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

  // RPG Lite-specific operations
  saveRPGLiteSession<T>(session: T): Promise<void>;
  loadRPGLiteSession<T>(sessionId: string): Promise<T | null>;
  deleteRPGLiteSession(sessionId: string): Promise<void>;
  listRPGLiteSessions<T>(): Promise<T[]>;

  saveRPGLiteStartPreset<T>(preset: T): Promise<void>;
  loadRPGLiteStartPreset<T>(presetId: string): Promise<T | null>;
  deleteRPGLiteStartPreset(presetId: string): Promise<void>;
  listRPGLiteStartPresets<T>(): Promise<T[]>;

  saveRPGLiteActionButton<T>(button: T): Promise<void>;
  loadRPGLiteActionButton<T>(buttonId: string): Promise<T | null>;
  deleteRPGLiteActionButton(buttonId: string): Promise<void>;
  listRPGLiteActionButtons<T>(): Promise<T[]>;

  // Persistent World RPG operations
  saveWorldRpgWorld<T>(world: T): Promise<void>;
  loadWorldRpgWorld<T>(worldId: string): Promise<T | null>;
  deleteWorldRpgWorld(worldId: string): Promise<void>;
  listWorldRpgWorlds<T>(): Promise<T[]>;

  saveWorldRpgAdventure<T>(adventure: T): Promise<void>;
  loadWorldRpgAdventure<T>(adventureId: string): Promise<T | null>;
  deleteWorldRpgAdventure(adventureId: string): Promise<void>;
  listWorldRpgAdventures<T>(): Promise<T[]>;
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
      return session ?? null;
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
      return snapshot ?? null;
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

  // ========================================
  // RPG Lite-specific methods
  // ========================================

  async saveRPGLiteSession<T>(session: T): Promise<void> {
    try {
      const sessionWithId = session as { id: string };
      await this.indexedDBService.set('rpg_lite_sessions', sessionWithId.id, session);
    } catch (error) {
      console.error('Failed to save RPG Lite session:', error);
      throw new Error(`Failed to save RPG Lite session: ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadRPGLiteSession<T>(sessionId: string): Promise<T | null> {
    try {
      const session = await this.indexedDBService.get<T>('rpg_lite_sessions', sessionId);
      return session ?? null;
    } catch (error) {
      console.error('Failed to load RPG Lite session:', error);
      throw new Error(`Failed to load RPG Lite session: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteRPGLiteSession(sessionId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('rpg_lite_sessions', sessionId);
    } catch (error) {
      console.error('Failed to delete RPG Lite session:', error);
      throw new Error(`Failed to delete RPG Lite session: ${error instanceof Error ? error.message : error}`);
    }
  }

  async listRPGLiteSessions<T>(): Promise<T[]> {
    try {
      return await this.indexedDBService.getAll<T>('rpg_lite_sessions');
    } catch (error) {
      console.error('Failed to list RPG Lite sessions:', error);
      throw new Error(`Failed to list RPG Lite sessions: ${error instanceof Error ? error.message : error}`);
    }
  }

  async saveRPGLiteStartPreset<T>(preset: T): Promise<void> {
    try {
      const presetWithId = preset as { id: string };
      await this.indexedDBService.set('rpg_lite_start_presets', presetWithId.id, preset);
    } catch (error) {
      console.error('Failed to save RPG Lite start preset:', error);
      throw new Error(`Failed to save RPG Lite start preset: ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadRPGLiteStartPreset<T>(presetId: string): Promise<T | null> {
    try {
      const preset = await this.indexedDBService.get<T>('rpg_lite_start_presets', presetId);
      return preset ?? null;
    } catch (error) {
      console.error('Failed to load RPG Lite start preset:', error);
      throw new Error(`Failed to load RPG Lite start preset: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteRPGLiteStartPreset(presetId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('rpg_lite_start_presets', presetId);
    } catch (error) {
      console.error('Failed to delete RPG Lite start preset:', error);
      throw new Error(`Failed to delete RPG Lite start preset: ${error instanceof Error ? error.message : error}`);
    }
  }

  async listRPGLiteStartPresets<T>(): Promise<T[]> {
    try {
      return await this.indexedDBService.getAll<T>('rpg_lite_start_presets');
    } catch (error) {
      console.error('Failed to list RPG Lite start presets:', error);
      throw new Error(`Failed to list RPG Lite start presets: ${error instanceof Error ? error.message : error}`);
    }
  }

  async saveRPGLiteActionButton<T>(button: T): Promise<void> {
    try {
      const buttonWithId = button as { id: string };
      await this.indexedDBService.set('rpg_lite_action_buttons', buttonWithId.id, button);
    } catch (error) {
      console.error('Failed to save RPG Lite action button:', error);
      throw new Error(`Failed to save RPG Lite action button: ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadRPGLiteActionButton<T>(buttonId: string): Promise<T | null> {
    try {
      const button = await this.indexedDBService.get<T>('rpg_lite_action_buttons', buttonId);
      return button ?? null;
    } catch (error) {
      console.error('Failed to load RPG Lite action button:', error);
      throw new Error(`Failed to load RPG Lite action button: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteRPGLiteActionButton(buttonId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('rpg_lite_action_buttons', buttonId);
    } catch (error) {
      console.error('Failed to delete RPG Lite action button:', error);
      throw new Error(`Failed to delete RPG Lite action button: ${error instanceof Error ? error.message : error}`);
    }
  }

  async listRPGLiteActionButtons<T>(): Promise<T[]> {
    try {
      const buttons = await this.indexedDBService.getAll<T>('rpg_lite_action_buttons');
      // Sort by order field if present
      return buttons.sort((a, b) => {
        const orderA = (a as { order?: number }).order ?? 0;
        const orderB = (b as { order?: number }).order ?? 0;
        return orderA - orderB;
      });
    } catch (error) {
      console.error('Failed to list RPG Lite action buttons:', error);
      throw new Error(`Failed to list RPG Lite action buttons: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ========================================
  // Persistent World RPG methods
  // ========================================

  async saveWorldRpgWorld<T>(world: T): Promise<void> {
    try {
      const worldWithId = world as { id: string };
      await this.indexedDBService.set('world_rpg_worlds', worldWithId.id, world);
    } catch (error) {
      console.error('Failed to save World RPG world:', error);
      throw new Error(`Failed to save World RPG world: ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadWorldRpgWorld<T>(worldId: string): Promise<T | null> {
    try {
      const world = await this.indexedDBService.get<T>('world_rpg_worlds', worldId);
      return world ?? null;
    } catch (error) {
      console.error('Failed to load World RPG world:', error);
      throw new Error(`Failed to load World RPG world: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteWorldRpgWorld(worldId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('world_rpg_worlds', worldId);
    } catch (error) {
      console.error('Failed to delete World RPG world:', error);
      throw new Error(`Failed to delete World RPG world: ${error instanceof Error ? error.message : error}`);
    }
  }

  async listWorldRpgWorlds<T>(): Promise<T[]> {
    try {
      return await this.indexedDBService.getAll<T>('world_rpg_worlds');
    } catch (error) {
      console.error('Failed to list World RPG worlds:', error);
      throw new Error(`Failed to list World RPG worlds: ${error instanceof Error ? error.message : error}`);
    }
  }

  async saveWorldRpgAdventure<T>(adventure: T): Promise<void> {
    try {
      const adventureWithId = adventure as { id: string };
      await this.indexedDBService.set('world_rpg_adventures', adventureWithId.id, adventure);
    } catch (error) {
      console.error('Failed to save World RPG adventure:', error);
      throw new Error(`Failed to save World RPG adventure: ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadWorldRpgAdventure<T>(adventureId: string): Promise<T | null> {
    try {
      const adventure = await this.indexedDBService.get<T>('world_rpg_adventures', adventureId);
      return adventure ?? null;
    } catch (error) {
      console.error('Failed to load World RPG adventure:', error);
      throw new Error(`Failed to load World RPG adventure: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteWorldRpgAdventure(adventureId: string): Promise<void> {
    try {
      await this.indexedDBService.delete('world_rpg_adventures', adventureId);
    } catch (error) {
      console.error('Failed to delete World RPG adventure:', error);
      throw new Error(`Failed to delete World RPG adventure: ${error instanceof Error ? error.message : error}`);
    }
  }

  async listWorldRpgAdventures<T>(): Promise<T[]> {
    try {
      return await this.indexedDBService.getAll<T>('world_rpg_adventures');
    } catch (error) {
      console.error('Failed to list World RPG adventures:', error);
      throw new Error(`Failed to list World RPG adventures: ${error instanceof Error ? error.message : error}`);
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
      version: 7, // Increment version to add Persistent World RPG stores
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
        },
        {
          name: 'rpg_lite_sessions',
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
          name: 'rpg_lite_start_presets',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-createdAt',
              keyPath: 'createdAt'
            }
          ]
        },
        {
          name: 'rpg_lite_action_buttons',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-order',
              keyPath: 'order'
            }
          ]
        },
        {
          name: 'world_rpg_worlds',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-updatedAt',
              keyPath: 'updatedAt'
            }
          ]
        },
        {
          name: 'world_rpg_adventures',
          keyPath: 'id',
          indexes: [
            {
              name: 'by-updatedAt',
              keyPath: 'updatedAt'
            }
          ]
        }
      ]
    };

    let indexedDBService = new IndexedDBService(dbConfig);
    
    try {
      await indexedDBService.initialize();
    } catch (initError) {
      console.error('IndexedDB initialization failed:', initError);
      
      // Close any existing connection
      indexedDBService.close();
      
      // Show error to user and ask what to do
      const errorMessage = initError instanceof Error ? initError.message : String(initError);
      const userWantsReset = confirm(
        `Database initialization failed: ${errorMessage}\n\n` +
        `This may be due to a database upgrade or corruption.\n\n` +
        `Do you want to RESET the database? This will DELETE ALL your data including:\n` +
        `- API key\n` +
        `- Projects\n` +
        `- RPG sessions\n` +
        `- Settings\n\n` +
        `Click OK to reset (data will be lost)\n` +
        `Click Cancel to keep trying (app may not work correctly)`
      );
      
      if (!userWantsReset) {
        throw new Error('Database initialization failed and user declined reset. Application may not function correctly.');
      }
      
      console.warn('User confirmed database reset. Deleting database...');
      
      // Delete the database and try again
      await StorageService.deleteDatabase(dbConfig.name);
      
      // Create new service and try again
      indexedDBService = new IndexedDBService(dbConfig);
      await indexedDBService.initialize();
      
      alert('Database has been reset. You will need to re-configure your settings.');
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