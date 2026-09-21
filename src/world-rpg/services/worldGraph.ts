/**
 * Read-only helpers over a WorldGraph: adjacency, edge lookup, and entity
 * queries. Kept free of mutation logic so they are safe to use anywhere.
 */

import {
  WorldCharacter,
  WorldEdge,
  WorldGraph,
  WorldLocation
} from '../types/WorldRpgTypes';

export interface Neighbor {
  edge: WorldEdge;
  /** The location id on the other side of the edge from the queried node. */
  otherId: string;
}

export function getLocation(graph: WorldGraph, locationId: string): WorldLocation {
  const location = graph.locations[locationId];
  if (!location) {
    throw new Error(`Location not found: ${locationId}`);
  }
  return location;
}

export function getCharacter(graph: WorldGraph, characterId: string): WorldCharacter {
  const character = graph.characters[characterId];
  if (!character) {
    throw new Error(`Character not found: ${characterId}`);
  }
  return character;
}

/** All edges incident to a location, with the opposite endpoint resolved. */
export function getNeighbors(graph: WorldGraph, locationId: string): Neighbor[] {
  const neighbors: Neighbor[] = [];
  for (const edge of Object.values(graph.edges)) {
    if (edge.aId === locationId) {
      neighbors.push({ edge, otherId: edge.bId });
    } else if (edge.bId === locationId) {
      neighbors.push({ edge, otherId: edge.aId });
    }
  }
  return neighbors;
}

/** The undirected edge between two locations, if any. */
export function findEdge(graph: WorldGraph, aId: string, bId: string): WorldEdge | undefined {
  for (const edge of Object.values(graph.edges)) {
    if ((edge.aId === aId && edge.bId === bId) || (edge.aId === bId && edge.bId === aId)) {
      return edge;
    }
  }
  return undefined;
}

/** Characters physically present at a location (excludes those in transit). */
export function charactersAt(graph: WorldGraph, locationId: string): WorldCharacter[] {
  return Object.values(graph.characters).filter(c => c.locationId === locationId && !c.transit);
}

/** Characters currently traveling between locations. */
export function charactersInTransit(graph: WorldGraph): WorldCharacter[] {
  return Object.values(graph.characters).filter(c => c.transit !== undefined);
}

/** In-transit characters whose destination is the given location. */
export function charactersIncomingTo(graph: WorldGraph, locationId: string): WorldCharacter[] {
  return Object.values(graph.characters).filter(c => c.transit?.toId === locationId);
}
