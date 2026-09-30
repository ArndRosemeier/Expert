/**
 * Memoize an async loader by key, with a time-to-live and in-flight de-duplication.
 *
 * Built for OpenRouter metadata (the ~760 KB `/models` list and per-model
 * `/endpoints`), which used to be re-downloaded several times per chat request.
 *
 * Guarantees:
 *  - concurrent callers for the same key share ONE in-flight load;
 *  - a successful result is reused until `ttlMs` has passed;
 *  - a FAILED load is never cached (the next call retries);
 *  - `force: true` bypasses the cache and replaces the entry;
 *  - `clear()` drops everything (e.g. when the API key changes).
 */
export interface MemoizedAsync<K, V> {
    get(key: K, options?: { force?: boolean }): Promise<V>;
    clear(): void;
}

export function memoizeAsync<K, V>(
    loader: (key: K) => Promise<V>,
    ttlMs: number,
    now: () => number = Date.now
): MemoizedAsync<K, V> {
    const entries = new Map<K, { value: V; at: number }>();
    const inFlight = new Map<K, Promise<V>>();
    // Bumped by clear() so a load that started before it cannot repopulate the cache.
    let generation = 0;

    return {
        async get(key: K, options?: { force?: boolean }): Promise<V> {
            if (!options?.force) {
                const hit = entries.get(key);
                if (hit && now() - hit.at < ttlMs) return hit.value;
                const pending = inFlight.get(key);
                if (pending) return pending;
            }
            const startedIn = generation;
            const load = loader(key).then(
                value => {
                    if (startedIn === generation) entries.set(key, { value, at: now() });
                    return value;
                }
            ).finally(() => {
                if (inFlight.get(key) === load) inFlight.delete(key);
            });
            inFlight.set(key, load);
            return load;
        },
        clear(): void {
            generation++;
            entries.clear();
            inFlight.clear();
        }
    };
}

/**
 * Resolve to `promise`'s value, or to `fallback` if it rejects or takes longer than
 * `waitMs`. Never rejects. The underlying promise keeps running (so a shared,
 * cached download still completes and fills its cache for the next caller).
 */
export async function withFallback<T, F>(promise: Promise<T>, waitMs: number, fallback: F): Promise<T | F> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<F>(resolve => {
        timer = setTimeout(() => { resolve(fallback); }, waitMs);
    });
    try {
        return await Promise.race([promise.catch(() => fallback), timeout]);
    } finally {
        clearTimeout(timer);
    }
}
