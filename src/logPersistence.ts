/**
 * Shared log-entry persistence, used by AILogService and ErrorLogService.
 *
 * The two services were near-duplicates of each other: same singleton shape, same
 * lazy init, same add/getAll/clear. Their `addLogEntry` differed in exactly two
 * behaviours, and both are now parameters rather than forks:
 *
 *   1. WHEN the service is initialized.
 *      - `initInsideTry: false` (AILogService) - initialization errors PROPAGATE.
 *        A caller that cannot even reach storage should hear about it.
 *      - `initInsideTry: true`  (ErrorLogService) - initialization errors are
 *        SWALLOWED after logging. The error logger must never throw: it runs from
 *        global error handlers, so throwing would recurse or crash the app.
 *   2. WHAT is logged when persistence fails.
 *      - `logEntryOnFailure: false` - the error alone.
 *      - `logEntryOnFailure: true`  - the error plus the entry that was lost.
 *
 * Behaviour is deliberately identical to the code this replaced; the parameter
 * defaults are the AILogService behaviour for (1) and the plain message for (2).
 */

/** The fields a log entry needs beyond its generated id. */
export interface LogEntryLike {
    id: string;
}

/** The slice of IndexedDBService this helper needs. */
export interface LogStoreWriter {
    set(storeName: string, key: string, value: unknown): Promise<void>;
}

export interface AddLogEntryOptions {
    /** Store name, e.g. 'aiLogs'. */
    storeName: string;
    /** Id prefix, e.g. 'ai-log'. */
    idPrefix: string;
    /** Context passed to console.error when persistence fails. */
    failureMessage: string;
    /**
     * When false (default), `ensureInitialized` runs OUTSIDE the try block so
     * initialization failures reject. When true, it runs INSIDE the try and is
     * swallowed after logging.
     */
    initInsideTry?: boolean;
    /** When true, the lost entry is included in the console.error output. */
    logEntryOnFailure?: boolean;
}

/**
 * Build a unique log id: `<prefix>-<epoch ms>-<9 random base36 chars>`.
 *
 * Pure and deterministic apart from the clock and RNG, so it is unit-testable
 * without a database. Note: this keeps each service's own extraction style
 * (`substr` for AI, `slice` for error) because both produce the same 9-character
 * result and changing either would be an unrelated behaviour change.
 */
export function generateLogId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Persist one log entry, parameterized to preserve both services' semantics.
 *
 * Never throws on persistence failure (both originals swallowed it); whether an
 * *initialization* failure throws is the `initInsideTry` parameter's job.
 */
export async function addLogEntry<T extends LogEntryLike>(
    entry: Omit<T, 'id'>,
    store: LogStoreWriter,
    ensureInitialized: () => Promise<void>,
    options: AddLogEntryOptions
): Promise<void> {
    const logEntry = { ...entry, id: generateLogId(options.idPrefix) } as T;

    // AILogService semantics: initialize OUTSIDE the try, so an initialization
    // failure rejects the caller's promise rather than being swallowed.
    if (!options.initInsideTry) {
        await ensureInitialized();
    }

    try {
        // ErrorLogService semantics: initialize INSIDE the try, so a storage
        // failure is reported and swallowed - the error logger must never throw.
        if (options.initInsideTry) {
            await ensureInitialized();
        }
        await store.set(options.storeName, logEntry.id, logEntry);
    } catch (error) {
        if (options.logEntryOnFailure) {
            console.error(options.failureMessage, error, 'original entry:', logEntry);
        } else {
            console.error(options.failureMessage, error);
        }
    }
}
