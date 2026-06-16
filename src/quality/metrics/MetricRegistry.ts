import { MetricCriterion, MetricParamsMap, MetricType } from '../../types';
import { MetricDefinition } from './MetricTypes';
import { emDashDensityMetric } from './emDashDensity';
import { bannedPhrasesMetric } from './bannedPhrases';
import { bannedNamesMetric } from './bannedNames';
import { tricolonMetric } from './tricolon';
import { repeatedSentenceOpenersMetric } from './repeatedSentenceOpeners';
import { notXButYMetric } from './notXButY';

/**
 * Strongly-typed registry of every built-in metric definition, keyed by metric
 * type. Adding a new metric is a single entry here plus its definition file; the
 * settings UI and evaluation loop pick it up automatically.
 */
export type MetricRegistry = {
    [K in MetricType]: MetricDefinition<K>;
};

const METRIC_REGISTRY: MetricRegistry = {
    emDashDensity: emDashDensityMetric,
    bannedPhrases: bannedPhrasesMetric,
    bannedNames: bannedNamesMetric,
    tricolon: tricolonMetric,
    repeatedSentenceOpeners: repeatedSentenceOpenersMetric,
    notXButY: notXButYMetric
};

/**
 * Returns the definition for a metric type. Throws loudly on an unknown type
 * rather than masking the problem with a silent fallback.
 */
export function getMetricDefinition<K extends MetricType>(type: K): MetricDefinition<K> {
    const definition = METRIC_REGISTRY[type];
    if (!definition) {
        throw new Error(`Unknown metric type: "${type}". No detector is registered for it.`);
    }
    return definition;
}

/** Returns all registered metric definitions (for building UI option lists). */
export function getAllMetricDefinitions(): MetricDefinition<MetricType>[] {
    return Object.values(METRIC_REGISTRY) as MetricDefinition<MetricType>[];
}

/** Compile-time exhaustiveness guard that fails loudly at runtime if reached. */
function assertNever(value: never): never {
    throw new Error(`Unhandled metric type: ${JSON.stringify(value)}`);
}

/**
 * Dispatches a metric criterion to its definition with correctly-narrowed
 * params. The discriminated `switch` lets the callback receive a matched
 * `(definition, params)` pair without any unsafe casts, and `assertNever`
 * guarantees every metric type is handled.
 */
export function withMetric<R>(
    criterion: MetricCriterion,
    callback: <K extends MetricType>(definition: MetricDefinition<K>, params: MetricParamsMap[K]) => R
): R {
    switch (criterion.metricType) {
        case 'emDashDensity':
            return callback(getMetricDefinition('emDashDensity'), criterion.params);
        case 'bannedPhrases':
            return callback(getMetricDefinition('bannedPhrases'), criterion.params);
        case 'bannedNames':
            return callback(getMetricDefinition('bannedNames'), criterion.params);
        case 'tricolon':
            return callback(getMetricDefinition('tricolon'), criterion.params);
        case 'repeatedSentenceOpeners':
            return callback(getMetricDefinition('repeatedSentenceOpeners'), criterion.params);
        case 'notXButY':
            return callback(getMetricDefinition('notXButY'), criterion.params);
        default:
            return assertNever(criterion);
    }
}
