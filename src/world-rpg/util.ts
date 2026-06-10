/**
 * Small shared helpers for the Persistent World RPG module.
 */

/** Current epoch milliseconds. */
export function now(): number {
  return Date.now();
}

/** Generate a prefixed unique id, e.g. `world_<uuid>`. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
