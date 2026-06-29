/**
 * ReviewScope - resolves the set of nodes a guided-review session operates on.
 *
 * Given a review root node and a set of selected template levels, it collects
 * the in-scope nodes (the root's subtree, filtered to the selected levels),
 * assigns each a short, stable session handle ("N1", "N2", ...), and exposes
 * lookups between handles and live DocumentNode instances.
 *
 * This is a LIVE helper rebuilt from the current tree each time a session opens;
 * it is never serialized. Only its inputs (the selected levels) are persisted.
 */

import { DocumentNode } from '../DocumentNode';
import { getAllDescendants } from '../ProjectUtils';
import { ReviewLayerInfo, ReviewScopeNode } from './ReviewTypes';

/**
 * Strips a trailing count from a raw template layer name.
 * e.g. "Chapter 4" -> "Chapter", "Scene" -> "Scene".
 */
export function baseLayerName(rawLayerName: string): string {
    const trimmed = rawLayerName.trim();
    const match = trimmed.match(/^(\w+)(?:\s+\d+)?$/);
    return match?.[1] ? match[1] : trimmed;
}

export class ReviewScope {
    private readonly reviewRoot: DocumentNode;
    private readonly selectedLevels: number[];
    private readonly scopeNodes: ReviewScopeNode[] = [];
    private readonly handleToNode = new Map<string, DocumentNode>();
    private readonly nodeIdToHandle = new Map<string, string>();

    constructor(reviewRoot: DocumentNode, selectedLevels: number[]) {
        this.reviewRoot = reviewRoot;
        this.selectedLevels = [...selectedLevels].sort((a, b) => a - b);
        this.build();
    }

    /**
     * Lists every distinct template level present in the review root's subtree,
     * with a human label and the number of nodes at that level. Used to drive
     * the layer-selection UI (independent of the current selection).
     */
    public static computeLayers(reviewRoot: DocumentNode): ReviewLayerInfo[] {
        const all = getAllDescendants(reviewRoot);
        const byLevel = new Map<number, { label: string; count: number }>();
        for (const node of all) {
            const rawLabel = node.template[node.level] ?? `Level ${node.level}`;
            const existing = byLevel.get(node.level);
            if (existing) {
                existing.count += 1;
            } else {
                byLevel.set(node.level, { label: baseLayerName(rawLabel), count: 1 });
            }
        }
        return Array.from(byLevel.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([level, info]) => ({ level, label: info.label, nodeCount: info.count }));
    }

    private build(): void {
        const selected = new Set(this.selectedLevels);
        let counter = 0;
        // Pre-order DFS over the subtree gives a stable, readable handle order.
        const all = getAllDescendants(this.reviewRoot);
        for (const node of all) {
            if (!selected.has(node.level)) {
                continue;
            }
            counter += 1;
            const handle = `N${counter}`;
            const layerLabel = baseLayerName(node.template[node.level] ?? `Level ${node.level}`);
            const scopeNode: ReviewScopeNode = {
                handle,
                nodeId: node.id,
                level: node.level,
                layerLabel,
                pathLabel: `${layerLabel}: ${node.title}`
            };
            this.scopeNodes.push(scopeNode);
            this.handleToNode.set(handle, node);
            this.nodeIdToHandle.set(node.id, handle);
        }
    }

    public getReviewRoot(): DocumentNode {
        return this.reviewRoot;
    }

    public getSelectedLevels(): number[] {
        return [...this.selectedLevels];
    }

    public getScopeNodes(): ReviewScopeNode[] {
        return [...this.scopeNodes];
    }

    public getNodeByHandle(handle: string): DocumentNode | null {
        return this.handleToNode.get(handle) ?? null;
    }

    public getHandleForNodeId(nodeId: string): string | null {
        return this.nodeIdToHandle.get(nodeId) ?? null;
    }

    public get size(): number {
        return this.scopeNodes.length;
    }
}
