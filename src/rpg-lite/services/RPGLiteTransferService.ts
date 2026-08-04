import { StorageService } from '../../StorageService';
import { FileDownloadService, FileDownloadResult } from '../../utils/FileDownloadService';
import { RPGLiteSession, RPGLiteStartPreset } from '../types/RPGLiteTypes';
import {
  RPG_LITE_TRANSFER_FORMAT,
  RPG_LITE_TRANSFER_VERSION,
  RPGLiteTransferFile,
  RPGLiteTransferImportResult,
  RPGLiteTransferSelection
} from '../types/RPGLiteTransferTypes';

interface OpenFilePickerWindow {
  showOpenFilePicker(options: {
    multiple?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }): Promise<FileSystemFileHandle[]>;
}

/**
 * Builds, saves, loads, and merges RPG Lite session/template transfer files.
 */
export class RPGLiteTransferService {
  /**
   * Builds a transfer payload from the given in-memory sessions/templates and checkbox selection.
   */
  public buildTransferFile(
    sessions: RPGLiteSession[],
    templates: RPGLiteStartPreset[],
    selection: RPGLiteTransferSelection
  ): RPGLiteTransferFile {
    const sessionIdSet = new Set(selection.sessionIds);
    const templateIdSet = new Set(selection.templateIds);

    const selectedSessions = sessions.filter((s) => sessionIdSet.has(s.id));
    const selectedTemplates = templates.filter((t) => templateIdSet.has(t.id));

    if (selectedSessions.length !== selection.sessionIds.length) {
      throw new Error('One or more selected sessions were not found in memory.');
    }
    if (selectedTemplates.length !== selection.templateIds.length) {
      throw new Error('One or more selected templates were not found in memory.');
    }
    if (selectedSessions.length === 0 && selectedTemplates.length === 0) {
      throw new Error('Select at least one session or template to save.');
    }

    return {
      format: RPG_LITE_TRANSFER_FORMAT,
      version: RPG_LITE_TRANSFER_VERSION,
      exportedAt: Date.now(),
      sessions: selectedSessions,
      templates: selectedTemplates
    };
  }

