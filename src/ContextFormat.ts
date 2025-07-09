/**
 * Context formatting utilities for managing context items
 */

/**
 * Splits context into an array of paragraphs (context items)
 * Each paragraph is considered a separate context item
 * @param context - The context string to split
 * @returns Array of context items (paragraphs)
 */
export function getContextItems(context: string): string[] {
    if (!context || !context.trim()) {
        return [];
    }
    
    // Split by double newlines (paragraph breaks) and filter out empty strings
    const items = context
        .split(/\n\s*\n/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    
    return items;
}

/**
 * Gets the count of context items in the given context
 * @param context - The context string to count items for
 * @returns Number of context items
 */
export function getContextItemCount(context: string): number {
    return getContextItems(context).length;
}

/**
 * Formats context items back into a single context string
 * @param items - Array of context items to join
 * @returns Formatted context string
 */
export function formatContextItems(items: string[]): string {
    return items.join('\n\n');
} 