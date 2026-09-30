/**
 * Load-once async singleton, keyed.
 *
 * Built for OpenRouter metadata (the ~760 KB `/models` list and per-model
 * `/endpoints`), which used to be re-downloaded several times per chat request.
 *
 * Owner rule: the model list is fetched ONCE per page load. It changes rarely, and
 * refreshing it is trivial - a hard reload of the page. So there is deliberately no
 * TTL, no `force` and no invalidation.
 *
 * Guarantees:
 *  - concurrent callers for the same key share ONE in-flight load;
 *  - a successful result is kept for the lifetime of the page;
 *  - a FAILED load is not kept (the next call retries), so one bad network moment
 *    cannot leave the app without a catalog until reload.
 */
export interface LoadOnce<K, V> {
    get(key: K): Promise<V>;
}

export function loadOnce<K, V>(loader: (key: K) => Promise<V>): LoadOnce<K, V> {
    const loads = new Map<K, Promise<V>>();
    return {
        async get(key: K): Promise<V> {
            let load = loads.get(key);
            if (!load) {
                load = loader(key);
                loads.set(key, load);
                const settled = load;
                settled.catch(() => {
                    if (loads.get(key) === settled) loads.delete(key);
                });
            }
            return load;
        }
    };
}

/**
 * Resolve to `promise`'s value, or to `fallback` if it rejects or takes longer than
 * `waitMs`. Never rejects. The underlying promise keeps running (so a shared
 * download still completes and is kept for the next caller).
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
