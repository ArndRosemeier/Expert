/**
 * ReviewContextBuilder - serializes the in-scope layer for the reviewer prompt.
 *
 * Only the selected/editable nodes are serialized (each layer is a self-contained
 * abstraction of the same story). Every node is tagged with its session handle so
 * the LLM can address edits precisely. When a node has staged (uncommitted) edits,
 * the staged values are serialized so the model always sees the current working
 * state.
 */

import { ReviewScope } from './ReviewScope';
import { ReviewContextItem, SerializedScope, StagedNodeEdit } from './ReviewTypes';

export class ReviewContextBuilder {
    /**
     * Builds the serialized scope text plus a rough size estimate.
     *
     * @param scope The live review scope (handles -> nodes).
     * @param stagedByNodeId Current staged edits, keyed by node id.
     */
    public static build(scope: ReviewScope, stagedByNodeId: Map<string, StagedNodeEdit>): SerializedScope {
        const blocks: string[] = [];
        for (const scopeNode of scope.getScopeNodes()) {
            const node = scope.getNodeByHandle(scopeNode.handle);
            if (!node) {
                throw new Error(`ReviewContextBuilder: no live node for handle ${scopeNode.handle}`);
            }
            const staged = stagedByNodeId.get(scopeNode.nodeId);
            const title = staged ? staged.titleAfter : node.title;
            const content = staged ? staged.contentAfter : node.content;
            const contextItems = staged ? staged.contextAfter : ReviewContextBuilder.liveContextItems(node);

            const lines: string[] = [];
            lines.push(`### ${scopeNode.handle} (${scopeNode.layerLabel}) — "${title}"`);
            lines.push('<content>');
            lines.push(content.length > 0 ? content : '(empty)');
            lines.push('</content>');
            if (contextItems.length > 0) {
                lines.push('conditional context items (own):');
                for (const item of contextItems) {
                    const idLabel = item.id ?? '(staged-new)';
                    const triggerLabel = item.trigger ? `trigger="${item.trigger}"` : 'global';
                    lines.push(`  - [${idLabel}] (${triggerLabel}) ${item.text}`);
                }
            }
            blocks.push(lines.join('\n'));
        }

        const text = blocks.join('\n\n');
        const charCount = text.length;
        // Rough heuristic; only used for a size hint in the UI.
        const approxTokens = Math.ceil(charCount / 4);
        return { text, charCount, approxTokens };
    }

    /** Maps a node's own conditional-context items into the reviewer shape. */
    private static liveContextItems(node: { getConditionalContextItems: () => { id: string; text: string; keywords?: string[] }[] }): ReviewContextItem[] {
        return node.getConditionalContextItems().map(item => ({
            id: item.id,
            workingId: item.id,
            text: item.text,
            trigger: item.keywords && item.keywords.length > 0 ? item.keywords[0]! : null
        }));
    }
}
