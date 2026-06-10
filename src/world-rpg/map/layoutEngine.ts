/**
 * Incremental anchored layout engine.
 *
 * The LLM never supplies coordinates. This engine derives display positions
 * deterministically from the graph's connectivity and edge distances. Existing
 * positions are kept fixed; only newly added locations get placed, anchored to
 * an already-placed neighbor, with edge length scaled from meters and simple
 * collision avoidance. This keeps the map stable as the world grows.
 */

import { ADJACENT, MapPosition, WorldGraph, WorldLocation } from '../types/WorldRpgTypes';
import { getNeighbors } from '../services/worldGraph';
import {
  LAYOUT_ADJACENT_SPACING,
  LAYOUT_BASE_SPACING,
  LAYOUT_MIN_NODE_GAP
} from '../constants';

function distanceBetween(a: MapPosition, b: MapPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** World-space edge length, compressed from meters so large ranges stay legible. */
function edgeLayoutLength(distance: number | typeof ADJACENT): number {
  if (distance === ADJACENT) {
    return LAYOUT_ADJACENT_SPACING;
  }
  return Math.min(LAYOUT_BASE_SPACING + Math.sqrt(distance) * 6, LAYOUT_BASE_SPACING * 6);
}

/** Stable seed root: earliest created, then lowest id, for determinism. */
function pickRoot(graph: WorldGraph): string {
  let best: WorldLocation | undefined;
  for (const location of Object.values(graph.locations)) {
    if (!best) {
      best = location;
      continue;
    }
    if (location.createdTurn < best.createdTurn) {
      best = location;
    } else if (location.createdTurn === best.createdTurn && location.id < best.id) {
      best = location;
    }
  }
  if (!best) {
    throw new Error('Cannot lay out an empty world graph.');
  }
  return best.id;
}

function spreadAngles(baseDir: number, count: number, isRoot: boolean): number[] {
  if (count === 1) {
    return [isRoot ? 0 : baseDir];
  }
  const span = isRoot ? Math.PI * 2 : Math.PI * 1.2;
  const start = isRoot ? 0 : baseDir - span / 2;
  const step = isRoot ? span / count : span / (count - 1);
  return Array.from({ length: count }, (_, i) => start + step * i);
}

function resolveCollision(pos: MapPosition, layout: Record<string, MapPosition>): MapPosition {
  let candidate = { ...pos };
  for (let attempt = 0; attempt < 32; attempt++) {
    let clear = true;
    for (const other of Object.values(layout)) {
      if (distanceBetween(candidate, other) < LAYOUT_MIN_NODE_GAP) {
        clear = false;
        break;
      }
    }
    if (clear) {
      return candidate;
    }
    candidate = {
      x: candidate.x + LAYOUT_MIN_NODE_GAP * Math.cos(attempt * 1.3),
      y: candidate.y + LAYOUT_MIN_NODE_GAP * Math.sin(attempt * 1.3)
    };
  }
  return candidate;
}

/**
 * Return an updated layout map covering every location in the graph. Positions
 * already present in `graph.layout` are preserved; missing ones are computed.
 */
export function updateLayout(graph: WorldGraph): Record<string, MapPosition> {
  const layout: Record<string, MapPosition> = { ...graph.layout };
  // Drop stale entries for locations that no longer exist.
  for (const id of Object.keys(layout)) {
    if (!graph.locations[id]) {
      delete layout[id];
    }
  }

  const placed = new Set(Object.keys(layout));
  const outwardDir = new Map<string, number>();

  if (placed.size === 0) {
    const root = pickRoot(graph);
    layout[root] = { x: 0, y: 0 };
    placed.add(root);
    outwardDir.set(root, 0);
  }

  let frontier = [...placed];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const parentPos = layout[id];
      if (!parentPos) {
        throw new Error(`Layout invariant broken: placed node '${id}' has no position`);
      }
      const unplaced = getNeighbors(graph, id).filter(n => !placed.has(n.otherId));
      if (unplaced.length === 0) {
        continue;
      }
      const isRoot = !outwardDir.has(id) || (outwardDir.get(id) === 0 && frontier.length === placed.size);
      const baseDir = outwardDir.get(id) ?? 0;
      const angles = spreadAngles(baseDir, unplaced.length, isRoot);
      unplaced.forEach((neighbor, index) => {
        if (placed.has(neighbor.otherId)) {
          return;
        }
        const angle = angles[index];
        if (angle === undefined) {
          return;
        }
        const length = edgeLayoutLength(neighbor.edge.distance);
        const raw: MapPosition = {
          x: parentPos.x + Math.cos(angle) * length,
          y: parentPos.y + Math.sin(angle) * length
        };
        const pos = resolveCollision(raw, layout);
        layout[neighbor.otherId] = pos;
        placed.add(neighbor.otherId);
        outwardDir.set(neighbor.otherId, Math.atan2(pos.y - parentPos.y, pos.x - parentPos.x));
        next.push(neighbor.otherId);
      });
    }
    frontier = next;
  }

  // Disconnected components / isolated nodes: drop them into a spiral so they
  // are still visible without overlapping the main cluster.
  let spiral = 0;
  for (const id of Object.keys(graph.locations)) {
    if (placed.has(id)) {
      continue;
    }
    const radius = LAYOUT_BASE_SPACING * (2 + spiral * 0.4);
    const angle = spiral * 2.399963; // golden angle for even spread
    layout[id] = resolveCollision({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, layout);
    placed.add(id);
    spiral++;
  }

  return layout;
}
