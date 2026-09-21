/**
 * ReviewStageApplier - applies parsed commands to the in-memory staged edits.
 *
 * The applier holds a working copy of the staged edits (keyed by node id),
 * lazily seeding an entry from a node's current committed state the first time
 * it is touched. Commands are applied sequentially, so later commands see the
 * results of earlier ones. Nothing here touches the live DocumentNode versions;
 * persistence happens only at commit time (ReviewCommitService).
 */

import { v4 as uuidv4 } from 'uuid';
import { ReviewScope } from './ReviewScope';
import {
    ReviewCommand,
    ReviewCommandResult,
    ReviewContextItem,
    StagedNodeEdit
} from './ReviewTypes';

export class ReviewStageApplier {
    private readonly scope: ReviewScope;
    private readonly working = new Map<string, StagedNodeEdit>();

    constructor(scope: ReviewScope, initial: StagedNodeEdit[]) {
        this.scope = scope;
        for (const edit of initial) {
            this.working.set(edit.nodeId, ReviewStageApplier.cloneEdit(edit));
        }
    }

    /** Applies all commands in order, returning one result per command. */
    public applyCommands(commands: ReviewCommand[]): ReviewCommandResult[] {
        return commands.map(command => this.applyCommand(command));
    }

    /** Returns the staged edits that represent a real change, with include flags. */
    public getStagedEdits(): StagedNodeEdit[] {
        const result: StagedNodeEdit[] = [];
        for (const edit of this.working.values()) {
            if (ReviewStageApplier.hasChanges(edit)) {
                result.push(edit);
            }
        }
        return result;
    }

    private applyCommand(command: ReviewCommand): ReviewCommandResult {
        switch (command.kind) {
            case 'edit':
                return this.applyEdit(command.handle, command.content, command.rawXml);
            case 'title':
                return this.applyTitle(command.handle, command.title, command.rawXml);
            case 'replace':
                return this.applyReplace(command.handle, command.search, command.replace, command.rawXml);
            case 'multi_replace':
                return this.applyMultiReplace(command.scope, command.search, command.replace, command.rawXml);
            case 'context_add':
                return this.applyContextAdd(command.handle, command.text, command.trigger, command.rawXml);
            case 'context_edit':
                return this.applyContextEdit(command.handle, command.itemId, command.text, command.trigger, command.hasTrigger, command.rawXml);
            case 'context_remove':
                return this.applyContextRemove(command.handle, command.itemId, command.rawXml);
            default: {
                const exhaustive: never = command;
                throw new Error(`ReviewStageApplier: unhandled command ${JSON.stringify(exhaustive)}`);
            }
        }
    }

    private applyEdit(handle: string, content: string, rawXml: string): ReviewCommandResult {
        const entry = this.ensureEntry(handle);
        if (!entry) {
            return { rawXml, ok: false, message: `Unknown node handle "${handle}".` };
        }
        entry.contentAfter = content;
        return { rawXml, ok: true, message: `Replaced content of ${handle}.` };
    }

    private applyTitle(handle: string, title: string, rawXml: string): ReviewCommandResult {
        const entry = this.ensureEntry(handle);
        if (!entry) {
            return { rawXml, ok: false, message: `Unknown node handle "${handle}".` };
        }
        entry.titleAfter = title;
        return { rawXml, ok: true, message: `Renamed ${handle}.` };
    }

    private applyReplace(handle: string, search: string, replace: string, rawXml: string): ReviewCommandResult {
        const entry = this.ensureEntry(handle);
        if (!entry) {
            return { rawXml, ok: false, message: `Unknown node handle "${handle}".` };
        }
        const count = ReviewStageApplier.countOccurrences(entry.contentAfter, search);
        if (count === 0) {
            return { rawXml, ok: false, message: `Search text not found in ${handle}.` };
        }
        entry.contentAfter = entry.contentAfter.split(search).join(replace);
        return { rawXml, ok: true, message: `Replaced ${count} occurrence(s) in ${handle}.` };
    }

    private applyMultiReplace(scope: 'content' | 'context' | 'both', search: string, replace: string, rawXml: string): ReviewCommandResult {
        const applyToContent = scope === 'content' || scope === 'both';
        const applyToContext = scope === 'context' || scope === 'both';
        let totalReplacements = 0;
        let affectedNodes = 0;

        for (const scopeNode of this.scope.getScopeNodes()) {
            const entry = this.ensureEntryByNodeId(scopeNode.nodeId, scopeNode.handle);
            if (!entry) {
                continue;
            }
            let nodeReplacements = 0;
            if (applyToContent) {
                const count = ReviewStageApplier.countOccurrences(entry.contentAfter, search);
                if (count > 0) {
                    entry.contentAfter = entry.contentAfter.split(search).join(replace);
                    nodeReplacements += count;
                }
            }
            if (applyToContext) {
                for (const item of entry.contextAfter) {
                    const count = ReviewStageApplier.countOccurrences(item.text, search);
                    if (count > 0) {
                        item.text = item.text.split(search).join(replace);
                        nodeReplacements += count;
                    }
                }
            }
            if (nodeReplacements > 0) {
                totalReplacements += nodeReplacements;
                affectedNodes += 1;
            }
        }

        if (totalReplacements === 0) {
            return { rawXml, ok: false, message: `Search text not found anywhere (scope: ${scope}).` };
        }
        return { rawXml, ok: true, message: `Replaced ${totalReplacements} occurrence(s) across ${affectedNodes} node(s) (scope: ${scope}).` };
    }

