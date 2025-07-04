/**
 * Sentence-level diff tool that highlights differences between two texts
 * Returns HTML with background colors for added/removed sentences
 */

export interface DiffResult {
    originalHtml: string;
    modifiedHtml: string;
    stats: {
        originalSentences: number;
        modifiedSentences: number;
        removedSentences: number;
        addedSentences: number;
        unchangedSentences: number;
    };
}

export class DiffTool {
    /**
     * Compare two texts and return HTML with highlighted differences
     * @param original - The original text
     * @param modified - The modified text
     * @returns DiffResult with HTML versions and statistics
     */
    static compare(original: string, modified: string): DiffResult {
        // Split texts into sentences while preserving all characters
        const originalSentences = this.splitIntoSentences(original);
        const modifiedSentences = this.splitIntoSentences(modified);
        
        // Create copies for modification
        const originalCopy = [...originalSentences];
        const modifiedCopy = [...modifiedSentences];
        
        // Create normalized versions for comparison (removes punctuation/whitespace differences)
        const originalNormalized = originalSentences.map(s => this.normalizeSentence(s));
        const modifiedNormalized = modifiedSentences.map(s => this.normalizeSentence(s));
        
        // Create sets for efficient lookup using normalized versions
        const originalNormalizedSet = new Set(originalNormalized);
        const modifiedNormalizedSet = new Set(modifiedNormalized);
        
        // Count statistics
        let removedCount = 0;
        let addedCount = 0;
        let unchangedCount = 0;
        
        // Process original sentences - mark removed ones with light red
        for (let i = 0; i < originalCopy.length; i++) {
            const sentence = originalCopy[i]!; // Non-null assertion since we know array is well-formed
            const normalizedSentence = originalNormalized[i]!;
            if (!modifiedNormalizedSet.has(normalizedSentence)) {
                // Sentence was removed (based on normalized comparison)
                originalCopy[i] = this.wrapWithBackground(sentence, '#ffebee'); // Light red
                removedCount++;
            } else {
                unchangedCount++;
            }
        }
        
        // Reset unchanged count for proper calculation
        unchangedCount = 0;
        
        // Process modified sentences - mark added ones with light green
        for (let i = 0; i < modifiedCopy.length; i++) {
            const sentence = modifiedCopy[i]!; // Non-null assertion since we know array is well-formed
            const normalizedSentence = modifiedNormalized[i]!;
            if (!originalNormalizedSet.has(normalizedSentence)) {
                // Sentence was added (based on normalized comparison)
                modifiedCopy[i] = this.wrapWithBackground(sentence, '#e8f5e8'); // Light green
                addedCount++;
            } else {
                unchangedCount++;
            }
        }
        
        // Join the modified arrays back into HTML
        const originalHtml = originalCopy.join('');
        const modifiedHtml = modifiedCopy.join('');
        
        return {
            originalHtml,
            modifiedHtml,
            stats: {
                originalSentences: originalSentences.length,
                modifiedSentences: modifiedSentences.length,
                removedSentences: removedCount,
                addedSentences: addedCount,
                unchangedSentences: unchangedCount
            }
        };
    }
    
    /**
     * Split text into sentences while preserving all characters including whitespace
     * @param text - The text to split
     * @returns Array of sentences with all characters preserved
     */
    private static splitIntoSentences(text: string): string[] {
        if (!text) return [];
        
        // Enhanced sentence boundary detection
        // This regex matches sentence endings followed by whitespace or end of string
        // It handles common abbreviations and edge cases
        const sentenceRegex = /([.!?]+)(\s+|$)/g;
        
        const sentences: string[] = [];
        let lastIndex = 0;
        let match;
        
        while ((match = sentenceRegex.exec(text)) !== null) {
            const sentenceEnd = match.index + match[0].length;
            const sentence = text.slice(lastIndex, sentenceEnd);
            sentences.push(sentence);
            lastIndex = sentenceEnd;
        }
        
        // Add any remaining text as the last sentence
        if (lastIndex < text.length) {
            sentences.push(text.slice(lastIndex));
        }
        
        return sentences;
    }
    
    /**
     * Wrap text with HTML span having specified background color
     * @param text - The text to wrap
     * @param backgroundColor - The background color
     * @returns HTML wrapped text
     */
    private static wrapWithBackground(text: string, backgroundColor: string): string {
        // Escape HTML characters in the text
        const escapedText = this.escapeHtml(text);
        return `<span style="background-color: ${backgroundColor}; padding: 2px 4px; border-radius: 3px; margin: 1px;">${escapedText}</span>`;
    }
    
    /**
     * Escape HTML characters in text
     * @param text - The text to escape
     * @returns Escaped text
     */
    private static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Normalize a sentence by removing all non-word and non-digit characters
     * This makes comparison less sensitive to punctuation and whitespace differences
     * @param sentence - The sentence to normalize
     * @returns Normalized sentence with only word and digit characters
     */
    private static normalizeSentence(sentence: string): string {
        // Remove all characters that are not letters, digits, or basic whitespace
        // Then normalize whitespace to single spaces and trim
        return sentence
            .replace(/[^\w\d\s]/g, '') // Remove all non-word, non-digit, non-whitespace chars
            .replace(/\s+/g, ' ')      // Normalize multiple whitespace to single space
            .trim()                    // Remove leading/trailing whitespace
            .toLowerCase();            // Convert to lowercase for case-insensitive comparison
    }
    
