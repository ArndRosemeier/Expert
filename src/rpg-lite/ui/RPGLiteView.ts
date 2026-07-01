import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import { StorageService } from '../../StorageService';
import { RPGLitePromptSplitService } from '../services/RPGLitePromptSplitService';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { SettingsManager } from '../../SettingsManager';
import { getPromptText } from '../../PromptManager';
import * as state from '../../state';
import {
  RPGLiteActionButton,
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

async function buildContextMessages(session: RPGLiteSession): Promise<OpenRouterMessage[]> {
  const messages: OpenRouterMessage[] = [];
  
  // Expand placeholders in systemPrompt on every call for fresh name inspiration
  const settingsManager = await SettingsManager.getInstance();
  const expansionService = createPromptExpansionService(settingsManager);
  const expandedSystemPrompt = expansionService.expandPrompt(session.systemPrompt, {});
  
  messages.push({ role: 'system', content: expandedSystemPrompt });
  messages.push({
    role: 'user',
    content:
      `ADVENTURE CONTEXT (always in context, not the system prompt):\n` +
      `${session.prefixContext}`
  });

  // Only include messages that have content. Empty messages are in-flight placeholders
  // created before the model responds — including them sends a blank assistant turn to
  // the model, which corrupts the role sequence and can cause repeated responses.
  const completed = session.conversation.filter(m => m.content.trim().length > 0);

  // Take the N most recent completed messages.
  let startIdx = Math.max(0, completed.length - session.maxContextMessages);

  // The adventure context above is injected as a 'user' message. The conversation
  // starts with an assistant message (the opening), so the pattern is:
  //   assistant, user, assistant, user, …
  // If the slice cuts at an even-offset position it starts with a 'user' message,
  // creating consecutive user roles which confuses most LLMs.
  // Fix: step back one to include the preceding assistant message, keeping the pair intact.
  if (startIdx > 0 && completed[startIdx]?.role === 'user') {
    startIdx -= 1;
  }

  for (const m of completed.slice(startIdx)) {
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

async function computeContextCharCount(session: RPGLiteSession): Promise<{ promptChars: number; messageCount: number }> {
  const messages = await buildContextMessages(session);
  const promptForLogging = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  return { promptChars: promptForLogging.length, messageCount: messages.length };
}

function getOpeningInstruction(): string {
  return (
    `Start the roleplaying game now.\n` +
    `Write the opening scene, establish the immediate situation, and end with a clear question to the player about what they do next.`
  );
}

const DEBUG_RPG_LITE_STREAMING: boolean = false;

export class RPGLiteView {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;

  private openRouterClient: OpenRouterClient;
  private promptSplitService: RPGLitePromptSplitService;

  private currentSession: RPGLiteSession | null = null;
  private sessions: RPGLiteSession[] = [];
  private presets: RPGLiteStartPreset[] = [];
  private actionButtons: RPGLiteActionButton[] = [];

  private isStreaming = false;
  private currentStreamingOperationId: string | null = null;
  private currentStreamingAbortRequested = false;
  private streamingMessageId: string | null = null;
  private editingPresetId: string | null = null;
  private promptHistory: string[] = [];
  private prefixContextHistory: string[] = [];

  private defaultNarratorPurpose: RPGLiteModelPurpose = 'creator';

  constructor(container: HTMLElement) {
    this.container = container;
    this.openRouterClient = OpenRouterClient.getInstance();
    this.promptSplitService = new RPGLitePromptSplitService(this.openRouterClient);
  }

  private setComposerButtonsGenerating(): void {
    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    const abortBtn = this.container.querySelector('#rpg-lite-abort') as HTMLButtonElement;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '⏳ Generating...';
    abortBtn.style.display = 'inline-block';
  }

  private setComposerButtonsIdle(): void {
    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    const abortBtn = this.container.querySelector('#rpg-lite-abort') as HTMLButtonElement;
    sendBtn.disabled = false;
    sendBtn.innerHTML = 'Send';
    abortBtn.style.display = 'none';
  }

  private addWaitingIndicator(msgEl: HTMLElement): void {
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;
    const indicator = document.createElement('div');
    indicator.className = 'rpg-lite-waiting-indicator';
    indicator.dataset['waitingIndicator'] = '1';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    contentEl.appendChild(indicator);
  }

  private removeWaitingIndicator(msgEl: HTMLElement): void {
    const indicator = msgEl.querySelector('[data-waiting-indicator="1"]');
    indicator?.remove();
  }

  /**
   * Builds StreamingChatOptions for RPGLite requests.
   * Checks model capabilities and adds image modalities when the active model supports image output.
   */
  private async buildStreamingOptions(session: RPGLiteSession): Promise<import('../../OpenRouterClient').StreamingChatOptions> {
    const opts: import('../../OpenRouterClient').StreamingChatOptions = {};
    if (session.temperature !== undefined) {
      opts.temperature = session.temperature;
    }
    // Check if the selected model for this purpose supports image output
    const modelId = state.getModelSelector()?.getSelectedModels()?.[session.narratorPurpose];
    if (modelId) {
      const supportsImages = await this.openRouterClient.modelSupportsImageOutput(modelId);
      if (supportsImages) {
        opts.modalities = ['image', 'text'];
      }
    }
    return opts;
  }

  /**
   * Appends received image URLs to a live streaming message element's images container.
   * Creates the container on first call, subsequent calls append to it.
   */
  private appendImagesToMessageEl(msgEl: HTMLElement, imageUrls: string[]): void {
    let imagesContainer = msgEl.querySelector('[data-role="images"]') as HTMLElement | null;
    if (!imagesContainer) {
      imagesContainer = document.createElement('div');
      imagesContainer.dataset['role'] = 'images';
      imagesContainer.className = 'rpg-lite-message-images';
      msgEl.appendChild(imagesContainer);
    }
    for (const url of imageUrls) {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'rpg-lite-message-image';
      img.alt = 'Generated image';
      imagesContainer.appendChild(img);
    }
    // Scroll to make the new images visible
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement | null;
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  private updateRetriesDisplay(): void {
    if (!this.currentSession) return;
    const session = this.currentSession;
    const remainingEl = this.container.querySelector('#rpg-lite-retries-remaining') as HTMLElement | null;
    if (!remainingEl) return;
    const used = session.retriesUsed ?? 0;
    // undefined means field not yet initialized; treat same as default (10).
    // null means unlimited.
    const limit = session.retryLimit ?? 10;
    const unlimited = session.retryLimit === null;
    const exhausted = !unlimited && used >= limit;
    remainingEl.textContent = unlimited ? '∞ left' : `${Math.max(0, limit - used)} left`;
    remainingEl.classList.toggle('rpg-lite-retries-exhausted', exhausted);
  }

  private abortStreamingIfActive(): void {
    if (!this.isStreaming) return;
    if (!this.currentStreamingOperationId) throw new Error('Streaming is active but no operation id is set.');

    this.currentStreamingAbortRequested = true;
    this.openRouterClient.abortOperation(this.currentStreamingOperationId);
    this.currentStreamingOperationId = null;
    this.streamingMessageId = null;
    this.isStreaming = false;

    this.setComposerButtonsIdle();
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
    this.actionButtons = await storage.listRPGLiteActionButtons<RPGLiteActionButton>();
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
          <label style="display:flex; align-items:center; gap:.5rem;">
            <span style="opacity:.85;">Default Narrator</span>
            <select id="rpg-lite-default-narrator" class="rpg-lite-select">
              <option value="prose">Prose</option>
              <option value="creator">Creator</option>
              <option value="editor">Editor</option>
              <option value="rater">Rater</option>
            </select>
          </label>
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

    const defaultNarratorSelect = this.container.querySelector('#rpg-lite-default-narrator') as HTMLSelectElement;
    defaultNarratorSelect.value = this.defaultNarratorPurpose;
    defaultNarratorSelect.addEventListener('change', () => {
      this.defaultNarratorPurpose = defaultNarratorSelect.value as RPGLiteModelPurpose;
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
          <div class="rpg-lite-button-group-tight">
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

  private renderActionButtons(): void {
    const list = this.container.querySelector('#rpg-lite-action-buttons-list') as HTMLElement | null;
    if (!list) return;

    if (this.actionButtons.length === 0) {
      list.innerHTML = `
        <div class="rpg-lite-empty-state" style="padding: 1rem 0.5rem;">
          <div style="font-size: 1.2rem; margin-bottom: 0.25rem;">⚡</div>
          <div style="font-size: 0.85rem; opacity: 0.7;">No quick actions yet</div>
        </div>
      `;
      return;
    }

    list.innerHTML = this.actionButtons
      .map(
        (btn) => `
        <div class="rpg-lite-action-button-item" data-action-button-id="${btn.id}">
          <button class="rpg-lite-action-button" data-trigger-action-id="${btn.id}" title="${btn.text}">
            ${btn.label}
          </button>
          <div class="rpg-lite-action-button-controls">
            <button class="rpg-lite-btn rpg-lite-btn-icon-sm" data-edit-action-id="${btn.id}" title="Edit">✏️</button>
            <button class="rpg-lite-btn rpg-lite-btn-icon-sm" data-delete-action-id="${btn.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `
      )
      .join('');

    // Trigger action
    list.querySelectorAll('[data-trigger-action-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['triggerActionId'];
        if (!id) throw new Error('Trigger action button is missing data-trigger-action-id.');
        this.triggerActionButton(id);
      });
    });

    // Edit action
    list.querySelectorAll('[data-edit-action-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['editActionId'];
        if (!id) throw new Error('Edit action button is missing data-edit-action-id.');
        void this.showEditActionButtonDialog(id);
      });
    });

    // Delete action
    list.querySelectorAll('[data-delete-action-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['deleteActionId'];
        if (!id) throw new Error('Delete action button is missing data-delete-action-id.');
        void this.deleteActionButton(id);
      });
    });
  }

  private triggerActionButton(buttonId: string): void {
    const button = this.actionButtons.find((b) => b.id === buttonId);
    if (!button) throw new Error(`Action button not found: ${buttonId}`);

    const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement | null;
    if (!inputEl) return;

    inputEl.value = button.text;
    inputEl.focus();
    
    // Automatically send the message
    void this.sendNewUserMessage();
  }

  private async showCreateActionButtonDialog(): Promise<void> {
    const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement | null;
    const currentText = inputEl?.value.trim() ?? '';

    const result = await this.showActionButtonEditorModal({
      title: 'Create Action Button',
      labelValue: currentText.substring(0, 20) || 'Action',
      textValue: currentText,
      confirmText: 'Create'
    });

    if (!result) return;

    const newButton: RPGLiteActionButton = {
      id: newId('action_btn'),
      label: result.label,
      text: result.text,
      order: this.actionButtons.length,
      createdAt: now(),
      updatedAt: now()
    };

    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteActionButton(newButton);
    this.actionButtons.push(newButton);
    this.renderActionButtons();
  }

  private async showEditActionButtonDialog(buttonId: string): Promise<void> {
    const button = this.actionButtons.find((b) => b.id === buttonId);
    if (!button) throw new Error(`Action button not found: ${buttonId}`);

    const result = await this.showActionButtonEditorModal({
      title: 'Edit Action Button',
      labelValue: button.label,
      textValue: button.text,
      confirmText: 'Save'
    });

    if (!result) return;

    button.label = result.label;
    button.text = result.text;
    button.updatedAt = now();

    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteActionButton(button);
    this.renderActionButtons();
  }

  private showActionButtonEditorModal(options: {
    title: string;
    labelValue: string;
    textValue: string;
    confirmText: string;
  }): Promise<{ label: string; text: string } | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'rpg-lite-action-editor-overlay';
      overlay.innerHTML = `
        <div class="rpg-lite-action-editor-modal">
          <div class="rpg-lite-action-editor-header">
            <h3>${options.title}</h3>
            <button class="rpg-lite-action-editor-close" title="Close">✕</button>
          </div>
          <div class="rpg-lite-action-editor-body">
            <div class="rpg-lite-action-editor-field">
              <label for="action-editor-label">Button Label:</label>
              <input 
                type="text" 
                id="action-editor-label" 
                class="rpg-lite-input" 
                placeholder="e.g., Look Around, Check Inventory" 
                value="${options.labelValue}"
                maxlength="50"
              />
            </div>
            <div class="rpg-lite-action-editor-field">
              <label for="action-editor-text">Action Text (multi-line instructions):</label>
              <textarea 
                id="action-editor-text" 
                class="rpg-lite-textarea rpg-lite-action-editor-textarea" 
                placeholder="Enter the detailed instruction or action text here...&#10;You can use multiple lines for complex instructions."
              >${options.textValue}</textarea>
            </div>
          </div>
          <div class="rpg-lite-action-editor-footer">
            <button class="rpg-lite-btn rpg-lite-btn-secondary" id="action-editor-cancel">Cancel</button>
            <button class="rpg-lite-btn rpg-lite-btn-primary" id="action-editor-confirm">${options.confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const labelInput = overlay.querySelector('#action-editor-label') as HTMLInputElement;
      const textArea = overlay.querySelector('#action-editor-text') as HTMLTextAreaElement;
      const confirmBtn = overlay.querySelector('#action-editor-confirm') as HTMLButtonElement;
      const cancelBtn = overlay.querySelector('#action-editor-cancel') as HTMLButtonElement;
      const closeBtn = overlay.querySelector('.rpg-lite-action-editor-close') as HTMLButtonElement;

      const cleanup = () => {
        overlay.remove();
      };

      const handleConfirm = () => {
        const label = labelInput.value.trim();
        const text = textArea.value.trim();

        if (!label) {
          alert('Please enter a button label');
          labelInput.focus();
          return;
        }

        if (!text) {
          alert('Please enter action text');
          textArea.focus();
          return;
        }

        cleanup();
        resolve({ label, text });
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      closeBtn.addEventListener('click', handleCancel);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleCancel();
      });

      // Focus label input
      setTimeout(() => { labelInput.focus(); }, 100);

      // Handle Enter key in label input (move to textarea)
      labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          textArea.focus();
        }
      });

      // Handle Ctrl+Enter in textarea to submit
      textArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          handleConfirm();
        }
      });
    });
  }

  private async deleteActionButton(buttonId: string): Promise<void> {
    const button = this.actionButtons.find((b) => b.id === buttonId);
    if (!button) throw new Error(`Action button not found: ${buttonId}`);

    if (!confirm(`Delete action button "${button.label}"?`)) return;

    const storage = await StorageService.getInstance();
    await storage.deleteRPGLiteActionButton(buttonId);
    this.actionButtons = this.actionButtons.filter((b) => b.id !== buttonId);
    this.renderActionButtons();
  }

  private generatePresetListItemHtml(preset: RPGLiteStartPreset, options: { showSubtitle: boolean; itemClass: string }): string {
    return `
      <div class="${options.itemClass}" data-preset-id="${preset.id}">
        <div style="min-width:0; flex: 1;">
          <div class="rpg-lite-list-item-title">${preset.name}</div>
          ${options.showSubtitle ? `<div style="opacity:.8; font-size:.85rem;">${preset.title}</div>` : ''}
        </div>
        <div class="rpg-lite-button-group-tight">
          <button class="rpg-lite-btn rpg-lite-btn-primary rpg-lite-btn-sm" data-start-preset-id="${preset.id}" title="Start">Start</button>
          <button class="rpg-lite-btn rpg-lite-btn-icon" data-edit-preset-id="${preset.id}" title="Edit">⚙️</button>
          <button class="rpg-lite-btn rpg-lite-btn-icon" data-copy-preset-id="${preset.id}" title="Copy">📋</button>
          <button class="rpg-lite-btn rpg-lite-btn-icon" data-delete-preset-id="${preset.id}" title="Delete">🗑️</button>
        </div>
      </div>
    `;
  }

  private bindPresetListEvents(list: HTMLElement): void {
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

    list.querySelectorAll('[data-copy-preset-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLElement;
        const id = btn.dataset['copyPresetId'];
        if (!id) throw new Error('Copy preset button is missing data-copy-preset-id.');
        void this.copyPreset(id);
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
      .map(p => this.generatePresetListItemHtml(p, { showSubtitle: true, itemClass: 'rpg-lite-list-item' }))
      .join('');

    this.bindPresetListEvents(list);
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

  private makeUniquePresetName(baseName: string): string {
    const existingNames = new Set(this.presets.map(p => p.name));
    
    if (!existingNames.has(baseName)) {
      return baseName;
    }
    
    let counter = 2;
    let newName = `${baseName} ${counter}`;
    
    while (existingNames.has(newName)) {
      counter++;
      newName = `${baseName} ${counter}`;
    }
    
    return newName;
  }

  private async copyPreset(presetId: string): Promise<void> {
    const preset = this.presets.find(p => p.id === presetId);
    if (!preset) throw new Error(`Preset not found: ${presetId}`);

    const baseName = `${preset.name} (Copy)`;
    const uniqueName = this.makeUniquePresetName(baseName);

    const newPreset: RPGLiteStartPreset = {
      id: newId('rpg_lite_preset'),
      name: uniqueName,
      createdAt: now(),
      updatedAt: now(),
      title: preset.title,
      systemPrompt: preset.systemPrompt,
      prefixContext: preset.prefixContext,
      ...(preset.narratorPurpose !== undefined ? { narratorPurpose: preset.narratorPurpose } : {}),
      maxContextMessages: preset.maxContextMessages
    };

    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteStartPreset(newPreset);
    await this.loadAll();
    
    // Optionally, open the new preset for editing
    this.editingPresetId = newPreset.id;
    this.renderSelector();
  }

  private renderPresetEditorHtml(presetId: string): string {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return '';

    const purposes: Array<{ key: RPGLiteModelPurpose | ''; label: string }> = [
      { key: '', label: 'Default' },
      { key: 'prose', label: 'Prose' },
      { key: 'creator', label: 'Creator' },
      { key: 'editor', label: 'Editor' },
      { key: 'rater', label: 'Rater' }
    ];

    const selectedPurpose = preset.narratorPurpose ?? '';

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
              ${purposes.map(p => `<option value="${p.key}" ${p.key === selectedPurpose ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
          </label>
          <label style="display:flex; flex-direction:column; gap:0.35rem; min-width: 12rem;">
            <span class="rpg-lite-section-title">Max msgs</span>
            <input id="rpg-lite-preset-editor-max-context" class="rpg-lite-input" type="number" min="2" step="1" value="${String(preset.maxContextMessages)}" />
          </label>
        </div>

        <label style="display:flex; flex-direction:column; gap:0.35rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
            <span class="rpg-lite-section-title">System Prompt</span>
            <span style="font-size: 0.8rem; opacity: 0.7;">
              Available: <code style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 3px;">{{noise_names}}</code>
            </span>
          </div>
          <textarea id="rpg-lite-preset-editor-system" class="rpg-lite-textarea rpg-lite-preset-editor-textarea">${preset.systemPrompt}</textarea>
        </label>

        <label style="display:flex; flex-direction:column; gap:0.35rem;">
          <span class="rpg-lite-section-title">Prefix Context</span>
          <textarea id="rpg-lite-preset-editor-prefix" class="rpg-lite-textarea rpg-lite-preset-editor-textarea">${preset.prefixContext}</textarea>
          <div style="display:flex; gap:.5rem; align-items:center; flex-wrap:wrap;">
            <button id="rpg-lite-prefix-more-details" class="rpg-lite-btn rpg-lite-btn-sm" title="Add more details to the prefix context">More Details</button>
            <button id="rpg-lite-prefix-variation" class="rpg-lite-btn rpg-lite-btn-sm" title="Generate a variation of the prefix context">Variation</button>
            <button id="rpg-lite-prefix-back" class="rpg-lite-btn rpg-lite-btn-sm" title="Restore previous version" disabled>Back to Last Version</button>
            <span id="rpg-lite-prefix-status" style="opacity:.7; font-size:0.85rem;"></span>
          </div>
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
      this.prefixContextHistory = [];
      this.renderSelector();
    });

    saveBtn.addEventListener('click', () => {
      void this.saveEditedPreset(preset.id);
    });

    // Prefix context refinement buttons
    const moreDetailsBtn = this.container.querySelector('#rpg-lite-prefix-more-details') as HTMLButtonElement | null;
    const variationBtn = this.container.querySelector('#rpg-lite-prefix-variation') as HTMLButtonElement | null;
    const backBtn = this.container.querySelector('#rpg-lite-prefix-back') as HTMLButtonElement | null;

    if (moreDetailsBtn && variationBtn && backBtn) {
      moreDetailsBtn.addEventListener('click', () => {
        void this.refinePrefixContext('more-details');
      });

      variationBtn.addEventListener('click', () => {
        void this.refinePrefixContext('variation');
      });

      backBtn.addEventListener('click', () => {
        const prefixEl = this.container.querySelector('#rpg-lite-preset-editor-prefix') as HTMLTextAreaElement | null;
        if (!prefixEl) return;
        
        if (this.prefixContextHistory.length > 0) {
          const previousContext = this.prefixContextHistory.pop();
          if (previousContext !== undefined) {
            prefixEl.value = previousContext;
            backBtn.disabled = this.prefixContextHistory.length === 0;
          }
        }
      });
    }
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
    if (purposeEl.value === '') {
      delete preset.narratorPurpose;
    } else {
      preset.narratorPurpose = purposeEl.value as RPGLiteModelPurpose;
    }
    preset.maxContextMessages = Math.max(2, Math.floor(Number(maxEl.value)));
    preset.systemPrompt = systemEl.value;
    preset.prefixContext = prefixEl.value;
    preset.updatedAt = now();

    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteStartPreset(preset);

    await this.loadAll();
    this.prefixContextHistory = [];
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
    // Don't auto-generate opening message - let user review/change settings first
    // User can click "Generate Opening" button or type their own message
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
      narratorPurpose: preset.narratorPurpose ?? this.defaultNarratorPurpose,
      maxContextMessages: preset.maxContextMessages,
      conversation: []
    };
    const storage = await StorageService.getInstance();
    await storage.saveRPGLiteSession(session);
    await this.loadAll();
    this.currentSession = session;
    this.renderSession();
    this.isStreaming = false;
    // Auto-generate opening message for template-based sessions (settings are predefined)
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
              <div style="display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:0.5rem;">
                <button id="rpg-lite-prompt-more-details" class="rpg-lite-btn rpg-lite-btn-sm" title="Add more details to the prompt">More Details</button>
                <button id="rpg-lite-prompt-variation" class="rpg-lite-btn rpg-lite-btn-sm" title="Generate a variation of the prompt">Variation</button>
                <button id="rpg-lite-prompt-back" class="rpg-lite-btn rpg-lite-btn-sm" title="Restore previous version" disabled>Back to Last Version</button>
                <span id="rpg-lite-prompt-status" style="opacity:.7; font-size:0.85rem;"></span>
              </div>
              <div style="display:flex; gap:.75rem; align-items:center; flex-wrap:wrap; margin-top:1rem;">
                <label style="display:flex; gap:.5rem; align-items:center;">
                  <span style="opacity:.85;">Narrator</span>
                  <select id="rpg-lite-narrator-purpose" class="rpg-lite-select">
                    <option value="prose" ${this.defaultNarratorPurpose === 'prose' ? 'selected' : ''}>Prose</option>
                    <option value="creator" ${this.defaultNarratorPurpose === 'creator' ? 'selected' : ''}>Creator</option>
                    <option value="editor" ${this.defaultNarratorPurpose === 'editor' ? 'selected' : ''}>Editor</option>
                    <option value="rater" ${this.defaultNarratorPurpose === 'rater' ? 'selected' : ''}>Rater</option>
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

    const promptEl = this.container.querySelector('#rpg-lite-adventure-prompt') as HTMLTextAreaElement;
    const moreDetailsBtn = this.container.querySelector('#rpg-lite-prompt-more-details') as HTMLButtonElement;
    const variationBtn = this.container.querySelector('#rpg-lite-prompt-variation') as HTMLButtonElement;
    const backBtn = this.container.querySelector('#rpg-lite-prompt-back') as HTMLButtonElement;

    (this.container.querySelector('#rpg-lite-back') as HTMLButtonElement).addEventListener('click', () => {
      this.promptHistory = [];
      this.prefixContextHistory = [];
      this.renderSelector();
    });

    (this.container.querySelector('#rpg-lite-analyze') as HTMLButtonElement).addEventListener('click', () => {
      void this.createSessionFromPrompt(isTemplate);
    });

    moreDetailsBtn.addEventListener('click', () => {
      void this.refineAdventurePrompt('more-details');
    });

    variationBtn.addEventListener('click', () => {
      void this.refineAdventurePrompt('variation');
    });

    backBtn.addEventListener('click', () => {
      if (this.promptHistory.length > 0) {
        const previousPrompt = this.promptHistory.pop();
        if (previousPrompt !== undefined) {
          promptEl.value = previousPrompt;
          backBtn.disabled = this.promptHistory.length === 0;
        }
      }
    });
  }

  private async refinePrefixContext(mode: 'more-details' | 'variation'): Promise<void> {
    const prefixEl = this.container.querySelector('#rpg-lite-preset-editor-prefix') as HTMLTextAreaElement | null;
    const statusEl = this.container.querySelector('#rpg-lite-prefix-status') as HTMLElement | null;
    const moreDetailsBtn = this.container.querySelector('#rpg-lite-prefix-more-details') as HTMLButtonElement | null;
    const variationBtn = this.container.querySelector('#rpg-lite-prefix-variation') as HTMLButtonElement | null;
    const backBtn = this.container.querySelector('#rpg-lite-prefix-back') as HTMLButtonElement | null;

    if (!prefixEl || !statusEl || !moreDetailsBtn || !variationBtn || !backBtn) return;

    const currentContext = prefixEl.value.trim();
    if (currentContext.length === 0) {
      alert('Please enter prefix context first.');
      return;
    }

    // Save current context to history
    this.prefixContextHistory.push(currentContext);
    backBtn.disabled = false;

    moreDetailsBtn.disabled = true;
    variationBtn.disabled = true;
    statusEl.textContent = mode === 'more-details' ? 'Adding details...' : 'Generating variation...';

    try {
      const systemPrompt = mode === 'more-details'
        ? getPromptText('rpg_lite_prefix_refine_more_details_system')
        : getPromptText('rpg_lite_prefix_refine_variation_system');

      const refinementMode = mode === 'more-details' 
        ? 'an expanded version with more narrative details' 
        : 'a creative narrative variation';
      
      // Get template and replace user-provided placeholders
      const userPromptTemplate = getPromptText('rpg_lite_prefix_refine_user');
      const userPromptWithPlaceholders = userPromptTemplate
        .split('{{prefix_context}}').join(currentContext)
        .split('{{refinement_mode}}').join(refinementMode);
      
      // Now expand {{noise_names}} and any other global placeholders
      const settingsManager = await SettingsManager.getInstance();
      const expansionService = createPromptExpansionService(settingsManager);
      const userPrompt = expansionService.expandPrompt(userPromptWithPlaceholders, {});

      const messages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      let response = '';
      await this.openRouterClient.streamingChat('creator', messages, {
        onStart: () => {},
        onChunk: (chunk: string) => {
          response += chunk;
        },
        onComplete: () => {},
        onError: () => {}
      });

      prefixEl.value = response.trim();
      statusEl.textContent = '';
    } catch (error) {
      console.error('Failed to refine prefix context:', error);
      statusEl.textContent = 'Error refining context';
      alert('Failed to refine prefix context: ' + (error instanceof Error ? error.message : String(error)));
      // Restore from history on error
      if (this.prefixContextHistory.length > 0) {
        this.prefixContextHistory.pop();
        backBtn.disabled = this.prefixContextHistory.length === 0;
      }
    } finally {
      moreDetailsBtn.disabled = false;
      variationBtn.disabled = false;
    }
  }

  private async refineAdventurePrompt(mode: 'more-details' | 'variation'): Promise<void> {
    const promptEl = this.container.querySelector('#rpg-lite-adventure-prompt') as HTMLTextAreaElement;
    const statusEl = this.container.querySelector('#rpg-lite-prompt-status') as HTMLElement;
    const moreDetailsBtn = this.container.querySelector('#rpg-lite-prompt-more-details') as HTMLButtonElement;
    const variationBtn = this.container.querySelector('#rpg-lite-prompt-variation') as HTMLButtonElement;
    const backBtn = this.container.querySelector('#rpg-lite-prompt-back') as HTMLButtonElement;

    const currentPrompt = promptEl.value.trim();
    if (currentPrompt.length === 0) {
      alert('Please enter an adventure prompt first.');
      return;
    }

    // Save current prompt to history
    this.promptHistory.push(currentPrompt);
    backBtn.disabled = false;

    moreDetailsBtn.disabled = true;
    variationBtn.disabled = true;
    statusEl.textContent = mode === 'more-details' ? 'Adding details...' : 'Generating variation...';

    try {
      const systemPrompt = mode === 'more-details'
        ? getPromptText('rpg_lite_prompt_refine_more_details_system')
        : getPromptText('rpg_lite_prompt_refine_variation_system');

      const refinementMode = mode === 'more-details' 
        ? 'an expanded version with more narrative details' 
        : 'a creative narrative variation';
      
      // Get template and replace user-provided placeholders
      const userPromptTemplate = getPromptText('rpg_lite_prompt_refine_user');
      const userPromptWithPlaceholders = userPromptTemplate
        .split('{{adventure_prompt}}').join(currentPrompt)
        .split('{{refinement_mode}}').join(refinementMode);
      
      // Now expand {{noise_names}} and any other global placeholders
      const settingsManager = await SettingsManager.getInstance();
      const expansionService = createPromptExpansionService(settingsManager);
      const userPrompt = expansionService.expandPrompt(userPromptWithPlaceholders, {});

      const messages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      let response = '';
      await this.openRouterClient.streamingChat('creator', messages, {
        onStart: () => {},
        onChunk: (chunk: string) => {
          response += chunk;
        },
        onComplete: () => {},
        onError: () => {}
      });

      promptEl.value = response.trim();
      statusEl.textContent = '';
    } catch (error) {
      console.error('Failed to refine prompt:', error);
      statusEl.textContent = 'Error refining prompt';
      alert('Failed to refine prompt: ' + (error instanceof Error ? error.message : String(error)));
      // Restore from history on error
      if (this.promptHistory.length > 0) {
        this.promptHistory.pop();
        backBtn.disabled = this.promptHistory.length === 0;
      }
    } finally {
      moreDetailsBtn.disabled = false;
      variationBtn.disabled = false;
    }
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
        // New presets use default narrator (omit property)
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
      // Auto-generate opening message for newly created sessions (settings are already configured)
      await this.generateOpeningMessage();
    }
  }

  private renderSession(): void {
    if (!this.currentSession) throw new Error('No current session.');
    const session = this.currentSession;

    // Get the model name for the current purpose
    const modelSelector = state.getModelSelector();
    const selectedModels = modelSelector?.getSelectedModels() ?? {};
    const modelName = selectedModels[session.narratorPurpose] ?? 'Not configured';
    
    // Initialize temperature if not set
    session.temperature ??= 1.0;

    // Initialize retry fields if not set (default: 10 retries, 0 used)
    if (session.retryLimit === undefined) {
      session.retryLimit = 10;
    }
    session.retriesUsed ??= 0;

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
            <span style="opacity:.65; font-size:0.85rem;" id="rpg-lite-model-name" title="Current model for this purpose">${modelName}</span>
          </label>
          <label style="display:flex; align-items:center; gap:.5rem;">
            <span style="opacity:.85;">Temp</span>
            <input id="rpg-lite-temperature" type="range" min="0" max="2" step="0.1" value="${session.temperature}" 
                   style="width: 80px;" title="Temperature: ${session.temperature}" />
            <span id="rpg-lite-temperature-value" style="opacity:.85; font-size:0.85rem; min-width:2.5rem;">${session.temperature.toFixed(1)}</span>
          </label>
          <label style="display:flex; align-items:center; gap:.5rem;">
            <span style="opacity:.85;">Max msgs</span>
            <input id="rpg-lite-max-context-session" class="rpg-lite-input" type="number" min="2" step="1" value="${String(session.maxContextMessages)}" style="max-width: 8rem;" />
          </label>
          <div style="display:flex; align-items:center; gap:.5rem; border-left: 1px solid rgba(255,255,255,0.12); padding-left:.75rem;">
            <span style="opacity:.85;">Retries</span>
            <input id="rpg-lite-retry-limit" class="rpg-lite-input" type="number" min="1" step="1"
                   value="${session.retryLimit ?? 10}" style="max-width: 4.5rem;"${session.retryLimit === null ? ' disabled' : ''} />
            <label style="display:flex; align-items:center; gap:.25rem; cursor:pointer; user-select:none;" title="Unlimited retries">
              <input type="checkbox" id="rpg-lite-retry-unlimited"${session.retryLimit === null ? ' checked' : ''} />
              <span style="opacity:.85;">∞</span>
            </label>
            <span id="rpg-lite-retries-remaining" class="rpg-lite-retries-remaining${session.retryLimit !== null && session.retriesUsed! >= session.retryLimit! ? ' rpg-lite-retries-exhausted' : ''}">
              ${session.retryLimit === null ? '∞' : String(Math.max(0, session.retryLimit - session.retriesUsed!))} left
            </span>
            <button id="rpg-lite-retry-reset" class="rpg-lite-btn rpg-lite-btn-sm" title="Reset retry counter">↺</button>
          </div>
          <button id="rpg-lite-save-session" class="rpg-lite-btn">Save Session</button>
          <button id="rpg-lite-close" class="rpg-lite-btn">Close</button>
        </div>
      </div>
      <div class="rpg-lite-body">
        <div class="rpg-lite-sidebar" id="rpg-lite-sidebar">
          <div class="rpg-lite-section-title">Active Sessions</div>
          <div class="rpg-lite-list" id="rpg-lite-session-list"></div>
          
          <div style="text-align: center; opacity: 0.5; font-size: 0.85rem; margin: 0.75rem 0;">or restart from template</div>
          
          <div class="rpg-lite-section-title">Templates</div>
          <div class="rpg-lite-list" id="rpg-lite-preset-list-session"></div>
        </div>
        <div class="rpg-lite-resize-handle" id="rpg-lite-resize-left" title="Drag to resize"></div>
        <div class="rpg-lite-main">
          <div class="rpg-lite-editors" id="rpg-lite-editors-panel">
            <div class="rpg-lite-editors-header">
              <button id="rpg-lite-toggle-editors" class="rpg-lite-btn rpg-lite-btn-sm" title="Toggle settings">
                <span id="rpg-lite-editors-toggle-icon">▼</span> Settings
              </button>
            </div>
            <div id="rpg-lite-editors-content" class="rpg-lite-editors-content" style="display: none;">
              <div class="rpg-lite-editor">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                  <div class="rpg-lite-section-title">System Prompt</div>
                  <span style="font-size: 0.8rem; opacity: 0.7;">
                    Available: <code style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 3px;">{{noise_names}}</code>
                  </span>
                </div>
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
            <textarea id="rpg-lite-input" class="rpg-lite-textarea" placeholder="${session.conversation.length === 0 ? 'Press Send to start, or type your first message...' : 'Your message...'}"></textarea>
            <button id="rpg-lite-send" class="rpg-lite-btn rpg-lite-btn-primary">Send</button>
            <button id="rpg-lite-abort" class="rpg-lite-btn rpg-lite-btn-danger" style="display: none;">Abort</button>
          </div>
        </div>
        <div class="rpg-lite-resize-handle" id="rpg-lite-resize-right" title="Drag to resize"></div>
        <div class="rpg-lite-right-sidebar" id="rpg-lite-right-sidebar">
          <div class="rpg-lite-right-sidebar-top">
            <div class="rpg-lite-section-title">Quick Actions</div>
            <div class="rpg-lite-action-buttons-list" id="rpg-lite-action-buttons-list"></div>
            <button id="rpg-lite-add-action-button" class="rpg-lite-btn rpg-lite-btn-sm" style="width: 100%; margin-top: 0.5rem;">
              + New Action
            </button>
          </div>
          <div class="rpg-lite-right-sidebar-bottom">
            <div class="rpg-lite-section-title">Clipboard</div>
            <textarea id="rpg-lite-clipboard" class="rpg-lite-clipboard-textarea" placeholder="Add GM answers here for reference...">${session.clipboard ?? ''}</textarea>
          </div>
        </div>
      </div>
    `;

    (this.container.querySelector('#rpg-lite-close') as HTMLButtonElement).addEventListener('click', () => {
      // Abort any in-progress stream first: tearing down the modal removes the
      // messages container, and an orphaned stream would keep firing DOM updates
      // (throwing "container not found") and consuming the API in the background.
      this.abortStreamingIfActive();
      this.modalEl?.remove();
      this.modalEl = null;
    });

    (this.container.querySelector('#rpg-lite-home') as HTMLButtonElement).addEventListener('click', () => {
      // Same reason as Close: navigating back to the selector replaces the
      // session screen (and its messages container), so the stream must stop.
      this.abortStreamingIfActive();
      void this.loadAll().then(() => { this.renderSelector(); });
    });

    (this.container.querySelector('#rpg-lite-title-display') as HTMLElement).addEventListener('click', () => {
      void this.editSessionTitle();
    });

    const purposeSelect = this.container.querySelector('#rpg-lite-purpose') as HTMLSelectElement;
    const modelNameEl = this.container.querySelector('#rpg-lite-model-name') as HTMLElement;
    purposeSelect.value = session.narratorPurpose;
    purposeSelect.addEventListener('change', () => {
      session.narratorPurpose = purposeSelect.value as RPGLiteModelPurpose;
      const ms = state.getModelSelector();
      const models = ms?.getSelectedModels() ?? {};
      modelNameEl.textContent = models[session.narratorPurpose] ?? 'Not configured';
      void this.saveSession();
    });

    const temperatureSlider = this.container.querySelector('#rpg-lite-temperature') as HTMLInputElement;
    const temperatureValue = this.container.querySelector('#rpg-lite-temperature-value') as HTMLElement;
    temperatureSlider.addEventListener('input', () => {
      const temp = parseFloat(temperatureSlider.value);
      session.temperature = temp;
      temperatureValue.textContent = temp.toFixed(1);
      temperatureSlider.title = `Temperature: ${temp.toFixed(1)}`;
      void this.saveSession();
    });

    const maxContextEl = this.container.querySelector('#rpg-lite-max-context-session') as HTMLInputElement;
    maxContextEl.value = String(session.maxContextMessages);
    maxContextEl.addEventListener('input', () => {
      const normalized = Math.max(2, Math.floor(Number(maxContextEl.value)));
      session.maxContextMessages = normalized;
      void this.saveSession().then(() => this.updateContextStats());
    });

    const retryLimitInput = this.container.querySelector('#rpg-lite-retry-limit') as HTMLInputElement;
    const retryUnlimitedCheckbox = this.container.querySelector('#rpg-lite-retry-unlimited') as HTMLInputElement;

    retryUnlimitedCheckbox.addEventListener('change', () => {
      if (retryUnlimitedCheckbox.checked) {
        session.retryLimit = null;
        retryLimitInput.disabled = true;
      } else {
        const limit = Math.max(1, Math.floor(Number(retryLimitInput.value) || 10));
        session.retryLimit = limit;
        retryLimitInput.disabled = false;
      }
      this.updateRetriesDisplay();
      void this.saveSession();
    });

    retryLimitInput.addEventListener('input', () => {
      if (session.retryLimit === null) return;
      const limit = Math.max(1, Math.floor(Number(retryLimitInput.value) || 1));
      session.retryLimit = limit;
      this.updateRetriesDisplay();
      void this.saveSession();
    });

    (this.container.querySelector('#rpg-lite-retry-reset') as HTMLButtonElement).addEventListener('click', () => {
      session.retriesUsed = 0;
      this.updateRetriesDisplay();
      this.renderConversation();
      void this.saveSession();
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

    const clipboardEl = this.container.querySelector('#rpg-lite-clipboard') as HTMLTextAreaElement;
    clipboardEl.addEventListener('input', () => {
      session.clipboard = clipboardEl.value;
      void this.saveSession();
    });

    const sendBtn = this.container.querySelector('#rpg-lite-send') as HTMLButtonElement;
    const abortBtn = this.container.querySelector('#rpg-lite-abort') as HTMLButtonElement;
    const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;

    sendBtn.addEventListener('click', () => {
      void this.sendNewUserMessage();
    });
    
    abortBtn.addEventListener('click', () => {
      this.abortStreamingIfActive();
    });
    
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendNewUserMessage();
      }
    });

    const addActionBtn = this.container.querySelector('#rpg-lite-add-action-button') as HTMLButtonElement;
    addActionBtn.addEventListener('click', () => {
      void this.showCreateActionButtonDialog();
    });

    this.renderSessionList();
    this.renderPresetListInSession();
    this.renderActionButtons();
    this.renderConversation();
    void this.updateContextStats();
    void this.initializeResizableLayout();

    inputEl.focus();
  }

  private async initializeResizableLayout(): Promise<void> {
    const body = this.container.querySelector('.rpg-lite-body') as HTMLElement;
    const leftSidebar = this.container.querySelector('#rpg-lite-sidebar') as HTMLElement;
    const rightSidebar = this.container.querySelector('#rpg-lite-right-sidebar') as HTMLElement;
    const leftHandle = this.container.querySelector('#rpg-lite-resize-left') as HTMLElement;
    const rightHandle = this.container.querySelector('#rpg-lite-resize-right') as HTMLElement;

    const storage = await StorageService.getInstance();

    const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
    const toPercent = (widthPx: number): number => (widthPx / body.offsetWidth) * 100;
    const applyLeftPercent = (pct: number): void => {
      const clamped = clamp(pct, 12, 40);
      const value = `${clamped.toFixed(2)}%`;
      leftSidebar.style.flex = `0 0 ${value}`;
      leftSidebar.style.width = value;
    };
    const applyRightPercent = (pct: number): void => {
      const clamped = clamp(pct, 12, 40);
      const value = `${clamped.toFixed(2)}%`;
      rightSidebar.style.flex = `0 0 ${value}`;
      rightSidebar.style.width = value;
    };

    // Load saved widths (current format: percent strings like "22.00%"; legacy format: px strings like "500px")
    const savedLeft = await storage.get<string>('rpg-lite-left-sidebar-width');
    const savedRight = await storage.get<string>('rpg-lite-right-sidebar-width');

    const parseSavedWidthPercent = (saved: string): number => {
      if (body.offsetWidth <= 0) throw new Error('Invalid layout: body width is 0.');

      const trimmed = saved.trim();
      if (trimmed.endsWith('%')) {
        const pct = Number(trimmed.slice(0, -1));
        if (Number.isNaN(pct)) throw new Error(`Invalid saved sidebar width: ${saved}`);
        return pct;
      }
      if (trimmed.endsWith('px')) {
        const px = Number(trimmed.slice(0, -2));
        if (Number.isNaN(px)) throw new Error(`Invalid saved sidebar width: ${saved}`);
        return (px / body.offsetWidth) * 100;
      }
      throw new Error(`Invalid saved sidebar width: ${saved}`);
    };

    if (savedLeft) {
      const pct = parseSavedWidthPercent(savedLeft);
      applyLeftPercent(pct);
      // Migrate legacy values to percent format so we never hit this path again.
      if (!savedLeft.trim().endsWith('%')) {
        await storage.set('rpg-lite-left-sidebar-width', leftSidebar.style.width);
      }
    }
    if (savedRight) {
      const pct = parseSavedWidthPercent(savedRight);
      applyRightPercent(pct);
      // Migrate legacy values to percent format so we never hit this path again.
      if (!savedRight.trim().endsWith('%')) {
        await storage.set('rpg-lite-right-sidebar-width', rightSidebar.style.width);
      }
    }

    // Left handle (between left sidebar and main)
    leftHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      leftHandle.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const startX = e.clientX;
      const startWidthPx = leftSidebar.getBoundingClientRect().width;

      const onMove = (ev: PointerEvent): void => {
        const deltaX = ev.clientX - startX;
        const newWidthPx = startWidthPx + deltaX;
        applyLeftPercent(toPercent(newWidthPx));
      };

      const onUp = (): void => {
        leftHandle.removeEventListener('pointermove', onMove);
        leftHandle.removeEventListener('pointerup', onUp);
        leftHandle.removeEventListener('pointercancel', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        void storage.set('rpg-lite-left-sidebar-width', leftSidebar.style.width);
      };

      leftHandle.addEventListener('pointermove', onMove);
      leftHandle.addEventListener('pointerup', onUp);
      leftHandle.addEventListener('pointercancel', onUp);
    });

    // Right handle (between main and right sidebar)
    rightHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      rightHandle.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const startX = e.clientX;
      const startWidthPx = rightSidebar.getBoundingClientRect().width;

      const onMove = (ev: PointerEvent): void => {
        const deltaX = startX - ev.clientX;
        const newWidthPx = startWidthPx + deltaX;
        applyRightPercent(toPercent(newWidthPx));
      };

      const onUp = (): void => {
        rightHandle.removeEventListener('pointermove', onMove);
        rightHandle.removeEventListener('pointerup', onUp);
        rightHandle.removeEventListener('pointercancel', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        void storage.set('rpg-lite-right-sidebar-width', rightSidebar.style.width);
      };

      rightHandle.addEventListener('pointermove', onMove);
      rightHandle.addEventListener('pointerup', onUp);
      rightHandle.addEventListener('pointercancel', onUp);
    });
  }

  private renderPresetListInSession(): void {
    const list = this.container.querySelector('#rpg-lite-preset-list-session') as HTMLElement | null;
    if (!list) return;

    if (this.presets.length === 0) {
      list.innerHTML = '<div style="opacity: 0.6; padding: 0.5rem; text-align: center; font-size: 0.85rem;">No templates</div>';
      return;
    }

    list.innerHTML = this.presets
      .map(p => this.generatePresetListItemHtml(p, { showSubtitle: false, itemClass: 'rpg-lite-list-item-compact' }))
      .join('');

    this.bindPresetListEvents(list);
  }

  private async updateContextStats(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    const statsEl = this.container.querySelector('#rpg-lite-context-stats-topbar') as HTMLElement | null;
    if (!statsEl) return;

    const { promptChars, messageCount } = await computeContextCharCount(this.currentSession);
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
    
    // Trace if called during streaming (this would explain the issue!)
    if (this.isStreaming) {
      console.warn('⚠️ [RPG Lite] renderConversation() called DURING STREAMING - this replaces the DOM and breaks incremental updates!', new Error().stack);
    }
    
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    messagesEl.innerHTML = '';

    for (const msg of this.currentSession.conversation) {
      messagesEl.appendChild(this.renderMessage(msg));
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    void this.updateContextStats();
  }

  private containsGraphicalContent(content: string): boolean {
    // Check for box-drawing characters (strong indicator of ASCII art)
    const hasBoxDrawing = /[─│┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║]/.test(content);
    
    // Check for repeated box-drawing or block characters (5+ in a row, not common chars)
    const hasRepeatedGraphicChars = /([─│┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║▀▄█▌▐░▒▓■□▪▫●○◆◇★☆♠♣♥♦])\1{4,}/.test(content);
    
    // Check for ASCII art table/box structure (multiple lines with box chars)
    const lines = content.split('\n');
    const linesWithBoxChars = lines.filter(l => /[─│┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║\+\|]/.test(l)).length;
    const hasAsciiArtStructure = linesWithBoxChars >= 3 && linesWithBoxChars / lines.length > 0.4;
    
    // Check for many emojis (8+ total or 5+ in short text)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiMatches = content.match(emojiRegex);
    const emojiCount = emojiMatches ? emojiMatches.length : 0;
    const hasMultipleEmojis = emojiCount >= 8 || (emojiCount >= 5 && content.length < 400);
    
    return hasBoxDrawing || hasRepeatedGraphicChars || hasAsciiArtStructure || hasMultipleEmojis;
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

    // Highlight complete XML elements with folding capability
    // Match opening tag, content, and closing tag as a unit
    // Use non-greedy matching to prevent runaway highlighting
    let foldId = 0;
    result = result.replace(
      /(&lt;([A-Za-z_][\w:\-\.]*)(?:\s+[^&]*?)?&gt;)([\s\S]*?)(&lt;\/\2&gt;)/g,
      (_match, openTag, tagName, content, closeTag) => {
        const id = `xml-fold-${foldId++}`;
        const isHidden = tagName.toLowerCase() === 'hidden';
        const foldedClass = isHidden ? ' xml-folded' : '';
        
        return `<span class="rpg-lite-xml-foldable${foldedClass}" data-fold-id="${id}">` +
          `<span class="rpg-lite-xml-fold-toggle" data-toggle-id="${id}">` +
          `<span class="rpg-lite-xml-fold-icon">${isHidden ? '▶' : '▼'}</span>` +
          `<span class="rpg-lite-xml-fold-tagname">${tagName}</span>` +
          `<span class="rpg-lite-highlight-xml-tag rpg-lite-xml-fold-open-tag">${openTag}</span>` +
          `</span>` +
          `<span class="rpg-lite-xml-fold-content" data-content-id="${id}">${content}</span>` +
          `<span class="rpg-lite-highlight-xml-tag">${closeTag}</span>` +
          `</span>`;
      }
    );

    // Highlight self-closing XML tags: <tag />
    result = result.replace(
      /(&lt;[A-Za-z_][\w:\-\.]*(?:\s+[^&]*?)?\/&gt;)/g,
      '<span class="rpg-lite-highlight-xml">$1</span>'
    );

    // Highlight JSON blocks (complete objects/arrays with content)
    // Constrain to not cross paragraph boundaries to prevent runaway highlighting
    result = result.replace(
      /(\{(?:(?!\n\n)[\s\S])*?\}|\[(?:(?!\n\n)[\s\S])*?\])/g,
      (match) => {
        // Only highlight if it looks like JSON (contains quotes/colons, reasonable structure)
        if ((match.includes('&quot;') || match.includes(':')) && match.length > 10) {
          return `<span class="rpg-lite-highlight-json">${match}</span>`;
        }
        return match;
      }
    );

    // Highlight direct speech (quoted text)
    // Matches straight quotes ("..."), curly double quotes ("\u201C...\u201D),
    // curly single quotes (\u2018...\u2019) and guillemets (\u00AB...\u00BB).
    // After escapeHtml, straight double quotes become &quot; while all unicode
    // variants remain as literal characters, so each needs its own open/close pair.
    // The body excludes the literal '<' character: at this point all original
    // text has been escaped (so a real '<' is now '&lt;'), meaning the only
    // literal '<' in the string belong to the XML/JSON highlight spans injected
    // above. Excluding it stops a quote match from spanning across those spans,
    // e.g. an unbalanced quote inside a folded <hidden> block must not pair with
    // the opening quote of the real speech that follows it.
    // Constrain to not cross paragraph boundaries to prevent hanging delimiter issues.
    const speechPatterns: RegExp[] = [
      /(&quot;(?:(?!\n\n)[^<])*?&quot;[,.\?!]?)/g,          // "straight"
      /(\u201C(?:(?!\n\n)[^<])*?\u201D[,.\?!]?)/g,           // \u201Ccurly\u201D
      /(\u2018(?:(?!\n\n)[^<])*?\u2019[,.\?!]?)/g,           // \u2018single curly\u2019
      /(\u00AB(?:(?!\n\n)[^<])*?\u00BB[,.\?!]?)/g,           // «guillemets»
    ];
    for (const pattern of speechPatterns) {
      result = result.replace(pattern, '<span class="rpg-lite-highlight-speech">$1</span>');
    }

    // First, normalize consecutive asterisks that are close together (treat as literal)
    // This prevents issues with patterns like "** text *" creating unclosed tags
    result = result.replace(/(\*{2,})/g, () => {
      // Replace with a single asterisk to prevent formatting confusion
      return '*';
    });

    // Highlight emphasis markers (bold **text** or italic *text*)
    // Bold: **text** (need at least 2 chars between)
    // Constrain to not cross paragraph boundaries (double newlines) to prevent runaway highlighting
    result = result.replace(
      /(\*\*(?:(?!\n\n)[^*]){2,}?\*\*)/g,
      '<span class="rpg-lite-highlight-emphasis">$1</span>'
    );

    // Highlight actions/narration in single asterisks *text*
    // Only match if there's proper pairing and at least 2 chars
    // Constrain to not cross paragraph boundaries (double newlines) to prevent runaway highlighting
    result = result.replace(
      /(?<!\*)(\*(?:(?!\n\n)[^*]){2,}?\*)(?!\*)/g,
      '<span class="rpg-lite-highlight-action">$1</span>'
    );

    // Highlight dice rolls (e.g., d20, 2d6, 1d100)
    result = result.replace(
      /(\b\d*d\d+(?:[+-]\d+)?\b)/gi,
      '<span class="rpg-lite-highlight-dice">$1</span>'
    );

    // Removed thought text highlighting (parentheses and em-dashes) - too noisy

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

    // Check if message has multiple versions
    const hasMultipleVersions = msg.versions && msg.versions.length > 1;
    const currentVersionIndex = msg.activeVersionIndex ?? 0;
    const versionCount = msg.versions?.length ?? 1;

    // Determine if retries are exhausted for this session
    const retryLimit = this.currentSession?.retryLimit ?? 10;
    const retriesUsed = this.currentSession?.retriesUsed ?? 0;
    const retriesExhausted = retryLimit !== null && retriesUsed >= retryLimit;
    const retryDisabled = retriesExhausted ? ' disabled title="Retry limit reached — reset the counter in the topbar"' : '';
    
    el.innerHTML = `
      <div class="rpg-lite-message-header">
        <div class="rpg-lite-message-role">${roleLabel}</div>
        <div class="rpg-lite-message-actions">
          ${hasMultipleVersions ? `
            <button class="rpg-lite-btn rpg-lite-btn-icon" data-action="prev-version" title="Previous version" ${currentVersionIndex === 0 ? 'disabled' : ''}>◀</button>
            <span class="rpg-lite-version-indicator">${currentVersionIndex + 1}/${versionCount}</span>
            <button class="rpg-lite-btn rpg-lite-btn-icon" data-action="next-version" title="Next version" ${currentVersionIndex === versionCount - 1 ? 'disabled' : ''}>▶</button>
          ` : ''}
          <button class="rpg-lite-btn rpg-lite-btn-sm" data-action="edit">Edit</button>
          ${msg.role === 'assistant' ? `<button class="rpg-lite-btn rpg-lite-btn-sm" data-action="retry"${retryDisabled}>Retry</button>` : ''}
          ${msg.role === 'assistant' ? `<button class="rpg-lite-btn rpg-lite-btn-icon" data-action="add-to-clipboard" title="Add to Clipboard">📋</button>` : ''}
        </div>
      </div>
      <div class="rpg-lite-message-content" data-role="content"></div>
      ${msg.images && msg.images.length > 0 ? '<div class="rpg-lite-message-images" data-role="images"></div>' : ''}
      <div class="rpg-lite-message-info">${infoParts.map(p => `<span>${p}</span>`).join('')}</div>
    `;

    const contentEl = el.querySelector('[data-role="content"]') as HTMLElement;
    
    // Check if content contains graphical elements (ASCII art, emojis)
    const isGraphical = this.containsGraphicalContent(msg.content);
    if (isGraphical) {
      contentEl.classList.add('rpg-lite-message-monospace');
    }
    
    // Apply syntax highlighting for assistant messages (but not during streaming)
    if (msg.role === 'assistant' && msg.id !== this.streamingMessageId) {
      contentEl.innerHTML = this.highlightContent(msg.content);
      // Add click handlers for XML folding
      this.attachXmlFoldHandlers(contentEl);
    } else {
      contentEl.textContent = msg.content;
    }

    // Render stored images
    if (msg.images && msg.images.length > 0) {
      const imagesContainer = el.querySelector('[data-role="images"]') as HTMLElement;
      for (const url of msg.images) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'rpg-lite-message-image';
        img.alt = 'Generated image';
        imagesContainer.appendChild(img);
      }
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
    
    const addToClipboardBtn = el.querySelector('[data-action="add-to-clipboard"]') as HTMLButtonElement | null;
    if (addToClipboardBtn) {
      addToClipboardBtn.addEventListener('click', () => {
        this.addToClipboard(msg.content);
      });
    }
    
    const prevVersionBtn = el.querySelector('[data-action="prev-version"]') as HTMLButtonElement | null;
    if (prevVersionBtn) {
      prevVersionBtn.addEventListener('click', () => {
        void this.switchToVersion(msg.id, -1);
      });
    }
    
    const nextVersionBtn = el.querySelector('[data-action="next-version"]') as HTMLButtonElement | null;
    if (nextVersionBtn) {
      nextVersionBtn.addEventListener('click', () => {
        void this.switchToVersion(msg.id, 1);
      });
    }

    return el;
  }

  private attachXmlFoldHandlers(container: HTMLElement): void {
    const toggles = container.querySelectorAll('.rpg-lite-xml-fold-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const foldId = (toggle as HTMLElement).dataset['toggleId'];
        if (!foldId) return;
        
        const foldable = container.querySelector(`[data-fold-id="${foldId}"]`) as HTMLElement;
        const icon = toggle.querySelector('.rpg-lite-xml-fold-icon');
        
        if (foldable && icon) {
          foldable.classList.toggle('xml-folded');
          const isFolded = foldable.classList.contains('xml-folded');
          icon.textContent = isFolded ? '▶' : '▼';
        }
      });
    });
  }

  private addToClipboard(content: string): void {
    if (!this.currentSession) throw new Error('No current session.');
    
    const clipboardEl = this.container.querySelector('#rpg-lite-clipboard') as HTMLTextAreaElement | null;
    if (!clipboardEl) return;
    
    // Append to clipboard with a separator if there's already content
    const separator = this.currentSession.clipboard?.trim() ? '\n\n---\n\n' : '';
    this.currentSession.clipboard = (this.currentSession.clipboard ?? '') + separator + content;
    
    clipboardEl.value = this.currentSession.clipboard;
    void this.saveSession();
    
    // Scroll to bottom of clipboard
    clipboardEl.scrollTop = clipboardEl.scrollHeight;
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
    
    // Set height based on content (approximate: 1.5rem per line, min 10rem, max 40rem)
    const lineCount = msg.content.split('\n').length;
    const estimatedHeight = Math.max(10, Math.min(40, lineCount * 1.5 + 2));
    textarea.style.minHeight = `${estimatedHeight}rem`;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '0.75rem';
    controls.style.flexWrap = 'wrap';
    controls.style.fontSize = '0.85rem';
    controls.style.opacity = '0.7';
    controls.style.alignItems = 'center';

    const hint = document.createElement('span');
    hint.textContent = 'Click outside to save, or';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'rpg-lite-btn rpg-lite-btn-sm';
    cancelBtn.textContent = 'Cancel';

    controls.appendChild(hint);
    controls.appendChild(cancelBtn);

    // For user messages, check if there's a next assistant message to retry
    if (msg.role === 'user') {
      const msgIdx = this.currentSession.conversation.findIndex((m) => m.id === messageId);
      const nextMsg = msgIdx >= 0 && msgIdx < this.currentSession.conversation.length - 1
        ? this.currentSession.conversation[msgIdx + 1]
        : null;
      
      if (nextMsg && nextMsg.role === 'assistant') {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'rpg-lite-btn rpg-lite-btn-sm rpg-lite-btn-primary';
        retryBtn.textContent = 'Retry Next Response';
        retryBtn.style.marginLeft = 'auto';
        
        retryBtn.addEventListener('click', () => {
          cancelled = true;
          msg.content = textarea.value;
          msg.editedAt = now();
          
          // Also update the active version if versions exist
          if (msg.versions && msg.versions.length > 0) {
            const activeIndex = msg.activeVersionIndex ?? 0;
            if (msg.versions[activeIndex]) {
              msg.versions[activeIndex]!.content = textarea.value;
            }
          }
          
          void this.saveSession().then(() => {
            this.renderConversation();
            void this.retryFromAssistant(nextMsg.id);
          });
        });
        
        controls.appendChild(retryBtn);
      }
    }

    contentEl.replaceWith(textarea);
    textarea.insertAdjacentElement('afterend', controls);
    textarea.focus();

    let cancelled = false;

    cancelBtn.addEventListener('click', () => {
      cancelled = true;
      this.renderConversation();
    });

    textarea.addEventListener('blur', () => {
      // Small delay to allow button clicks to register
      setTimeout(() => {
        if (!cancelled && document.activeElement !== textarea) {
          msg.content = textarea.value;
          msg.editedAt = now();
          
          // Also update the active version if versions exist
          if (msg.versions && msg.versions.length > 0) {
            const activeIndex = msg.activeVersionIndex ?? 0;
            if (msg.versions[activeIndex]) {
              msg.versions[activeIndex]!.content = textarea.value;
            }
          }
          
          void this.saveSession().then(() => { this.renderConversation(); });
        }
      }, 150);
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelled = true;
        this.renderConversation();
      }
    });
  }

  private async sendNewUserMessage(): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
    const text = inputEl.value.trim();
    
    // If conversation is empty and user sends empty message, generate opening
    if (text.length === 0) {
      if (this.currentSession.conversation.length === 0) {
        await this.generateOpeningMessage();
      }
      return;
    }
    
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

  private async switchToVersion(messageId: string, direction: number): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    
    const msg = this.currentSession.conversation.find((m) => m.id === messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    if (!msg.versions || msg.versions.length <= 1) return;
    
    const currentIndex = msg.activeVersionIndex ?? 0;
    const newIndex = currentIndex + direction;
    
    if (newIndex < 0 || newIndex >= msg.versions.length) return;
    
    // Switch to the new version
    msg.activeVersionIndex = newIndex;
    const version = msg.versions[newIndex];
    if (!version) throw new Error(`Version not found at index ${newIndex}`);
    
    msg.content = version.content;
    msg.createdAt = version.createdAt;
    
    // Conditionally assign generation to avoid exactOptionalPropertyTypes error
    if (version.generation) {
      msg.generation = version.generation;
    } else {
      delete msg.generation;
    }
    
    await this.saveSession();
    this.renderConversation();
  }

  private async retryFromAssistant(assistantMessageId: string): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');

    // Enforce retry limit
    const retryLimit = this.currentSession.retryLimit ?? 10;
    const retriesUsed = this.currentSession.retriesUsed ?? 0;
    if (retryLimit !== null && retriesUsed >= retryLimit) {
      alert(`Retry limit of ${retryLimit} reached. Reset the counter in the topbar to continue.`);
      return;
    }

    // Consume one retry
    this.currentSession.retriesUsed = retriesUsed + 1;
    this.updateRetriesDisplay();
    this.renderConversation(); // refresh button disabled state
    
    // Check if we're aborting an active stream before calling abort
    const wasStreaming = this.isStreaming;
    this.abortStreamingIfActive();
    
    // Wait a bit to ensure the abort operation is fully processed before manipulating DOM
    // This prevents streaming errors when retrying a stuck message
    if (wasStreaming) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const idx = this.currentSession.conversation.findIndex((m) => m.id === assistantMessageId);
    if (idx === -1) throw new Error(`Message not found: ${assistantMessageId}`);
    const assistantMsg = this.currentSession.conversation[idx];
    if (!assistantMsg) throw new Error(`Message not found: ${assistantMessageId}`);
    if (assistantMsg.role !== 'assistant') {
      throw new Error('Retry is only available for assistant messages.');
    }

    // Initialize versions array if it doesn't exist (migration for old messages)
    if (!assistantMsg.versions) {
      assistantMsg.versions = [{
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
        ...(assistantMsg.generation ? { generation: assistantMsg.generation } : {})
      }];
      assistantMsg.activeVersionIndex = 0;
    }

    // Save current version to versions array before generating a new one
    const currentVersionIndex = assistantMsg.activeVersionIndex ?? 0;
    assistantMsg.versions[currentVersionIndex] = {
      content: assistantMsg.content,
      createdAt: assistantMsg.createdAt,
      ...(assistantMsg.generation ? { generation: assistantMsg.generation } : {})
    };

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
      // Remove all messages after the one we're retrying, keep the message to be updated
      this.currentSession.conversation = this.currentSession.conversation.slice(0, idx + 1);
      // Reset the message content to prepare for new generation
      assistantMsg.content = '';
      await this.saveSession();
      this.renderConversation();
      await this.generateOpeningMessage(assistantMsg);
      return;
    }

    // Remove all messages after the one we're retrying, keep the message to be updated
    this.currentSession.conversation = this.currentSession.conversation.slice(0, idx + 1);
    // Reset the message content to prepare for new generation
    assistantMsg.content = '';
    await this.saveSession();
    this.renderConversation();

    await this.generateAssistantReply(assistantMsg);
  }

  private async generateOpeningMessage(existingMessage?: RPGLiteChatMessage): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const session = this.currentSession;
    let assistantMsg: RPGLiteChatMessage;
    
    if (existingMessage) {
      // Reuse existing message (for retry)
      assistantMsg = existingMessage;
      assistantMsg.content = '';
      delete assistantMsg.images;
    } else {
      // Create new message
      assistantMsg = {
        id: newId('rpg_lite_msg'),
        role: 'assistant',
        content: '',
        createdAt: now()
      };
      session.conversation.push(assistantMsg);
    }
    
    await this.saveSession();
    
    // OPTIMIZATION: Don't re-render the whole conversation (expensive in old sessions)
    // Just append the new message element directly.
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    if (messagesEl && !existingMessage) {
      messagesEl.appendChild(this.renderMessage(assistantMsg));
      // Scroll to the new message ONCE before streaming starts
      // This ensures it's visible so the browser will paint incremental updates
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      this.renderConversation();
    }

    // Force browser to paint the new message element AND the scroll position before streaming starts
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    this.isStreaming = true;
    this.streamingMessageId = assistantMsg.id;
    this.currentStreamingAbortRequested = false;
    this.currentStreamingOperationId = newId('rpg_lite_op');
    this.setComposerButtonsGenerating();

    const openingInstruction = getOpeningInstruction();
    let meta: RPGLiteMessageGenerationMeta | null = null;

    const openRouterMessages: OpenRouterMessage[] = [
      ...await buildContextMessages(session),
      { role: 'user', content: openingInstruction }
    ];

    const msgEl = messagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement;
    msgEl.classList.add('rpg-lite-message-streaming');
    this.addWaitingIndicator(msgEl);

    const opId = this.currentStreamingOperationId;
    if (!opId) throw new Error('Missing streaming operation id.');
    let chunkCount = 0;
    let imageCount = 0;
    const startTime = Date.now();
    let rafPending = false;
    let rafHandle: number | null = null;
    
    const updateDOM = () => {
      rafPending = false;
      rafHandle = null;

      // If streaming already ended (or a different message started streaming), do not touch the DOM.
      // Otherwise we may overwrite the highlighted HTML that is rendered on completion.
      if (!this.isStreaming) return;
      if (this.streamingMessageId !== assistantMsg.id) return;
      
      // IMPORTANT: Re-query the live DOM node each update.
      const liveMessagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement | null;
      if (!liveMessagesEl) throw new Error('RPG Lite streaming: messages container not found.');

      const liveMsgEl = liveMessagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement | null;
      if (!liveMsgEl) throw new Error(`RPG Lite streaming: message element not found: ${assistantMsg.id}`);

      const liveContentEl = liveMsgEl.querySelector('[data-role="content"]') as HTMLElement | null;
      if (!liveContentEl) throw new Error(`RPG Lite streaming: message content element missing: ${assistantMsg.id}`);

      liveContentEl.textContent = assistantMsg.content;
      // Auto-scroll to keep streaming content visible
      liveMessagesEl.scrollTop = liveMessagesEl.scrollHeight;
    };

    const streamOpts = await this.buildStreamingOptions(session);
    
    await this.openRouterClient.streamingChat(session.narratorPurpose, openRouterMessages, {
      onStart: () => {
        if (DEBUG_RPG_LITE_STREAMING) console.log('🎬 [RPG Lite Opening] Streaming started');
      },
      onChunk: (chunk: string) => {
        chunkCount++;
        assistantMsg.content += chunk;

        // Remove waiting indicator on first text chunk
        if (chunkCount === 1 && imageCount === 0) {
          this.removeWaitingIndicator(msgEl);
        }

        if (DEBUG_RPG_LITE_STREAMING) {
          const elapsed = Date.now() - startTime;
          console.log(
            `📦 [RPG Lite Opening] Chunk #${chunkCount} at ${elapsed}ms, chunk length: ${chunk.length}, total content: ${assistantMsg.content.length}`
          );
        }

        // Throttle DOM updates: only schedule ONE paint frame at a time
        // This ensures browser always has time to paint between updates
        if (!rafPending) {
          rafPending = true;
          rafHandle = requestAnimationFrame(updateDOM);
        }
      },
      onImages: (imageUrls: string[]) => {
        imageCount++;
        // Remove waiting indicator on first image if no text arrived yet
        if (imageCount === 1 && chunkCount === 0) {
          this.removeWaitingIndicator(msgEl);
        }
        assistantMsg.images ??= [];
        assistantMsg.images.push(...imageUrls);
        this.appendImagesToMessageEl(msgEl, imageUrls);
      },
      onMeta: (m) => {
        meta = mapCompletionMetaToGenerationMeta(session.narratorPurpose, m);
      },
      onComplete: async () => {
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        rafPending = false;

        if (DEBUG_RPG_LITE_STREAMING) {
          const elapsed = Date.now() - startTime;
          console.log(
            `✨ [RPG Lite Opening] Streaming complete at ${elapsed}ms, received ${chunkCount} chunks, final length: ${assistantMsg.content.length}`
          );
        }
        if (meta) {
          assistantMsg.generation = meta;
        }
        
        // Add this response as a new version
        assistantMsg.versions ??= [];
        assistantMsg.versions.push({
          content: assistantMsg.content,
          createdAt: now(),
          ...(assistantMsg.generation ? { generation: assistantMsg.generation } : {})
        });
        assistantMsg.activeVersionIndex = assistantMsg.versions.length - 1;
        
        await this.saveSession();
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        this.setComposerButtonsIdle();
        msgEl.classList.remove('rpg-lite-message-streaming');
        if (DEBUG_RPG_LITE_STREAMING) console.log('🎨 [RPG Lite Opening] Re-rendering with highlighting');
        // Re-render with highlighting now that streaming is complete
        this.renderConversation();
        const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
        inputEl.focus();
      },
      onError: (error: Error) => {
        console.error('❌ [RPG Lite Opening] Streaming error:', error);
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        rafPending = false;
        const wasAbort = this.currentStreamingAbortRequested && error.message.toLowerCase().includes('aborted');
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        this.setComposerButtonsIdle();
        msgEl.classList.remove('rpg-lite-message-streaming');
        if (wasAbort) return;
        console.error('RPG Lite narrator error:', error);
        alert(`Narrator error: ${error.message}`);
      }
    }, opId, undefined, streamOpts);
  }

  private async generateAssistantReply(existingMessage?: RPGLiteChatMessage): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const session = this.currentSession;
    let assistantMsg: RPGLiteChatMessage;
    
    if (existingMessage) {
      // Reuse existing message (for retry)
      assistantMsg = existingMessage;
      assistantMsg.content = '';
      delete assistantMsg.images;
    } else {
      // Create new message
      assistantMsg = {
        id: newId('rpg_lite_msg'),
        role: 'assistant',
        content: '',
        createdAt: now()
      };
      session.conversation.push(assistantMsg);
    }
    
    await this.saveSession();
    
    // OPTIMIZATION: Don't re-render the whole conversation (expensive in old sessions)
    // Just append the new message element directly.
    const messagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement;
    if (messagesEl && !existingMessage) {
      messagesEl.appendChild(this.renderMessage(assistantMsg));
      // Scroll to the new message ONCE before streaming starts
      // This ensures it's visible so the browser will paint incremental updates
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      this.renderConversation();
    }

    // Force browser to paint the new message element AND the scroll position before streaming starts
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    this.isStreaming = true;
    this.streamingMessageId = assistantMsg.id;
    this.currentStreamingAbortRequested = false;
    this.currentStreamingOperationId = newId('rpg_lite_op');
    this.setComposerButtonsGenerating();

    let meta: RPGLiteMessageGenerationMeta | null = null;
    const openRouterMessages = await buildContextMessages(session);
    void this.updateContextStats();
    const msgEl = messagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement;
    msgEl.classList.add('rpg-lite-message-streaming');
    this.addWaitingIndicator(msgEl);

    const opId = this.currentStreamingOperationId;
    if (!opId) throw new Error('Missing streaming operation id.');
    let chunkCount = 0;
    let imageCount = 0;
    const startTime = Date.now();
    let rafPending = false;
    let rafHandle: number | null = null;
    
    const updateDOM = () => {
      rafPending = false;
      rafHandle = null;

      // If streaming already ended (or a different message started streaming), do not touch the DOM.
      // Otherwise we may overwrite the highlighted HTML that is rendered on completion.
      if (!this.isStreaming) return;
      if (this.streamingMessageId !== assistantMsg.id) return;
      
      // IMPORTANT: Re-query the live DOM node each update.
      const liveMessagesEl = this.container.querySelector('#rpg-lite-messages') as HTMLElement | null;
      if (!liveMessagesEl) throw new Error('RPG Lite streaming: messages container not found.');

      const liveMsgEl = liveMessagesEl.querySelector(`[data-message-id="${assistantMsg.id}"]`) as HTMLElement | null;
      if (!liveMsgEl) throw new Error(`RPG Lite streaming: message element not found: ${assistantMsg.id}`);

      const liveContentEl = liveMsgEl.querySelector('[data-role="content"]') as HTMLElement | null;
      if (!liveContentEl) throw new Error(`RPG Lite streaming: message content element missing: ${assistantMsg.id}`);

      liveContentEl.textContent = assistantMsg.content;
      // Auto-scroll to keep streaming content visible
      liveMessagesEl.scrollTop = liveMessagesEl.scrollHeight;
    };

    const streamOpts = await this.buildStreamingOptions(session);
    
    await this.openRouterClient.streamingChat(session.narratorPurpose, openRouterMessages, {
      onStart: () => {
        if (DEBUG_RPG_LITE_STREAMING) console.log('🎬 [RPG Lite Reply] Streaming started');
      },
      onChunk: (chunk: string) => {
        chunkCount++;
        assistantMsg.content += chunk;

        // Remove waiting indicator on first text chunk
        if (chunkCount === 1 && imageCount === 0) {
          this.removeWaitingIndicator(msgEl);
        }

        if (DEBUG_RPG_LITE_STREAMING) {
          const elapsed = Date.now() - startTime;
          console.log(
            `📦 [RPG Lite Reply] Chunk #${chunkCount} at ${elapsed}ms, chunk length: ${chunk.length}, total content: ${assistantMsg.content.length}`
          );
        }

        // Throttle DOM updates: only schedule ONE paint frame at a time
        // This ensures browser always has time to paint between updates
        if (!rafPending) {
          rafPending = true;
          rafHandle = requestAnimationFrame(updateDOM);
        }
      },
      onImages: (imageUrls: string[]) => {
        imageCount++;
        // Remove waiting indicator on first image if no text arrived yet
        if (imageCount === 1 && chunkCount === 0) {
          this.removeWaitingIndicator(msgEl);
        }
        assistantMsg.images ??= [];
        assistantMsg.images.push(...imageUrls);
        this.appendImagesToMessageEl(msgEl, imageUrls);
      },
      onMeta: (m) => {
        meta = mapCompletionMetaToGenerationMeta(session.narratorPurpose, m);
      },
      onComplete: async () => {
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        rafPending = false;

        if (DEBUG_RPG_LITE_STREAMING) {
          const elapsed = Date.now() - startTime;
          console.log(
            `✨ [RPG Lite Reply] Streaming complete at ${elapsed}ms, received ${chunkCount} chunks, final length: ${assistantMsg.content.length}`
          );
        }
        if (meta) {
          assistantMsg.generation = meta;
        }
        
        // Add this response as a new version
        assistantMsg.versions ??= [];
        assistantMsg.versions.push({
          content: assistantMsg.content,
          createdAt: now(),
          ...(assistantMsg.generation ? { generation: assistantMsg.generation } : {})
        });
        assistantMsg.activeVersionIndex = assistantMsg.versions.length - 1;
        
        await this.saveSession();
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        this.setComposerButtonsIdle();
        msgEl.classList.remove('rpg-lite-message-streaming');
        if (DEBUG_RPG_LITE_STREAMING) console.log('🎨 [RPG Lite Reply] Re-rendering with highlighting');
        // Re-render with highlighting now that streaming is complete
        this.renderConversation();
        const inputEl = this.container.querySelector('#rpg-lite-input') as HTMLTextAreaElement;
        inputEl.focus();
      },
      onError: (error: Error) => {
        console.error('❌ [RPG Lite Reply] Streaming error:', error);
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        rafPending = false;
        const wasAbort = this.currentStreamingAbortRequested && error.message.toLowerCase().includes('aborted');
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.currentStreamingOperationId = null;
        this.currentStreamingAbortRequested = false;
        this.setComposerButtonsIdle();
        msgEl.classList.remove('rpg-lite-message-streaming');
        if (wasAbort) return;
        console.error('RPG Lite narrator error:', error);
        alert(`Narrator error: ${error.message}`);
      }
    }, opId, undefined, streamOpts);
  }
}

export async function openRPGLiteView(): Promise<void> {
  const container = document.createElement('div');
  const view = new RPGLiteView(container);
  await view.open();
}


