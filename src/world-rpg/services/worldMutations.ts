/**
 * Deterministic application of a parser-produced state update to an adventure.
 *
 * All mutation happens on a structured clone of the world graph and is only
 * committed back to the adventure if the whole update applies without error, so
 * a malformed update can never leave the world half-mutated. Errors are thrown
 * loudly (no silent fallbacks) and surfaced by the engine.
 *
 * The clock is advanced here too: player travel costs are derived from the edge
 * distance and travel mode; explicit waits come from `timeAdvanceMinutes`.
 */

import {
  Adventure,
  StateUpdateCharacter,
  StateUpdateConnection,
  StateUpdateGoal,
  StateUpdateLocation,
  StateUpdateLore,
  WorldCharacter,
  WorldGoal,
  WorldGraph,
  WorldRpgStateUpdate
} from '../types/WorldRpgTypes';
import { newId, now } from '../util';
import { edgeTravelMinutes } from './worldTime';
import { findEdge, getLocation } from './worldGraph';

function requireLocation(graph: WorldGraph, id: string, context: string): void {
  if (!graph.locations[id]) {
    throw new Error(`${context}: unknown location id '${id}'`);
  }
}

function upsertLocation(graph: WorldGraph, su: StateUpdateLocation, turn: number): void {
  const existing = graph.locations[su.id];
  if (existing) {
    if (su.name !== undefined) existing.name = su.name;
    if (su.description !== undefined) existing.description = su.description;
    if (su.state) existing.state = { ...existing.state, ...su.state };
    if (su.subLocationOf !== undefined) existing.subLocationOf = su.subLocationOf;
    if (su.known !== undefined) existing.known = su.known;
    existing.lastUsedTurn = turn;
    existing.updatedAt = now();
    return;
  }
  graph.locations[su.id] = {
    id: su.id,
    name: su.name ?? su.id,
    description: su.description ?? '',
    state: su.state ? { ...su.state } : {},
    ...(su.subLocationOf !== undefined ? { subLocationOf: su.subLocationOf } : {}),
    visited: false,
    known: su.known ?? true,
    createdTurn: turn,
    lastUsedTurn: turn,
    createdAt: now(),
    updatedAt: now()
  };
}

function applyConnection(graph: WorldGraph, fromId: string, conn: StateUpdateConnection, turn: number): void {
  requireLocation(graph, fromId, 'connection');
  requireLocation(graph, conn.toId, 'connection');
  if (fromId === conn.toId) {
    throw new Error(`connection: self-loop on location '${fromId}'`);
  }
  const existing = findEdge(graph, fromId, conn.toId);
  if (existing) {
    existing.distance = conn.distance;
    if (conn.terrain !== undefined) existing.terrain = conn.terrain;
    existing.lastUsedTurn = turn;
    existing.updatedAt = now();
    return;
  }
  const id = newId('wedge');
  graph.edges[id] = {
    id,
    aId: fromId,
    bId: conn.toId,
    distance: conn.distance,
    ...(conn.terrain !== undefined ? { terrain: conn.terrain } : {}),
    createdTurn: turn,
    lastUsedTurn: turn,
    createdAt: now(),
    updatedAt: now()
  };
}

function applyGoals(character: WorldCharacter, goals: StateUpdateGoal[], turn: number): void {
  for (const g of goals) {
    const existing = character.goals.find(x => x.id === g.id);
    if (existing) {
      if (g.text !== undefined) existing.text = g.text;
      if (g.status !== undefined) existing.status = g.status;
      existing.updatedTurn = turn;
    } else {
      character.goals.push({
        id: g.id,
        text: g.text ?? g.id,
        status: g.status ?? 'active',
        createdTurn: turn,
        updatedTurn: turn
      });
    }
  }
}

function initialGoals(goals: StateUpdateGoal[] | undefined, turn: number): WorldGoal[] {
  if (!goals) {
    return [];
  }
  return goals.map(g => ({
    id: g.id,
    text: g.text ?? g.id,
    status: g.status ?? 'active',
    createdTurn: turn,
    updatedTurn: turn
  }));
}

/**
 * Relocate an existing character. When origin and destination are connected and
 * a travel mode is given, the move is timed: the character enters transit and
 * arrives once the clock reaches the arrival time. Otherwise it is instantaneous.
 */
function applyCharacterMove(graph: WorldGraph, character: WorldCharacter, su: StateUpdateCharacter, startClock: number): void {
  const toId = su.locationId;
  if (!toId) {
    throw new Error(`character move '${su.id}' has no target locationId`);
  }
  requireLocation(graph, toId, `character move '${su.id}'`);
  const fromId = character.locationId;
  if (fromId === toId) {
    delete character.transit;
    return;
  }
  const edge = findEdge(graph, fromId, toId);
  if (edge && su.mode) {
    const minutes = edgeTravelMinutes(edge, su.mode, graph.speeds);
    character.transit = {
      fromId,
      toId,
      departedClock: startClock,
      arrivalClock: startClock + minutes
    };
    return;
  }
  character.locationId = toId;
  delete character.transit;
}

