import { BannedNamesParams } from '../../types';
import { MetricDefinition, MetricResult, scoreFromCount } from './MetricTypes';
import { escapeRegExp } from './textUtils';

/**
 * Detects overused fantasy/AI-generated character names. Unlike the banned
 * phrases metric, matching is CASE-SENSITIVE: proper names are capitalized, so
 * requiring the exact capitalized form avoids false positives on common words
 * that happen to coincide with a listed name (e.g. the noun "park").
 *
 * The list is fully editable so projects can curate it. This only guards against
 * the most egregious attractor names; varied naming is reinforced separately via
 * the {{noise_names}} prompt expansion.
 */
export const bannedNamesMetric: MetricDefinition<'bannedNames'> = {
    type: 'bannedNames',
    label: 'Banned names',
    defaultParams: {
        names: [],
        maxOccurrences: 0
    },
    paramSchema: [
        { key: 'names', label: 'Banned names (one per line)', type: 'stringList' },
        { key: 'maxOccurrences', label: 'Max total occurrences tolerated', type: 'number', min: 0, max: 50, step: 1 }
    ],
    detect(text: string, params: BannedNamesParams): MetricResult {
        const found: string[] = [];
        let count = 0;

        for (const name of params.names) {
            const trimmed = name.trim();
            if (trimmed.length === 0) {
                continue;
            }
            const regex = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'g');
            const matches = text.match(regex);
            if (matches && matches.length > 0) {
                count += matches.length;
                found.push(`"${trimmed}" (${matches.length})`);
            }
        }

        const score = scoreFromCount(count, params.maxOccurrences, 3);
        const detail = found.length > 0
            ? `Banned names found: ${found.join(', ')}. Limit ${params.maxOccurrences}.`
            : 'No banned names found.';
        return { score, violations: count, detail };
    },
    creatorGuidance(params: BannedNamesParams): string {
        const list = params.names.filter(n => n.trim().length > 0);
        const base = 'When introducing a new character, choose natural, varied names; never rename characters that are already established.';
        if (list.length === 0) {
            return base;
        }
        return `${base} Never use these overused names for new characters: ${list.join(', ')}.`;
    }
};
