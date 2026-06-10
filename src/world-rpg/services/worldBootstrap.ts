/**
 * On-the-fly minimal world generation. When the user starts an adventure with
 * no chosen template, the creator model designs a small connected area which we
 * turn into a deterministic world graph.
 */

import { OpenRouterClient } from '../../OpenRouterClient';
import { EdgeDistance, WorldGraph } from '../types/WorldRpgTypes';
import { WORLD_BOOTSTRAP_PROMPT } from '../prompts';
import { createEmptyGraph, NewPlayerSpec } from './worldFactory';
import { findEdge } from './worldGraph';
import { newId, now } from '../util';

interface BootstrapConnection {
  toId: string;
  distance: EdgeDistance;
  terrain?: string;
}

interface BootstrapLocation {
  id: string;
  name: string;
  description: string;
  connections?: BootstrapConnection[];
}

interface BootstrapCharacter {
  id: string;
  name: string;
  description: string;
  locationId: string;
}

interface BootstrapPayload {
  world: { name: string; description: string };
  startLocationId: string;
  player: { name: string; description: string };
  locations: BootstrapLocation[];
  characters?: BootstrapCharacter[];
}

export interface BootstrapResult {
  worldName: string;
  worldDescription: string;
  graph: WorldGraph;
  startLocationId: string;
  player: NewPlayerSpec;
}

function parseStrictJson<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`World bootstrap model did not return a JSON object. Got: ${trimmed.slice(0, 2000)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

function buildGraph(payload: BootstrapPayload): WorldGraph {
  const graph = createEmptyGraph();
  const timestamp = now();

  for (const loc of payload.locations) {
    graph.locations[loc.id] = {
      id: loc.id,
      name: loc.name,
      description: loc.description,
      state: {},
      visited: false,
      known: true,
      createdTurn: 0,
      lastUsedTurn: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  for (const loc of payload.locations) {
    if (!loc.connections) {
      continue;
    }
    for (const conn of loc.connections) {
      if (!graph.locations[conn.toId]) {
        throw new Error(`Bootstrap connection from '${loc.id}' references unknown location '${conn.toId}'`);
      }
      if (loc.id === conn.toId || findEdge(graph, loc.id, conn.toId)) {
        continue;
      }
      const id = newId('wedge');
      graph.edges[id] = {
        id,
        aId: loc.id,
        bId: conn.toId,
        distance: conn.distance,
        ...(conn.terrain !== undefined ? { terrain: conn.terrain } : {}),
        createdTurn: 0,
        lastUsedTurn: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }
  }

  if (!graph.locations[payload.startLocationId]) {
    throw new Error(`Bootstrap startLocationId '${payload.startLocationId}' is not among the generated locations`);
  }

  if (payload.characters) {
    for (const char of payload.characters) {
      if (!graph.locations[char.locationId]) {
        throw new Error(`Bootstrap character '${char.id}' references unknown location '${char.locationId}'`);
      }
      graph.characters[char.id] = {
        id: char.id,
        name: char.name,
        description: char.description,
        state: {},
        locationId: char.locationId,
        isPlayer: false,
        known: true,
        goals: [],
        createdTurn: 0,
        lastUsedTurn: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }
  }

  return graph;
}

/** Generate a minimal world graph from an optional premise. */
export async function bootstrapWorldGraph(client: OpenRouterClient, premise: string): Promise<BootstrapResult> {
  const prompt = WORLD_BOOTSTRAP_PROMPT.split('{{premise}}').join(premise.trim());

  let raw = '';
  await client.streamingChat('creator', [{ role: 'user', content: prompt }], {
    onStart: () => {},
    onChunk: (chunk: string) => {
      raw += chunk;
    },
    onComplete: (final: string) => {
      raw = final;
    },
    onError: () => {}
  });

  const payload = parseStrictJson<BootstrapPayload>(raw);
  if (payload.locations.length === 0) {
    throw new Error('World bootstrap produced no locations.');
  }

  return {
    worldName: payload.world.name,
    worldDescription: payload.world.description,
    graph: buildGraph(payload),
    startLocationId: payload.startLocationId,
    player: { name: payload.player.name, description: payload.player.description }
  };
}