function upsertCharacter(graph: WorldGraph, su: StateUpdateCharacter, turn: number, startClock: number): void {
  const existing = graph.characters[su.id];
  if (existing) {
    if (su.name !== undefined) existing.name = su.name;
    if (su.description !== undefined) existing.description = su.description;
    if (su.state) existing.state = { ...existing.state, ...su.state };
    if (su.homeLocationId !== undefined) existing.homeLocationId = su.homeLocationId;
    if (su.known !== undefined) existing.known = su.known;
    if (su.goals) applyGoals(existing, su.goals, turn);

    if (su.action === 'move') {
      applyCharacterMove(graph, existing, su, startClock);
    } else if (su.locationId !== undefined) {
      requireLocation(graph, su.locationId, `character '${su.id}'`);
      existing.locationId = su.locationId;
      delete existing.transit;
    }
    existing.lastUsedTurn = turn;
    existing.updatedAt = now();
    return;
  }
  if (su.action === 'move') {
    throw new Error(`character move references unknown character '${su.id}'`);
  }
  if (!su.locationId) {
    throw new Error(`new character '${su.id}' has no locationId`);
  }
  requireLocation(graph, su.locationId, `character '${su.id}'`);
  graph.characters[su.id] = {
    id: su.id,
    name: su.name ?? su.id,
    description: su.description ?? '',
    state: su.state ? { ...su.state } : {},
    locationId: su.locationId,
    ...(su.homeLocationId !== undefined ? { homeLocationId: su.homeLocationId } : {}),
    isPlayer: false,
    known: su.known ?? true,
    goals: initialGoals(su.goals, turn),
    createdTurn: turn,
    lastUsedTurn: turn,
    createdAt: now(),
    updatedAt: now()
  };
}

/** Land any in-transit characters whose arrival time has been reached. */
function resolveArrivals(graph: WorldGraph, clock: number, turn: number): void {
  for (const character of Object.values(graph.characters)) {
    if (character.transit && character.transit.arrivalClock <= clock) {
      character.locationId = character.transit.toId;
      character.lastUsedTurn = turn;
      character.updatedAt = now();
      delete character.transit;
    }
  }
}

function upsertLore(graph: WorldGraph, su: StateUpdateLore, turn: number): void {
  const existing = graph.lore[su.id];
  if (existing) {
    if (su.title !== undefined) existing.title = su.title;
    if (su.content !== undefined) existing.content = su.content;
    if (su.tags !== undefined) existing.tags = [...su.tags];
    existing.lastUsedTurn = turn;
    existing.updatedAt = now();
    return;
  }
  graph.lore[su.id] = {
    id: su.id,
    title: su.title ?? su.id,
    content: su.content ?? '',
    tags: su.tags ? [...su.tags] : [],
    createdTurn: turn,
    lastUsedTurn: turn,
    createdAt: now(),
    updatedAt: now()
  };
}

/**
 * Apply a state update to the adventure for the given turn. Commits atomically.
 * Returns the number of in-world minutes the clock advanced this turn.
 */
export function applyStateUpdate(adventure: Adventure, update: WorldRpgStateUpdate, turn: number): number {
  const graph: WorldGraph = structuredClone(adventure.graph);
  const startClock = adventure.clockMinutes;
  let clockMinutes = adventure.clockMinutes;
  let currentLocationId = adventure.currentLocationId;

  // 1. Upsert all locations first, then wire their connections (so both
  //    endpoints exist before edges are created).
  if (update.locations) {
    for (const su of update.locations) {
      upsertLocation(graph, su, turn);
    }
    for (const su of update.locations) {
      if (su.connections) {
        for (const conn of su.connections) {
          applyConnection(graph, su.id, conn, turn);
        }
      }
    }
  }

  // 2. Characters (create / update / move). Timed moves use the turn's start
  //    clock as their departure time.
  if (update.characters) {
    for (const su of update.characters) {
      upsertCharacter(graph, su, turn, startClock);
    }
  }

  // 3. Lore.
  if (update.lore) {
    for (const su of update.lore) {
      upsertLore(graph, su, turn);
    }
  }

  // 4. Player movement: derive travel time from the edge + mode.
  if (update.playerMove) {
    const move = update.playerMove;
    requireLocation(graph, move.toId, 'playerMove');
    const edge = findEdge(graph, currentLocationId, move.toId);
    if (!edge) {
      throw new Error(`playerMove to '${move.toId}' has no connection from '${currentLocationId}'`);
    }
    clockMinutes += edgeTravelMinutes(edge, move.mode, graph.speeds);
    const player = graph.characters[adventure.playerCharacterId];
    if (!player) {
      throw new Error(`player character '${adventure.playerCharacterId}' not found in graph`);
    }
    player.locationId = move.toId;
    player.lastUsedTurn = turn;
    const dest = getLocation(graph, move.toId);
    dest.visited = true;
    dest.known = true;
    dest.lastUsedTurn = turn;
    currentLocationId = move.toId;
  }

  // 5. Explicit non-travel time advance (resting, waiting, conversation).
  if (typeof update.timeAdvanceMinutes === 'number' && update.timeAdvanceMinutes > 0) {
    clockMinutes += Math.round(update.timeAdvanceMinutes);
  }

  // 6. Resolve any in-transit characters who arrive within the new clock.
  resolveArrivals(graph, clockMinutes, turn);

  // Commit.
  adventure.graph = graph;
  adventure.clockMinutes = clockMinutes;
  adventure.currentLocationId = currentLocationId;
  if (typeof update.recentEventsSummary === 'string' && update.recentEventsSummary.trim().length > 0) {
    adventure.recentEventsSummary = update.recentEventsSummary.trim();
  }

  return clockMinutes - startClock;
}
