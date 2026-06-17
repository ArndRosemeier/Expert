/**
 * ReviewStageStore - ephemeral persistence for an in-progress guided review.
 *
 * Staged edits are intentionally simple, throwaway data: they live in the
 * IndexedDB keyValue store under a per-scope key so an interrupted review can be
 * recovered after a crash/reload, and are cleared the moment the review is
 * committed or discarded.
 */

import { REVIEW_STAGE_PREFIX } from '../constants';
import { StorageService } from '../StorageService';
import { ReviewSessionState } from './ReviewTypes';

export class ReviewStageStore {
    private static keyFor(projectRootId: string, reviewRootId: string): string {
        return `${REVIEW_STAGE_PREFIX}${projectRootId}:${reviewRootId}`;
    }

    public static async load(projectRootId: string, reviewRootId: string): Promise<ReviewSessionState | null> {
        const storage = await StorageService.getInstance();
        const state = await storage.get<ReviewSessionState>(ReviewStageStore.keyFor(projectRootId, reviewRootId));
        return state ?? null;
    }

    public static async save(state: ReviewSessionState): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.set(ReviewStageStore.keyFor(state.projectRootId, state.reviewRootId), state);
    }

    public static async clear(projectRootId: string, reviewRootId: string): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.delete(ReviewStageStore.keyFor(projectRootId, reviewRootId));
    }
}
