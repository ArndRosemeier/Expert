/**
 * ReviewCommitService - persists selected staged edits to the live tree.
 *
 * For each included node it applies conditional-context changes directly (they
 * are not versioned), then captures content/title as a new promoted version so
 * the edit is part of the node's version history. Finally it saves the project
 * and emits a tree-update so the UI re-renders. Staging cleanup is the caller's
 * responsibility (the modal clears the persisted stage after a successful commit).
 */

import { v4 as uuidv4 } from 'uuid';
import { DocumentNode } from '../DocumentNode';
import { ProjectManager } from '../ProjectManager';
import { StagedNodeEdit } from './ReviewTypes';

export interface ReviewCommitResult {
    committedNodeCount: number;
    skippedNodeCount: number;
}

export class ReviewCommitService {
    public static async commit(
        projectManager: ProjectManager,
        reviewRootId: string,
        stagedEdits: StagedNodeEdit[]
    ): Promise<ReviewCommitResult> {
        let committed = 0;
        let skipped = 0;

        for (const edit of stagedEdits) {
            if (!edit.include) {
                skipped += 1;
                continue;
            }
            const node = projectManager.findNodeById(edit.nodeId);
            if (!node) {
                throw new Error(`ReviewCommitService: node ${edit.nodeId} (${edit.handle}) not found in project`);
            }
            ReviewCommitService.applyContext(node, edit);
            ReviewCommitService.applyContentAndTitle(node, edit);
            committed += 1;
        }

        await projectManager.saveToStorage();
        projectManager.emit('tree-update-needed', { nodeId: reviewRootId, reason: 'guided-review-commit' });

        return { committedNodeCount: committed, skippedNodeCount: skipped };
    }

    private static applyContentAndTitle(node: DocumentNode, edit: StagedNodeEdit): void {
        const titleChanged = edit.titleAfter !== edit.titleBefore;
        const contentChanged = edit.contentAfter !== edit.contentBefore;
        if (!titleChanged && !contentChanged) {
            return;
        }
        // The uuid tag keeps each commit's tag-set unique so addVersion never
        // dedupes against a previous reviewer edit.
        const versionId = node.addVersion(
            ['reviewer_edit', uuidv4()],
            { content: edit.contentAfter, title: edit.titleAfter }
        );
        if (versionId === null) {
            throw new Error(`ReviewCommitService: failed to create version for node ${edit.nodeId}`);
        }
        node.promoteToMaster(versionId);
    }

    private static applyContext(node: DocumentNode, edit: StagedNodeEdit): void {
        // Removals: committed items whose id is absent from the staged result.
        const afterIds = new Set(
            edit.contextAfter.filter(i => i.id !== null).map(i => i.id as string)
        );
        for (const before of edit.contextBefore) {
            if (before.id !== null && !afterIds.has(before.id)) {
                node.removeConditionalContextItem(before.id);
            }
        }

        const beforeById = new Map(
            edit.contextBefore.filter(i => i.id !== null).map(i => [i.id as string, i])
        );

        for (const after of edit.contextAfter) {
            if (after.id === null) {
                const newId = node.addConditionalContextItem(after.text, [], 'AND');
                if (after.trigger) {
                    node.updateConditionalContextItem(newId, { keywords: [after.trigger] });
                }
                continue;
            }
            const before = beforeById.get(after.id);
            const textChanged = !before || before.text !== after.text;
            const triggerChanged = !before || before.trigger !== after.trigger;
            if (textChanged || triggerChanged) {
                node.updateConditionalContextItem(after.id, {
                    text: after.text,
                    keywords: after.trigger ? [after.trigger] : []
                });
            }
        }
    }
}