  /**
   * Writes a transfer file via Save As when supported; falls back to a Downloads download.
   */
  public async saveTransferFile(data: RPGLiteTransferFile): Promise<FileDownloadResult> {
    const stamp = new Date(data.exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `rpg-lite-export-${stamp}.json`;
    return FileDownloadService.downloadJson(data, filename, 'RPG Lite Export');
  }

  /**
   * Opens a JSON file picker (File System Access API when available, file input otherwise).
   * Returns null when the user cancels.
   */
  public async pickTransferFile(): Promise<File | null> {
    if ('showOpenFilePicker' in window) {
      try {
        const fileHandles = await (window as unknown as OpenFilePickerWindow).showOpenFilePicker({
          multiple: false,
          types: [{
            description: 'RPG Lite Export',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const fileHandle = fileHandles[0];
        if (!fileHandle) {
          return null;
        }
        return await fileHandle.getFile();
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return null;
        }
        throw error;
      }
    }

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';

      input.onchange = () => {
        const file = input.files?.[0] ?? null;
        input.remove();
        resolve(file);
      };

      input.addEventListener('cancel', () => {
        input.remove();
        resolve(null);
      });

      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Parses and validates a transfer JSON file.
   */
  public async parseTransferFile(file: File): Promise<RPGLiteTransferFile> {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    return this.validateTransferFile(parsed);
  }

  /**
   * Merges imported sessions/templates into IndexedDB.
   * Items with the same name (session title / template name) overwrite local ones;
   * everything else is added as new entries with fresh ids.
   */
  public async importTransferFile(data: RPGLiteTransferFile): Promise<RPGLiteTransferImportResult> {
    const storage = await StorageService.getInstance();
    const existingSessions = await storage.listRPGLiteSessions<RPGLiteSession>();
    const existingTemplates = await storage.listRPGLiteStartPresets<RPGLiteStartPreset>();

    const result: RPGLiteTransferImportResult = {
      sessionsAdded: 0,
      sessionsOverwritten: 0,
      templatesAdded: 0,
      templatesOverwritten: 0
    };

    for (const imported of data.sessions) {
      this.assertSessionShape(imported);
      const match = existingSessions.find((s) => s.title === imported.title);
      if (match) {
        const merged: RPGLiteSession = {
          ...imported,
          id: match.id,
          createdAt: match.createdAt,
          updatedAt: Date.now()
        };
        await storage.saveRPGLiteSession(merged);
        const index = existingSessions.findIndex((s) => s.id === match.id);
        existingSessions[index] = merged;
        result.sessionsOverwritten += 1;
      } else {
        const added: RPGLiteSession = {
          ...imported,
          id: `rpg_lite_session_${crypto.randomUUID()}`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await storage.saveRPGLiteSession(added);
        existingSessions.push(added);
        result.sessionsAdded += 1;
      }
    }

    for (const imported of data.templates) {
      this.assertTemplateShape(imported);
      const match = existingTemplates.find((t) => t.name === imported.name);
      if (match) {
        const merged: RPGLiteStartPreset = {
          ...imported,
          id: match.id,
          createdAt: match.createdAt,
          updatedAt: Date.now()
        };
        await storage.saveRPGLiteStartPreset(merged);
        const index = existingTemplates.findIndex((t) => t.id === match.id);
        existingTemplates[index] = merged;
        result.templatesOverwritten += 1;
      } else {
        const added: RPGLiteStartPreset = {
          ...imported,
          id: `rpg_lite_preset_${crypto.randomUUID()}`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await storage.saveRPGLiteStartPreset(added);
        existingTemplates.push(added);
        result.templatesAdded += 1;
      }
    }

    return result;
  }

  private validateTransferFile(value: unknown): RPGLiteTransferFile {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Transfer file is not a JSON object.');
    }
    const obj = value as Record<string, unknown>;
    if (obj['format'] !== RPG_LITE_TRANSFER_FORMAT) {
      throw new Error(`Unsupported transfer format: ${String(obj['format'])}`);
    }
    if (obj['version'] !== RPG_LITE_TRANSFER_VERSION) {
      throw new Error(`Unsupported transfer version: ${String(obj['version'])}`);
    }
    if (typeof obj['exportedAt'] !== 'number') {
      throw new Error('Transfer file is missing exportedAt.');
    }
    if (!Array.isArray(obj['sessions'])) {
      throw new Error('Transfer file is missing sessions array.');
    }
    if (!Array.isArray(obj['templates'])) {
      throw new Error('Transfer file is missing templates array.');
    }

    const sessions = obj['sessions'] as RPGLiteSession[];
    const templates = obj['templates'] as RPGLiteStartPreset[];
    for (const session of sessions) {
      this.assertSessionShape(session);
    }
    for (const template of templates) {
      this.assertTemplateShape(template);
    }

    return {
      format: RPG_LITE_TRANSFER_FORMAT,
      version: RPG_LITE_TRANSFER_VERSION,
      exportedAt: obj['exportedAt'],
      sessions,
      templates
    };
  }

  private assertSessionShape(value: unknown): asserts value is RPGLiteSession {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Imported session is not an object.');
    }
    const s = value as Record<string, unknown>;
    if (typeof s['id'] !== 'string' || typeof s['title'] !== 'string') {
      throw new Error('Imported session is missing id or title.');
    }
    if (!Array.isArray(s['conversation'])) {
      throw new Error(`Imported session "${String(s['title'])}" is missing conversation.`);
    }
  }

  private assertTemplateShape(value: unknown): asserts value is RPGLiteStartPreset {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Imported template is not an object.');
    }
    const t = value as Record<string, unknown>;
    if (typeof t['id'] !== 'string' || typeof t['name'] !== 'string') {
      throw new Error('Imported template is missing id or name.');
    }
  }
}
