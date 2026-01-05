import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import { StorageService } from '../../StorageService';
import { RPGLitePromptSplitService } from '../services/RPGLitePromptSplitService';
import {
  RPGLiteChatMessage,
  RPGLiteMessageGenerationMeta,
  RPGLiteModelPurpose,
  RPGLiteSession,
  RPGLiteStartPreset,
  mapCompletionMetaToGenerationMeta
} from '../types/RPGLiteTypes';

function now(): number {
  return Date.now();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function buildContextMessages(session: RPGLiteSession): OpenRouterMessage[] {
  const messages: OpenRouterMessage[] = [];
  messages.push({ role: 'system', content: session.systemPrompt });
  messages.push({
    role: 'user',
    content:
      `ADVENTURE CONTEXT (always in context, not the system prompt):\n` +
      `${session.prefixContext}`
  });

  const slice = session.conversation.slice(Math.max(0, session.conversation.length - session.maxContextMessages));
  for (const m of slice) {
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

function computeContextCharCount(session: RPGLiteSession): { promptChars: number; messageCount: number } {
  const messages = buildContextMessages(session);
  const promptForLogging = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  return { promptChars: promptForLogging.length, messageCount: messages.length };
}

function getOpeningInstruction(): string {
  return (
    `Start the roleplaying game now.\n` +
    `Write the opening scene, establish the immediate situation, and end with a clear question to the player about what they do next.`
  );
}

export class RPGLiteView {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;

  private openRouterClient: OpenRouterClient;
  private promptSplitService: RPGLitePromptSplitService;

  private currentSession: RPGLiteSession | null = null;
  private sessions: RPGLiteSession[] = [];
  private presets: RPGLiteStartPreset[] = [];

  private isStreaming = false;
  private currentStreamingOperationId: string | null = null;
  private currentStreamingAbortRequested = false;
  private streamingMessageId: string | null = null;
  private editingPresetId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.openRouterClient = OpenRouterClient.getInstance();
    this.promptSplitService = new RPGLitePromptSplitService(this.openRouterClient);
  }

  private abortStreamingIfActive(): void {
    if (!this.isStreaming) return;
    if (!this.currentStreamingOperationId) throw new Error('Streaming is active but no operation id is set.');

    this.currentStreamingAbortRequested = true;
    this.openRouterClient.abortOperation(this.currentStreamingOperationId);
    this.currentStreamingOperationId = null;
    this.streamingMessageId = null;
    this.isStreaming = false;

    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    sendBtn.disabled = false;
  }

  async open(): Promise<void> {
    await this.loadAll();
    this.renderSelector();
  }

  private async loadAll(): Promise<void> {
    const storage = await StorageService.getInstance();
    this.sessions = await storage.listRPGLiteSessions<RPGLiteSession>();
    this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    this.presets = await storage.listRPGLiteStartPresets<RPGLiteStartPreset>();
    this.presets.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private makeUniqueSessionTitle(baseTitle: string): string {
    const existingTitles = new Set(this.sessions.map(s => s.title));
    
    if (!existingTitles.has(baseTitle)) {
      return baseTitle;
    }
    
    let counter = 2;
    let newTitle = `${baseTitle} ${counter}`;
    
    while (existingTitles.has(newTitle)) {
      counter++;
      newTitle = `${baseTitle} ${counter}`;
    }
    
    return newTitle;
  }

  private ensureModal(): void {
    let modal = document.getElementById('rpg-lite-view-container');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rpg-lite-view-container';
      modal.className = 'rpg-lite-modal';
      document.body.appendChild(modal);
    }
    this.modalEl = modal;
    this.modalEl.innerHTML = `<div class="rpg-lite-container"><div id="rpg-lite-root" class="rpg-lite-panel"></div></div>`;
    this.container = this.modalEl.querySelector('#rpg-lite-root') as HTMLElement;
  }

  private renderSelector(): void {
    this.ensureModal();
    this.currentSession = null;

    this.container.innerHTML = `
      <div class="rpg-lite-topbar">
        <div class="rpg-lite-topbar-left">
          <div class="rpg-lite-title">RPG Lite</div>
        </div>
        <div class="rpg-lite-topbar-right">
          <button id="rpg-lite-close" class="rpg-lite-btn">Close</button>
        </div>
      </div>
      <div class="rpg-lite-body">
        <div class="rpg-lite-sidebar">
          <div class="rpg-lite-section-title">Active Sessions</div>
          <div class="rpg-lite-list" id="rpg-lite-session-list"></div>
          <button id="rpg-lite-new-session-scratch" class="rpg-lite-btn rpg-lite-btn-primary" style="width: 100%;">+ New Session from Scratch</button>
          
          <div style="text-align: center; opacity: 0.5; font-size: 0.85rem; margin: 1.25rem 0 0.75rem;">or start from template</div>
          
          <div class="rpg-lite-section-title">Saved Templates</div>
          <div class="rpg-lite-list" id="rpg-lite-preset-list"></div>
          <button id="rpg-lite-new-template" class="rpg-lite-btn" style="width: 100%;">+ New Template</button>
        </div>
        <div class="rpg-lite-main">
          ${this.editingPresetId ? this.renderPresetEditorHtml(this.editingPresetId) : `
            <div class="rpg-lite-messages">
              <div class="rpg-lite-message">
                <div class="rpg-lite-message-content">
                  Create a new session from scratch, or start from a saved template.
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    (this.container.querySelector('#rpg-lite-close') as HTMLButtonElement).addEventListener('click', () => {
      this.modalEl?.remove();
      this.modalEl = null;
    });

    const newScratchBtn = this.container.querySelector('#rpg-lite-new-session-scratch') as HTMLButtonElement;
    newScratchBtn.addEventListener('click', () => {
      void this.renderNewSessionDialog(false);
    });

    const newTemplateBtn = this.container.querySelector('#rpg-lite-new-template') as HTMLButtonElement;
    newTemplateBtn.addEventListener('click', () => {
      void this.renderNewSessionDialog(true);
    });

    this.renderSessionList();
    this.renderPresetList();
    this.bindPresetEditorEvents();
  }

  private renderSessionList(): void {
    const list = this.container.querySelector('#rpg-lite-session-list') as HTMLElement | null;
    if (!list) return;

    if (this.sessions.length === 0) {
      list.innerHTML = `
        <div class="rpg-lite-empty-state">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📖</div>
          <div style="font-weight: 600;">No sessions yet</div>
          <div style="opacity: 0.7; font-size: 0.9rem;">Create your first adventure!</div>
        </div>
      `;
      return;
    }

    const currentId = this.currentSession?.id;

    list.innerHTML = this.sessions
      .map(
        (s) => {
          const isActive = s.id === currentId;
          return `
        <div class="rpg-lite-list-item ${isActive ? 'rpg-lite-list-item-active' : ''}" data-session-id="${s.id}" style="cursor: pointer;">
          <div style="min-width:0; flex: 1;">
            <div class="rpg-lite-list-item-title">${isActive ? '▶ ' : ''}${s.title}</div>
            <div style="opacity:.8; font-size:.85rem;">${formatDateTime(s.updatedAt)} · ${s.conversation.length} msgs</div>
          </div>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            <button class="rpg-lite-btn rpg-lite-btn-primary rpg-lite-btn-sm" data-continue-session-id="${s.id}" title="Continue">Continue</button>
            <button class="rpg-lite-btn rpg-lite-btn-icon" data-delete-session-id="${s.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `;
        }
      )
      .join('');

    list.querySelectorAll('[data-continue-session-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['continueSessionId'];
        if (!id) throw new Error('Continue session button is missing data-continue-session-id.');
        void this.openSession(id);
      });
    });

    list.querySelectorAll('[data-delete-session-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['deleteSessionId'];
        if (!id) throw new Error('Delete session button is missing data-delete-session-id.');
        void this.deleteSession(id);
      });
    });
  }

  private renderPresetList(): void {
    const list = this.container.querySelector('#rpg-lite-preset-list') as HTMLElement | null;
    if (!list) return;

    if (this.presets.length === 0) {
      list.innerHTML = `
        <div class="rpg-lite-empty-state">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🎭</div>
          <div style="font-weight: 600;">No templates yet</div>
          <div style="opacity: 0.7; font-size: 0.9rem;">Create reusable templates below</div>
        </div>
      `;
      return;
    }

    list.innerHTML = this.presets
      .map(
        (p) => `
        <div class="rpg-lite-list-item" data-preset-id="${p.id}" style="cursor: pointer;">
          <div style="min-width:0; flex: 1;">
            <div class="rpg-lite-list-item-title">${p.name}</div>
            <div style="opacity:.8; font-size:.85rem;">${p.title}</div>
          </div>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            <button class="rpg-lite-btn rpg-lite-btn-primary rpg-lite-btn-sm" data-start-preset-id="${p.id}" title="Start">Start</button>
            <button class="rpg-lite-btn rpg-lite-btn-icon" data-edit-preset-id="${p.id}" title="Edit">⚙️</button>
            <button class="rpg-lite-btn rpg-lite-btn-icon" data-delete-preset-id="${p.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `
      )
      .join('');

    list.querySelectorAll('[data-start-preset-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['startPresetId'];
        if (!id) throw new Error('Start preset button is missing data-start-preset-id.');
        void this.restartFromPreset(id).catch((e: unknown) => {
          console.error('RPG Lite restart failed:', e);
          const msg = e instanceof Error ? e.message : String(e);
          alert(`Restart failed: ${msg}`);
        });
      });
    });

    list.querySelectorAll('[data-edit-preset-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['editPresetId'];
        if (!id) throw new Error('Edit preset button is missing data-edit-preset-id.');
        this.editingPresetId = id;
        this.renderSelector();
      });
    });

    list.querySelectorAll('[data-delete-preset-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['deletePresetId'];
        if (!id) throw new Error('Delete preset button is missing data-delete-preset-id.');
        void this.deletePreset(id);
      });
    });
  }

  private async deleteSession(sessionId: string): Promise<void> {
    const ok = confirm('Delete this session? This cannot be undone.');
    if (!ok) return;
    const storage = await StorageService.getInstance();
    await storage.deleteRPGLiteSession(sessionId);
    await this.loadAll();
    this.renderSelector();
  }

  private async deletePreset(presetId: string): Promise<void> {
    const ok = confirm('Delete this start preset? This cannot be undone.');
    if (!ok) return;
    const storage = await StorageService.getInstance();
    await storage.deleteRPGLiteStartPreset(presetId);
    await this.loadAll();
    if (this.editingPresetId === presetId) {
      this.editingPresetId = null;
    }
    this.renderSelector();
  }

  private renderPresetEditorHtml(presetId: string): string {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return '';

    const purposes: Array<{ key: RPGLiteModelPurpose; label: string }> = [
      { key: 'prose', label: 'Prose' },
      { key: 'creator', label: 'Creator' },
      { key: 'editor', label: 'Editor' },
      { key: 'rater', label: 'Rater' }
    ];

    return `
      <div class="rpg-lite-message">
        <div class="rpg-lite-message-header">
          <div class="rpg-lite-message-role">Preset Editor</div>
          <div class="rpg-lite-message-actions">
            <button id="rpg-lite-preset-editor-cancel" class="rpg-lite-btn">Close</button>
            <button id="rpg-lite-preset-editor-save" class="rpg-lite-btn rpg-lite-btn-primary">Save</button>
          </div>
        </div>

        <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          <label style="display:flex; flex-direction:column; gap:0.35rem; flex: 1; min-width: 16rem;">
            <span class="rpg-lite-section-title">Name</span>
            <input id="rpg-lite-preset-editor-name" class="rpg-lite-input" value="${preset.name.replaceAll('"', '&quot;')}" />
          </label>
          <label style="display:flex; flex-direction:column; gap:0.35rem; flex: 1; min-width: 16rem;">
            <span class="rpg-lite-section-title">Title</span>
            <input id="rpg-lite-preset-editor-title" class="rpg-lite-input" value="${preset.title.replaceAll('"', '&quot;')}" />
          </label>
          <label style="display:flex; flex-direction:column; gap:0.35rem; min-width: 12rem;">
            <span class="rpg-lite-section-title">Narrator</span>
            <select id="rpg-lite-preset-editor-purpose" class="rpg-lite-select">
              ${purposes.map(p => `<option value="${p.key}" ${p.key === preset.narratorPurpose ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
          </label>
          <label style="display:flex; flex-direction:column; gap:0.35rem; min-width: 12rem;">
            <span class="rpg-lite-section-title">Max msgs</span>
            <input id="rpg-lite-preset-editor-max-context" class="rpg-lite-input" type="number" min="2" step="1" value="${String(preset.maxContextMessages)}" />
          </label>
        </div>

        <label style="display:flex; flex-direction:column; gap:0.35rem;">
          <span class="rpg-lite-section-title">System Prompt</span>
          <textarea id="rpg-lite-preset-editor-system" class="rpg-lite-textarea">${preset.systemPrompt}</textarea>
        </label>

        <label style="display:flex; flex-direction:column; gap:0.35rem;">
          <span class="rpg-lite-section-title">Prefix Context</span>
          <textarea id="rpg-lite-preset-editor-prefix" class="rpg-lite-textarea">${preset.prefixContext}</textarea>
        </label>

        <div class="rpg-lite-message-info">
          <span>Preset id: ${preset.id}</span>
          <span>Updated: ${formatDateTime(preset.updatedAt)}</span>
        </div>
      </div>
    `;
  }

  private bindPresetEditorEvents(): void {
    if (!this.editingPresetId) return;
    const preset = this.presets.find((p) => p.id === this.editingPresetId);
    if (!preset) return;

    const cancelBtn = this.container.querySelector('#rpg-lite-preset-editor-cancel') as HTMLButtonElement | null;
    const saveBtn = this.container.querySelector('#rpg-lite-preset-editor-save') as HTMLButtonElement | null;
    if (!cancelBtn || !saveBtn) return;

    cancelBtn.addEventListener('click', () => {
      this.editingPresetId = null;
      this.renderSelector();
    });

    saveBtn.addEventListener('click', () => {
      void this.saveEditedPreset(preset.id);
    });
  }

  private async saveEditedPreset(presetId: string): Promise<void> {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) throw new Error(`Start preset not found: ${presetId}`);

    const nameEl = this.container.querySelector('#rpg-lite-preset-editor-name') as HTMLInputElement;
    const titleEl = this.container.querySelector('#rpg-lite-preset-editor-title') as HTMLInputElement;
    const purposeEl = this.container.querySelector('#rpg-lite-preset-editor-purpose') as HTMLSelectElement;
    const maxEl = this.container.querySelector('#rpg-lite-preset-editor-max-context') as HTMLInputElement;
    const systemEl = this.container.querySelector('#rpg-lite-preset-editor-system') as HTMLTextAreaElement;
    const prefixEl = this.container.querySelector('#rpg-lite-preset-editor-prefix') as HTMLTextAreaElement;

    const name = nameEl.value.trim();
    const title = titleEl.value.trim();
    if (name.length === 0) throw new Error('Preset name must not be empty.');
    if (title.length === 0) throw new Error('Preset title must not be empty.');

    preset.name = name;
    preset.title = title;
    preset.narratorPurpose = purposeEl.value as RPGLiteModelPurpose;
    preset.maxContextMessages = Math.max(2, Math.floor(Number(maxEl.value)));
    preset.systemPrompt = systemEl.value;
    preset.prefixContext = prefixEl.value;
    preset.updatedAt = now();

    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteStartPreset(preset);

    await this.loadAll();
    this.editingPresetId = presetId;
    this.renderSelector();
  }

  private async openSession(sessionId: string): Promise<void> {
    const storage = await StorageService.getInstance();
    const session = await storage.loadRPGLiteSession<RPGLiteSession>(sessionId);
    if (!session) {
      throw new Error(`RPG Lite session not found: ${sessionId}`);
    }
    this.currentSession = session;
    await this.loadAll();
    this.renderSession();
    if (this.currentSession.conversation.length === 0) {
      await this.generateOpeningMessage();
    }
  }

  private async restartFromPreset(presetId: string): Promise<void> {
    this.abortStreamingIfActive();
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) throw new Error(`Start preset not found: ${presetId}`);

    const session: RPGLiteSession = {
      id: newId('rpg_lite_session'),
      title: this.makeUniqueSessionTitle(preset.name),
      createdAt: now(),
      updatedAt: now(),
      systemPrompt: preset.systemPrompt,
      prefixContext: preset.prefixContext,
      narratorPurpose: preset.narratorPurpose,
      maxContextMessages: preset.maxContextMessages,
      conversation: []
    };
    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteSession(session);
    await this.loadAll();
    this.currentSession = session;
    this.renderSession();
    this.isStreaming = false;
    await this.generateOpeningMessage();
  }

  private async renderNewSessionDialog(isTemplate: boolean): Promise<void> {
    this.ensureModal();
    this.currentSession = null;

    const title = isTemplate ? 'New Template' : 'New Session from Scratch';
    const buttonText = isTemplate ? 'Create Template' : 'Analyze & Start';

    this.container.innerHTML = `
      <div class="rpg-lite-topbar">
        <div class="rpg-lite-topbar-left">
          <div class="rpg-lite-title">${title}</div>
        </div>
        <div class="rpg-lite-topbar-right">
          <button id="rpg-lite-back" class="rpg-lite-btn">Back</button>
        </div>
      </div>
      <div class="rpg-lite-body">
        <div class="rpg-lite-main" style="max-width: 48rem; margin: 0 auto;">
          <div class="rpg-lite-editors">
            <div class="rpg-lite-editor">
              <div class="rpg-lite-section-title">Adventure Prompt</div>
              <textarea id="rpg-lite-adventure-prompt" class="rpg-lite-textarea" placeholder="Describe your adventure, rules, and narrative style..."></textarea>
              <div style="display:flex; gap:.75rem; align-items:center; flex-wrap:wrap;">
                <label style="display:flex; gap:.5rem; align-items:center;">
                  <span style="opacity:.85;">Narrator</span>
                  <select id="rpg-lite-narrator-purpose" class="rpg-lite-select">
                    <option value="prose">Prose</option>
                    <option value="creator">Creator</option>
                    <option value="editor">Editor</option>
                    <option value="rater">Rater</option>
                  </select>
                </label>
                <label style="display:flex; gap:.5rem; align-items:center;">
                  <span style="opacity:.85;">Context msgs</span>
                  <input id="rpg-lite-max-context" class="rpg-lite-input" type="number" min="2" step="1" value="10000" style="max-width: 8rem;" />
                </label>
                <button id="rpg-lite-analyze" class="rpg-lite-btn rpg-lite-btn-primary">${buttonText}</button>
                <span id="rpg-lite-status" style="opacity:.85;"></span>
              </div>
            </div>
          </div>
          <div class="rpg-lite-messages">
            <div class="rpg-lite-message">
              <div class="rpg-lite-message-content">
                The prompt will be split into:
                - a <b>system prompt</b> (rules/style that must always apply)
                - a <b>prefix context</b> (setup info always placed at the top of the context window)
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    (this.container.querySelector('#rpg-lite-back') as HTMLButtonElement).addEventListener('click', () => {
      this.renderSelector();
    });

    (this.container.querySelector('#rpg-lite-analyze') as HTMLButtonElement).addEventListener('click', () => {
      void this.createSessionFromPrompt(isTemplate);
    });
  }

  private async createSessionFromPrompt(isTemplate: boolean): Promise<void> {
    const promptEl = this.container.querySelector('#rpg-lite-adventure-prompt') as HTMLTextAreaElement;
    const purposeEl = this.container.querySelector('#rpg-lite-narrator-purpose') as HTMLSelectElement;
    const maxContextEl = this.container.querySelector('#rpg-lite-max-context') as HTMLInputElement;
    const statusEl = this.container.querySelector('#rpg-lite-status') as HTMLElement;
    const btn = this.container.querySelector('#rpg-lite-analyze') as HTMLButtonElement;

    const adventurePrompt = promptEl.value.trim();
    if (adventurePrompt.length === 0) {
      alert('Please enter an adventure prompt.');
      return;
    }

    const maxContext = Math.max(2, Math.floor(Number(maxContextEl.value)));
    const narratorPurpose = purposeEl.value as RPGLiteModelPurpose;

    btn.disabled = true;
    statusEl.textContent = 'Analyzing prompt...';

    const split = await this.promptSplitService.splitAdventurePrompt(adventurePrompt);

    if (isTemplate) {
      const templateName = prompt('Name this template:', split.title);
      if (!templateName || templateName.trim().length === 0) {
        btn.disabled = false;
        statusEl.textContent = '';
        return;
      }

      const preset: RPGLiteStartPreset = {
        id: newId('rpg_lite_preset'),
        name: templateName.trim(),
        title: split.title,
        createdAt: now(),
        updatedAt: now(),
        systemPrompt: split.systemPrompt,
        prefixContext: split.prefixContext,
        narratorPurpose,
        maxContextMessages: maxContext
      };

      const storage = await StorageService.getInstance();
      await storage.saveRPGLiteStartPreset(preset);
      await this.loadAll();
      this.renderSelector();
    } else {
      const session: RPGLiteSession = {
        id: newId('rpg_lite_session'),
        title: this.makeUniqueSessionTitle(split.title),
        createdAt: now(),
        updatedAt: now(),
        systemPrompt: split.systemPrompt,
        prefixContext: split.prefixContext,
        narratorPurpose,
        maxContextMessages: maxContext,
        conversation: []
      };

      const storage = await StorageService.getInstance();
      await storage.saveRPGLiteSession(session);
      await this.loadAll();
      this.currentSession = session;
      this.renderSession();
      this.isStreaming = false;
      await this.generateOpeningMessage();
    }
  }

  private renderSession(): void {
    if (!this.currentSession) throw new Error('No current session.');
    const session = this.currentSession;

    this.ensureModal();
    this.container.innerHTML = `
      <div class="rpg-lite-topbar">
        <div class="rpg-lite-topbar-left">
          <button id="rpg-lite-home" class="rpg-lite-btn">Home</button>
          <div class="rpg-lite-title" id="rpg-lite-title-display" style="cursor: pointer;" title="Click to rename">${session.title}</div>
        </div>
        <div class="rpg-lite-topbar-right">
          <div id="rpg-lite-context-stats-topbar" class="rpg-lite-context-stats"></div>
          <label style="display:flex; align-items:center; gap:.5rem;">
            <span style="opacity:.85;">Narrator</span>
            <select id="rpg-lite-purpose" class="rpg-lite-select">
              <option value="prose">Prose</option>
              <option value="creator">Creator</option>
              <option value="editor">Editor</option>
              <option value="rater">Rater</option>
            </select>
          </label>
          <label style="display:flex; align-items:center; gap:.5rem;">
            <span style="opacity:.85;">Max msgs</span>
            <input id="rpg-lite-max-context-session" class="rpg-lite-input" type="number" min="2" step="1" value="${String(session.maxContextMessages)}" style="max-width: 8rem;" />
          </label>
          <button id="rpg-lite-save-session" class="rpg-lite-btn">Save Session</button>
          <button id="rpg-lite-close" class="rpg-lite-btn">Close</button>
        </div>
      </div>
      <div class="rpg-lite-body">
        <div class="rpg-lite-sidebar">
          <div class="rpg-lite-section-title">Active Sessions</div>
          <div class="rpg-lite-list" id="rpg-lite-session-list"></div>
          
          <div style="text-align: center; opacity: 0.5; font-size: 0.85rem; margin: 0.75rem 0;">or restart from template</div>
          
          <div class="rpg-lite-section-title">Templates</div>
          <div class="rpg-lite-list" id="rpg-lite-preset-list-session"></div>
        </div>
        <div class="rpg-lite-main">
          <div class="rpg-lite-editors" id="rpg-lite-editors-panel">
            <div class="rpg-lite-editors-header">
              <button id="rpg-lite-toggle-editors" class="rpg-lite-btn rpg-lite-btn-sm" title="Toggle settings">
                <span id="rpg-lite-editors-toggle-icon">▼</span> Settings
              </button>
            </div>
            <div id="rpg-lite-editors-content" class="rpg-lite-editors-content" style="display: none;">
              <div class="rpg-lite-editor">
                <div class="rpg-lite-section-title">System Prompt</div>
                <textarea id="rpg-lite-system" class="rpg-lite-textarea"></textarea>
              </div>
              <div class="rpg-lite-editor">
                <div class="rpg-lite-section-title">Prefix Context</div>
                <textarea id="rpg-lite-prefix" class="rpg-lite-textarea"></textarea>
              </div>
            </div>
          </div>
          <div id="rpg-lite-messages" class="rpg-lite-messages"></div>
          <div class="rpg-lite-composer">
            <textarea id="rpg-lite-input" class="rpg-lite-textarea" placeholder="Your message..."></textarea>
            <button id="rpg-lite-send" class="rpg-lite-btn rpg-lite-btn-primary">Send</button>
          </div>
        </div>
      </div>
    `;

    (this.container.querySelector('#rpg-lite-close') as HTMLButtonElement).addEventListener('click', () => {
      this.modalEl?.remove();
      this.modalEl = null;
    });

    (this.container.querySelector('#rpg-lite-home') as HTMLButtonElement).addEventListener('click', () => {
      void this.loadAll().then(() => this.renderSelector());
    });

    (this.container.querySelector('#rpg-lite-title-display') as HTMLElement).addEventListener('click', () => {
      void this.editSessionTitle();
    });

    const purposeSelect = this.container.querySelector('#rpg-lite-purpose') as HTMLSelectElement;
    purposeSelect.value = session.narratorPurpose;
    purposeSelect.addEventListener('change', () => {
      session.narratorPurpose = purposeSelect.value as RPGLiteModelPurpose;
      void this.saveSession();
    });

    const maxContextEl = this.container.querySelector('#rpg-lite-max-context-session') as HTMLInputElement;
    maxContextEl.value = String(session.maxContextMessages);
    maxContextEl.addEventListener('input', () => {
      const normalized = Math.max(2, Math.floor(Number(maxContextEl.value)));
      session.maxContextMessages = normalized;
      void this.saveSession().then(() => this.updateContextStats());
    });

    (this.container.querySelector('#rpg-lite-save-session') as HTMLButtonElement).addEventListener('click', () => {
      void this.saveCurrentAsSessionCopy();
    });

    const toggleEditorsBtn = this.container.querySelector('#rpg-lite-toggle-editors') as HTMLButtonElement;
    const editorsContent = this.container.querySelector('#rpg-lite-editors-content') as HTMLElement;
    const toggleIcon = this.container.querySelector('#rpg-lite-editors-toggle-icon') as HTMLElement;
    toggleEditorsBtn.addEventListener('click', () => {
      const isHidden = editorsContent.style.display === 'none';
      editorsContent.style.display = isHidden ? 'flex' : 'none';
      toggleIcon.textContent = isHidden ? '▲' : '▼';
    });

    const systemEl = this.container.querySelector('#rpg-lite-system') as HTMLTextAreaElement;
    systemEl.value = session.systemPrompt;
    systemEl.addEventListener('input', () => {
      session.systemPrompt = systemEl.value;
      void this.saveSession().then(() => this.updateContextStats());
    });

    const prefixEl = this.container.querySelector('#rpg-lite-prefix') as HTMLTextAreaElement;
    prefixEl.value = session.prefixContext;
    prefixEl.addEventListener('input', () => {
      session.prefixContext = prefixEl.value;
      void this.saveSession().then(() => this.updateContextStats());
    });

    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;

    sendBtn.addEventListener('click', () => {
      void this.sendNewUserMessage();
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendNewUserMessage();
      }
    });

    this.renderSessionList();
    this.renderPresetListInSession();
    this.renderConversation();
    this.updateContextStats();

    inputEl.focus();
  }

  private renderPresetListInSession(): void {
    const list = this.container.querySelector('#rpg-lite-preset-list-session') as HTMLElement | null;
    if (!list) return;

    if (this.presets.length === 0) {
      list.innerHTML = '<div style="opacity: 0.6; padding: 0.5rem; text-align: center; font-size: 0.85rem;">No templates</div>';
      return;
    }

    list.innerHTML = this.presets
      .map(
        (p) => `
        <div class="rpg-lite-list-item-compact" data-start-preset-id="${p.id}" style="cursor: pointer;">
          <div style="min-width:0; flex: 1;">
            <div class="rpg-lite-list-item-title">${p.name}</div>
          </div>
        </div>
      `
      )
      .join('');

    list.querySelectorAll('[data-start-preset-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const item = ev.currentTarget as HTMLElement;
        const id = item.dataset['startPresetId'];
        if (!id) throw new Error('Start preset item is missing data-start-preset-id.');
        void this.restartFromPreset(id).catch((e: unknown) => {
          console.error('RPG Lite restart failed:', e);
          const msg = e instanceof Error ? e.message : String(e);
          alert(`Restart failed: ${msg}`);
        });
      });
    });
  }

  private updateContextStats(): void {
    if (!this.currentSession) throw new Error('No current session.');
    const statsEl = this.container.querySelector('#rpg-lite-context-stats-topbar') as HTMLElement | null;
    if (!statsEl) return;

    const { promptChars, messageCount } = computeContextCharCount(this.currentSession);
    statsEl.textContent = `📊 ${promptChars.toLocaleString()} chars · ${messageCount} msgs`;
  }

  private async saveCurrentAsSessionCopy(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    this.abortStreamingIfActive();

    const suggested = this.makeUniqueSessionTitle(`${this.currentSession.title} (copy)`);
    const title = prompt('New session name (branch):', suggested);
    if (!title || title.trim().length === 0) return;

    const base = this.currentSession;
    const clonedConversation: RPGLiteChatMessage[] = base.conversation.map((m) => ({
      id: newId('rpg_lite_msg'),
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      ...(typeof m.editedAt === 'number' ? { editedAt: m.editedAt } : {}),
      ...(m.generation ? { generation: { ...m.generation } } : {})
    }));

    const finalTitle = this.makeUniqueSessionTitle(title.trim());

    const newSession: RPGLiteSession = {
      id: newId('rpg_lite_session'),
      title: finalTitle,
      createdAt: now(),
      updatedAt: now(),
      systemPrompt: base.systemPrompt,
      prefixContext: base.prefixContext,
      narratorPurpose: base.narratorPurpose,
      maxContextMessages: base.maxContextMessages,
      conversation: clonedConversation
    };

    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteSession(newSession);

    await this.loadAll();
    this.currentSession = newSession;
    this.renderSession();
  }

  private async saveSession(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    this.currentSession.updatedAt = now();
    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteSession(this.currentSession);
  }

  private async editSessionTitle(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    
    const newTitle = prompt('Rename session:', this.currentSession.title);
    
    if (newTitle === null || newTitle.trim().length === 0) {
      return;
    }
    
    const trimmedTitle = newTitle.trim();
    
    // Check if title is already in use by a different session
    const existingSession = this.sessions.find(s => s.id !== this.currentSession!.id && s.title === trimmedTitle);
    
    if (existingSession) {
      alert(`A session with the name "${trimmedTitle}" already exists. Please choose a different name.`);
      return;
    }
    
    this.currentSession.title = trimmedTitle;
    await this.saveSession();
    await this.loadAll();
    this.renderSession();
  }

  private renderConversation(): void {
    if (!this.currentSession) throw new Error('No current session.');
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    messagesEl.innerHTML = '';

    for (const msg of this.currentSession.conversation) {
      messagesEl.appendChild(this.renderMessage(msg));
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    this.updateContextStats();
  }

  private wrapTextForFadeIn(content: string): string {
    const escapeChar = (ch: string): string => {
      if (ch === '&') return '&amp;';
      if (ch === '<') return '&lt;';
      if (ch === '>') return '&gt;';
      if (ch === '"') return '&quot;';
      if (ch === "'") return '&#039;';
      return ch;
    };

    const chars = content.split('');

    // Wrap each character in a span with animation delay
    // Limit to reasonable number to avoid performance issues
    const maxAnimatedChars = 1000;
    const animationDelay = 0.015; // 15ms per character
    
    return chars.map((char, index) => {
      if (index < maxAnimatedChars) {
        const delay = index * animationDelay;
        return `<span class="rpg-lite-char-fadein" style="animation-delay: ${delay}s">${escapeChar(char)}</span>`;
      }
      return escapeChar(char);
    }).join('');
  }

  private highlightContent(content: string): string {
    // Escape HTML to prevent injection
    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    let result = escapeHtml(content);

    // Highlight complete XML elements: <tag>content</tag> or <tag attr="value">content</tag>
    // Match opening tag, content, and closing tag as a unit
    result = result.replace(
      /(&lt;([A-Za-z_][\w:\-\.]*)(?:\s+[^&]*?)?&gt;)([\s\S]*?)(&lt;\/\2&gt;)/g,
      '<span class="rpg-lite-highlight-xml">$1$3$4</span>'
    );

    // Highlight self-closing XML tags: <tag />
    result = result.replace(
      /(&lt;[A-Za-z_][\w:\-\.]*(?:\s+[^&]*?)?\/&gt;)/g,
      '<span class="rpg-lite-highlight-xml">$1</span>'
    );

    // Highlight JSON blocks (complete objects/arrays with content)
    result = result.replace(
      /(\{[\s\S]*?\}|\[[\s\S]*?\])/g,
      (match) => {
        // Only highlight if it looks like JSON (contains quotes/colons, reasonable structure)
        if ((match.includes('&quot;') || match.includes(':')) && match.length > 10) {
          return `<span class="rpg-lite-highlight-json">${match}</span>`;
        }
        return match;
      }
    );

    // Highlight direct speech (quoted text)
    // Match "text" or "text," or "text." etc.
    result = result.replace(
      /(&quot;[\s\S]*?&quot;[,.\?!]?)/g,
      '<span class="rpg-lite-highlight-speech">$1</span>'
    );

    // Highlight actions/narration in asterisks *text*
    result = result.replace(
      /(\*[^*]+\*)/g,
      '<span class="rpg-lite-highlight-action">$1</span>'
    );

    // Highlight dice rolls (e.g., d20, 2d6, 1d100)
    result = result.replace(
      /(\b\d*d\d+(?:[+-]\d+)?\b)/gi,
      '<span class="rpg-lite-highlight-dice">$1</span>'
    );

    // Highlight emphasis markers (bold **text** or italic *text* when not already caught)
    result = result.replace(
      /(\*\*[^*]+\*\*)/g,
      '<span class="rpg-lite-highlight-emphasis">$1</span>'
    );

    // Highlight thought text (text in parentheses or em-dashes)
    result = result.replace(
      /(\([^)]+\))/g,
      '<span class="rpg-lite-highlight-thought">$1</span>'
    );

    // Also catch em-dash thoughts: —thought—
    result = result.replace(
      /(—[^—]+—)/g,
      '<span class="rpg-lite-highlight-thought">$1</span>'
    );

    return result;
  }

  private renderMessage(msg: RPGLiteChatMessage): HTMLElement {
    const el = document.createElement('div');
    el.className = `rpg-lite-message ${msg.role}`;
    el.dataset['messageId'] = msg.id;

    const roleLabel = msg.role === 'user' ? 'You' : 'GM';

    const infoParts: string[] = [];
    infoParts.push(`🕐 ${formatDateTime(msg.editedAt ?? msg.createdAt)}`);
    
    const charCount = msg.content.length;
    const charDisplay = charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k` : String(charCount);
    infoParts.push(`📝 ${charDisplay}`);

    if (msg.generation) {
      const g = msg.generation;
      if (g.usage) {
        infoParts.push(`🔤 ${g.usage.prompt_tokens}→${g.usage.completion_tokens}`);
      }
      if (typeof g.totalCostUsd === 'number') {
        infoParts.push(`💰 ${formatUsd(g.totalCostUsd)}`);
      }
      const durationSec = g.durationMs / 1000;
      const durationDisplay = durationSec >= 1 ? `${durationSec.toFixed(1)}s` : `${Math.round(g.durationMs)}ms`;
      infoParts.push(`⏱️ ${durationDisplay}`);
    }
    if (msg.editedAt) {
      infoParts.push('✏️ edited');
    }

    el.innerHTML = `
      <div class="rpg-lite-message-header">
        <div class="rpg-lite-message-role">${roleLabel}</div>
        <div class="rpg-lite-message-actions">
          <button class="rpg-lite-btn rpg-lite-btn-sm" data-action="edit">Edit</button>
          ${msg.role === 'assistant' ? `<button class="rpg-lite-btn rpg-lite-btn-sm" data-action="retry">Retry</button>` : ''}
        </div>
      </div>
      <div class="rpg-lite-message-content" data-role="content"></div>
      <div class="rpg-lite-message-info">${infoParts.map(p => `<span>${p}</span>`).join('')}</div>
    `;

    const contentEl = el.querySelector('[data-role="content"]') as HTMLElement;
    
    // Apply syntax highlighting for assistant messages (but not during streaming)
    if (msg.role === 'assistant' && msg.id !== this.streamingMessageId) {
      contentEl.innerHTML = this.highlightContent(msg.content);
    } else {
      contentEl.textContent = msg.content;
    }

    (el.querySelector('[data-action="edit"]') as HTMLButtonElement).addEventListener('click', () => {
      this.startEditMessage(msg.id);
    });
    const retryBtn = el.querySelector('[data-action="retry"]') as HTMLButtonElement | null;
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        void this.retryFromAssistant(msg.id);
      });
    }

    return el;
  }

  private startEditMessage(messageId: string): void {
    if (!this.currentSession) throw new Error('No current session.');
    const msg = this.currentSession.conversation.find((m) => m.id === messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);

    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    const msgEl = messagesEl.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;

    const textarea = document.createElement('textarea');
    textarea.className = 'rpg-lite-textarea';
    textarea.value = msg.content;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '0.75rem';
    controls.style.flexWrap = 'wrap';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'rpg-lite-btn rpg-lite-btn-primary';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'rpg-lite-btn';
    cancelBtn.textContent = 'Cancel';

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);

    contentEl.replaceWith(textarea);
    textarea.insertAdjacentElement('afterend', controls);
    textarea.focus();

    cancelBtn.addEventListener('click', () => {
      this.renderConversation();
    });

    saveBtn.addEventListener('click', () => {
      msg.content = textarea.value;
      msg.editedAt = now();
      void this.saveSession().then(() => this.renderConversation());
    });
  }

  private async sendNewUserMessage(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
    const text = inputEl.value.trim();
    if (text.length === 0) return;
    inputEl.value = '';

    const userMsg: RPGLiteChatMessage = {
      id: newId('rpg_lite_msg'),
      role: 'user',
      content: text,
      createdAt: now()
    };
    this.currentSession.conversation.push(userMsg);
    await this.saveSession();
    this.renderConversation();

    await this.generateAssistantReply();
  }

  private async retryFromAssistant(assistantMessageId: string): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    this.abortStreamingIfActive();

    const idx = this.currentSession.conversation.findIndex((m) => m.id === assistantMessageId);
    if (idx === -1) throw new Error(`Message not found: ${assistantMessageId}`);
    const assistantMsg = this.currentSession.conversation[idx];
    if (!assistantMsg) throw new Error(`Message not found: ${assistantMessageId}`);
    if (assistantMsg.role !== 'assistant') {
      throw new Error('Retry is only available for assistant messages.');
    }

    let userIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      const m = this.currentSession.conversation[i];
      if (!m) throw new Error('Unexpected missing message while searching for preceding user message.');
      if (m.role === 'user') {
        userIdx = i;
        break;
      }
    }
    if (userIdx === -1) {
      // Opening message retry: no preceding user message exists.
      this.currentSession.conversation = [];
      await this.saveSession();
      this.renderConversation();
      await this.generateOpeningMessage();
      return;
    }

    this.currentSession.conversation = this.currentSession.conversation.slice(0, userIdx + 1);
    await this.saveSession();
    this.renderConversation();

    await this.generateAssistantReply();
  }

  private async generateOpeningMessage(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const session = this.currentSession;
    const assistantMsg: RPGLiteChatMessage = {
      id: newId('rpg_lite_msg'),
      role: 'assistant',
      content: '',
      createdAt: now()
    };
    session.conversation.push(assistantMsg);
    await this.saveSession();
    this.renderConversation();

    this.isStreaming = true;
    this.streamingMessageId = assistantMsg.id;
    this.currentStreamingAbortRequested = false;
    this.currentStreamingOperationId = newId('rpg_lite_op');
    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '⏳ Generating...';

    const openingInstruction = getOpeningInstruction();
    let meta: RPGLiteMessageGenerationMeta | null = null;

    const openRouterMessages: OpenRouterMessage[] = [
      ...buildContextMessages(session),
      { role: 'user', content: openingInstruction }
    ];

    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    const msgEl = messagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement;
    msgEl.classList.add('rpg-lite-message-streaming');
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;
    let rafScheduled = false;

    const opId = this.currentStreamingOperationId;
    if (!opId) throw new Error('Missing streaming operation id.');
    await this.openRouterClient.streamingChat(session.narratorPurpose, openRouterMessages, {
      onStart: () => {},
      onChunk: (chunk: string) => {
        assistantMsg.content += chunk;
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          contentEl.textContent = assistantMsg.content;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      },
      onMeta: (m) => {
        meta = mapCompletionMetaToGenerationMeta(session.narratorPurpose, m);
      },
      onComplete: async () => {
        if (meta) {
          assistantMsg.generation = meta;
        }
        await this.saveSession();
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Send';
        msgEl.classList.remove('rpg-lite-message-streaming');
        this.renderConversation();
        const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
        inputEl.focus();
      },
      onError: (error: Error) => {
        const wasAbort = this.currentStreamingAbortRequested && error.message.toLowerCase().includes('aborted');
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Send';
        msgEl.classList.remove('rpg-lite-message-streaming');
        if (wasAbort) return;
        console.error('RPG Lite narrator error:', error);
        alert(`Narrator error: ${error.message}`);
      }
    }, opId);
  }

  private async generateAssistantReply(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const session = this.currentSession;
    const assistantMsg: RPGLiteChatMessage = {
      id: newId('rpg_lite_msg'),
      role: 'assistant',
      content: '',
      createdAt: now()
    };
    session.conversation.push(assistantMsg);
    await this.saveSession();
    this.renderConversation();

    this.isStreaming = true;
    this.streamingMessageId = assistantMsg.id;
    this.currentStreamingAbortRequested = false;
    this.currentStreamingOperationId = newId('rpg_lite_op');
    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '⏳ Generating...';

    let meta: RPGLiteMessageGenerationMeta | null = null;
    const openRouterMessages = buildContextMessages(session);
    this.updateContextStats();
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    const msgEl = messagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement;
    msgEl.classList.add('rpg-lite-message-streaming');
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;
    let rafScheduled = false;

    const opId = this.currentStreamingOperationId;
    if (!opId) throw new Error('Missing streaming operation id.');
    await this.openRouterClient.streamingChat(session.narratorPurpose, openRouterMessages, {
      onStart: () => {},
      onChunk: (chunk: string) => {
        assistantMsg.content += chunk;
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          contentEl.textContent = assistantMsg.content;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      },
      onMeta: (m) => {
        meta = mapCompletionMetaToGenerationMeta(session.narratorPurpose, m);
      },
      onComplete: async () => {
        if (meta) {
          assistantMsg.generation = meta;
        }
        await this.saveSession();
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Send';
        msgEl.classList.remove('rpg-lite-message-streaming');
        this.renderConversation();
        const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
        inputEl.focus();
      },
      onError: (error: Error) => {
        const wasAbort = this.currentStreamingAbortRequested && error.message.toLowerCase().includes('aborted');
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Send';
        msgEl.classList.remove('rpg-lite-message-streaming');
        if (wasAbort) return;
        console.error('RPG Lite narrator error:', error);
        alert(`Narrator error: ${error.message}`);
      }
    }, opId);
  }
}

export async function openRPGLiteView(): Promise<void> {
  const container = document.createElement('div');
  const view = new RPGLiteView(container);
  await view.open();
}


