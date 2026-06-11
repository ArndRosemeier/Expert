/**
 * Pure constructors for worlds and adventures. No IO and no LLM calls, so these
 * are easy to test and reason about.
 *
 * Reuse model:
 *   - A World is a saved template. Forking deep-copies its graph into a new
 *     Adventure and adds a fresh player character.
 *   - Saving an adventure produces a World: the graph is deep-copied, the player
 *     character is stripped, and (when overwriting) the version is bumped.
 */

import {
  Adventure,
  AdventureStartState,
  AdventureUiState,
  World,
  WorldCharacter,
  WorldGraph
} from '../types/WorldRpgTypes';
import {
  DEFAULT_CLOCK_CONFIG,
  DEFAULT_LOCALITY_BUDGET,
  DEFAULT_MAP_PANE_RATIO,
  DEFAULT_NOTES_HEIGHT_RATIO,
  DEFAULT_SPEEDS,
  DEFAULT_ZOOM
} from '../constants';
import { newId, now } from '../util';

/** In-world minute the clock starts at for a new adventure (08:00 on day 1). */
const ADVENTURE_START_CLOCK_MINUTES = 8 * 60;

export interface NewPlayerSpec {
  name: string;
  description: string;
}

export function createEmptyGraph(): WorldGraph {
  return {
    locations: {},
    characters: {},
    edges: {},
    lore: {},
    rules: '',
    clockConfig: { ...DEFAULT_CLOCK_CONFIG },
    speeds: { ...DEFAULT_SPEEDS },
    layout: {}
  };
}

function defaultUiState(): AdventureUiState {
  return {
    mapPaneRatio: DEFAULT_MAP_PANE_RATIO,
    camera: { panX: 0, panY: 0, zoom: DEFAULT_ZOOM },
    notesHeightRatio: DEFAULT_NOTES_HEIGHT_RATIO
  };
}

export interface CreateAdventureOptions {
  title: string;
  /** Graph to own. It is deep-cloned so the source is never mutated. */
  graph: WorldGraph;
  startLocationId: string;
  player: NewPlayerSpec;
  sourceWorldId?: string;
  sourceWorldVersion?: number;
}

export function createAdventure(opts: CreateAdventureOptions): Adventure {
  const graph = structuredClone(opts.graph);
  const start = graph.locations[opts.startLocationId];
  if (!start) {
    throw new Error(`Cannot create adventure: start location '${opts.startLocationId}' not in graph`);
  }

  const playerId = newId('char');
  const player: WorldCharacter = {
    id: playerId,
    name: opts.player.name,
    description: opts.player.description,
    state: {},
    locationId: opts.startLocationId,
    isPlayer: true,
    known: true,
    goals: [],
    createdTurn: 0,
    lastUsedTurn: 0,
    createdAt: now(),
    updatedAt: now()
  };
  graph.characters[playerId] = player;

  start.visited = true;
  start.known = true;

  const timestamp = now();
  const startState: AdventureStartState = {
    graph: structuredClone(graph),
    clockMinutes: ADVENTURE_START_CLOCK_MINUTES,
    currentLocationId: opts.startLocationId
  };
  return {
    id: newId('adv'),
    title: opts.title,
    ...(opts.sourceWorldId ? { sourceWorldId: opts.sourceWorldId } : {}),
    ...(typeof opts.sourceWorldVersion === 'number' ? { sourceWorldVersion: opts.sourceWorldVersion } : {}),
    graph,
    playerCharacterId: playerId,
    currentLocationId: opts.startLocationId,
    clockMinutes: ADVENTURE_START_CLOCK_MINUTES,
    turn: 0,
    transcript: [],
    recentEventsSummary: '',
    premise: '',
    narratorPurpose: 'prose',
    parserPurpose: 'editor',
    localityBudget: DEFAULT_LOCALITY_BUDGET,
    notes: '',
    isTemplate: false,
    regenerateOpeningOnStart: true,
    startState,
    ui: defaultUiState(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

/**
 * Reset an adventure to its pristine pre-opening state so a fresh opening can be
 * re-rolled. Clears the transcript, rolling summary, turn counter and transient
 * captures, and restores the world graph/clock/location from `startState` when
 * present (older adventures without a snapshot keep their current graph).
 */
export function resetAdventureToStartState(adventure: Adventure): void {
  adventure.transcript = [];
  adventure.recentEventsSummary = '';
  adventure.turn = 0;
  delete adventure.rollback;
  delete adventure.lastDebug;
  if (adventure.startState) {
    adventure.graph = structuredClone(adventure.startState.graph);
    adventure.clockMinutes = adventure.startState.clockMinutes;
    adventure.currentLocationId = adventure.startState.currentLocationId;
  }
}

/**
 * Deep-copy a template adventure into a fresh, independent playable save. The
 * full evolved state (graph, transcript, clock) is preserved, but the copy is
 * not a template and drops transient retry/debug captures.
 */
export function copyAdventureForPlay(template: Adventure): Adventure {
  const copy = structuredClone(template);
  const timestamp = now();
  copy.id = newId('adv');
  copy.isTemplate = false;
  copy.createdAt = timestamp;
  copy.updatedAt = timestamp;
  delete copy.rollback;
  delete copy.lastDebug;
  return copy;
}

/** Fork a saved world template into a fresh adventure. */
export function forkWorldToAdventure(world: World, title: string, player: NewPlayerSpec): Adventure {
  return createAdventure({
    title,
    graph: world.graph,
    startLocationId: world.startLocationId,
    player,
    sourceWorldId: world.id,
    sourceWorldVersion: world.version
  });
}

/**
 * Build a World template from an adventure's current state. Pass `existing` to
 * overwrite/version an existing world; omit it to create a brand-new world.
 */
export function buildWorldFromAdventure(adventure: Adventure, name: string, existing?: World | null): World {
  const graph = structuredClone(adventure.graph);
  delete graph.characters[adventure.playerCharacterId];

  const timestamp = now();
  return {
    id: existing?.id ?? newId('world'),
    name,
    description: existing?.description ?? '',
    version: existing ? existing.version + 1 : 1,
    startLocationId: adventure.currentLocationId,
    graph,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}