    private applyContextAdd(handle: string, text: string, trigger: string | null, rawXml: string): ReviewCommandResult {
        const entry = this.ensureEntry(handle);
        if (!entry) {
            return { rawXml, ok: false, message: `Unknown node handle "${handle}".` };
        }
        const item: ReviewContextItem = {
            id: null,
            workingId: uuidv4(),
            text,
            trigger: ReviewStageApplier.normalizeTrigger(trigger)
        };
        entry.contextAfter.push(item);
        return { rawXml, ok: true, message: `Added a ${item.trigger ? `triggered ("${item.trigger}")` : 'global'} context item to ${handle}.` };
    }

    private applyContextEdit(handle: string, itemId: string, text: string | null, trigger: string | null, hasTrigger: boolean, rawXml: string): ReviewCommandResult {
        const entry = this.ensureEntry(handle);
        if (!entry) {
            return { rawXml, ok: false, message: `Unknown node handle "${handle}".` };
        }
        const item = entry.contextAfter.find(i => i.id === itemId);
        if (!item) {
            return { rawXml, ok: false, message: `Context item "${itemId}" not found on ${handle}.` };
        }
        if (text !== null) {
            item.text = text;
        }
        if (hasTrigger) {
            item.trigger = ReviewStageApplier.normalizeTrigger(trigger);
        }
        return { rawXml, ok: true, message: `Edited context item "${itemId}" on ${handle}.` };
    }

    private applyContextRemove(handle: string, itemId: string, rawXml: string): ReviewCommandResult {
        const entry = this.ensureEntry(handle);
        if (!entry) {
            return { rawXml, ok: false, message: `Unknown node handle "${handle}".` };
        }
        const before = entry.contextAfter.length;
        entry.contextAfter = entry.contextAfter.filter(i => i.id !== itemId);
        if (entry.contextAfter.length === before) {
            return { rawXml, ok: false, message: `Context item "${itemId}" not found on ${handle}.` };
        }
        return { rawXml, ok: true, message: `Removed context item "${itemId}" from ${handle}.` };
    }

    private ensureEntry(handle: string): StagedNodeEdit | null {
        const node = this.scope.getNodeByHandle(handle);
        if (!node) {
            return null;
        }
        return this.ensureEntryByNodeId(node.id, handle);
    }

    private ensureEntryByNodeId(nodeId: string, handle: string): StagedNodeEdit | null {
        const existing = this.working.get(nodeId);
        if (existing) {
            return existing;
        }
        const node = this.scope.getNodeByHandle(handle);
        if (node?.id !== nodeId) {
            return null;
        }
        const contextItems: ReviewContextItem[] = node.getConditionalContextItems().map(item => ({
            id: item.id,
            workingId: item.id,
            text: item.text,
            trigger: item.keywords && item.keywords.length > 0 ? item.keywords[0]! : null
        }));
        const pathLabel = this.scope.getScopeNodes().find(s => s.nodeId === nodeId)?.pathLabel ?? node.title;
        const edit: StagedNodeEdit = {
            nodeId,
            handle,
            pathLabel,
            titleBefore: node.title,
            titleAfter: node.title,
            contentBefore: node.content,
            contentAfter: node.content,
            contextBefore: contextItems.map(i => ({ ...i })),
            contextAfter: contextItems.map(i => ({ ...i })),
            include: true
        };
        this.working.set(nodeId, edit);
        return edit;
    }

    private static normalizeTrigger(trigger: string | null): string | null {
        if (trigger === null) {
            return null;
        }
        const trimmed = trigger.trim();
        return trimmed === '' ? null : trimmed;
    }

    private static countOccurrences(haystack: string, needle: string): number {
        if (needle === '') {
            return 0;
        }
        return haystack.split(needle).length - 1;
    }

    private static hasChanges(edit: StagedNodeEdit): boolean {
        if (edit.titleAfter !== edit.titleBefore) return true;
        if (edit.contentAfter !== edit.contentBefore) return true;
        return ReviewStageApplier.contextChanged(edit.contextBefore, edit.contextAfter);
    }

    private static contextChanged(before: ReviewContextItem[], after: ReviewContextItem[]): boolean {
        if (before.length !== after.length) return true;
        for (let i = 0; i < before.length; i++) {
            const b = before[i]!;
            const a = after[i]!;
            if (b.workingId !== a.workingId || b.text !== a.text || b.trigger !== a.trigger || b.id !== a.id) {
                return true;
            }
        }
        return false;
    }

    private static cloneEdit(edit: StagedNodeEdit): StagedNodeEdit {
        return {
            nodeId: edit.nodeId,
            handle: edit.handle,
            pathLabel: edit.pathLabel,
            titleBefore: edit.titleBefore,
            titleAfter: edit.titleAfter,
            contentBefore: edit.contentBefore,
            contentAfter: edit.contentAfter,
            contextBefore: edit.contextBefore.map(i => ({ ...i })),
            contextAfter: edit.contextAfter.map(i => ({ ...i })),
            include: edit.include
        };
    }
}
