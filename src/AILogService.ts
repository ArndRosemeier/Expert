import { StorageService } from './StorageService';
import { IndexedDBService } from './IndexedDBService';
import { AILogEntry } from './types';

export class AILogService {
    private static instance: AILogService | null = null;
    private indexedDBService: IndexedDBService | null = null;
    private storeName = 'aiLogs';

    private constructor() {}

    public static getInstance(): AILogService {
        if (!AILogService.instance) {
            AILogService.instance = new AILogService();
        }
        return AILogService.instance;
    }

    public async initialize(): Promise<void> {
        try {
            const storageService = await StorageService.getInstance();
            // Access the underlying IndexedDB service
            this.indexedDBService = (storageService as any).indexedDBService;
            
            if (!this.indexedDBService) {
                console.error('❌ Failed to get IndexedDBService from StorageService');
                throw new Error('IndexedDBService not available');
            }
            
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
     * Add a new AI log entry
     */
    public async addLogEntry(entry: Omit<AILogEntry, 'id'>): Promise<void> {
        await this.ensureInitialized();

        const logEntry: AILogEntry = {
            ...entry,
            id: `ai-log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        try {
            await this.indexedDBService!.set(this.storeName, logEntry.id, logEntry);
        } catch (error) {
            console.error('Failed to add AI log entry:', error);
        }
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