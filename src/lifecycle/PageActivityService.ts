import { EventEmitter } from '../EventEmitter';

/**
 * Events emitted by {@link PageActivityService}.
 *
 * - `hidden`  : the tab became hidden (Page Visibility `visibilitychange`).
 * - `visible` : the tab became visible again.
 * - `frozen`  : the browser froze the page (Page Lifecycle `freeze`); freezable
 *               tasks including timers and fetch callbacks are suspended.
 * - `resumed` : the browser unfroze the page (Page Lifecycle `resume`).
 */
type PageActivityEvents = {
    hidden: [];
    visible: [];
    frozen: [];
    resumed: [];
};

/**
 * Handle returned by {@link PageActivityService.beginActiveWork}. Callers MUST
 * call {@link ActiveWorkHandle.end} exactly once when their long-running work
 * finishes (typically in a `finally` block) so the screen wake lock is released
 * once no active work remains.
 */
export interface ActiveWorkHandle {
    /** Release this unit of active work. Idempotent: safe to call once. */
    end(): void;
}

/**
 * Central page-activity coordinator for long-running work (e.g. book/content
 * generation) in a browser tab.
 *
 * It provides three things:
 *  1. A ref-counted "active work" registry. While at least one unit of active
 *     work exists, the service holds a Screen Wake Lock so the display does not
 *     sleep mid-run (relevant when the tab is in the foreground but the user
 *     steps away). Wake locks are automatically released by the browser when
 *     the tab is hidden, so the service re-acquires one when the tab becomes
 *     visible again and work is still active.
 *  2. Page Visibility (`visibilitychange`) and Page Lifecycle (`freeze` /
 *     `resume`) events, re-emitted through a strongly-typed EventEmitter so
 *     consumers (e.g. stream stall detectors) can react without each wiring up
 *     their own document listeners.
 *  3. Simple state getters ({@link isHidden}, {@link hasActiveWork}).
 *
 * A single shared instance is exported as {@link pageActivityService}.
 */
export class PageActivityService extends EventEmitter<PageActivityEvents> {
    private activeWorkCount = 0;
    private wakeLock: WakeLockSentinel | null = null;

    constructor() {
        super();
        document.addEventListener('visibilitychange', () => { this.handleVisibilityChange(); });
        // `freeze` / `resume` are Page Lifecycle events (Chromium). Other engines
        // simply never fire them, so no capability check is required.
        document.addEventListener('freeze', () => { this.emit('frozen'); });
        document.addEventListener('resume', () => { this.emit('resumed'); });
    }

    /**
     * Register a unit of long-running work. The first active unit acquires a
     * screen wake lock; the last one to end releases it. Returns a handle whose
     * `end()` must be called exactly once when the work completes.
     */
    public beginActiveWork(label: string): ActiveWorkHandle {
        this.activeWorkCount++;
        console.log(`🔋 PageActivityService: active work started (${label}), count=${this.activeWorkCount}`);

        if (this.activeWorkCount === 1) {
            void this.acquireWakeLock();
        }

        let ended = false;
        return {
            end: (): void => {
                if (ended) {
                    return;
                }
                ended = true;
                this.activeWorkCount--;
                console.log(`🔋 PageActivityService: active work ended (${label}), count=${this.activeWorkCount}`);
                if (this.activeWorkCount === 0) {
                    void this.releaseWakeLock();
                }
            }
        };
    }

    /** Whether the tab is currently hidden (backgrounded/minimized). */
    public isHidden(): boolean {
        return document.visibilityState === 'hidden';
    }

    /** Whether at least one unit of long-running work is currently active. */
    public hasActiveWork(): boolean {
        return this.activeWorkCount > 0;
    }

    private handleVisibilityChange(): void {
        if (document.visibilityState === 'hidden') {
            // The browser auto-releases the wake lock when the tab is hidden; drop
            // our reference so we re-acquire it cleanly on return.
            this.wakeLock = null;
            this.emit('hidden');
        } else {
            this.emit('visible');
            if (this.hasActiveWork()) {
                void this.acquireWakeLock();
            }
        }
    }

    private async acquireWakeLock(): Promise<void> {
        // Screen Wake Lock is an optional web-platform API; where it is missing
        // we simply run without it (the generation loop is unaffected).
        if (!('wakeLock' in navigator)) {
            return;
        }
        if (this.wakeLock !== null) {
            return;
        }
        // Requesting a wake lock while the document is not visible is rejected by
        // the spec, so only attempt it while visible.
        if (document.visibilityState !== 'visible') {
            return;
        }
        try {
            const sentinel = await navigator.wakeLock.request('screen');
            this.wakeLock = sentinel;
            sentinel.addEventListener('release', () => {
                if (this.wakeLock === sentinel) {
                    this.wakeLock = null;
                }
            });
            console.log('🔋 PageActivityService: screen wake lock acquired');
        } catch (error) {
            // Best-effort feature: report loudly but do not interrupt generation.
            console.warn('🔋 PageActivityService: failed to acquire screen wake lock', error);
        }
    }

    private async releaseWakeLock(): Promise<void> {
        const sentinel = this.wakeLock;
        if (sentinel === null) {
            return;
        }
        this.wakeLock = null;
        await sentinel.release();
        console.log('🔋 PageActivityService: screen wake lock released');
    }
}

/** Shared singleton instance used across the app. */
export const pageActivityService = new PageActivityService();
