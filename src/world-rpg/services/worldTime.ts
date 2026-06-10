/**
 * Deterministic time and distance utilities for the Persistent World RPG.
 *
 * The clock and all travel times are computed here, never by the LLM. Distances
 * are stored in meters (or the `ADJACENT` sentinel); travel time is derived from
 * distance, the chosen travel mode, and the world's speed table.
 */

import {
  ADJACENT,
  EdgeDistance,
  SpeedTable,
  TravelMode,
  WorldClockConfig,
  WorldEdge
} from '../types/WorldRpgTypes';
import { ADJACENT_TRAVEL_MINUTES } from '../constants';

/**
 * Travel-time multipliers by terrain label. Unknown/absent terrain is 1.0.
 * Centralized and intentionally small; extend as worlds need it.
 */
const TERRAIN_MULTIPLIERS: Record<string, number> = {
  road: 0.8,
  plains: 1.0,
  forest: 1.4,
  hills: 1.5,
  mountain: 2.5,
  swamp: 2.0,
  water: 1.0
};

export function terrainMultiplier(terrain?: string): number {
  if (!terrain) {
    return 1.0;
  }
  return TERRAIN_MULTIPLIERS[terrain.toLowerCase()] ?? 1.0;
}

/**
 * Minutes to traverse a distance with a given mode. `ADJACENT` edges cost a flat
 * minimum. Result is rounded up to at least 1 minute.
 */
export function travelMinutesForDistance(
  distance: EdgeDistance,
  mode: TravelMode,
  speeds: SpeedTable,
  terrain?: string
): number {
  if (distance === ADJACENT) {
    return ADJACENT_TRAVEL_MINUTES;
  }
  const metersPerMinute = speeds[mode];
  if (metersPerMinute <= 0) {
    throw new Error(`Invalid speed for mode '${mode}': ${metersPerMinute}`);
  }
  const minutes = (distance / metersPerMinute) * terrainMultiplier(terrain);
  return Math.max(1, Math.round(minutes));
}

/** Minutes to traverse a specific edge with a given mode. */
export function edgeTravelMinutes(edge: WorldEdge, mode: TravelMode, speeds: SpeedTable): number {
  return travelMinutesForDistance(edge.distance, mode, speeds, edge.terrain);
}

/**
 * Walking-time "weight" for an edge, used by the locality traversal to order the
 * frontier by how far places feel from the player on foot.
 */
export function edgeWalkWeight(edge: WorldEdge, speeds: SpeedTable): number {
  return edgeTravelMinutes(edge, 'foot', speeds);
}

export interface ClockBreakdown {
  /** 1-based in-world day number. */
  day: number;
  /** Hour of day, 0-23 (assuming a 24h day; derived from minutesPerDay). */
  hour: number;
  minute: number;
  /** Minutes elapsed within the current day. */
  minuteOfDay: number;
}

export function breakDownClock(clockMinutes: number, config: WorldClockConfig): ClockBreakdown {
  if (clockMinutes < 0) {
    throw new Error(`Clock minutes cannot be negative: ${clockMinutes}`);
  }
  const minutesPerDay = config.minutesPerDay;
  const day = Math.floor(clockMinutes / minutesPerDay) + 1;
  const minuteOfDay = clockMinutes % minutesPerDay;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return { day, hour, minute, minuteOfDay };
}

/** A coarse part-of-day label derived from the fraction of the day elapsed. */
export function partOfDay(clockMinutes: number, config: WorldClockConfig): string {
  const { minuteOfDay } = breakDownClock(clockMinutes, config);
  const fraction = minuteOfDay / config.minutesPerDay;
  if (fraction < 0.21) return 'night';
  if (fraction < 0.29) return 'dawn';
  if (fraction < 0.46) return 'morning';
  if (fraction < 0.54) return 'midday';
  if (fraction < 0.71) return 'afternoon';
  if (fraction < 0.79) return 'dusk';
  if (fraction < 0.92) return 'evening';
  return 'night';
}

/** Human-readable clock, e.g. "Day 3, 18:05 (dusk)". */
export function formatClock(clockMinutes: number, config: WorldClockConfig): string {
  const { day, hour, minute } = breakDownClock(clockMinutes, config);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${config.dayLabel} ${day}, ${hh}:${mm} (${partOfDay(clockMinutes, config)})`;
}

/** Human-readable duration, e.g. "2h 15m" or "45m". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}
