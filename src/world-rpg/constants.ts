/**
 * Tunable constants for the Persistent World RPG module.
 * Centralized here so they are trivial to adjust later.
 */

import { SpeedTable, WorldClockConfig } from './types/WorldRpgTypes';

/** Default fixed-size locality window: max referenced nodes sent per turn. */
export const DEFAULT_LOCALITY_BUDGET = 12;

/** How many recent transcript messages are sent to the narrator each turn. */
export const DEFAULT_MAX_CONTEXT_MESSAGES = 16;

/** Max exits described in narrator prose before collapsing to "+N more". */
export const MAX_EXITS_SHOWN = 8;

/** Flat travel time, in minutes, for an `ADJACENT` edge. */
export const ADJACENT_TRAVEL_MINUTES = 1;

/** Default per-mode travel speeds in meters per minute. */
export const DEFAULT_SPEEDS: SpeedTable = {
  foot: 80,    // ~4.8 km/h
  horse: 230,  // ~13.8 km/h
  cart: 130,   // ~7.8 km/h
  boat: 170,   // ~10 km/h
  car: 1500    // ~90 km/h
};

export const DEFAULT_CLOCK_CONFIG: WorldClockConfig = {
  minutesPerDay: 1440,
  dayLabel: 'Day'
};

/** Default narrator temperature when a session has none set. */
export const DEFAULT_TEMPERATURE = 1.0;

// --- Map camera ---
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 1;

// --- Layout (world-space units) ---
/** Baseline spacing between connected nodes for a "typical" edge. */
export const LAYOUT_BASE_SPACING = 140;
/** Spacing for `ADJACENT` edges (rooms within a building, etc.). */
export const LAYOUT_ADJACENT_SPACING = 56;
/** Minimum gap enforced between any two nodes during collision avoidance. */
export const LAYOUT_MIN_NODE_GAP = 48;

// --- View shell ---
/** Default fraction of the split given to the map pane. */
export const DEFAULT_MAP_PANE_RATIO = 0.6;

/** Default notes-pane height as a fraction of the map pane height. */
export const DEFAULT_NOTES_HEIGHT_RATIO = 0.25;
