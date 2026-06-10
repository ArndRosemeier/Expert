/**
 * World maintenance: merge duplicate entities and detect likely duplicates.
 *
 * The registry-based parsing already prevents most duplication, but long-running
 * worlds can still accumulate the odd duplicate (e.g. the same place named two
 * slightly different ways across sessions). These tools let the player clean up.
 */

import { WorldGraph } from '../types/WorldRpgTypes';
import { now } from '../util';

export interface DuplicateGroup {
  /** Normalized display name shared by the group. */
  name: string;
  /** Entity ids sharing that name. */
  ids: string[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Merge `dropId` into `keepId`: all references are repointed to the kept
 * location, duplicate/self edges are pruned, and the dropped location and its
 * layout position are removed.
 */
export function mergeLocations(graph: WorldGraph, keepId: string, dropId: string): void {
  if (keepId === dropId) {
    throw new Error('Cannot merge a location into itself.');
  }
  const keep = graph.locations[keepId];
  const drop = graph.locations[dropId];
  if (!keep || !drop) {
    throw new Error(`Merge failed: location '${keepId}' or '${dropId}' not found.`);
  }

  keep.state = { ...drop.state, ...keep.state };
  keep.visited = keep.visited || drop.visited;
  keep.known = keep.known || drop.known;

  for (const edge of Object.values(graph.edges)) {
    if (edge.aId === dropId) edge.aId = keepId;
    if (edge.bId === dropId) edge.bId = keepId;
  }

  // Drop self-loops and duplicate edges created by the merge.
  const seenPairs = new Set<string>();
  for (const edge of Object.values(graph.edges)) {
    if (edge.aId === edge.bId) {
      delete graph.edges[edge.id];
      continue;
    }
    const key = [edge.aId, edge.bId].sort().join('|');
    if (seenPairs.has(key)) {
      delete graph.edges[edge.id];
      continue;
    }
    seenPairs.add(key);
  }

  for (const character of Object.values(graph.characters)) {
    if (character.locationId === dropId) character.locationId = keepId;
    if (character.homeLocationId === dropId) character.homeLocationId = keepId;
    if (character.transit) {
      if (character.transit.fromId === dropId) character.transit.fromId = keepId;
      if (character.transit.toId === dropId) character.transit.toId = keepId;
      if (character.transit.fromId === character.transit.toId) {
        delete character.transit;
      }
    }
  }

  for (const location of Object.values(graph.locations)) {
    if (location.subLocationOf === dropId) location.subLocationOf = keepId;
  }
  if (keep.subLocationOf === dropId) {
    delete keep.subLocationOf;
  }

  delete graph.locations[dropId];
  delete graph.layout[dropId];
  keep.updatedAt = now();
}

/** Merge `dropId` character into `keepId`. The player cannot be merged. */
export function mergeCharacters(graph: WorldGraph, keepId: string, dropId: string): void {
  if (keepId === dropId) {
    throw new Error('Cannot merge a character into itself.');
  }
  const keep = graph.characters[keepId];
  const drop = graph.characters[dropId];
  if (!keep || !drop) {
    throw new Error(`Merge failed: character '${keepId}' or '${dropId}' not found.`);
  }
  if (keep.isPlayer || drop.isPlayer) {
    throw new Error('Cannot merge the player character.');
  }

  keep.state = { ...drop.state, ...keep.state };
  keep.known = keep.known || drop.known;
  for (const goal of drop.goals) {
    if (!keep.goals.some(g => g.id === goal.id)) {
      keep.goals.push(goal);
    }
  }
  if (!keep.homeLocationId && drop.homeLocationId) {
    keep.homeLocationId = drop.homeLocationId;
  }

  delete graph.characters[dropId];
  keep.updatedAt = now();
}

function groupByName(entries: Array<{ id: string; name: string }>): DuplicateGroup[] {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const key = normalizeName(entry.name);
    const ids = map.get(key) ?? [];
    ids.push(entry.id);
    map.set(key, ids);
  }
  const groups: DuplicateGroup[] = [];
  for (const [name, ids] of map) {
    if (ids.length > 1) {
      groups.push({ name, ids });
    }
  }
  return groups;
}

export function findDuplicateLocationGroups(graph: WorldGraph): DuplicateGroup[] {
  return groupByName(Object.values(graph.locations).map(l => ({ id: l.id, name: l.name })));
}

export function findDuplicateCharacterGroups(graph: WorldGraph): DuplicateGroup[] {
  return groupByName(
    Object.values(graph.characters)
      .filter(c => !c.isPlayer)
      .map(c => ({ id: c.id, name: c.name }))
  );
}
