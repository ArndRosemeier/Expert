/**
 * Ownership of one RPGLite narrator generation ("run").
 *
 * Why this exists: a run used to become abortable only once
 * OpenRouterClient.streamingChat() registered its operation id - but before that
 * the view awaited setup work (context building, model metadata). Pressing Stop in
 * that window found nothing to abort, the UI reset anyway, and the run carried on
 * and later rendered a reply. A Retry in the meantime produced a second run, so the
 * user saw two replies arrive together, and the stale run's completion also reset
 * the *new* run's streaming state.
 *
 * A run is now abortable from the moment it starts:
 *  - `signal` aborts when the run is stopped or superseded; pass it to streamingChat
 *    as the external abort signal so an operation registered *later* is still torn down;
 *  - `isCurrent()` lets every async resumption (after an await, in each streaming
 *    callback) check that it still owns the UI before touching state or the DOM.
 */
export interface StreamRun {
    readonly id: string;
    readonly signal: AbortSignal;
    /** True while this run is the active one and has not been stopped. */
    isCurrent(): boolean;
}

export class StreamRunTracker {
    private current: { run: StreamRun; controller: AbortController } | null = null;

    /** Start a new run. Any previous run is stopped (superseded). */
    start(id: string): StreamRun {
        this.stop();
        const controller = new AbortController();
        const run: StreamRun = {
            id,
            signal: controller.signal,
            isCurrent: () => this.current?.run === run && !controller.signal.aborted
        };
        this.current = { run, controller };
        return run;
    }

    /** Stop the active run, if any. Safe to call at any time, including mid-setup. */
    stop(): boolean {
        const cur = this.current;
        if (!cur) return false;
        this.current = null;
        cur.controller.abort();
        return true;
    }

    /** Mark `run` finished without aborting it. No-op if it is no longer current. */
    finish(run: StreamRun): void {
        if (this.current?.run === run) this.current = null;
    }

    get active(): StreamRun | null {
        return this.current?.run ?? null;
    }
}
