/**
 * Type definitions for the Persistent World RPG module.
 *
 * Design notes:
 * - A `World` is a reusable, saved template. An `Adventure` forks (deep-copies)
 *   a world's graph and evolves it independently.
 * - The LLM never owns coordinates or the clock. It only emits relational facts
 *   (connections, distances in meters, moves). Deterministic code computes
 *   layout positions, travel time, and the in-world clock.
 * - Distances are stored in meters, with the `ADJACENT` sentinel for negligibly
 *   close locations (e.g. two rooms in a house) that cost a flat ~1 minute.
 */

import { OpenRouterUsage, OpenRouterCompletionMeta } from '../../OpenRouterClient';

export type WorldRpgModelPurpose = 'creator' | 'prose' | 'editor' | 'rater';

export type WorldRpgMessageRole = 'user' | 'assistant';

/** Sentinel distance for locations so close that travel time is negligible. */
export const ADJACENT = 'adjacent';
export type AdjacentDistance = typeof ADJACENT;

/** Edge distance: meters as a number, or the `ADJACENT` sentinel. */
export type EdgeDistance = number | AdjacentDistance;

export type TravelMode = 'foot' | 'horse' | 'cart' | 'boat' | 'car';

export type WorldGoalStatus = 'active' | 'completed' | 'abandoned';

export interface WorldGoal {
  id: string;
  text: string;
  status: WorldGoalStatus;
  createdTurn: number;
  updatedTurn: number;
}

