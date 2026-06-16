
export interface CreatorPayload {
    prompt: string;
    response: string;
}
export interface EditorPayload {
    prompt:string;
    advice: string;
} 

/**
 * The set of built-in deterministic metric types. Each value corresponds to a
 * detector implementation registered in the metric registry.
 */
export type MetricType =
    | 'emDashDensity'
    | 'bannedPhrases'
    | 'bannedNames'
    | 'tricolon'
    | 'repeatedSentenceOpeners'
    | 'notXButY';

/** Parameters for the em-dash density metric. */
export interface EmDashDensityParams {
    /** Maximum number of em-dashes allowed per 1000 words. */
    maxPer1000Words: number;
}

/** Parameters for the banned phrases metric. */
export interface BannedPhrasesParams {
    /** Literal phrases that must not appear (case-insensitive, word-aware). */
    phrases: string[];
    /** Additional raw regular expressions (source strings) to match against. */
    regexes: string[];
    /** Total number of matches tolerated before the metric starts failing. */
    maxOccurrences: number;
}

/** Parameters for the banned names metric. */
export interface BannedNamesParams {
    /** Proper names that must not appear (matched case-sensitively, word-aware). */
    names: string[];
    /** Total number of matches tolerated before the metric starts failing. */
    maxOccurrences: number;
}

/** Parameters for the tricolon ("rule of three") metric. */
export interface TricolonParams {
    /** Maximum number of "X, Y, and Z" enumerations per 1000 words. */
    maxPer1000Words: number;
}

/** Parameters for the repeated sentence openers metric. */
export interface RepeatedSentenceOpenersParams {
    /** Maximum number of sentences that may share the same opening word. */
    maxRepeats: number;
}

/** Parameters for the "It wasn't X, it was Y" antithesis metric. */
export interface NotXButYParams {
    /** Number of antithesis constructions tolerated before failing. */
    maxOccurrences: number;
}

/** Maps each metric type to its strongly-typed parameter object. */
export interface MetricParamsMap {
    emDashDensity: EmDashDensityParams;
    bannedPhrases: BannedPhrasesParams;
    bannedNames: BannedNamesParams;
    tricolon: TricolonParams;
    repeatedSentenceOpeners: RepeatedSentenceOpenersParams;
    notXButY: NotXButYParams;
}

/** Supported field types for auto-generated metric parameter UI controls. */
export type MetricParamFieldType = 'number' | 'stringList';

/**
 * Describes a single editable parameter of a metric so the settings UI can
 * render an appropriate control without hard-coding each metric.
 */
export interface MetricParamField {
    /** Key within the metric's params object. */
    key: string;
    /** Human-readable label shown in the UI. */
    label: string;
    /** Control type to render. */
    type: MetricParamFieldType;
    /** Optional bounds/step for numeric fields. */
    min?: number;
    max?: number;
    step?: number;
}

/** Common fields shared by every metric criterion regardless of metric type. */
interface MetricCriterionCommon {
    kind: 'metric';
    name: string;
    /** Threshold score (1-10) the deterministic result must reach to pass. */
    goal: number;
    /** Human-readable summary shown in the editor and secondary prompts. */
    description: string;
    /**
     * Relative weight applied only when ranking failing iterations to choose the
     * best attempt. It does NOT affect pass/fail: every enabled criterion must
     * reach its goal regardless of weight.
     */
    weight: number;
    /** Whether this metric participates in evaluation at all. */
    enabled: boolean;
    outline?: boolean;
    leaf?: boolean;
}

/**
 * A deterministic, locally-evaluated quality criterion. The discriminated union
 * over `metricType` keeps each criterion's `params` strongly typed.
 */
export type MetricCriterion = {
    [K in MetricType]: MetricCriterionCommon & { metricType: K; params: MetricParamsMap[K] };
}[MetricType];

/**
 * A free-text criterion scored by the rater LLM. `kind` is optional so legacy
 * stored criteria (which predate the discriminant) are treated as LLM criteria.
 */
export interface LLMCriterion {
    kind?: 'llm';
    name: string;
    goal: number;
    description?: string;
    outline?: boolean;
    leaf?: boolean;
}

/** A quality criterion is either an LLM-scored or a deterministic metric criterion. */
export type QualityCriterion = LLMCriterion | MetricCriterion;

/** Type guard: true when the criterion is a deterministic metric criterion. */
export function isMetricCriterion(criterion: QualityCriterion): criterion is MetricCriterion {
    return criterion.kind === 'metric';
}

/** Type guard: true when the criterion is an LLM-scored criterion. */
export function isLLMCriterion(criterion: QualityCriterion): criterion is LLMCriterion {
    return criterion.kind !== 'metric';
}

export interface AILogEntry {
    id: string;
    timestamp: Date;
    purpose: string;
    prompt: string;
    response: string;
    model: string;
    requestDuration: number; // in milliseconds
} 