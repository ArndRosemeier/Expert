import { StorageService } from './StorageService';
import { IndexedDBService } from './IndexedDBService';
import { AILogEntry } from './types';
import { addLogEntry } from './logPersistence';

export class AILogService {
    private static instance: AILogService | null = null;
    private indexedDBService: IndexedDBService | null = null;
    private storeName = 'aiLogs';

    private constructor() {}

    public static getInstance(): AILogService {
        AILogService.instance ??= new AILogService();
        return AILogService.instance;
    }

    public async initialize(): Promise<void> {
        try {
            const storageService = await StorageService.getInstance();
            this.indexedDBService = storageService.getIndexedDBService();
            
            console.log('✅ AILogService initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize AILogService:', error);
            throw error;
        }
    }

    /**
     * Ensure the service is initialized before use
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.indexedDBService) {
            await this.initialize();
        }
        if (!this.indexedDBService) {
            throw new Error('Failed to initialize AILogService - IndexedDBService is not available');
        }
    }

    /**
     * Add a new AI log entry.
     *
     * Shared with ErrorLogService via addLogEntry() in logPersistence.ts. The
     * defaults there are this service's semantics: initialize before the write
     * (so an init failure propagates), and log only the error on failure.
     */
    public async addLogEntry(entry: Omit<AILogEntry, 'id'>): Promise<void> {
        await addLogEntry<AILogEntry>(entry, this.indexedDBService!, async () => this.ensureInitialized(), {
            storeName: this.storeName,
            idPrefix: 'ai-log',
            failureMessage: 'Failed to add AI log entry:'
        });
    }

    /**
     * Get all AI log entries, sorted by timestamp (newest first)
     */
    public async getAllLogs(): Promise<AILogEntry[]> {
        await this.ensureInitialized();

        try {
            const logs = await this.indexedDBService!.getAll<AILogEntry>(this.storeName);
            console.log(`📋 Retrieved ${logs.length} AI log entries from IndexedDB`);
            // Sort by timestamp descending (newest first)
            return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (error) {
            console.error('Failed to retrieve AI logs:', error);
            return [];
        }
    }

    /**
     * Clear all AI log entries
     */
    public async clearAllLogs(): Promise<void> {
        await this.ensureInitialized();

        try {
            await this.indexedDBService!.clear(this.storeName);
            console.log('🗑️ All AI logs cleared from IndexedDB');
        } catch (error) {
            console.error('Failed to clear AI logs:', error);
        }
    }

    /**
     * Get logs filtered by purpose
     */
    public async getLogsByPurpose(purpose: string): Promise<AILogEntry[]> {
        const allLogs = await this.getAllLogs();
        return allLogs.filter(log => log.purpose === purpose);
    }

    /**
     * Get recent logs (last N entries)
     */
    public async getRecentLogs(count: number = 50): Promise<AILogEntry[]> {
        const allLogs = await this.getAllLogs();
        return allLogs.slice(0, count);
    }
} 