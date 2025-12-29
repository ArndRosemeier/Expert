// Core RPG System Type Definitions

/**
 * A location in the game world
 */
export interface RPGLocation {
    id: string;
    name: string;
    description: string;
    state: Record<string, unknown>; // Flexible JSON for dynamic attributes (weather, time, etc.)
    /**
     * Scene-scoped state. Must be treated as ephemeral and may be cleared when the player leaves the scene
     * or when the entity is no longer present.
     */
    sceneState: Record<string, unknown>;
    /**
     * Conversation turn when this entity was created (0 = initial setup / intro turn).
     */
    createdTurn: number;
    /**
     * Conversation turn when this entity was last included in the narrator context.
     */
    lastUsedTurn: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * A character in the game world (NPC or player)
 */
export interface RPGCharacter {
    id: string;
    name: string;
    description: string;
    state: Record<string, unknown>; // Flexible JSON (health, mood, inventory, etc.)
    /**
     * Scene-scoped state. Must be treated as ephemeral and may be cleared when the character leaves the scene.
     */
    sceneState: Record<string, unknown>;
    /**
     * Optional long-term goals for coherence. These are durable and should evolve over time.
     */
    goals: RPGGoal[];
    /**
     * Conversation turn when this entity was created (0 = initial setup / intro turn).
     */
    createdTurn: number;
    /**
     * Conversation turn when this entity was last included in the narrator context.
     */
    lastUsedTurn: number;
    createdAt: number;
    updatedAt: number;
}

export type RPGGoalStatus = 'active' | 'completed' | 'abandoned';
export type RPGGoalPriority = 1 | 2 | 3 | 4 | 5;

export interface RPGGoal {
    id: string;
    text: string;
    status: RPGGoalStatus;
    priority: RPGGoalPriority;
    createdTurn: number;
    updatedTurn: number;
}

/**
 * Background information, events, and world-building details
 */
export interface RPGLore {
    id: string;
    title: string;
    content: string;
    tags: string[];
    /**
     * Conversation turn when this item was created (0 = initial setup / intro turn).
     */
    createdTurn: number;
    /**
     * Conversation turn when this item was last included in the narrator context.
     */
    lastUsedTurn: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * Relationship between two entities (Character↔Character, Character↔Location, etc.)
 */
export type RPGRelationshipKind =
    | 'located_at'
    | 'describes'
    | 'found_at'
    | 'knows_name_of'
    | 'knows_about'
    | 'knows_fact'
    | 'attitude_towards';

export type RPGAttitudeStance =
    | 'friendly'
    | 'neutral'
    | 'hostile'
    | 'fearful'
    | 'respectful'
    | 'suspicious'
    | 'romantic'
    | 'disgusted';

export type RPGAttitudeIntensity = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export interface RPGRelationshipBase<K extends RPGRelationshipKind> {
    id: string;
    fromId: string; // Entity ID
    toId: string;   // Entity ID
    kind: K;
    /**
     * Optional human-readable note about the relationship (not authoritative mechanics).
     */
    note?: string | undefined;
    /**
     * Conversation turn when this relationship was created (0 = initial setup / intro turn).
     */
    createdTurn: number;
    /**
     * Conversation turn when this relationship was last included in the narrator context.
     */
    lastUsedTurn: number;
    createdAt: number;
    updatedAt: number;
}

export type RPGRelationship =
    | RPGRelationshipBase<'located_at'>
    | RPGRelationshipBase<'describes'>
    | RPGRelationshipBase<'found_at'>
    | RPGRelationshipBase<'knows_name_of'>
    | RPGRelationshipBase<'knows_about'>
    | RPGRelationshipBase<'knows_fact'>
    | (RPGRelationshipBase<'attitude_towards'> & {
        stance: RPGAttitudeStance;
        intensity: RPGAttitudeIntensity;
        reason?: string | undefined;
    });

/**
 * Legacy relationship shape (pre-typed relationships).
 * Used for explicit migration when loading old sessions.
 */
export interface RPGLegacyRelationshipSerialized {
    id: string;
    fromId: string;
    toId: string;
    type: string;
    description?: string | undefined;
    createdAt: number;
    updatedAt: number;
}

/**
 * Distance/travel time between two locations (emergent, extracted from narrative)
 */
export interface RPGDistance {
    fromLocationId: string;
    toLocationId: string;
    distance: number | string; // Can be numeric value or range
    unit: string; // 'km', 'miles', 'hours', 'days', etc.
    /**
     * Conversation turn when this distance entry was created (0 = initial setup / intro turn).
     */
    createdTurn: number;
    /**
     * Conversation turn when this distance entry was last included in the narrator context.
     */
    lastUsedTurn: number;
    createdAt: number;
}

/**
 * The complete game world state
 */
export interface RPGWorldState {
    locations: Map<string, RPGLocation>;
    characters: Map<string, RPGCharacter>;
    lore: Map<string, RPGLore>;
    relationships: Map<string, RPGRelationship>;
    distances: RPGDistance[];
    recentEventsSummary: string;
    currentLocationId: string;
    playerCharacterId: string;
}

/**
 * A snapshot of the world state at a specific turn (for undo/rollback)
 */
export interface RPGSnapshot {
    id: string;
    timestamp: number;
    worldState: RPGWorldState;
    conversationTurn: number;
}

/**
 * A single message in the conversation
 */
export interface RPGConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    /**
     * Rollback point ID captured BEFORE generating the assistant response for this turn.
     * This is an in-memory rollback key (not a persisted snapshot).
     * Only set on assistant messages so the UI can offer "Retry" (rollback + resend).
     */
    preTurnRollbackId?: string;
    /**
     * Persisted checkpoint snapshot ID corresponding to the world state AFTER this assistant message's turn was applied.
     * Only set on assistant messages (including the initial GM intro).
     */
    checkpointSnapshotId?: string;
    /**
     * Diagnostics for the narrator LLM call that produced this assistant message.
     */
    narratorPromptCharCount?: number;
    narratorWorldItemsSentCount?: number;
    narratorWorldItemsTotalCount?: number;
}

export interface RPGManualSave {
    id: string;
    snapshotId: string;
    conversationTurn: number;
    locationId: string;
    locationName: string;
    createdAt: number;
}

export type RPGEntityType = 'location' | 'character' | 'lore' | 'relationship' | 'distance';

export interface RPGSuspiciousEntityFlag {
    entityId: string;
    entityType: RPGEntityType;
    reason: string;
    conversationTurn: number;
    createdAt: number;
}

/**
 * A complete RPG game session
 */
export interface RPGGameSession {
    id: string;
    title: string;
    worldState: RPGWorldState;
    conversationHistory: RPGConversationMessage[]; // Full history for display
    last2Messages: RPGConversationMessage[]; // Only last 2 for LLM context
    snapshots: string[]; // Snapshot IDs
    manualSaves: RPGManualSave[];
    suspiciousEntities: RPGSuspiciousEntityFlag[];
    narratorPurpose: string; // Model purpose for Game LLM (default: 'prose')
    parserPurpose: string; // Model purpose for State Parser LLM (default: 'editor')
    customSystemPrompt?: string; // Custom system prompt for Game LLM (includes style and rules)
    /**
     * One-shot system note injected into the next narrator call only.
     * Used for events that must immediately re-anchor narration context (e.g. player character takeover).
     */
    pendingNarratorSystemNote?: string;
    createdAt: number;
    updatedAt: number;
}

/**
 * Structured state update extracted from State Parser LLM output (XML)
 */
export interface RPGStateUpdateXML {
    locations?: Array<{
        action: 'create' | 'update';
        id: string;
        name?: string;
        description?: string;
        /**
         * Verbatim evidence copied from the GM response that justifies this entity and captures key details.
         * Intended mainly for action="create" so the initial description cannot lose important nuances.
         */
        verbatimEvidence?: string;
        state?: Record<string, unknown>;
        sceneState?: Record<string, unknown>;
    }>;
    characters?: Array<{
        action: 'create' | 'update';
        id: string;
        name?: string;
        description?: string;
        /**
         * Verbatim evidence copied from the GM response that justifies this entity and captures key details.
         * Intended mainly for action="create" so the initial description cannot lose important nuances.
         */
        verbatimEvidence?: string;
        state?: Record<string, unknown>;
        sceneState?: Record<string, unknown>;
        goals?: RPGGoal[];
    }>;
    lore?: Array<{
        action: 'create' | 'update';
        id: string;
        title?: string;
        content?: string;
        tags?: string[];
    }>;
    relationships?: Array<
        | {
            action: 'create' | 'update' | 'delete';
            kind: Exclude<RPGRelationshipKind, 'attitude_towards'>;
            fromId: string;
            toId: string;
            note?: string;
        }
        | {
            action: 'create' | 'update' | 'delete';
            kind: 'attitude_towards';
            fromId: string;
            toId: string;
            stance?: RPGAttitudeStance;
            intensity?: RPGAttitudeIntensity;
            reason?: string;
            note?: string;
        }
    >;
    distances?: Array<{
        fromLocationId: string;
        toLocationId: string;
        distance: number | string;
        unit: string;
    }>;
    recentEventsSummary?: string;
    playerLocation?: {
        currentLocationId: string;
    };
    /**
     * Optional scene roster extracted from the GM response.
     * This exists to make scene membership robust even if individual located_at relationships are missed.
     */
    scene?: {
        presentCharacterIds: string[];
    };
    diagnostics?: Array<{
        entityId: string;
        reason: string;
    }>;
}

/**
 * Model configuration for narrator and parser
 */
export interface RPGModelConfig {
    narratorPurpose: string; // Default: 'prose'
    parserPurpose: string;   // Default: 'editor'
}

/**
 * State analysis status (for UI)
 */
export interface RPGAnalysisState {
    isAnalyzing: boolean;
    canSubmit: boolean;
}

/**
 * Serializable version of RPGWorldState (for storage)
 */
export interface RPGWorldStateSerialized {
    locations: Record<string, RPGLocation>;
    characters: Record<string, RPGCharacter>;
    lore: Record<string, RPGLore>;
    relationships: Record<string, RPGRelationship | RPGLegacyRelationshipSerialized>;
    distances: RPGDistance[];
    recentEventsSummary: string;
    currentLocationId: string;
    playerCharacterId: string;
}

/**
 * Serializable version of RPGSnapshot (for storage)
 */
export interface RPGSnapshotSerialized {
    id: string;
    timestamp: number;
    worldState: RPGWorldStateSerialized;
    conversationTurn: number;
}

/**
 * Serializable version of RPGGameSession (for storage)
 */
export interface RPGGameSessionSerialized {
    id: string;
    title: string;
    worldState: RPGWorldStateSerialized;
    conversationHistory: RPGConversationMessage[];
    last2Messages: RPGConversationMessage[];
    snapshots: string[];
    manualSaves?: RPGManualSave[];
    suspiciousEntities?: RPGSuspiciousEntityFlag[];
    narratorPurpose: string;
    parserPurpose: string;
    customSystemPrompt?: string;
    pendingNarratorSystemNote?: string;
    createdAt: number;
    updatedAt: number;
}

/**
 * Helper functions for serialization/deserialization
 */
export function serializeWorldState(state: RPGWorldState): RPGWorldStateSerialized {
    return {
        locations: Object.fromEntries(state.locations),
        characters: Object.fromEntries(state.characters),
        lore: Object.fromEntries(state.lore),
        relationships: Object.fromEntries(state.relationships),
        distances: state.distances,
        recentEventsSummary: state.recentEventsSummary,
        currentLocationId: state.currentLocationId,
        playerCharacterId: state.playerCharacterId
    };
}

export function deserializeWorldState(serialized: RPGWorldStateSerialized): RPGWorldState {
    const migratedRelationships = new Map<string, RPGRelationship>();
    for (const [id, rel] of Object.entries(serialized.relationships)) {
        migratedRelationships.set(id, migrateRelationship(rel));
    }

    const migratedLocations = new Map<string, RPGLocation>();
    for (const [id, loc] of Object.entries(serialized.locations)) {
        const anyLoc = loc as RPGLocation & { createdTurn?: number; lastUsedTurn?: number; sceneState?: Record<string, unknown> };
        const createdTurn = anyLoc.createdTurn ?? 0;
        migratedLocations.set(id, {
            ...anyLoc,
            createdTurn,
            lastUsedTurn: anyLoc.lastUsedTurn ?? createdTurn,
            sceneState: anyLoc.sceneState ?? {}
        });
    }

    const migratedCharacters = new Map<string, RPGCharacter>();
    for (const [id, ch] of Object.entries(serialized.characters)) {
        const anyCh = ch as RPGCharacter & { createdTurn?: number; lastUsedTurn?: number; sceneState?: Record<string, unknown>; goals?: RPGGoal[] };
        const createdTurn = anyCh.createdTurn ?? 0;
        migratedCharacters.set(id, {
            ...anyCh,
            createdTurn,
            lastUsedTurn: anyCh.lastUsedTurn ?? createdTurn,
            sceneState: anyCh.sceneState ?? {},
            goals: anyCh.goals ?? []
        });
    }

    const migratedLore = new Map<string, RPGLore>();
    for (const [id, lore] of Object.entries(serialized.lore)) {
        const anyLore = lore as RPGLore & { createdTurn?: number; lastUsedTurn?: number };
        const createdTurn = anyLore.createdTurn ?? 0;
        migratedLore.set(id, {
            ...anyLore,
            createdTurn,
            lastUsedTurn: anyLore.lastUsedTurn ?? createdTurn
        });
    }

    const migratedDistances: RPGDistance[] = serialized.distances.map(d => {
        const anyD = d as RPGDistance & { createdTurn?: number; lastUsedTurn?: number };
        const createdTurn = anyD.createdTurn ?? 0;
        return {
            ...anyD,
            createdTurn,
            lastUsedTurn: anyD.lastUsedTurn ?? createdTurn
        };
    });

    return {
        locations: migratedLocations,
        characters: migratedCharacters,
        lore: migratedLore,
        relationships: migratedRelationships,
        distances: migratedDistances,
        recentEventsSummary: serialized.recentEventsSummary,
        currentLocationId: serialized.currentLocationId,
        playerCharacterId: serialized.playerCharacterId
    };
}

function migrateRelationship(rel: RPGRelationship | RPGLegacyRelationshipSerialized): RPGRelationship {
    if ('kind' in rel) {
        const anyRel = rel as RPGRelationship & { createdTurn?: number; lastUsedTurn?: number };
        const createdTurn = anyRel.createdTurn ?? 0;
        return {
            ...anyRel,
            createdTurn,
            lastUsedTurn: anyRel.lastUsedTurn ?? createdTurn
        };
    }

    // Legacy shape: { type, description } -> { kind, note } (+ typed payload when possible)
    const note = rel.description;

    if (rel.type === 'located_at') {
        return { id: rel.id, fromId: rel.fromId, toId: rel.toId, kind: 'located_at', note, createdTurn: 0, lastUsedTurn: 0, createdAt: rel.createdAt, updatedAt: rel.updatedAt };
    }
    if (rel.type === 'describes') {
        return { id: rel.id, fromId: rel.fromId, toId: rel.toId, kind: 'describes', note, createdTurn: 0, lastUsedTurn: 0, createdAt: rel.createdAt, updatedAt: rel.updatedAt };
    }
    if (rel.type === 'found_at') {
        return { id: rel.id, fromId: rel.fromId, toId: rel.toId, kind: 'found_at', note, createdTurn: 0, lastUsedTurn: 0, createdAt: rel.createdAt, updatedAt: rel.updatedAt };
    }
    if (rel.type === 'knows_name_of') {
        return { id: rel.id, fromId: rel.fromId, toId: rel.toId, kind: 'knows_name_of', note, createdTurn: 0, lastUsedTurn: 0, createdAt: rel.createdAt, updatedAt: rel.updatedAt };
    }

    // Deterministic legacy mappings (explicit + visible)
    if (rel.type === 'friend') {
        return {
            id: rel.id,
            fromId: rel.fromId,
            toId: rel.toId,
            kind: 'attitude_towards',
            stance: 'friendly',
            intensity: 2,
            note,
            createdTurn: 0,
            lastUsedTurn: 0,
            createdAt: rel.createdAt,
            updatedAt: rel.updatedAt
        };
    }
    if (rel.type === 'enemy') {
        return {
            id: rel.id,
            fromId: rel.fromId,
            toId: rel.toId,
            kind: 'attitude_towards',
            stance: 'hostile',
            intensity: -2,
            note,
            createdTurn: 0,
            lastUsedTurn: 0,
            createdAt: rel.createdAt,
            updatedAt: rel.updatedAt
        };
    }
    if (rel.type === 'knows') {
        return { id: rel.id, fromId: rel.fromId, toId: rel.toId, kind: 'knows_about', note, createdTurn: 0, lastUsedTurn: 0, createdAt: rel.createdAt, updatedAt: rel.updatedAt };
    }

    throw new Error(`Unsupported legacy relationship type '${rel.type}' (id=${rel.id}).`);
}

export function serializeSnapshot(snapshot: RPGSnapshot): RPGSnapshotSerialized {
    return {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        worldState: serializeWorldState(snapshot.worldState),
        conversationTurn: snapshot.conversationTurn
    };
}

export function deserializeSnapshot(serialized: RPGSnapshotSerialized): RPGSnapshot {
    return {
        id: serialized.id,
        timestamp: serialized.timestamp,
        worldState: deserializeWorldState(serialized.worldState),
        conversationTurn: serialized.conversationTurn
    };
}

export function serializeSession(session: RPGGameSession): RPGGameSessionSerialized {
    return {
        id: session.id,
        title: session.title,
        worldState: serializeWorldState(session.worldState),
        conversationHistory: session.conversationHistory,
        last2Messages: session.last2Messages,
        snapshots: session.snapshots,
        manualSaves: session.manualSaves,
        suspiciousEntities: session.suspiciousEntities,
        narratorPurpose: session.narratorPurpose,
        parserPurpose: session.parserPurpose,
        ...(session.customSystemPrompt !== undefined && { customSystemPrompt: session.customSystemPrompt }),
        ...(session.pendingNarratorSystemNote !== undefined && { pendingNarratorSystemNote: session.pendingNarratorSystemNote }),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
    };
}

export function deserializeSession(serialized: RPGGameSessionSerialized): RPGGameSession {
    return {
        id: serialized.id,
        title: serialized.title,
        worldState: deserializeWorldState(serialized.worldState),
        conversationHistory: serialized.conversationHistory,
        last2Messages: serialized.last2Messages,
        snapshots: serialized.snapshots,
        manualSaves: serialized.manualSaves || [],
        suspiciousEntities: serialized.suspiciousEntities || [],
        narratorPurpose: serialized.narratorPurpose,
        parserPurpose: serialized.parserPurpose,
        ...(serialized.customSystemPrompt !== undefined && { customSystemPrompt: serialized.customSystemPrompt }),
        ...(serialized.pendingNarratorSystemNote !== undefined && { pendingNarratorSystemNote: serialized.pendingNarratorSystemNote }),
        createdAt: serialized.createdAt,
        updatedAt: serialized.updatedAt
    };
}

