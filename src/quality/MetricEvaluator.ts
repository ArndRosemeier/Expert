import {
    QualityCriterion,
    MetricCriterion,
    isMetricCriterion,
    isLLMCriterion
} from '../types';
import { Rating } from '../types/RatingTypes';
import { withMetric } from './metrics/MetricRegistry';

/**
 * Failure-score penalty added when a hard-gate metric fails. It is large enough
 * that the best-iteration selector strongly prefers any version that passes all
 * gates over one that does not, regardless of soft-criterion scores.
 */
export const GATE_FAILURE_PENALTY = 1000;

/**
 * Runs all enabled deterministic metric criteria against the given text and maps
 * each result into the shared `Rating` shape, so metric results merge seamlessly
 * with LLM ratings throughout the rest of the loop and UI.
 */
export function evaluateMetrics(text: string, metricCriteria: MetricCriterion[]): Rating[] {
    return metricCriteria.map(criterion => {
        const result = withMetric(criterion, (definition, params) => definition.detect(text, params));
        return {
            criterion: criterion.name,
            goal: criterion.goal,
            actual: result.score,
            passed: result.score >= criterion.goal,
            description: result.detail
        };
    });
}

/**
 * Returns only the metric criteria that are enabled. Disabled metrics are
 * excluded from both creator guidance and evaluation.
 */
export function getEnabledMetricCriteria(criteria: QualityCriterion[]): MetricCriterion[] {
    return criteria.filter(isMetricCriterion).filter(metric => metric.enabled);
}

/**
 * Builds the JSON criteria block shown to the creator/prose model. LLM criteria
 * contribute their name + description; metric criteria contribute dynamically
 * generated guidance reflecting their current parameters, so the creator stays
 * aware of every constraint up front (including the deterministic ones).
 */
export function formatCriteriaForCreator(criteria: QualityCriterion[]): string {
    if (!criteria || criteria.length === 0) {
        return 'No criteria defined';
    }

    const formatted = criteria.map(criterion => {
        if (isMetricCriterion(criterion)) {
            if (!criterion.enabled) {
                return null;
            }
            const guidance = withMetric(criterion, (definition, params) => definition.creatorGuidance(params));
            return { name: criterion.name, description: guidance };
        }

        const shortName = criterion.name.indexOf('.') > 0
            ? criterion.name.substring(0, criterion.name.indexOf('.'))
            : criterion.name;
        return { name: shortName, description: criterion.description || shortName };
    }).filter((entry): entry is { name: string; description: string } => entry !== null);

    return JSON.stringify(formatted, null, 2);
}

/**
 * Splits a criteria list into the LLM-scored criteria (rated by the rater model)
 * and the enabled deterministic metric criteria (evaluated locally).
 */
export function splitCriteria(criteria: QualityCriterion[]): {
    llmCriteria: QualityCriterion[];
    metricCriteria: MetricCriterion[];
} {
    return {
        llmCriteria: criteria.filter(isLLMCriterion),
        metricCriteria: getEnabledMetricCriteria(criteria)
    };
}
