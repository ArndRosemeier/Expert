/**
 * Typed persistence helpers for worlds and adventures. Thin wrappers over the
 * generic StorageService CRUD so the rest of the module works with concrete
 * types instead of generics.
 */

import { StorageService } from '../../StorageService';
import { Adventure, World } from '../types/WorldRpgTypes';

function byUpdatedDesc<T extends { updatedAt: number }>(items: T[]): T[] {
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveWorld(world: World): Promise<void> {
  const storage = await StorageService.getInstance();
  await storage.saveWorldRpgWorld(world);
}

export async function loadWorld(worldId: string): Promise<World | null> {
  const storage = await StorageService.getInstance();
  return storage.loadWorldRpgWorld<World>(worldId);
}

export async function deleteWorld(worldId: string): Promise<void> {
  const storage = await StorageService.getInstance();
  await storage.deleteWorldRpgWorld(worldId);
}

export async function listWorlds(): Promise<World[]> {
  const storage = await StorageService.getInstance();
  return byUpdatedDesc(await storage.listWorldRpgWorlds<World>());
}

export async function saveAdventure(adventure: Adventure): Promise<void> {
  const storage = await StorageService.getInstance();
  await storage.saveWorldRpgAdventure(adventure);
}

export async function loadAdventure(adventureId: string): Promise<Adventure | null> {
  const storage = await StorageService.getInstance();
  return storage.loadWorldRpgAdventure<Adventure>(adventureId);
}

export async function deleteAdventure(adventureId: string): Promise<void> {
  const storage = await StorageService.getInstance();
  await storage.deleteWorldRpgAdventure(adventureId);
}

export async function listAdventures(): Promise<Adventure[]> {
  const storage = await StorageService.getInstance();
  return byUpdatedDesc(await storage.listWorldRpgAdventures<Adventure>());
}