/** A node in the world graph. */
export interface WorldLocation {
  id: string;
  name: string;
  description: string;
  /** Flexible durable attributes (weather, faction control, etc.). */
  state: Record<string, unknown>;
  /** Optional parent location id (e.g. a room inside a building). */
  subLocationOf?: string;
  /** True once the player character has physically been here. */
  visited: boolean;
  /** True if the player knows of this place (seen or heard of), even if unvisited. */
  known: boolean;
  /** Turn this entity was created (0 = initial world setup). */
  createdTurn: number;
  /** Turn this entity was last included in narrator context. */
  lastUsedTurn: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * A character that has left one location and is traveling to another. The
 * character keeps `locationId` = the origin for graph integrity, but is treated
 * as absent from the origin and "in transit" until the clock reaches arrival.
 */
export interface CharacterTransit {
  fromId: string;
  toId: string;
  /** In-world minute the character departed. */
  departedClock: number;
  /** In-world minute the character arrives (locationId flips to `toId` then). */
  arrivalClock: number;
}

/** A character (NPC or the player) living in the world graph. */
export interface WorldCharacter {
  id: string;
  name: string;
  description: string;
  /** Flexible attributes (health, mood, inventory, disposition, etc.). */
  state: Record<string, unknown>;
  /** Location id where the character currently is (origin while in transit). */
  locationId: string;
  /** Optional home/resident location id. */
  homeLocationId?: string;
  /** True for the adventure's player character. */
  isPlayer: boolean;
  /**
   * True if the player is aware of this character (met or heard of). Known
   * characters are always offered to the parser's id registry, so an NPC who
   * has wandered out of the locality window is never duplicated.
   */
  known: boolean;
  /** Present while the character is moving between locations. */
  transit?: CharacterTransit;
  goals: WorldGoal[];
  createdTurn: number;
  lastUsedTurn: number;
  createdAt: number;
  updatedAt: number;
}

/** A connection between two locations. Edges are symmetric (bidirectional). */
export interface WorldEdge {
  id: string;
  aId: string;
  bId: string;
  /** Distance in meters, or `ADJACENT` for negligible travel. */
  distance: EdgeDistance;
  /** Optional terrain/difficulty label; multiplies travel time when set. */
  terrain?: string;
  createdTurn: number;
  lastUsedTurn: number;
  createdAt: number;
  updatedAt: number;
}

/** Background/world-building information, retrieved on demand by name/tag. */
export interface WorldLore {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdTurn: number;
  lastUsedTurn: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorldClockConfig {
  /** Minutes per in-world day (default 1440). */
  minutesPerDay: number;
  /** Label for the day unit when formatting (e.g. "Day"). */
  dayLabel: string;
}

/** Travel speed per mode, expressed in meters per minute. */
export type SpeedTable = Record<TravelMode, number>;

/** A position in unbounded world space (not screen space). */
export interface MapPosition {
  x: number;
  y: number;
}

/**
 * The structured, non-LLM game world. Embedded in both `World` (template) and
 * `Adventure` (live, evolving copy).
 */
export interface WorldGraph {
  locations: Record<string, WorldLocation>;
  characters: Record<string, WorldCharacter>;
  edges: Record<string, WorldEdge>;
  lore: Record<string, WorldLore>;
  /**
   * Global, always-in-context world rules and setting canon: genre/background
   * (e.g. sci-fi, high fantasy), magic/technology systems, tone, and play rules.
   * Unlike `lore` (retrieved on demand by relevance), this is always sent to the
   * narrator so it is never contradicted. Free text; may be empty.
   */
  rules: string;
  clockConfig: WorldClockConfig;
  speeds: SpeedTable;
  /** Cached deterministic layout positions, keyed by location id. */
  layout: Record<string, MapPosition>;
}

/** A reusable, saved, versioned world template. */
export interface World {
  id: string;
  name: string;
  description: string;
  /** Monotonic version, bumped each time this record is overwritten. */
  version: number;
  /** Default location new adventures start at. */
  startLocationId: string;
  graph: WorldGraph;
  createdAt: number;
  updatedAt: number;
}

export interface WorldRpgGenerationMeta {
  purpose: WorldRpgModelPurpose;
  model: string;
  promptChars: number;
  completionChars: number;
  durationMs: number;
  usage?: OpenRouterUsage;
  totalCostUsd?: number;
}

export interface WorldRpgChatMessage {
  id: string;
  role: WorldRpgMessageRole;
  content: string;
  createdAt: number;
  editedAt?: number;
  generation?: WorldRpgGenerationMeta;
  /** Base64 data URLs of any model-generated images. */
  images?: string[];
}

/** Map camera transform (world-space -> screen-space). */
export interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface AdventureUiState {
  /** Map pane size as a fraction of the split (0..1); chat gets the rest. */
  mapPaneRatio: number;
  camera: CameraState;
  /** Notes pane height as a fraction of the map pane height (0..1). */
  notesHeightRatio: number;
}

/** One message exactly as sent to a model, captured for debugging. */
export interface WorldRpgDebugMessage {
  role: string;
  content: string;
}

/**
 * Capture of the exact inputs/outputs of the last turn's model calls, so the
 * "what did the GM actually see" can be inspected. Replaced each turn.
 */
export interface WorldRpgDebugCapture {
  /** Turn number this capture belongs to. */
  turn: number;
  /** Full message list sent to the narrator (system, world state, history). */
  narratorMessages: WorldRpgDebugMessage[];
  /** Full prompt string sent to the parser. */
  parserPrompt: string;
  /** Raw parser response text (before JSON extraction). */
  parserRaw: string;
}

/**
 * Snapshot of the mutable adventure state taken immediately BEFORE a turn, so
 * the last turn can be undone and regenerated ("retry"). Stored on the
 * adventure so it survives close/reopen. Only one (the most recent) is kept.
 */
export interface AdventureRollback {
  /** Deep copy of the world graph as it was before the last turn. */
  graph: WorldGraph;
  clockMinutes: number;
  turn: number;
  currentLocationId: string;
  recentEventsSummary: string;
  /** Number of transcript messages before the last turn (truncate point). */
  transcriptLength: number;
  /** Player action that produced the last turn; null for the opening scene. */
  action: string | null;
}

/** A single playthrough that forks a world and evolves it. */
export interface Adventure {
  id: string;
  title: string;
  /** The world template this adventure forked from (for reference only). */
  sourceWorldId?: string;
  sourceWorldVersion?: number;
  /** The live, evolving copy of the world graph. */
  graph: WorldGraph;
  playerCharacterId: string;
  currentLocationId: string;
  /** In-world time as integer minutes since the world epoch. */
  clockMinutes: number;
  /** Monotonic turn counter (increments per assistant turn). */
  turn: number;
  transcript: WorldRpgChatMessage[];
  /** Bounded rolling summary of distant/older events for context. */
  recentEventsSummary: string;
  /**
   * The scenario premise and opening directive: the starting situation and
   * anything that should happen in the very first scene. Used once, to shape the
   * opening narration. Free text; may be empty.
   */
  premise: string;
  narratorPurpose: WorldRpgModelPurpose;
  parserPurpose: WorldRpgModelPurpose;
  /** Fixed-size locality window: max number of referenced nodes per turn. */
  localityBudget: number;
  temperature?: number;
  /** Free user scratchpad text. Never sent to the LLM. */
  notes: string;
  /**
   * When true, this save is a template: it is never played/evolved directly.
   * Starting it spawns an independent copy so the template stays pristine.
   */
  isTemplate: boolean;
  ui: AdventureUiState;
  /** Most recent pre-turn snapshot, enabling retry of the last turn. */
  rollback?: AdventureRollback;
  /** Most recent turn's model inputs/outputs, for the debug inspector. */
  lastDebug?: WorldRpgDebugCapture;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// State update schema (parser LLM output -> deterministic world mutation)
// ============================================================================

export interface StateUpdateConnection {
  toId: string;
  distance: EdgeDistance;
  terrain?: string;
}

export interface StateUpdateLocation {
  action: 'create' | 'update';
  id: string;
  name?: string;
  description?: string;
  state?: Record<string, unknown>;
  subLocationOf?: string;
  /** Connections from this location to others (created/updated as edges). */
  connections?: StateUpdateConnection[];
  known?: boolean;
}

export interface StateUpdateGoal {
  action: 'create' | 'update';
  id: string;
  text?: string;
  status?: WorldGoalStatus;
}

export interface StateUpdateCharacter {
  action: 'create' | 'update' | 'move';
  id: string;
  name?: string;
  description?: string;
  state?: Record<string, unknown>;
  /** Target location id for create/move. */
  locationId?: string;
  homeLocationId?: string;
  /** Whether the player is aware of this character. */
  known?: boolean;
  /**
   * Travel mode for a `move`. When the origin and destination are connected,
   * the move becomes timed (the character arrives later); without a mode (or an
   * edge) the move is treated as an instantaneous/off-screen relocation.
   */
  mode?: TravelMode;
  /** Goal create/update operations for this character. */
  goals?: StateUpdateGoal[];
}

export interface StateUpdateLore {
  action: 'create' | 'update';
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
}

export interface StateUpdatePlayerMove {
  toId: string;
  mode: TravelMode;
}

/** A full structured state update extracted from the parser LLM. */
export interface WorldRpgStateUpdate {
  locations?: StateUpdateLocation[];
  characters?: StateUpdateCharacter[];
  lore?: StateUpdateLore[];
  /** Player movement; travel time is derived from the edge distance and mode. */
  playerMove?: StateUpdatePlayerMove;
  /** Explicit non-travel time advance in minutes (resting, waiting, etc.). */
  timeAdvanceMinutes?: number;
  recentEventsSummary?: string;
}

export function mapCompletionMetaToGenerationMeta(
  purpose: WorldRpgModelPurpose,
  meta: OpenRouterCompletionMeta
): WorldRpgGenerationMeta {
  return {
    purpose,
    model: meta.model,
    promptChars: meta.promptChars,
    completionChars: meta.completionChars,
    durationMs: meta.durationMs,
    ...(meta.usage ? { usage: meta.usage } : {}),
    ...(typeof meta.totalCostUsd === 'number' ? { totalCostUsd: meta.totalCostUsd } : {})
  };
}
