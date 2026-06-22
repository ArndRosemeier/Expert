/**
 * Context formatting utilities for managing context items
 */

// Type-only import: erased at compile time, so this does NOT create a runtime
// import cycle with DocumentNode (which imports getContextItems from here).
import type { DocumentNode, ChildScope } from './DocumentNode';

/**
 * Applies AI-generated context to a node as conditional context items.
 *
 * The context string is a list of paragraph items (separated by blank lines).
 * A paragraph may optionally start with a trigger prefix of the form
 * `<trigger>word1, word2</trigger>` to make it a keyword-gated item; paragraphs
 * without that prefix become always-visible (global) items.
 *
 * This is the single shared implementation used by every import/creation path
 * (AI creator, concept import, full-text import) so context handling stays
 * consistent. It uses only the node's public API.
 */
export function applyConditionalContextItems(rootNode: DocumentNode, aiContext: string): void {
    if (!aiContext || !aiContext.trim()) {
        return;
    }

    const items = getContextItems(aiContext);
    for (const itemText of items) {
        const trimmed = itemText.trim();
        if (!trimmed) {
            continue;
        }

        const triggerMatch = trimmed.match(/^<trigger>(.*?)<\/trigger>(.*)/s);
        if (triggerMatch && triggerMatch[1] && triggerMatch[2]) {
            const keywords = triggerMatch[1]
                .split(',')
                .map(word => word.trim())
                .filter(word => word.length > 0);
            const contextText = triggerMatch[2].trim();
            const id = rootNode.addConditionalContextItem(contextText);
            if (keywords.length > 0) {
                rootNode.updateConditionalContextItem(id, { keywords });
            }
        } else {
            rootNode.addConditionalContextItem(trimmed);
        }
    }
}

/**
 * Parse content that is structured with `===<title>===` section headers into an
 * array of `{ title, content }` sections. This is the single shared
 * implementation used both by deterministic child creation and by the
 * conditional-context editor (to offer a node's prospective direct children
 * before they have been generated).
 */
export function parseContentSections(content: string): Array<{ title: string; content: string }> {
    if (!content || !content.trim()) {
        return [];
    }

    const lines = content.split('\n');
    const sections: Array<{ title: string; content: string }> = [];
    let currentSection: { title: string; content: string[] } | null = null;

    for (const line of lines) {
        const sectionMatch = line.match(/^===(.+?)===\s*$/);

        if (sectionMatch) {
            if (currentSection) {
                sections.push({
                    title: currentSection.title,
                    content: currentSection.content.join('\n').trim()
                });
            }
            const title = sectionMatch[1];
            if (title) {
                currentSection = { title: title.trim(), content: [] };
            }
        } else if (currentSection) {
            currentSection.content.push(line);
        }
        // Ignore lines before the first section header
    }

    if (currentSection) {
        sections.push({
            title: currentSection.title,
            content: currentSection.content.join('\n').trim()
        });
    }

    return sections.filter(section => section.title.length > 0);
}

/**
 * Convenience wrapper returning only the section titles in document order.
 */
export function parseSectionTitles(content: string): string[] {
    return parseContentSections(content).map(s => s.title);
}

/**
 * Restore conditional context items from raw export/import JSON onto a node.
 *
 * This is the single shared restore path used by every partial-import flow.
 * It clears the node's existing items and rebuilds them from the new-shape
 * fields (`text`, `keywords`, `childScope`, `leavesOnly`). Legacy `conditions`
 * / `logic` fields on old exports are intentionally ignored.
 */
export function restoreConditionalContextItems(node: DocumentNode, rawItems: unknown): void {
    if (!Array.isArray(rawItems)) {
        return;
    }

    for (const existing of node.getConditionalContextItems()) {
        node.removeConditionalContextItem(existing.id);
    }

    for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object' || typeof (raw as { text?: unknown }).text !== 'string') {
            throw new Error('restoreConditionalContextItems: each item must be an object with a string text field');
        }
        const item = raw as {
            text: string;
            keywords?: unknown;
            childScope?: { mode?: unknown; titles?: unknown };
            leavesOnly?: unknown;
        };
        const newId = node.addConditionalContextItem(item.text);
        const keywords = Array.isArray(item.keywords)
            ? item.keywords.filter((k): k is string => typeof k === 'string')
            : [];
        const mode = item.childScope?.mode;
        const rawTitles = item.childScope?.titles;
        const titles = Array.isArray(rawTitles)
            ? rawTitles.filter((t): t is string => typeof t === 'string')
            : [];
        const childScope: ChildScope = (mode === 'include' || mode === 'exclude')
            ? { mode, titles }
            : { mode: 'all', titles: [] };
        node.updateConditionalContextItem(newId, {
            keywords,
            childScope,
            leavesOnly: item.leavesOnly === true
        });
    }
}

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

/**
 * Generates the context info text with count and explanation
 * @param context - The context string to analyze
 * @returns Formatted info text explaining context items
 */
export function getContextInfoText(context: string): string {
    const count = getContextItemCount(context);
    return `${count} context items in context. Any paragraph is considered a context item. Items starting with "*" are protected from AI analysis.`;
} 