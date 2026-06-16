import { TricolonParams } from '../../types';
import { MetricDefinition, MetricResult, scoreFromRatio } from './MetricTypes';
import { countWords } from './textUtils';

/**
 * Detects overuse of the "rule of three" enumeration (e.g. "X, Y, and Z"),
 * a rhythm AI models lean on heavily. Density is measured per 1000 words.
 */
export const tricolonMetric: MetricDefinition<'tricolon'> = {
    type: 'tricolon',
    label: 'Tricolon ("rule of three") density',
    defaultParams: { maxPer1000Words: 3 },
    paramSchema: [
        { key: 'maxPer1000Words', label: 'Max tricolons per 1000 words', type: 'number', min: 0, max: 50, step: 1 }
    ],
    detect(text: string, params: TricolonParams): MetricResult {
        const regex = /[^,.;:!?]+,\s+[^,.;:!?]+,\s+(?:and|or)\s+[^,.;:!?]+/gi;
        const matches = text.match(regex);
        const count = matches ? matches.length : 0;
        const words = countWords(text);
        const per1000 = words > 0 ? (count / words) * 1000 : 0;
        const score = scoreFromRatio(per1000, params.maxPer1000Words);
        return {
            score,
            violations: count,
            detail: `${count} rule-of-three enumeration${count === 1 ? '' : 's'} (${per1000.toFixed(1)} per 1000 words; limit ${params.maxPer1000Words}).`
        };
    },
    creatorGuidance(params: TricolonParams): string {
        return `Do not overuse three-part lists such as "X, Y, and Z": at most about ${params.maxPer1000Words} per 1000 words. Vary enumeration length and structure.`;
    }
};
