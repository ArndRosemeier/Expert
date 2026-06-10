/**
 * LocalityContextBuilder - the heart of the GM <-> world-store integration.
 *
 * Produces, for a single turn:
 *   (a) narratorContext: human-readable prose describing the player's immediate
 *       surroundings, with detail decaying by distance.
 *   (b) registry: the canonical id/name list of every entity referenced, so the
 *       parser resolves narrated references to existing ids (update) instead of
 *       inventing duplicates (create).
 *
 * Selection is a fixed-size window: best-first expansion from the player ordered
 * by walking time, capped at `localityBudget` referenced locations. The current
 * location and its direct exits are always included; everything beyond is filled
 * by nearest walking time until the budget is reached.
 */

import { Adventure, WorldCharacter, WorldGraph } from '../types/WorldRpgTypes';
import {
  charactersAt,
  charactersIncomingTo,
  getCharacter,
  getLocation,
  getNeighbors,
  Neighbor
} from './worldGraph';
import {
  edgeWalkWeight,
  formatClock,
  formatDuration,
  travelMinutesForDistance
} from './worldTime';
import { ADJACENT } from '../types/WorldRpgTypes';
import { MAX_EXITS_SHOWN } from '../constants';

export interface LocalityRegistryEntry {
  id: string;
  name: string;
  type: 'location' | 'character';
}

export interface LocalityResult {
  narratorContext: string;
  registry: LocalityRegistryEntry[];
  includedLocationIds: string[];
}

interface WalkInfo {
  minutes: number;
  hops: number;
}

/** Dijkstra over walking-time weights from the start location. */
function walkDistances(graph: WorldGraph, startId: string): Map<string, WalkInfo> {
  const dist = new Map<string, WalkInfo>();
  dist.set(startId, { minutes: 0, hops: 0 });
  const visited = new Set<string>();

  for (;;) {
    let currentId: string | undefined;
    let best = Infinity;
    for (const [id, info] of dist) {
      if (!visited.has(id) && info.minutes < best) {
        best = info.minutes;
        currentId = id;
      }
    }
    if (currentId === undefined) {
      break;
    }
    visited.add(currentId);
    const current = dist.get(currentId)!;
    for (const { edge, otherId } of getNeighbors(graph, currentId)) {
      const candidate = current.minutes + edgeWalkWeight(edge, graph.speeds);
      const existing = dist.get(otherId);
      if (!existing || candidate < existing.minutes) {
        dist.set(otherId, { minutes: candidate, hops: current.hops + 1 });
      }
    }
  }
  return dist;
}

