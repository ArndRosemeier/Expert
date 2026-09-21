import { StorageService } from './StorageService';
import { IndexedDBService } from './IndexedDBService';
import { ErrorLogEntry } from './types';
import { addLogEntry } from './logPersistence';

/**
 * Persists runtime errors to IndexedDB so that otherwise-silent failures
 * (unhandled promise rejections, uncaught errors, fire-and-forget mishaps)
 * become visible and exportable for later diagnosis.
 *
 * Logging is intentionally non-blocking: a failure to persist an entry is
 * reported to the console but never thrown, so the error logger can never
 * itself crash the application or recurse through the global error handlers.
 */
export class ErrorLogService {
    private static instance: ErrorLogService | null = null;
    private indexedDBService: IndexedDBService | null = null;
    private readonly storeName = 'errorLogs';

    private constructor() {}

    public static getInstance(): ErrorLogService {
        ErrorLogService.instance ??= new ErrorLogService();
        return ErrorLogService.instance;
    }

    /**
     * Resolve the underlying IndexedDB service. Called lazily so the first
     * captured error transparently initializes storage.
     */
    public async initialize(): Promise<void> {
        const storageService = await StorageService.getInstance();
        this.indexedDBService = storageService.getIndexedDBService();
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.indexedDBService) {
            await this.initialize();
        }
    }

    /**
     * Record a single error entry. Persistence failures are surfaced to the
     * console but swallowed afterwards to keep the logger non-blocking.
     *
     * Shared with AILogService via addLogEntry() in logPersistence.ts. The
     * `initInsideTry` and `logEntryOnFailure` options preserve this service's
     * two deliberate differences: initialization happens inside the try so a
     * storage failure can never escape the logger, and the lost entry is
     * included in the console output.
     */
    public async addLogEntry(entry: Omit<ErrorLogEntry, 'id'>): Promise<void> {
        await addLogEntry<ErrorLogEntry>(entry, this.indexedDBService!, async () => this.ensureInitialized(), {
            storeName: this.storeName,
            idPrefix: 'error-log',
            failureMessage: 'Failed to persist error log entry:',
            initInsideTry: true,
            logEntryOnFailure: true
        });
    }

    /**
     * Return all error entries, newest first.
     */
    public async getAllLogs(): Promise<ErrorLogEntry[]> {
        await this.ensureInitialized();
        const logs = await this.indexedDBService!.getAll<ErrorLogEntry>(this.storeName);
        return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    /**
     * Remove every stored error entry.
     */
    public async clearAllLogs(): Promise<void> {
        await this.ensureInitialized();
        await this.indexedDBService!.clear(this.storeName);
    }
}
