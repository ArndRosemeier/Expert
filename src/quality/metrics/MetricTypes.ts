import { MetricParamField, MetricParamsMap, MetricType } from '../../types';

/**
 * The outcome of running a single deterministic metric detector against a piece
 * of text. The score is on the same 1-10 scale as LLM ratings so the two kinds
 * of result can be merged transparently downstream.
 */
export interface MetricResult {
    /** Quality score on a 1-10 scale (10 = no violations). */
    score: number;
    /** Raw number of detected violations (for reporting). */
    violations: number;
    /** Human-readable explanation of what was found. */
    detail: string;
}

/**
 * A self-contained definition of a deterministic metric. Detection logic is
 * pure: it depends only on its text and params, never on external state, which
 * is what keeps the generation loop deterministic and resumable.
 */
export interface MetricDefinition<K extends MetricType> {
    /** The metric type discriminant. */
    type: K;
    /** Human-readable label for the settings UI. */
    label: string;
    /** Default parameter values used when creating a new instance of the metric. */
    defaultParams: MetricParamsMap[K];
    /** Schema describing each editable parameter so the UI can auto-render controls. */
    paramSchema: MetricParamField[];
    /** Pure detector that scores the given text against the params. */
    detect(text: string, params: MetricParamsMap[K]): MetricResult;
    /** Produces natural-language guidance for the creator prompt from the params. */
    creatorGuidance(params: MetricParamsMap[K]): string;
}

/**
 * Maps an observed count against an allowed threshold to a 1-10 score.
 * At or below the threshold the score is 10; each unit over the threshold
 * reduces the score by `penaltyPerUnit`, clamped to a minimum of 1.
 */
export function scoreFromCount(observed: number, allowed: number, penaltyPerUnit: number): number {
    if (observed <= allowed) {
        return 10;
    }
    const over = observed - allowed;
    return Math.max(1, Math.round(10 - over * penaltyPerUnit));
}

/**
 * Maps an observed rate to a 1-10 score relative to an allowed rate.
 * At or below the allowed rate the score is 10; the score falls off linearly as
 * the ratio of observed/allowed grows beyond 1, clamped to a minimum of 1.
 */
export function scoreFromRatio(observed: number, allowed: number): number {
    if (allowed <= 0) {
        return observed > 0 ? 1 : 10;
    }
    const ratio = observed / allowed;
    if (ratio <= 1) {
        return 10;
    }
    return Math.max(1, Math.round(10 - (ratio - 1) * 10));
}
