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
        const storageService = await StorageService.getInstance();
        // Access the underlying IndexedDB service
        this.indexedDBService = (storageService as any).indexedDBService;
    }

    /**
     * Add a new AI log entry
     */
    public async addLogEntry(entry: Omit<AILogEntry, 'id'>): Promise<void> {
        if (!this.indexedDBService) {
            await this.initialize();
        }

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
        if (!this.indexedDBService) {
            await this.initialize();
        }

        try {
            const logs = await this.indexedDBService!.getAll<AILogEntry>(this.storeName);
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
        if (!this.indexedDBService) {
            await this.initialize();
        }

        try {
            await this.indexedDBService!.clear(this.storeName);
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