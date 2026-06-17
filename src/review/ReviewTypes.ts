/**
 * Shared types for the Guided Reviewer feature.
 *
 * The Guided Reviewer makes sweeping, multi-node edits across a node's subtree
 * (e.g. renaming a character across every scene). These types describe the
 * review scope, the node-addressed commands the LLM emits, the ephemeral staged
 * edits, and the serializable session state used for crash recovery.
 *
 * Design notes:
 * - Only the SELECTED layers are editable AND visible to the LLM. Each layer is
 *   a self-contained abstraction level of the same story.
 * - Nodes are referenced by short, per-session handles ("N1", "N2", ...) that
 *   map to real DocumentNode ids. Handles are recomputed deterministically when
 *   a session is (re)opened, so only their inputs (selected levels) are persisted.
 */

/** AI model purpose, matching ModelSelector's purpose keys. */
export type ReviewPurpose = 'creator' | 'rater' | 'editor' | 'prose';

/** A single chat turn in the reviewer conversation. */
export interface ReviewChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * A conditional-context item belonging to an in-scope node (own items only).
 * `id` is the real DocumentNode conditional-context id, or null for a staged
 * add that has not been committed yet.
 */
export interface ReviewContextItem {
    /** Real conditional-context id, or null for an uncommitted staged add. */
    id: string | null;
    /** Stable id used to track the item within the session (also for adds). */
    workingId: string;
    text: string;
    /** Single trigger keyword, or null for a global (always-on) item. */
    trigger: string | null;
}

/** One node pulled into the review scope, with its stable session handle. */
export interface ReviewScopeNode {
    handle: string;
    nodeId: string;
    level: number;
    layerLabel: string;
    pathLabel: string;
}

/** Per-layer summary used by the layer selector UI. */
export interface ReviewLayerInfo {
    /** Absolute template level. */
    level: number;
    label: string;
    nodeCount: number;
}

/**
 * The working (staged) edit accumulator for a single node. `*Before` fields are
 * the committed state captured when the node first received a staged change;
 * `*After` fields are the current working values. A node is "changed" when any
 * after value differs from its before value.
 */
export interface StagedNodeEdit {
    nodeId: string;
    handle: string;
    pathLabel: string;
    titleBefore: string;
    titleAfter: string;
    contentBefore: string;
    contentAfter: string;
    contextBefore: ReviewContextItem[];
    contextAfter: ReviewContextItem[];
    /** Whether the user has selected this node's changes for the next commit. */
    include: boolean;
}

/**
 * Full, serializable session state. Persisted to IndexedDB so an in-progress
 * review survives a crash/reload. Cleared once a commit succeeds.
 */
export interface ReviewSessionState {
    reviewRootId: string;
    projectRootId: string;
    purpose: ReviewPurpose;
    /** Absolute template levels currently selected (editable + in context). */
    selectedLevels: number[];
    conversation: ReviewChatMessage[];
    /** Staged edits; only nodes with real changes are retained. */
    stagedEdits: StagedNodeEdit[];
}

/** A node-addressed command parsed from an LLM response. */
export type ReviewCommand =
    | { kind: 'edit'; handle: string; content: string; rawXml: string }
    | { kind: 'title'; handle: string; title: string; rawXml: string }
    | { kind: 'replace'; handle: string; search: string; replace: string; rawXml: string }
    | { kind: 'multi_replace'; scope: MultiReplaceScope; search: string; replace: string; rawXml: string }
    | { kind: 'context_add'; handle: string; text: string; trigger: string | null; rawXml: string }
    | { kind: 'context_edit'; handle: string; itemId: string; text: string | null; trigger: string | null; hasTrigger: boolean; rawXml: string }
    | { kind: 'context_remove'; handle: string; itemId: string; rawXml: string };

/** Where a multi_replace applies. */
export type MultiReplaceScope = 'content' | 'context' | 'both';

/** A parse error surfaced loudly to the user (no silent drops). */
export interface ReviewParseError {
    message: string;
    sourceText: string;
}

/** Result of parsing an LLM response into commands. */
export interface ReviewParseResult {
    commands: ReviewCommand[];
    errors: ReviewParseError[];
}

/** Outcome of applying a single command, used to echo Executed/Failed badges. */
export interface ReviewCommandResult {
    rawXml: string;
    ok: boolean;
    message: string;
}

/** Serialized scope for the prompt, with a rough size estimate. */
export interface SerializedScope {
    text: string;
    charCount: number;
    approxTokens: number;
}
