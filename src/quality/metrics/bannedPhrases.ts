import { BannedPhrasesParams } from '../../types';
import { MetricDefinition, MetricResult, scoreFromCount } from './MetricTypes';
import { escapeRegExp } from './textUtils';

/**
 * Detects occurrences of overused "AI-ism" phrases. Both a literal phrase list
 * and an optional list of raw regular expressions are supported, so users can
 * extend coverage (including language-specific AI-isms) without code changes.
 */
export const bannedPhrasesMetric: MetricDefinition<'bannedPhrases'> = {
    type: 'bannedPhrases',
    label: 'Banned phrases',
    defaultParams: {
        phrases: [],
        regexes: [],
        maxOccurrences: 0
    },
    paramSchema: [
        { key: 'phrases', label: 'Banned phrases (one per line)', type: 'stringList' },
        { key: 'regexes', label: 'Banned patterns / regex (one per line)', type: 'stringList' },
        { key: 'maxOccurrences', label: 'Max total occurrences tolerated', type: 'number', min: 0, max: 50, step: 1 }
    ],
    detect(text: string, params: BannedPhrasesParams): MetricResult {
        const found: string[] = [];
        let count = 0;

        for (const phrase of params.phrases) {
            const trimmed = phrase.trim();
            if (trimmed.length === 0) {
                continue;
            }
            const regex = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches && matches.length > 0) {
                count += matches.length;
                found.push(`"${trimmed}" (${matches.length})`);
            }
        }

        for (const pattern of params.regexes) {
            const trimmed = pattern.trim();
            if (trimmed.length === 0) {
                continue;
            }
            const regex = new RegExp(trimmed, 'gi');
            const matches = text.match(regex);
            if (matches && matches.length > 0) {
                count += matches.length;
                found.push(`/${trimmed}/ (${matches.length})`);
            }
        }

        const score = scoreFromCount(count, params.maxOccurrences, 3);
        const detail = found.length > 0
            ? `Banned phrases found: ${found.join(', ')}. Limit ${params.maxOccurrences}.`
            : 'No banned phrases found.';
        return { score, violations: count, detail };
    },
    creatorGuidance(params: BannedPhrasesParams): string {
        const list = params.phrases.filter(p => p.trim().length > 0);
        if (list.length === 0) {
            return 'Avoid overused AI cliche phrases and formulaic transitions.';
        }
        return `Avoid these overused AI phrases entirely: ${list.join(', ')}.`;
    }
};
