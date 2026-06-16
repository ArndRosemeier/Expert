/**
 * Small pure text-analysis helpers shared by the deterministic metric detectors.
 * These intentionally avoid any external state so that metric evaluation is
 * fully deterministic and safe to re-run on resume.
 */

/** Counts the number of whitespace-delimited words in the text. */
export function countWords(text: string): number {
    const matches = text.trim().match(/\S+/g);
    return matches ? matches.length : 0;
}

/**
 * Splits text into sentences using terminal punctuation as boundaries.
 * This is a heuristic splitter adequate for prose-quality measurement.
 */
export function splitSentences(text: string): string[] {
    return text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Returns the lower-cased first word of a sentence, stripped of punctuation. */
export function firstWord(sentence: string): string {
    const match = sentence.match(/[A-Za-z']+/);
    return match ? match[0].toLowerCase() : '';
}

/**
 * Escapes a literal string for safe inclusion inside a regular expression.
 */
export function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