function oneLiner(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1).trimEnd()}\u2026`;
}

function renderState(state: Record<string, unknown>): string {
  const keys = Object.keys(state);
  if (keys.length === 0) {
    return '';
  }
  const parts = keys.map(k => `${k}: ${String(state[k])}`);
  return parts.join('; ');
}

/** Active goals as a compact string, or '' if none. */
function activeGoals(character: WorldCharacter): string {
  const active = character.goals.filter(g => g.status === 'active');
  if (active.length === 0) {
    return '';
  }
  return active.map(g => g.text).join('; ');
}

function explorationLabel(visited: boolean, known: boolean): string {
  if (visited) {
    return 'visited';
  }
  return known ? 'known' : 'unexplored';
}

/** Distance phrasing for an exit edge. */
function distancePhrase(distance: number | typeof ADJACENT, onFootMinutes: number): string {
  if (distance === ADJACENT) {
    return 'adjacent';
  }
  return `${distance} m, ~${formatDuration(onFootMinutes)} on foot`;
}

export function buildLocalityContext(adventure: Adventure): LocalityResult {
  const graph = adventure.graph;
  const startId = adventure.currentLocationId;
  const current = getLocation(graph, startId);
  const budget = Math.max(1, adventure.localityBudget);

  const distances = walkDistances(graph, startId);

  // Mandatory: current location + direct exits.
  const exits: Neighbor[] = getNeighbors(graph, startId);
  const selected = new Set<string>([startId]);
  for (const exit of exits) {
    selected.add(exit.otherId);
  }

  // Fill remaining budget by nearest walking time, tie-broken by recency.
  const candidates = [...distances.keys()].filter(id => !selected.has(id));
  candidates.sort((a, b) => {
    const da = distances.get(a)!;
    const db = distances.get(b)!;
    if (da.minutes !== db.minutes) {
      return da.minutes - db.minutes;
    }
    return getLocation(graph, b).lastUsedTurn - getLocation(graph, a).lastUsedTurn;
  });
  for (const id of candidates) {
    if (selected.size >= budget) {
      break;
    }
    selected.add(id);
  }

  // ---- Build narrator prose ----
  const lines: string[] = [];
  lines.push(`CURRENT TIME: ${formatClock(adventure.clockMinutes, graph.clockConfig)}`);
  lines.push('');
  lines.push(`CURRENT LOCATION: ${current.name} [${current.id}]`);
  lines.push(current.description.trim());
  const currentState = renderState(current.state);
  if (currentState) {
    lines.push(`State: ${currentState}`);
  }

  const playerGoals = activeGoals(getCharacter(graph, adventure.playerCharacterId));
  if (playerGoals) {
    lines.push('');
    lines.push(`YOUR GOALS: ${playerGoals}`);
  }

  const present = charactersAt(graph, startId).filter(c => !c.isPlayer);
  if (present.length > 0) {
    lines.push('');
    lines.push('CHARACTERS PRESENT:');
    for (const c of present) {
      const cState = renderState(c.state);
      const goals = activeGoals(c);
      const suffix = [cState ? `state: ${cState}` : '', goals ? `wants: ${goals}` : '']
        .filter(s => s.length > 0)
        .join('; ');
      lines.push(`- ${c.name} [${c.id}]: ${oneLiner(c.description)}${suffix ? ` (${suffix})` : ''}`);
    }
  }

  const incoming = charactersIncomingTo(graph, startId).filter(c => !c.isPlayer);
  if (incoming.length > 0) {
    lines.push('');
    lines.push('ARRIVING SOON:');
    for (const c of incoming) {
      const eta = Math.max(0, c.transit!.arrivalClock - adventure.clockMinutes);
      lines.push(`- ${c.name} [${c.id}] (arrives in ~${formatDuration(eta)})`);
    }
  }

  if (exits.length > 0) {
    const rankedExits = [...exits].sort((a, b) => {
      const da = getLocation(graph, a.otherId);
      const db = getLocation(graph, b.otherId);
      if (da.lastUsedTurn !== db.lastUsedTurn) {
        return db.lastUsedTurn - da.lastUsedTurn;
      }
      return (distances.get(a.otherId)?.minutes ?? 0) - (distances.get(b.otherId)?.minutes ?? 0);
    });
    const shown = rankedExits.slice(0, MAX_EXITS_SHOWN);
    lines.push('');
    lines.push('EXITS (directly connected locations):');
    for (const exit of shown) {
      const dest = getLocation(graph, exit.otherId);
      const onFoot = travelMinutesForDistance(exit.edge.distance, 'foot', graph.speeds, exit.edge.terrain);
      const phrase = distancePhrase(exit.edge.distance, onFoot);
      const seen = explorationLabel(dest.visited, dest.known);
      lines.push(`- ${dest.name} [${dest.id}] (${phrase}; ${seen}): ${oneLiner(dest.description)}`);
    }
    if (rankedExits.length > shown.length) {
      lines.push(`- (+${rankedExits.length - shown.length} more exits)`);
    }
  }

  // Farther selected places (beyond current + direct exits): names only.
  const exitIds = new Set(exits.map(e => e.otherId));
  const farther = [...selected].filter(id => id !== startId && !exitIds.has(id));
  if (farther.length > 0) {
    farther.sort((a, b) => distances.get(a)!.minutes - distances.get(b)!.minutes);
    const names = farther.map(id => {
      const loc = getLocation(graph, id);
      return `${loc.name} [${loc.id}]`;
    });
    lines.push('');
    lines.push(`KNOWN FARTHER PLACES: ${names.join(', ')}`);
  }

  if (adventure.recentEventsSummary.trim().length > 0) {
    lines.push('');
    lines.push('RECENT EVENTS SUMMARY:');
    lines.push(adventure.recentEventsSummary.trim());
  }

  // ---- Build registry (for the parser to resolve/dedupe ids) ----
  const registry: LocalityRegistryEntry[] = [];
  const seenIds = new Set<string>();
  const pushEntry = (entry: LocalityRegistryEntry): void => {
    if (!seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      registry.push(entry);
    }
  };

  for (const id of selected) {
    const loc = getLocation(graph, id);
    pushEntry({ id: loc.id, name: loc.name, type: 'location' });
    for (const c of charactersAt(graph, id)) {
      pushEntry({ id: c.id, name: c.name, type: 'character' });
    }
  }
  // Always offer known characters (and any in transit) so the parser never
  // re-creates someone who has left the locality window.
  for (const c of Object.values(graph.characters)) {
    if (c.known || c.transit) {
      pushEntry({ id: c.id, name: c.name, type: 'character' });
    }
  }

  return {
    narratorContext: lines.join('\n'),
    registry,
    includedLocationIds: [...selected]
  };
}
