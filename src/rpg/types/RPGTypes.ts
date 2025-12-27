// Core RPG System Type Definitions

/**
 * A location in the game world
 */
export interface RPGLocation {
    id: string;
    name: string;
    description: string;
    state: Record<string, unknown>; // Flexible JSON for dynamic attributes (weather, time, etc.)
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
    createdAt: number;
    updatedAt: number;
}

/**
 * Background information, events, and world-building details
 */
export interface RPGLore {
    id: string;
    title: string;
    content: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
}

/**
 * Relationship between two entities (Character↔Character, Character↔Location, etc.)
 */
export interface RPGRelationship {
    id: string;
    fromId: string; // Entity ID
    toId: string;   // Entity ID
    type: string;   // 'friend', 'enemy', 'knows', 'located_at', 'related_to', etc.
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
    narratorPurpose: string; // Model purpose for Game LLM (default: 'prose')
    parserPurpose: string; // Model purpose for State Parser LLM (default: 'editor')
    customSystemPrompt?: string; // Custom system prompt for Game LLM (includes style and rules)
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
        state?: Record<string, unknown>;
    }>;
    characters?: Array<{
        action: 'create' | 'update';
        id: string;
        name?: string;
        description?: string;
        state?: Record<string, unknown>;
    }>;
    lore?: Array<{
        action: 'create' | 'update';
        id: string;
        title?: string;
        content?: string;
        tags?: string[];
    }>;
    relationships?: Array<{
        action: 'create' | 'update' | 'delete';
        fromId: string;
        toId: string;
        type: string;
        description?: string;
    }>;
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
    relationships: Record<string, RPGRelationship>;
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
    narratorPurpose: string;
    parserPurpose: string;
    customSystemPrompt?: string;
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
    return {
        locations: new Map(Object.entries(serialized.locations)),
        characters: new Map(Object.entries(serialized.characters)),
        lore: new Map(Object.entries(serialized.lore)),
        relationships: new Map(Object.entries(serialized.relationships)),
        distances: serialized.distances,
        recentEventsSummary: serialized.recentEventsSummary,
        currentLocationId: serialized.currentLocationId,
        playerCharacterId: serialized.playerCharacterId
    };
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
        narratorPurpose: session.narratorPurpose,
        parserPurpose: session.parserPurpose,
        ...(session.customSystemPrompt !== undefined && { customSystemPrompt: session.customSystemPrompt }),
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
        narratorPurpose: serialized.narratorPurpose,
        parserPurpose: serialized.parserPurpose,
        ...(serialized.customSystemPrompt !== undefined && { customSystemPrompt: serialized.customSystemPrompt }),
        createdAt: serialized.createdAt,
        updatedAt: serialized.updatedAt
    };
}