    /**
     * Get a human-readable summary of the diff
     * @param result - The diff result
     * @returns Summary string
     */
    static getSummary(result: DiffResult): string {
        const { stats } = result;
        const parts: string[] = [];
        
        if (stats.addedSentences > 0) {
            parts.push(`${stats.addedSentences} sentence${stats.addedSentences === 1 ? '' : 's'} added`);
        }
        
        if (stats.removedSentences > 0) {
            parts.push(`${stats.removedSentences} sentence${stats.removedSentences === 1 ? '' : 's'} removed`);
        }
        
        if (stats.unchangedSentences > 0) {
            parts.push(`${stats.unchangedSentences} sentence${stats.unchangedSentences === 1 ? '' : 's'} unchanged`);
        }
        
        if (parts.length === 0) {
            return 'No changes detected';
        }
        
        return parts.join(', ');
    }
    
    /**
     * Alternative sentence splitting method using natural language boundaries
     * This method is more sophisticated and handles edge cases better
     * @param text - The text to split
     * @returns Array of sentences with all characters preserved
     */
    private static splitIntoSentencesAdvanced(text: string): string[] {
        if (!text) return [];
        
        const sentences: string[] = [];
        let currentSentence = '';
        let i = 0;
        
        while (i < text.length) {
            const char = text[i];
            currentSentence += char;
            
            // Check for sentence ending punctuation
            if (char === '.' || char === '!' || char === '?') {
                // Look ahead for multiple punctuation marks
                let j = i + 1;
                while (j < text.length && (text[j] === '.' || text[j] === '!' || text[j] === '?')) {
                    currentSentence += text[j];
                    j++;
                }
                
                // Look ahead for whitespace
                while (j < text.length && /\s/.test(text[j]!)) {
                    currentSentence += text[j];
                    j++;
                }
                
                // Check if next character starts a new sentence (capital letter or end of text)
                if (j >= text.length || /[A-Z]/.test(text[j]!)) {
                    sentences.push(currentSentence);
                    currentSentence = '';
                    i = j - 1; // -1 because the loop will increment
                }
            }
            
            i++;
        }
        
        // Add any remaining text
        if (currentSentence) {
            sentences.push(currentSentence);
        }
        
        return sentences;
    }
    
    /**
     * Compare two texts using the advanced sentence splitting method
     * @param original - The original text
     * @param modified - The modified text
     * @returns DiffResult with HTML versions and statistics
     */
    static compareAdvanced(original: string, modified: string): DiffResult {
        // Split texts into sentences using advanced method
        const originalSentences = this.splitIntoSentencesAdvanced(original);
        const modifiedSentences = this.splitIntoSentencesAdvanced(modified);
        
        // Create copies for modification
        const originalCopy = [...originalSentences];
        const modifiedCopy = [...modifiedSentences];
        
        // Create sets for efficient lookup
        const originalSet = new Set(originalSentences);
        const modifiedSet = new Set(modifiedSentences);
        
        // Count statistics
        let removedCount = 0;
        let addedCount = 0;
        let unchangedCount = 0;
        
        // Process original sentences - mark removed ones with light red
        for (let i = 0; i < originalCopy.length; i++) {
            const sentence = originalCopy[i]!; // Non-null assertion since we know array is well-formed
            if (!modifiedSet.has(sentence)) {
                // Sentence was removed
                originalCopy[i] = this.wrapWithBackground(sentence, '#ffebee'); // Light red
                removedCount++;
            } else {
                unchangedCount++;
            }
        }
        
        // Reset unchanged count for proper calculation
        unchangedCount = 0;
        
        // Process modified sentences - mark added ones with light green
        for (let i = 0; i < modifiedCopy.length; i++) {
            const sentence = modifiedCopy[i]!; // Non-null assertion since we know array is well-formed
            if (!originalSet.has(sentence)) {
                // Sentence was added
                modifiedCopy[i] = this.wrapWithBackground(sentence, '#e8f5e8'); // Light green
                addedCount++;
            } else {
                unchangedCount++;
            }
        }
        
        // Join the modified arrays back into HTML
        const originalHtml = originalCopy.join('');
        const modifiedHtml = modifiedCopy.join('');
        
        return {
            originalHtml,
            modifiedHtml,
            stats: {
                originalSentences: originalSentences.length,
                modifiedSentences: modifiedSentences.length,
                removedSentences: removedCount,
                addedSentences: addedCount,
                unchangedSentences: unchangedCount
            }
        };
    }
}

/**
 * Convenience function for quick diff comparison
 * @param original - The original text
 * @param modified - The modified text
 * @returns DiffResult with HTML versions and statistics
 */
export function diffTexts(original: string, modified: string): DiffResult {
    return DiffTool.compare(original, modified);
}

/**
 * Convenience function for advanced diff comparison
 * @param original - The original text
 * @param modified - The modified text
 * @returns DiffResult with HTML versions and statistics
 */
export function diffTextsAdvanced(original: string, modified: string): DiffResult {
    return DiffTool.compareAdvanced(original, modified);
} 