import { RPGLiteSession, RPGLiteStartPreset } from './RPGLiteTypes';

/** Identifies an RPG Lite save/load JSON file. */
export const RPG_LITE_TRANSFER_FORMAT = 'rpg-lite-transfer' as const;

/** Current on-disk schema version for RPG Lite transfer files. */
export const RPG_LITE_TRANSFER_VERSION = 1 as const;

/**
 * Portable bundle of RPG Lite sessions and templates written to / read from a JSON file.
 */
export interface RPGLiteTransferFile {
  format: typeof RPG_LITE_TRANSFER_FORMAT;
  version: typeof RPG_LITE_TRANSFER_VERSION;
  exportedAt: number;
  sessions: RPGLiteSession[];
  templates: RPGLiteStartPreset[];
}

/**
 * Selection of sessions and templates chosen in the Save modal.
 */
export interface RPGLiteTransferSelection {
  sessionIds: string[];
  templateIds: string[];
}

/**
 * Result of merging an imported transfer file into local storage.
 */
export interface RPGLiteTransferImportResult {
  sessionsAdded: number;
  sessionsOverwritten: number;
  templatesAdded: number;
  templatesOverwritten: number;
}
