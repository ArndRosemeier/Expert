/**
 * WorldRpgView - the full-screen UI shell for the Persistent World RPG.
 *
 * Home screen: pick/continue an adventure, or start a new one (forking a saved
 * world, or letting the LLM bootstrap a minimal world).
 *
 * Game screen: a resizable split of a pannable/zoomable 2D map and a chat, plus
 * a user-controlled notes area (never sent to the LLM) and world/adventure
 * controls. The map and clock are driven by the deterministic world store.
 */

import { OpenRouterClient } from '../../OpenRouterClient';
import * as state from '../../state';
import { Adventure, World, WorldRpgModelPurpose } from '../types/WorldRpgTypes';
import { WorldRpgEngine, TurnCallbacks } from '../services/WorldRpgEngine';
import { WorldMapRenderer } from '../map/WorldMapRenderer';
import { updateLayout } from '../map/layoutEngine';
import { DEFAULT_NOTES_HEIGHT_RATIO } from '../constants';
import { renderWorldRpgContent, attachWorldRpgFoldHandlers } from './worldRpgTextRenderer';
import {
  charactersAt,
  charactersIncomingTo,
  getCharacter,
  getLocation,
  getNeighbors
} from '../services/worldGraph';
import { formatClock } from '../services/worldTime';
import {
  DuplicateGroup,
  findDuplicateCharacterGroups,
  findDuplicateLocationGroups,
  mergeCharacters,
  mergeLocations
} from '../services/worldMaintenance';
import {
  createAdventure,
  copyAdventureForPlay,
  resetAdventureToStartState,
  forkWorldToAdventure,
  buildWorldFromAdventure
} from '../services/worldFactory';
import { bootstrapWorldGraph } from '../services/worldBootstrap';
import {
  extractScenarioOpening,
  extractScenarioRules,
  listRpgLiteScenarios,
  scenarioToPremise
} from '../services/rpgLiteImport';
import { RPGLiteStartPreset } from '../../rpg-lite/types/RPGLiteTypes';
import {
  deleteAdventure,
  listAdventures,
  listWorlds,
  loadAdventure,
  loadWorld,
  saveAdventure,
  saveWorld
} from '../services/worldStorage';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class WorldRpgView {
  private modalEl: HTMLElement;
  private client: OpenRouterClient;
  private engine: WorldRpgEngine;
  private adventure: Adventure | null = null;
  private mapRenderer: WorldMapRenderer | null = null;
  private busy = false;
  private cameraSaveTimer: number | null = null;
  /** Defaults for the next new adventure, chosen on the home screen. */
  private newNarratorPurpose: WorldRpgModelPurpose = 'prose';
  private newParserPurpose: WorldRpgModelPurpose = 'editor';

  constructor() {
    this.client = OpenRouterClient.getInstance();
    this.engine = new WorldRpgEngine(this.client);
    this.modalEl = this.ensureModal();
  }

  async open(): Promise<void> {
    await this.renderHome();
  }

  private ensureModal(): HTMLElement {
    let modal = document.getElementById('world-rpg-view-container');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'world-rpg-view-container';
      modal.className = 'world-rpg-modal';
      document.body.appendChild(modal);
    }
    return modal;
  }

  private close(): void {
    if (this.mapRenderer) {
      this.mapRenderer.destroy();
      this.mapRenderer = null;
    }
    this.modalEl.remove();
  }

  // ============================ Home screen ============================

  private async renderHome(): Promise<void> {
    if (this.mapRenderer) {
      this.mapRenderer.destroy();
      this.mapRenderer = null;
    }
    this.adventure = null;

    const [adventures, worlds] = await Promise.all([listAdventures(), listWorlds()]);

    this.modalEl.innerHTML = `
      <div class="world-rpg-topbar">
        <div class="world-rpg-topbar-left">
          <div class="world-rpg-title">World RPG</div>
        </div>
        <div class="world-rpg-topbar-right">
          <button id="world-rpg-close" class="world-rpg-btn">Close</button>
        </div>
      </div>
      <div class="world-rpg-home">
        <div class="world-rpg-home-card">
          <h2>Continue an adventure</h2>
          <div id="world-rpg-adventures" class="world-rpg-list"></div>
        </div>
        <div class="world-rpg-home-card">
          <h2>Start a new adventure</h2>
          <div class="world-rpg-form-row">
            <label>Player name</label>
            <input id="world-rpg-player-name" class="world-rpg-input" value="Adventurer" />
          </div>
          <div class="world-rpg-form-row">
            <label>Base world</label>
            <select id="world-rpg-world-select" class="world-rpg-select"></select>
          </div>
          <div class="world-rpg-form-row">
            <label>Premise (used only when generating a new world)</label>
            <textarea id="world-rpg-premise" class="world-rpg-textarea" rows="3" placeholder="e.g. A foggy harbor town hiding an old secret"></textarea>
          </div>
          <div class="world-rpg-form-row">
            <label>Models</label>
            <div class="world-rpg-home-purposes">
              <label class="world-rpg-purpose">Narrator
                <select id="world-rpg-home-narrator" class="world-rpg-select"></select>
              </label>
              <label class="world-rpg-purpose">Parser
                <select id="world-rpg-home-parser" class="world-rpg-select"></select>
              </label>
            </div>
          </div>
          <div class="world-rpg-home-actions">
            <button id="world-rpg-start" class="world-rpg-btn world-rpg-btn-primary">Begin adventure</button>
            <button id="world-rpg-import" class="world-rpg-btn" title="Generate a world from a saved RPG Lite scenario">Import from RPG Lite</button>
          </div>
          <div id="world-rpg-start-status" class="world-rpg-empty" style="margin-top:.5rem;"></div>
        </div>
      </div>
    `;

    (this.modalEl.querySelector('#world-rpg-close') as HTMLElement).addEventListener('click', () => { this.close(); });

    this.renderAdventureList(adventures);
    this.renderWorldSelect(worlds);
    this.setupHomeModelSelectors();

    (this.modalEl.querySelector('#world-rpg-start') as HTMLElement).addEventListener('click', () => {
      void this.handleStart();
    });
    (this.modalEl.querySelector('#world-rpg-import') as HTMLElement).addEventListener('click', () => {
      void this.openImportPicker();
    });
  }

  private setupHomeModelSelectors(): void {
    const narrator = this.modalEl.querySelector('#world-rpg-home-narrator') as HTMLSelectElement;
    const parser = this.modalEl.querySelector('#world-rpg-home-parser') as HTMLSelectElement;
    narrator.innerHTML = this.purposeOptionsHtml(this.newNarratorPurpose);
    parser.innerHTML = this.purposeOptionsHtml(this.newParserPurpose);

    narrator.addEventListener('change', () => {
      this.newNarratorPurpose = narrator.value as WorldRpgModelPurpose;
    });
    parser.addEventListener('change', () => {
      this.newParserPurpose = parser.value as WorldRpgModelPurpose;
    });
  }

  private renderAdventureList(adventures: Adventure[]): void {
    const list = this.modalEl.querySelector('#world-rpg-adventures') as HTMLElement;
    if (adventures.length === 0) {
      list.innerHTML = `<div class="world-rpg-empty">No adventures yet. Start one on the right.</div>`;
      return;
    }
    list.innerHTML = '';
    for (const adv of adventures) {
      const item = document.createElement('div');
      item.className = 'world-rpg-list-item';
      const when = new Date(adv.updatedAt).toLocaleString();
      const isTemplate = adv.isTemplate;
      const reroll = adv.regenerateOpeningOnStart;
      const badge = isTemplate ? ' <span class="world-rpg-tag">template</span>' : '';
      const primaryLabel = isTemplate ? 'Start' : 'Open';
      const rerollToggle = isTemplate ? `
          <label class="world-rpg-tpl-toggle" title="Generate a fresh opening scene every time this template is started">
            <input type="checkbox" data-reroll="${adv.id}"${reroll ? ' checked' : ''} /> Re-roll opening
          </label>` : '';
      item.innerHTML = `
        <span>${escapeHtml(adv.title)}${badge} <span class="world-rpg-empty">(${when})</span></span>
        <span style="display:flex; gap:.4rem; align-items:center;">
          <label class="world-rpg-tpl-toggle" title="Templates are never evolved directly; starting one spawns a copy">
            <input type="checkbox" data-tpl="${adv.id}"${isTemplate ? ' checked' : ''} /> Template
          </label>${rerollToggle}
          <button class="world-rpg-btn world-rpg-btn-primary" data-open="${adv.id}">${primaryLabel}</button>
          <button class="world-rpg-btn" data-del="${adv.id}">Delete</button>
        </span>
      `;
      list.appendChild(item);
      (item.querySelector('[data-open]') as HTMLElement).addEventListener('click', () => {
        if (isTemplate) {
          void this.startFromTemplate(adv);
        } else {
          void this.openAdventure(adv.id);
        }
      });
      (item.querySelector('[data-tpl]') as HTMLInputElement).addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        void this.setAdventureTemplate(adv, checked);
      });
      const rerollInput = item.querySelector('[data-reroll]') as HTMLInputElement | null;
      if (rerollInput) {
        rerollInput.addEventListener('change', (e) => {
          adv.regenerateOpeningOnStart = (e.target as HTMLInputElement).checked;
          adv.updatedAt = Date.now();
          void saveAdventure(adv);
        });
      }
      (item.querySelector('[data-del]') as HTMLElement).addEventListener('click', () => {
        if (window.confirm(`Delete adventure "${adv.title}"? This cannot be undone.`)) {
          void deleteAdventure(adv.id).then(async () => this.renderHome());
        }
      });
    }
  }

  /** Toggle a save's template flag and re-render so its button relabels. */
  private async setAdventureTemplate(adventure: Adventure, isTemplate: boolean): Promise<void> {
    adventure.isTemplate = isTemplate;
    // Make the re-roll flag concrete so the checkbox and Start path agree.
    if (typeof adventure.regenerateOpeningOnStart !== 'boolean') {
      adventure.regenerateOpeningOnStart = true;
    }
    adventure.updatedAt = Date.now();
    await saveAdventure(adventure);
    await this.renderHome();
  }

  /** Start a template: play an independent copy so the template stays pristine. */
  private async startFromTemplate(template: Adventure): Promise<void> {
    const copy = copyAdventureForPlay(template);
    // When the template re-rolls its opening, wipe back to the pristine start so
    // a brand-new first scene is generated below. Default on: legacy saves with
    // no explicit value (undefined) still re-roll, matching the checkbox.
    if (copy.regenerateOpeningOnStart) {
      resetAdventureToStartState(copy);
    }
    await saveAdventure(copy);
    this.adventure = copy;
    this.renderGame();
    // No chat to show (pristine, or just reset for a re-roll): generate an
    // opening. A played template that keeps its transcript just shows it.
    if (copy.transcript.length === 0) {
      await this.runOpening();
    } else {
      this.renderTranscript();
    }
  }

  private renderWorldSelect(worlds: World[]): void {
    const select = this.modalEl.querySelector('#world-rpg-world-select') as HTMLSelectElement;
    const options = ['<option value="">— Generate a new world (LLM) —</option>'];
    for (const world of worlds) {
      options.push(`<option value="${world.id}">${escapeHtml(world.name)} (v${world.version})</option>`);
    }
    select.innerHTML = options.join('');
  }

  private async handleStart(): Promise<void> {
    const playerName = (this.modalEl.querySelector('#world-rpg-player-name') as HTMLInputElement).value.trim() || 'Adventurer';
    const worldId = (this.modalEl.querySelector('#world-rpg-world-select') as HTMLSelectElement).value;
    const premise = (this.modalEl.querySelector('#world-rpg-premise') as HTMLTextAreaElement).value;
    const status = this.modalEl.querySelector('#world-rpg-start-status') as HTMLElement;
    const startBtn = this.modalEl.querySelector('#world-rpg-start') as HTMLButtonElement;
    startBtn.disabled = true;

    try {
      let adventure: Adventure;
      if (worldId) {
        status.textContent = 'Forking world...';
        const world = await loadWorld(worldId);
        if (!world) {
          throw new Error('Selected world no longer exists.');
        }
        adventure = forkWorldToAdventure(world, `${world.name} - new adventure`, { name: playerName, description: '' });
      } else {
        status.textContent = 'Generating a new world...';
        const bootstrap = await bootstrapWorldGraph(this.client, premise);
        adventure = createAdventure({
          title: bootstrap.worldName,
          graph: bootstrap.graph,
          startLocationId: bootstrap.startLocationId,
          player: { name: playerName, description: bootstrap.player.description }
        });
        adventure.premise = premise.trim();
      }

      status.textContent = '';
      await this.launchNewAdventure(adventure);
    } catch (error) {
      status.textContent = `Failed: ${error instanceof Error ? error.message : String(error)}`;
      startBtn.disabled = false;
    }
  }

  /** Apply the chosen models, persist, switch to the game screen, and narrate. */
  private async launchNewAdventure(adventure: Adventure): Promise<void> {
    adventure.narratorPurpose = this.newNarratorPurpose;
    adventure.parserPurpose = this.newParserPurpose;
    await saveAdventure(adventure);
    this.adventure = adventure;
    this.renderGame();
    await this.runOpening();
  }

  /** Show a picker of saved rpg-lite scenarios to import as a new world. */
  private async openImportPicker(): Promise<void> {
    const scenarios = await listRpgLiteScenarios();
    if (scenarios.length === 0) {
      window.alert('No RPG Lite scenarios (saved templates) were found to import.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'world-rpg-tools-overlay';
    this.modalEl.appendChild(overlay);

    const rows = scenarios
      .map(p => `
        <div class="world-rpg-list-item">
          <span>${escapeHtml(p.name)} <span class="world-rpg-empty">${escapeHtml(p.title)}</span></span>
          <button class="world-rpg-btn" data-import="${p.id}">Import</button>
        </div>
      `)
      .join('');
    overlay.innerHTML = `
      <div class="world-rpg-tools">
        <div class="world-rpg-tools-head">
          <strong>Import scenario from RPG Lite</strong>
          <button class="world-rpg-btn" data-close>Close</button>
        </div>
        <div class="world-rpg-tools-body">
          <div class="world-rpg-empty" style="margin-bottom:.6rem;">A structured world (locations, characters, map) will be generated from the scenario's text.</div>
          ${rows}
        </div>
      </div>
    `;
    (overlay.querySelector('[data-close]') as HTMLElement).addEventListener('click', () => {
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    for (const preset of scenarios) {
      (overlay.querySelector(`[data-import="${preset.id}"]`) as HTMLElement).addEventListener('click', () => {
        overlay.remove();
        void this.importFromScenario(preset);
      });
    }
  }

  /** Generate a world from a scenario's prose and start a new adventure. */
  private async importFromScenario(preset: RPGLiteStartPreset): Promise<void> {
    const playerName = (this.modalEl.querySelector('#world-rpg-player-name') as HTMLInputElement).value.trim() || 'Adventurer';
    const status = this.modalEl.querySelector('#world-rpg-start-status') as HTMLElement;
    const startBtn = this.modalEl.querySelector('#world-rpg-start') as HTMLButtonElement;
    const importBtn = this.modalEl.querySelector('#world-rpg-import') as HTMLButtonElement;
    startBtn.disabled = true;
    importBtn.disabled = true;

    try {
      status.textContent = `Extracting rules and generating a world from "${preset.name}"...`;
      const [rules, opening, bootstrap] = await Promise.all([
        extractScenarioRules(this.client, preset),
        extractScenarioOpening(this.client, preset),
        bootstrapWorldGraph(this.client, scenarioToPremise(preset))
      ]);
      const adventure = createAdventure({
        title: bootstrap.worldName,
        graph: bootstrap.graph,
        startLocationId: bootstrap.startLocationId,
        player: { name: playerName, description: bootstrap.player.description }
      });
      adventure.graph.rules = rules;
      adventure.premise = opening;
      status.textContent = '';
      await this.launchNewAdventure(adventure);
    } catch (error) {
      status.textContent = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
      startBtn.disabled = false;
      importBtn.disabled = false;
    }
  }

  private async openAdventure(adventureId: string): Promise<void> {
    const adventure = await loadAdventure(adventureId);
    if (!adventure) {
      throw new Error(`Adventure not found: ${adventureId}`);
    }
    this.adventure = adventure;
    this.renderGame();
    this.renderTranscript();
  }

  // ============================ Game screen ============================

  private renderGame(): void {
    if (!this.adventure) {
      throw new Error('renderGame called without an adventure.');
    }

    this.modalEl.innerHTML = `
      <div class="world-rpg-topbar">
        <div class="world-rpg-topbar-left">
          <div class="world-rpg-title" id="world-rpg-adv-title"></div>
          <div class="world-rpg-clock" id="world-rpg-clock"></div>
        </div>
        <div class="world-rpg-topbar-right">
          <label class="world-rpg-purpose">Narrator
            <select id="world-rpg-narrator-purpose" class="world-rpg-select"></select>
          </label>
          <label class="world-rpg-purpose">Parser
            <select id="world-rpg-parser-purpose" class="world-rpg-select"></select>
          </label>
          <button id="world-rpg-rules" class="world-rpg-btn">Rules</button>
          <button id="world-rpg-tools" class="world-rpg-btn">Tools</button>
          <button id="world-rpg-debug" class="world-rpg-btn">Debug</button>
          <button id="world-rpg-save-world" class="world-rpg-btn">Save world</button>
          <button id="world-rpg-home" class="world-rpg-btn">Home</button>
          <button id="world-rpg-close" class="world-rpg-btn">Close</button>
        </div>
      </div>
      <div class="world-rpg-main" id="world-rpg-main">
        <div class="world-rpg-map-pane" id="world-rpg-map-pane">
          <div class="world-rpg-map-stage">
            <canvas class="world-rpg-map-canvas" id="world-rpg-canvas"></canvas>
            <div class="world-rpg-map-controls">
              <button id="world-rpg-recenter" class="world-rpg-btn" title="Recenter on player">Center</button>
              <button id="world-rpg-fit" class="world-rpg-btn" title="Zoom to fit">Fit</button>
            </div>
            <div class="world-rpg-map-loc">
              <div class="world-rpg-map-loc-name" id="world-rpg-loc-name"></div>
              <div class="world-rpg-map-loc-desc" id="world-rpg-loc-desc"></div>
            </div>
          </div>
          <div class="world-rpg-notes-splitter" id="world-rpg-notes-splitter" title="Drag to resize notes"></div>
          <div class="world-rpg-notes">
            <div class="world-rpg-notes-header">Notes (private, never sent to the GM)</div>
            <textarea class="world-rpg-notes-textarea world-rpg-textarea" id="world-rpg-notes"></textarea>
          </div>
        </div>
        <div class="world-rpg-splitter" id="world-rpg-splitter"></div>
        <div class="world-rpg-chat-pane">
          <div class="world-rpg-transcript" id="world-rpg-transcript"></div>
          <div class="world-rpg-composer">
            <textarea class="world-rpg-composer-input world-rpg-textarea" id="world-rpg-input" rows="2" placeholder="What do you do?"></textarea>
            <div class="world-rpg-composer-actions">
              <button id="world-rpg-send" class="world-rpg-btn world-rpg-btn-primary">Send</button>
              <button id="world-rpg-retry" class="world-rpg-btn" title="Discard the last answer and regenerate it">Retry</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const main = this.modalEl.querySelector('#world-rpg-main') as HTMLElement;
    main.style.setProperty('--map-ratio', String(this.adventure.ui.mapPaneRatio));

    // Normalize older adventures that predate newer fields.
    if (typeof this.adventure.ui.notesHeightRatio !== 'number') {
      this.adventure.ui.notesHeightRatio = DEFAULT_NOTES_HEIGHT_RATIO;
    }
    if (typeof this.adventure.isTemplate !== 'boolean') {
      this.adventure.isTemplate = false;
    }
    if (typeof this.adventure.regenerateOpeningOnStart !== 'boolean') {
      this.adventure.regenerateOpeningOnStart = true;
    }
    if (typeof this.adventure.graph.rules !== 'string') {
      this.adventure.graph.rules = '';
    }
    if (typeof this.adventure.premise !== 'string') {
      this.adventure.premise = '';
    }
    const mapPane = this.modalEl.querySelector('#world-rpg-map-pane') as HTMLElement;
    mapPane.style.setProperty('--notes-ratio', String(this.adventure.ui.notesHeightRatio));

    const canvas = this.modalEl.querySelector('#world-rpg-canvas') as HTMLCanvasElement;
    this.mapRenderer = new WorldMapRenderer(canvas, {
      onCameraChange: () => { this.scheduleCameraSave(); },
      onLayoutChange: () => { this.scheduleCameraSave(); },
      onNodeInspect: (locationId) => { this.openNodeInspector(locationId); }
    });
    this.mapRenderer.setAdventure(this.adventure);

    (this.modalEl.querySelector('#world-rpg-close') as HTMLElement).addEventListener('click', () => { this.close(); });
    (this.modalEl.querySelector('#world-rpg-home') as HTMLElement).addEventListener('click', () => {
      void this.renderHome();
    });
    (this.modalEl.querySelector('#world-rpg-save-world') as HTMLElement).addEventListener('click', () => {
      void this.saveCurrentWorld();
    });
    (this.modalEl.querySelector('#world-rpg-rules') as HTMLElement).addEventListener('click', () => {
      this.openRulesModal();
    });
    (this.modalEl.querySelector('#world-rpg-tools') as HTMLElement).addEventListener('click', () => {
      this.openToolsModal();
    });
    (this.modalEl.querySelector('#world-rpg-debug') as HTMLElement).addEventListener('click', () => {
      this.openDebugModal();
    });
    (this.modalEl.querySelector('#world-rpg-recenter') as HTMLElement).addEventListener('click', () => {
      this.mapRenderer?.recenterToPlayer();
    });
    (this.modalEl.querySelector('#world-rpg-fit') as HTMLElement).addEventListener('click', () => {
      this.mapRenderer?.zoomToFit();
    });

    this.setupNotes();
    this.setupComposer();
    this.setupSplitter();
    this.setupModelSelectors();
    this.updateHud();
    this.refreshRetryButton();
  }

  private purposeOptionsHtml(selected: WorldRpgModelPurpose): string {
    const purposes: WorldRpgModelPurpose[] = ['prose', 'creator', 'editor', 'rater'];
    const models = state.getModelSelector()?.getSelectedModels() ?? {};
    return purposes
      .map(p => {
        const model = models[p];
        const label = model ? `${p} (${model})` : `${p} (no model set)`;
        return `<option value="${p}"${p === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
      })
      .join('');
  }

  private setupModelSelectors(): void {
    if (!this.adventure) {
      return;
    }
    const narrator = this.modalEl.querySelector('#world-rpg-narrator-purpose') as HTMLSelectElement;
    const parser = this.modalEl.querySelector('#world-rpg-parser-purpose') as HTMLSelectElement;
    narrator.innerHTML = this.purposeOptionsHtml(this.adventure.narratorPurpose);
    parser.innerHTML = this.purposeOptionsHtml(this.adventure.parserPurpose);

    narrator.addEventListener('change', () => {
      this.adventure!.narratorPurpose = narrator.value as WorldRpgModelPurpose;
      void saveAdventure(this.adventure!);
    });
    parser.addEventListener('change', () => {
      this.adventure!.parserPurpose = parser.value as WorldRpgModelPurpose;
      void saveAdventure(this.adventure!);
    });
  }

  private setupNotes(): void {
    if (!this.adventure) {
      return;
    }
    const notes = this.modalEl.querySelector('#world-rpg-notes') as HTMLTextAreaElement;
    notes.value = this.adventure.notes;

    let notesTimer: number | null = null;
    notes.addEventListener('input', () => {
      this.adventure!.notes = notes.value;
      if (notesTimer !== null) {
        window.clearTimeout(notesTimer);
      }
      notesTimer = window.setTimeout(() => {
        void saveAdventure(this.adventure!);
      }, 600);
    });

    this.setupNotesSplitter();
  }

  /** Drag the bar between the map and notes to trade vertical space. */
  private setupNotesSplitter(): void {
    const splitter = this.modalEl.querySelector('#world-rpg-notes-splitter') as HTMLElement;
    const mapPane = this.modalEl.querySelector('#world-rpg-map-pane') as HTMLElement;

    const onMove = (e: PointerEvent): void => {
      const rect = mapPane.getBoundingClientRect();
      const raw = (rect.bottom - e.clientY) / rect.height;
      const ratio = Math.max(0.1, Math.min(0.8, raw));
      mapPane.style.setProperty('--notes-ratio', String(ratio));
      this.adventure!.ui.notesHeightRatio = ratio;
      this.mapRenderer?.scheduleRender();
    };
    const onUp = (e: PointerEvent): void => {
      splitter.releasePointerCapture(e.pointerId);
      splitter.removeEventListener('pointermove', onMove);
      splitter.removeEventListener('pointerup', onUp);
      void saveAdventure(this.adventure!);
    };
    splitter.addEventListener('pointerdown', (e: PointerEvent) => {
      splitter.setPointerCapture(e.pointerId);
      splitter.addEventListener('pointermove', onMove);
      splitter.addEventListener('pointerup', onUp);
    });
  }

  private setupComposer(): void {
    const input = this.modalEl.querySelector('#world-rpg-input') as HTMLTextAreaElement;
    const send = this.modalEl.querySelector('#world-rpg-send') as HTMLButtonElement;
    const retry = this.modalEl.querySelector('#world-rpg-retry') as HTMLButtonElement;
    send.addEventListener('click', () => {
      void this.handleSend();
    });
    retry.addEventListener('click', () => {
      void this.handleRetry();
    });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend();
      }
    });
  }

  /** Enable Retry only when there is a captured turn and we are idle. */
  private refreshRetryButton(): void {
    const retry = this.modalEl.querySelector<HTMLButtonElement>('#world-rpg-retry');
    if (retry) {
      retry.disabled = this.busy || !this.adventure?.rollback;
    }
  }

  private setupSplitter(): void {
    const splitter = this.modalEl.querySelector('#world-rpg-splitter') as HTMLElement;
    const main = this.modalEl.querySelector('#world-rpg-main') as HTMLElement;

    const onMove = (e: PointerEvent): void => {
      const rect = main.getBoundingClientRect();
      const vertical = getComputedStyle(main).flexDirection === 'column';
      const raw = vertical ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
      const ratio = Math.max(0.15, Math.min(0.85, raw));
      main.style.setProperty('--map-ratio', String(ratio));
      this.adventure!.ui.mapPaneRatio = ratio;
      this.mapRenderer?.scheduleRender();
    };
    const onUp = (e: PointerEvent): void => {
      splitter.releasePointerCapture(e.pointerId);
      splitter.removeEventListener('pointermove', onMove);
      splitter.removeEventListener('pointerup', onUp);
      void saveAdventure(this.adventure!);
    };
    splitter.addEventListener('pointerdown', (e: PointerEvent) => {
      splitter.setPointerCapture(e.pointerId);
      splitter.addEventListener('pointermove', onMove);
      splitter.addEventListener('pointerup', onUp);
    });
  }

  private scheduleCameraSave(): void {
    if (this.cameraSaveTimer !== null) {
      window.clearTimeout(this.cameraSaveTimer);
    }
    this.cameraSaveTimer = window.setTimeout(() => {
      if (this.adventure) {
        void saveAdventure(this.adventure);
      }
    }, 800);
  }

  private updateHud(): void {
    if (!this.adventure) {
      return;
    }
    (this.modalEl.querySelector('#world-rpg-adv-title') as HTMLElement).textContent = this.adventure.title;
    (this.modalEl.querySelector('#world-rpg-clock') as HTMLElement).textContent =
      formatClock(this.adventure.clockMinutes, this.adventure.graph.clockConfig);
    const loc = getLocation(this.adventure.graph, this.adventure.currentLocationId);
    (this.modalEl.querySelector('#world-rpg-loc-name') as HTMLElement).textContent = loc.name;
    (this.modalEl.querySelector('#world-rpg-loc-desc') as HTMLElement).textContent = loc.description;
  }

  private renderTranscript(): void {
    if (!this.adventure) {
      return;
    }
    const transcript = this.modalEl.querySelector('#world-rpg-transcript') as HTMLElement;
    transcript.innerHTML = '';
    for (const msg of this.adventure.transcript) {
      const el = document.createElement('div');
      el.className = `world-rpg-msg ${msg.role}`;
      if (msg.role === 'assistant') {
        el.innerHTML = renderWorldRpgContent(msg.content);
        attachWorldRpgFoldHandlers(el);
      } else {
        el.textContent = msg.content;
      }
      transcript.appendChild(el);
    }
    this.scrollTranscript();
  }

  private scrollTranscript(): void {
    const transcript = this.modalEl.querySelector('#world-rpg-transcript') as HTMLElement;
    transcript.scrollTop = transcript.scrollHeight;
  }

  private appendMessageEl(role: 'user' | 'assistant', text: string): HTMLElement {
    const transcript = this.modalEl.querySelector('#world-rpg-transcript') as HTMLElement;
    const el = document.createElement('div');
    el.className = `world-rpg-msg ${role}`;
    el.textContent = text;
    transcript.appendChild(el);
    this.scrollTranscript();
    return el;
  }

  private appendError(message: string): void {
    const transcript = this.modalEl.querySelector('#world-rpg-transcript') as HTMLElement;
    const el = document.createElement('div');
    el.className = 'world-rpg-msg-error';
    el.textContent = message;
    transcript.appendChild(el);
    this.scrollTranscript();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const send = this.modalEl.querySelector<HTMLButtonElement>('#world-rpg-send');
    const input = this.modalEl.querySelector<HTMLTextAreaElement>('#world-rpg-input');
    if (send) {
      send.disabled = busy;
    }
    if (input) {
      input.disabled = busy;
    }
    this.refreshRetryButton();
  }

  private async runOpening(): Promise<void> {
    await this.runTurn(null);
  }

  /**
   * Stream a single turn and apply state. `action === null` is the opening
   * scene; otherwise it is the player's action (already removed from the input).
   */
  private async runTurn(action: string | null): Promise<void> {
    if (!this.adventure) {
      return;
    }
    this.setBusy(true);
    if (action !== null) {
      this.appendMessageEl('user', action);
    }
    const bubble = this.appendMessageEl('assistant', '');
    let text = '';
    const callbacks: TurnCallbacks = {
      onNarratorChunk: (chunk) => {
        text += chunk;
        bubble.textContent = text;
        this.scrollTranscript();
      },
      onNarratorComplete: (full) => {
        bubble.innerHTML = renderWorldRpgContent(full);
        attachWorldRpgFoldHandlers(bubble);
        this.scrollTranscript();
      },
      onNarratorPersist: async () => {
        if (this.adventure) {
          await saveAdventure(this.adventure);
        }
      },
      onStateError: (err) => { this.appendError(`State update issue: ${err.message}`); }
    };
    try {
      if (action === null) {
        await this.engine.generateOpening(this.adventure, callbacks);
      } else {
        await this.engine.runPlayerTurn(this.adventure, action, callbacks);
      }
    } catch (error) {
      this.appendError(`Narrator failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await saveAdventure(this.adventure);
      this.afterTurn();
      this.setBusy(false);
      this.modalEl.querySelector<HTMLTextAreaElement>('#world-rpg-input')?.focus();
    }
  }

  private async handleSend(): Promise<void> {
    if (!this.adventure || this.busy) {
      return;
    }
    const input = this.modalEl.querySelector('#world-rpg-input') as HTMLTextAreaElement;
    const action = input.value.trim();
    if (action.length === 0) {
      return;
    }
    input.value = '';
    await this.runTurn(action);
  }

  /** Roll the world back to before the last turn and regenerate it. */
  private async handleRetry(): Promise<void> {
    if (!this.adventure || this.busy || !this.adventure.rollback) {
      return;
    }
    const action = this.engine.rollbackLastTurn(this.adventure);
    this.renderTranscript();
    this.afterTurn();
    await this.runTurn(action);
  }

  private afterTurn(): void {
    if (!this.adventure || !this.mapRenderer) {
      return;
    }
    this.mapRenderer.setAdventure(this.adventure);
    this.updateHud();
    this.scrollTranscript();
    this.refreshRetryButton();
  }

  private async saveCurrentWorld(): Promise<void> {
    if (!this.adventure) {
      return;
    }
    const defaultName = this.adventure.title;
    const name = window.prompt('Save current world as template. Name:', defaultName);
    if (name === null || name.trim().length === 0) {
      return;
    }

    let existing: World | null = null;
    if (this.adventure.sourceWorldId) {
      const overwrite = window.confirm('Overwrite the source world with the current state? Cancel = save as a new world.');
      if (overwrite) {
        existing = await loadWorld(this.adventure.sourceWorldId);
      }
    }

    const world = buildWorldFromAdventure(this.adventure, name.trim(), existing);
    await saveWorld(world);
    this.adventure.sourceWorldId = world.id;
    this.adventure.sourceWorldVersion = world.version;
    await saveAdventure(this.adventure);
    window.alert(`World "${world.name}" saved (v${world.version}).`);
  }

  // ============================ Maintenance tools ============================

  private openToolsModal(): void {
    if (!this.adventure) {
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'world-rpg-tools-overlay';
    this.modalEl.appendChild(overlay);

    const renderTools = (): void => {
      const adv = this.adventure!;
      overlay.innerHTML = `
        <div class="world-rpg-tools">
          <div class="world-rpg-tools-head">
            <strong>Maintenance - duplicate entities</strong>
            <button class="world-rpg-btn" data-close>Close</button>
          </div>
          <div class="world-rpg-tools-body">
            <h3>Locations</h3>
            <div id="wr-loc-groups"></div>
            <h3>Characters</h3>
            <div id="wr-char-groups"></div>
          </div>
        </div>
      `;
      (overlay.querySelector('[data-close]') as HTMLElement).addEventListener('click', () => {
        overlay.remove();
      });
      this.renderDuplicateGroups(
        overlay.querySelector('#wr-loc-groups') as HTMLElement,
        findDuplicateLocationGroups(adv.graph),
        'location',
        renderTools
      );
      this.renderDuplicateGroups(
        overlay.querySelector('#wr-char-groups') as HTMLElement,
        findDuplicateCharacterGroups(adv.graph),
        'character',
        renderTools
      );
    };
    renderTools();
  }

  private renderDuplicateGroups(
    container: HTMLElement,
    groups: DuplicateGroup[],
    kind: 'location' | 'character',
    refresh: () => void
  ): void {
    if (groups.length === 0) {
      container.innerHTML = `<div class="world-rpg-empty">No duplicate names found.</div>`;
      return;
    }
    container.innerHTML = '';
    for (const group of groups) {
      const row = document.createElement('div');
      row.className = 'world-rpg-list-item';
      const options = group.ids
        .map(id => {
          const label = kind === 'location'
            ? getLocation(this.adventure!.graph, id).name
            : getCharacter(this.adventure!.graph, id).name;
          return `<option value="${id}">${escapeHtml(label)} [${id}]</option>`;
        })
        .join('');
      row.innerHTML = `
        <span>"${escapeHtml(group.name)}" x${group.ids.length}</span>
        <span style="display:flex; gap:.4rem; align-items:center;">
          <select class="world-rpg-select" data-keep>${options}</select>
          <button class="world-rpg-btn" data-merge>Merge into selected</button>
        </span>
      `;
      container.appendChild(row);
      (row.querySelector('[data-merge]') as HTMLElement).addEventListener('click', () => {
        const keepId = (row.querySelector('[data-keep]') as HTMLSelectElement).value;
        void this.mergeDuplicateGroup(kind, keepId, group.ids).then(refresh);
      });
    }
  }

  private async mergeDuplicateGroup(
    kind: 'location' | 'character',
    keepId: string,
    ids: string[]
  ): Promise<void> {
    if (!this.adventure) {
      return;
    }
    const adv = this.adventure;
    for (const dropId of ids) {
      if (dropId === keepId) {
        continue;
      }
      if (kind === 'location') {
        mergeLocations(adv.graph, keepId, dropId);
        if (adv.currentLocationId === dropId) {
          adv.currentLocationId = keepId;
        }
      } else {
        mergeCharacters(adv.graph, keepId, dropId);
      }
    }
    adv.graph.layout = updateLayout(adv.graph);
    await saveAdventure(adv);
    this.mapRenderer?.setAdventure(adv);
    this.updateHud();
  }

  // ============================ World rules ============================

  /** Editable overlay for the global, always-in-context world rules/setting. */
  private openRulesModal(): void {
    if (!this.adventure) {
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'world-rpg-tools-overlay';
    this.modalEl.appendChild(overlay);
    overlay.innerHTML = `
      <div class="world-rpg-tools">
        <div class="world-rpg-tools-head">
          <strong>World rules &amp; opening</strong>
          <button class="world-rpg-btn" data-close>Close</button>
        </div>
        <div class="world-rpg-tools-body">
          <h3>Rules &amp; setting</h3>
          <div class="world-rpg-empty" style="margin-bottom:.5rem;">Always sent to the narrator and never contradicted. Put genre/background, magic or tech systems, tone, and play rules here.</div>
          <textarea class="world-rpg-textarea" id="world-rpg-rules-text" rows="12" placeholder="e.g. Setting: gritty cyberpunk megacity. Magic: none. Netrunning costs time and risks ICE. Tone: noir, second person. Never decide the player's actions."></textarea>
          <h3>Opening directive</h3>
          <div class="world-rpg-empty" style="margin-bottom:.5rem;">Used once, to shape the first scene. The starting situation and anything that should happen right at the start. (Editing only affects a not-yet-started adventure or a retry of the opening.)</div>
          <textarea class="world-rpg-textarea" id="world-rpg-premise-text" rows="6" placeholder="e.g. Begin with the player waking, disoriented, in the back of a moving cargo hauler; a stranger is already watching them."></textarea>
        </div>
      </div>
    `;
    const rulesArea = overlay.querySelector('#world-rpg-rules-text') as HTMLTextAreaElement;
    const premiseArea = overlay.querySelector('#world-rpg-premise-text') as HTMLTextAreaElement;
    rulesArea.value = this.adventure.graph.rules;
    premiseArea.value = this.adventure.premise;

    let timer: number | null = null;
    const scheduleSave = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        void saveAdventure(this.adventure!);
      }, 600);
    };
    rulesArea.addEventListener('input', () => {
      this.adventure!.graph.rules = rulesArea.value;
      scheduleSave();
    });
    premiseArea.addEventListener('input', () => {
      this.adventure!.premise = premiseArea.value;
      scheduleSave();
    });

    const finish = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      void saveAdventure(this.adventure!);
      overlay.remove();
    };
    (overlay.querySelector('[data-close]') as HTMLElement).addEventListener('click', finish);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        finish();
      }
    });
  }

  // ============================ Debug inspector ============================

  /** Right-click overlay showing everything stored for a single location. */
  private openNodeInspector(locationId: string): void {
    if (!this.adventure) {
      return;
    }
    const graph = this.adventure.graph;
    const loc = getLocation(graph, locationId);

    const overlay = document.createElement('div');
    overlay.className = 'world-rpg-tools-overlay';
    this.modalEl.appendChild(overlay);

    const stateRows = Object.entries(loc.state)
      .map(([k, v]) => `<div class="world-rpg-kv"><span>${escapeHtml(k)}</span><code>${escapeHtml(JSON.stringify(v))}</code></div>`)
      .join('') || '<div class="world-rpg-empty">(none)</div>';

    const connections = getNeighbors(graph, locationId)
      .map(({ edge, otherId }) => {
        const other = getLocation(graph, otherId);
        const dist = typeof edge.distance === 'number' ? `${edge.distance} m` : 'adjacent';
        const terrain = edge.terrain ? ` · ${escapeHtml(edge.terrain)}` : '';
        return `<div class="world-rpg-kv"><span>${escapeHtml(other.name)} <em>[${otherId}]</em></span><code>${dist}${terrain}</code></div>`;
      })
      .join('') || '<div class="world-rpg-empty">(none)</div>';

    const here = charactersAt(graph, locationId)
      .map(c => `<div class="world-rpg-kv"><span>${escapeHtml(c.name)}${c.isPlayer ? ' (player)' : ''} <em>[${c.id}]</em></span><code>${escapeHtml(JSON.stringify(c.state))}</code></div>`)
      .join('') || '<div class="world-rpg-empty">(none)</div>';

    const incoming = charactersIncomingTo(graph, locationId)
      .map(c => {
        const t = c.transit!;
        return `<div class="world-rpg-kv"><span>${escapeHtml(c.name)} <em>[${c.id}]</em></span><code>arrives @ ${t.arrivalClock} (from ${t.fromId})</code></div>`;
      })
      .join('') || '<div class="world-rpg-empty">(none)</div>';

    const flags = [
      `id: <code>${loc.id}</code>`,
      `visited: <code>${loc.visited}</code>`,
      `known: <code>${loc.known}</code>`,
      loc.subLocationOf ? `subLocationOf: <code>${escapeHtml(loc.subLocationOf)}</code>` : null,
      `createdTurn: <code>${loc.createdTurn}</code>`,
      `lastUsedTurn: <code>${loc.lastUsedTurn}</code>`
    ].filter((x): x is string => x !== null).join(' &nbsp;·&nbsp; ');

    overlay.innerHTML = `
      <div class="world-rpg-tools">
        <div class="world-rpg-tools-head">
          <strong>Inspect location — ${escapeHtml(loc.name)}</strong>
          <button class="world-rpg-btn" data-close>Close</button>
        </div>
        <div class="world-rpg-tools-body">
          <div class="world-rpg-inspect-flags">${flags}</div>
          <h3>Description</h3>
          <div class="world-rpg-inspect-desc">${escapeHtml(loc.description) || '<span class="world-rpg-empty">(empty)</span>'}</div>
          <h3>State</h3>
          ${stateRows}
          <h3>Connections</h3>
          ${connections}
          <h3>Characters here</h3>
          ${here}
          <h3>Arriving soon</h3>
          ${incoming}
        </div>
      </div>
    `;
    (overlay.querySelector('[data-close]') as HTMLElement).addEventListener('click', () => {
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  /** Adventure-level debug overlay: clock/turn, summary, lore, last LLM I/O. */
  private openDebugModal(): void {
    if (!this.adventure) {
      return;
    }
    const adv = this.adventure;
    const graph = adv.graph;
    const loc = getLocation(graph, adv.currentLocationId);

    const overview = [
      `clock: <code>${escapeHtml(formatClock(adv.clockMinutes, graph.clockConfig))}</code> (<code>${adv.clockMinutes}</code> min)`,
      `turn: <code>${adv.turn}</code>`,
      `current: <code>${escapeHtml(loc.name)} [${loc.id}]</code>`,
      `localityBudget: <code>${adv.localityBudget}</code>`,
      `narrator: <code>${adv.narratorPurpose}</code> · parser: <code>${adv.parserPurpose}</code>`,
      `locations: <code>${Object.keys(graph.locations).length}</code> · characters: <code>${Object.keys(graph.characters).length}</code> · edges: <code>${Object.keys(graph.edges).length}</code> · lore: <code>${Object.keys(graph.lore).length}</code>`
    ].join(' &nbsp;·&nbsp; ');

    const lore = Object.values(graph.lore);
    const loreHtml = lore.length === 0
      ? '<div class="world-rpg-empty">(none)</div>'
      : lore
        .map(l => `<details class="world-rpg-debug-block"><summary>${escapeHtml(l.title)} <em>[${l.id}]</em></summary><div class="world-rpg-kv"><span>tags</span><code>${escapeHtml(l.tags.join(', ') || '(none)')}</code></div><pre>${escapeHtml(l.content)}</pre></details>`)
        .join('');

    const debug = adv.lastDebug;
    const lastIo = debug === undefined
      ? '<div class="world-rpg-empty">No turn captured yet. Run a turn, then reopen.</div>'
      : `
        <div class="world-rpg-inspect-flags">captured on turn <code>${debug.turn}</code></div>
        ${debug.narratorMessages
          .map(m => `<details class="world-rpg-debug-block"><summary>narrator · ${escapeHtml(m.role)} (${m.content.length} chars)</summary><pre>${escapeHtml(m.content)}</pre></details>`)
          .join('')}
        <details class="world-rpg-debug-block"><summary>parser · prompt (${debug.parserPrompt.length} chars)</summary><pre>${escapeHtml(debug.parserPrompt)}</pre></details>
        <details class="world-rpg-debug-block"><summary>parser · raw response (${debug.parserRaw.length} chars)</summary><pre>${escapeHtml(debug.parserRaw)}</pre></details>
      `;

    const overlay = document.createElement('div');
    overlay.className = 'world-rpg-tools-overlay';
    this.modalEl.appendChild(overlay);
    overlay.innerHTML = `
      <div class="world-rpg-tools">
        <div class="world-rpg-tools-head">
          <strong>Debug — internal state</strong>
          <button class="world-rpg-btn" data-close>Close</button>
        </div>
        <div class="world-rpg-tools-body">
          <div class="world-rpg-inspect-flags">${overview}</div>
          <h3>Recent events summary</h3>
          <div class="world-rpg-inspect-desc">${escapeHtml(adv.recentEventsSummary) || '<span class="world-rpg-empty">(empty)</span>'}</div>
          <h3>Lore</h3>
          ${loreHtml}
          <h3>Last context window (what the models received)</h3>
          ${lastIo}
        </div>
      </div>
    `;
    (overlay.querySelector('[data-close]') as HTMLElement).addEventListener('click', () => {
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }
}

export async function openWorldRpgView(): Promise<void> {
  const view = new WorldRpgView();
  await view.open();
}
