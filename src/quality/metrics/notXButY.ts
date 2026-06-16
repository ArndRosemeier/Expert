import { NotXButYParams } from '../../types';
import { MetricDefinition, MetricResult, scoreFromCount } from './MetricTypes';

/**
 * Detects the overused antithesis / dramatic-reframing construction, e.g.
 * "It wasn't just food. It was fuel." or "not X, but Y". These are strong
 * AI-ism tells that inflate ordinary statements.
 */
export const notXButYMetric: MetricDefinition<'notXButY'> = {
    type: 'notXButY',
    label: 'Antithesis ("It wasn\'t X, it was Y")',
    defaultParams: { maxOccurrences: 0 },
    paramSchema: [
        { key: 'maxOccurrences', label: 'Max antithesis constructions tolerated', type: 'number', min: 0, max: 20, step: 1 }
    ],
    detect(text: string, params: NotXButYParams): MetricResult {
        const patterns: RegExp[] = [
            /\bnot\s+(?:just\s+|only\s+|merely\s+|simply\s+)?[^.,;:!?]{1,60},?\s+but\s+/gi,
            /\b(?:wasn't|weren't|isn't|aren't|wasn’t|weren’t|isn’t|aren’t)\b[^.!?]{1,80}[.!?]\s+(?:it|he|she|they|that)\s+(?:was|were|is|are)\b/gi
        ];

        let count = 0;
        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (matches) {
                count += matches.length;
            }
        }

        const score = scoreFromCount(count, params.maxOccurrences, 3);
        const detail = count > 0
            ? `${count} antithesis construction${count === 1 ? '' : 's'} detected (limit ${params.maxOccurrences}).`
            : 'No antithesis constructions detected.';
        return { score, violations: count, detail };
    },
    creatorGuidance(params: NotXButYParams): string {
        if (params.maxOccurrences === 0) {
            return 'Never use the "It wasn\'t X, it was Y" antithesis or similar dramatic reframing. State things plainly and let significance emerge naturally.';
        }
        return `Avoid the "It wasn't X, it was Y" antithesis construction: at most ${params.maxOccurrences}.`;
    }
};
