import { RepeatedSentenceOpenersParams } from '../../types';
import { MetricDefinition, MetricResult, scoreFromCount } from './MetricTypes';
import { splitSentences, firstWord } from './textUtils';

/**
 * Detects monotonous sentence rhythm by measuring how often the same opening
 * word is reused to start sentences. The observed value is the largest number
 * of sentences sharing a single opener.
 */
export const repeatedSentenceOpenersMetric: MetricDefinition<'repeatedSentenceOpeners'> = {
    type: 'repeatedSentenceOpeners',
    label: 'Repeated sentence openers',
    defaultParams: { maxRepeats: 3 },
    paramSchema: [
        { key: 'maxRepeats', label: 'Max sentences sharing the same opening word', type: 'number', min: 1, max: 20, step: 1 }
    ],
    detect(text: string, params: RepeatedSentenceOpenersParams): MetricResult {
        const sentences = splitSentences(text);
        const counts = new Map<string, number>();
        for (const sentence of sentences) {
            const opener = firstWord(sentence);
            if (opener.length === 0) {
                continue;
            }
            counts.set(opener, (counts.get(opener) ?? 0) + 1);
        }

        let worstOpener = '';
        let worstCount = 0;
        for (const [opener, count] of counts) {
            if (count > worstCount) {
                worstCount = count;
                worstOpener = opener;
            }
        }

        const score = scoreFromCount(worstCount, params.maxRepeats, 3);
        const detail = worstCount > 0
            ? `Most repeated opener "${worstOpener}" used ${worstCount} time${worstCount === 1 ? '' : 's'} (limit ${params.maxRepeats}).`
            : 'No sentences to analyze.';
        return { score, violations: Math.max(0, worstCount - params.maxRepeats), detail };
    },
    creatorGuidance(params: RepeatedSentenceOpenersParams): string {
        return `Vary how sentences begin: do not start more than ${params.maxRepeats} sentences with the same word.`;
    }
};
