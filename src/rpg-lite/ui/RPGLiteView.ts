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
      list.innerHTML = '<div style="opacity: 0.7; margin: 1rem 0; text-align: center;">No sessions yet.</div>';
      return;
    }

    list.innerHTML = this.sessions
      .map(
        (s) => `
        <div class="rpg-lite-list-item" data-session-id="${s.id}" style="cursor: pointer;">
          <div style="min-width:0; flex: 1;">
            <div class="rpg-lite-list-item-title">${s.title}</div>
            <div style="opacity:.8; font-size:.85rem;">${formatDateTime(s.updatedAt)} · ${s.conversation.length} msgs</div>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="rpg-lite-btn rpg-lite-btn-primary" data-continue-session-id="${s.id}" title="Continue">Continue</button>
            <button class="rpg-lite-btn" data-delete-session-id="${s.id}" title="Delete">Delete</button>
          </div>
        </div>
      `
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
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="rpg-lite-btn rpg-lite-btn-primary" data-start-preset-id="${p.id}" title="Start">Start</button>
            <button class="rpg-lite-btn" data-edit-preset-id="${p.id}" title="Edit">Edit</button>
            <button class="rpg-lite-btn" data-delete-preset-id="${p.id}" title="Delete">Delete</button>
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

    const ok = confirm(`Restart "${preset.name}"? This will create a new session.`);
    if (!ok) return;

    const session: RPGLiteSession = {
      id: newId('rpg_lite_session'),
      title: preset.title,
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
        title: split.title,
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
          <div class="rpg-lite-title">${session.title}</div>
        </div>
        <div class="rpg-lite-topbar-right">
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
          <div class="rpg-lite-section-title">Restart from preset</div>
          <select id="rpg-lite-preset-select" class="rpg-lite-select">
            <option value="">Select preset…</option>
            ${this.presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
          <button id="rpg-lite-restart" class="rpg-lite-btn">Restart</button>

          <div class="rpg-lite-section-title" style="margin-top: .5rem;">Sessions</div>
          <div class="rpg-lite-list" id="rpg-lite-session-list"></div>
        </div>
        <div class="rpg-lite-main">
          <div class="rpg-lite-editors">
            <div class="rpg-lite-editor">
              <div class="rpg-lite-section-title">System Prompt (editable)</div>
              <textarea id="rpg-lite-system" class="rpg-lite-textarea"></textarea>
            </div>
            <div class="rpg-lite-editor">
              <div class="rpg-lite-section-title">Prefix Context (always included)</div>
              <textarea id="rpg-lite-prefix" class="rpg-lite-textarea"></textarea>
            </div>
          </div>
          <div id="rpg-lite-messages" class="rpg-lite-messages"></div>
          <div class="rpg-lite-composer">
            <textarea id="rpg-lite-input" class="rpg-lite-textarea" placeholder="Your message..."></textarea>
            <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:flex-end;">
              <button id="rpg-lite-send" class="rpg-lite-btn rpg-lite-btn-primary">Send</button>
              <div id="rpg-lite-context-stats" style="opacity:.85; font-size:.85rem;"></div>
            </div>
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

    const presetSelect = this.container.querySelector('#rpg-lite-preset-select') as HTMLSelectElement;
    (this.container.querySelector('#rpg-lite-restart') as HTMLButtonElement).addEventListener('click', () => {
      const id = presetSelect.value;
      if (!id) {
        alert('Please select a start preset first.');
        presetSelect.focus();
        return;
      }
      void this.restartFromPreset(id).catch((e: unknown) => {
        console.error('RPG Lite restart failed:', e);
        const msg = e instanceof Error ? e.message : String(e);
        alert(`Restart failed: ${msg}`);
      });
    });

    (this.container.querySelector('#rpg-lite-save-session') as HTMLButtonElement).addEventListener('click', () => {
      void this.saveCurrentAsSessionCopy();
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
    this.renderConversation();
    this.updateContextStats();

    inputEl.focus();
  }

  private updateContextStats(): void {
    if (!this.currentSession) throw new Error('No current session.');
    const statsEl = this.container.querySelector('#rpg-lite-context-stats') as HTMLElement;
    if (!statsEl) throw new Error('Missing #rpg-lite-context-stats element.');

    const { promptChars, messageCount } = computeContextCharCount(this.currentSession);
    statsEl.textContent = `Context: ${promptChars.toLocaleString()} chars · ${messageCount} msgs`;
  }

  private async saveCurrentAsSessionCopy(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    this.abortStreamingIfActive();

    const suggested = `${this.currentSession.title} (copy)`;
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

    const newSession: RPGLiteSession = {
      id: newId('rpg_lite_session'),
      title: title.trim(),
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

  private renderMessage(msg: RPGLiteChatMessage): HTMLElement {
    const el = document.createElement('div');
    el.className = `rpg-lite-message ${msg.role}`;
    el.dataset['messageId'] = msg.id;

    const roleLabel = msg.role === 'user' ? 'You' : 'GM';

    const infoParts: string[] = [];
    infoParts.push(formatDateTime(msg.editedAt ?? msg.createdAt));
    infoParts.push(`${msg.content.length} chars`);

    if (msg.generation) {
      const g = msg.generation;
      if (g.usage) {
        infoParts.push(`${g.usage.prompt_tokens} prompt tok`);
        infoParts.push(`${g.usage.completion_tokens} completion tok`);
      }
      if (typeof g.totalCostUsd === 'number') {
        infoParts.push(formatUsd(g.totalCostUsd));
      }
      infoParts.push(`${Math.round(g.durationMs)} ms`);
    }
    if (msg.editedAt) {
      infoParts.push('edited');
    }

    el.innerHTML = `
      <div class="rpg-lite-message-header">
        <div class="rpg-lite-message-role">${roleLabel}</div>
        <div class="rpg-lite-message-actions">
          <button class="rpg-lite-btn" data-action="edit">Edit</button>
          ${msg.role === 'assistant' ? `<button class="rpg-lite-btn" data-action="retry">Retry</button>` : ''}
        </div>
      </div>
      <div class="rpg-lite-message-content" data-role="content"></div>
      <div class="rpg-lite-message-info">${infoParts.map(p => `<span>${p}</span>`).join('')}</div>
    `;

    const contentEl = el.querySelector('[data-role="content"]') as HTMLElement;
    contentEl.textContent = msg.content;

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
    this.currentStreamingAbortRequested = false;
    this.currentStreamingOperationId = newId('rpg_lite_op');
    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    sendBtn.disabled = true;

    const openingInstruction = getOpeningInstruction();
    let meta: RPGLiteMessageGenerationMeta | null = null;

    const openRouterMessages: OpenRouterMessage[] = [
      ...buildContextMessages(session),
      { role: 'user', content: openingInstruction }
    ];

    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    const msgEl = messagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement;
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;

    const opId = this.currentStreamingOperationId;
    if (!opId) throw new Error('Missing streaming operation id.');
    await this.openRouterClient.streamingChat(session.narratorPurpose, openRouterMessages, {
      onStart: () => {},
      onChunk: (chunk: string) => {
        assistantMsg.content += chunk;
        contentEl.textContent = assistantMsg.content;
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
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
        this.renderConversation();
        const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
        inputEl.focus();
      },
      onError: (error: Error) => {
        const wasAbort = this.currentStreamingAbortRequested && error.message.toLowerCase().includes('aborted');
        this.isStreaming = false;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
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
    this.currentStreamingAbortRequested = false;
    this.currentStreamingOperationId = newId('rpg_lite_op');
    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    sendBtn.disabled = true;

    let meta: RPGLiteMessageGenerationMeta | null = null;
    const openRouterMessages = buildContextMessages(session);
    this.updateContextStats();
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    const msgEl = messagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement;
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;

    const opId = this.currentStreamingOperationId;
    if (!opId) throw new Error('Missing streaming operation id.');
    await this.openRouterClient.streamingChat(session.narratorPurpose, openRouterMessages, {
      onStart: () => {},
      onChunk: (chunk: string) => {
        assistantMsg.content += chunk;
        contentEl.textContent = assistantMsg.content;
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
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
        this.renderConversation();
        const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
        inputEl.focus();
      },
      onError: (error: Error) => {
        const wasAbort = this.currentStreamingAbortRequested && error.message.toLowerCase().includes('aborted');
        this.isStreaming = false;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        sendBtn.disabled = false;
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


