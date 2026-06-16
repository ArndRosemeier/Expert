import { EmDashDensityParams } from '../../types';
import { MetricDefinition, MetricResult, scoreFromRatio } from './MetricTypes';
import { countWords } from './textUtils';

/**
 * Detects overuse of em-dashes (and em-dash-style en-dashes), a hallmark of
 * AI-generated prose. Density is measured per 1000 words so the limit scales
 * with text length.
 */
export const emDashDensityMetric: MetricDefinition<'emDashDensity'> = {
    type: 'emDashDensity',
    label: 'Em-dash density',
    defaultParams: { maxPer1000Words: 4 },
    paramSchema: [
        { key: 'maxPer1000Words', label: 'Max em-dashes per 1000 words', type: 'number', min: 0, max: 50, step: 1 }
    ],
    detect(text: string, params: EmDashDensityParams): MetricResult {
        const dashMatches = text.match(/[\u2014\u2013]/g);
        const count = dashMatches ? dashMatches.length : 0;
        const words = countWords(text);
        const per1000 = words > 0 ? (count / words) * 1000 : 0;
        const score = scoreFromRatio(per1000, params.maxPer1000Words);
        return {
            score,
            violations: count,
            detail: `${count} em-dash${count === 1 ? '' : 'es'} (${per1000.toFixed(1)} per 1000 words; limit ${params.maxPer1000Words}).`
        };
    },
    creatorGuidance(params: EmDashDensityParams): string {
        return `Use em-dashes very sparingly: no more than about ${params.maxPer1000Words} per 1000 words. Prefer commas, periods, or restructured sentences instead.`;
    }
};
