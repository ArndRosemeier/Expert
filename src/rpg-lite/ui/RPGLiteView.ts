import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import { StorageService } from '../../StorageService';
import { RPGLitePromptSplitService } from '../services/RPGLitePromptSplitService';
import { RPGLiteSummaryService } from '../services/RPGLiteSummaryService';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { SettingsManager } from '../../SettingsManager';
import { getPromptText } from '../../PromptManager';
import * as state from '../../state';
import {
  RPGLiteActionButton,
  RPGLiteChatMessage,
  RPGLiteMessageGenerationMeta,
  RPGLiteMilestone,
  RPGLiteModelPurpose,
  RPGLiteOpeningShake,
  RPGLiteSession,
  RPGLiteStartPreset,
  RPGLiteSummaryMode,
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

/** Parse a strict JSON array of non-empty strings from model output. */
function parseJsonStringArray(text: string): string[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model did not return a JSON array. Got: ${trimmed.slice(0, 2000)}`);
  }
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array.');
  }
  const strings = parsed
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim());
  if (strings.length === 0) {
    throw new Error('JSON array contained no usable strings.');
  }
  return strings;
}

/** Escape text for safe insertion into innerHTML. */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function queryHTMLElement(root: ParentNode, selector: string): HTMLElement | null {
  const el = root.querySelector(selector);
  return el instanceof HTMLElement ? el : null;
}

function queryHTMLButtonElement(root: ParentNode, selector: string): HTMLButtonElement | null {
  const el = root.querySelector(selector);
  return el instanceof HTMLButtonElement ? el : null;
}

function queryHTMLTextAreaElement(root: ParentNode, selector: string): HTMLTextAreaElement | null {
  const el = root.querySelector(selector);
  return el instanceof HTMLTextAreaElement ? el : null;
}

function requireHTMLElement(root: ParentNode, selector: string): HTMLElement {
  const el = queryHTMLElement(root, selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el;
}

function requireHTMLTextAreaElement(root: ParentNode, selector: string): HTMLTextAreaElement {
  const el = queryHTMLTextAreaElement(root, selector);
  if (!el) throw new Error(`Required textarea not found: ${selector}`);
  return el;
}

/**
 * Select the most recent milestone whose summary is still valid for the current
 * conversation length. A milestone is valid when it covers no more messages than
 * currently exist (coveredCount <= completedCount); the one with the largest
 * coveredCount wins. Returns null when summaries are absent.
 */
/** Whether periodical summaries are active for this session (any non-'off' mode). */
function summariesEnabled(session: RPGLiteSession): boolean {
  return session.summaryMode === 'lean' || session.summaryMode === 'full';
}

function latestValidMilestone(session: RPGLiteSession, completedCount: number): RPGLiteMilestone | null {
  if (!session.milestones || session.milestones.length === 0) return null;
  let best: RPGLiteMilestone | null = null;
  for (const m of session.milestones) {
    if (m.coveredCount <= completedCount && (!best || m.coveredCount > best.coveredCount)) {
      best = m;
    }
  }
  return best;
}

async function buildContextMessages(session: RPGLiteSession): Promise<OpenRouterMessage[]> {
  const messages: OpenRouterMessage[] = [];
  
  const settingsManager = await SettingsManager.getInstance();
  const expansionService = createPromptExpansionService(settingsManager);
  // Resolve {{selectonefrom …}} first, using the session's selectionSeed. The seed is
  // fixed for a playthrough, so the chosen options stay stable turn-to-turn (a scenario
  // pick won't contradict the already-written story); it is re-minted whenever the
  // opening is (re)generated, so retrying the first prompt reshuffles the picks.
  // Doing this before expandPrompt also guarantees the literal placeholder can never
  // reach the model (a raw placeholder would be "chosen" by the model, which strongly
  // favours the first listed option — primacy bias). Other placeholders like
  // {{noise_names}} stay raw and expand fresh every turn via expandPrompt.
  const systemWithSelections = expansionService.expandSelectOneFrom(session.systemPrompt, session.selectionSeed);
  const expandedSystemPrompt = expansionService.expandPrompt(systemWithSelections, {});
  const expandedPrefixContext = expansionService.expandSelectOneFrom(session.prefixContext, session.selectionSeed);

  messages.push({ role: 'system', content: expandedSystemPrompt });
  messages.push({
    role: 'user',
    content:
      `ADVENTURE CONTEXT (always in context, not the system prompt):\n` +
      `${expandedPrefixContext}`
  });

  // Only include messages that have content. Empty messages are in-flight placeholders
  // created before the model responds — including them sends a blank assistant turn to
  // the model, which corrupts the role sequence and can cause repeated responses.
  const completed = session.conversation.filter(m => m.content.trim().length > 0);

  const summariesOn = summariesEnabled(session);
  const milestone = summariesOn
    ? latestValidMilestone(session, completed.length)
    : null;

  // Window selection:
  // - Milestone present: everything up to coveredCount is carried by the summary,
  //   so the verbatim tail begins at coveredCount.
  // - Summaries on but no checkpoint reached yet: send every message verbatim.
  //   The first checkpoint at summaryInterval bounds this, so maxContextMessages
  //   is intentionally NOT applied here (it would silently drop un-summarized
  //   history that no summary covers yet).
  // - Summaries off: fall back to the last-N recency window (maxContextMessages).
  let startIdx: number;
  if (milestone) {
    startIdx = milestone.coveredCount;
  } else if (summariesOn) {
    startIdx = 0;
  } else {
    startIdx = Math.max(0, completed.length - session.maxContextMessages);
  }

  // The adventure context above is injected as a 'user' message. The conversation
  // starts with an assistant message (the opening), so the pattern is:
  //   assistant, user, assistant, user, …
  // If the slice cuts at an even-offset position it starts with a 'user' message,
  // creating consecutive user roles which confuses most LLMs.
  // Fix: step back one to include the preceding assistant message, keeping the pair intact.
  // This also guarantees the tail after the injected summary begins with an assistant turn.
  if (startIdx > 0 && completed[startIdx]?.role === 'user') {
    startIdx -= 1;
  }

  if (milestone) {
    messages.push({
      role: 'user',
      content:
        `STORY SO FAR (summary of earlier events, always in context):\n` +
        `${milestone.summary}`
    });
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

/**
 * Mint a fresh seed for {{selectonefrom …}} rolls. A session keeps one seed so its
 * picks stay stable turn-to-turn; a new seed is minted whenever the opening message is
 * (re)generated, which reshuffles the picks (e.g. when retrying the very first prompt).
 */
function newSelectionSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
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
  private summaryService: RPGLiteSummaryService;

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
    this.summaryService = new RPGLiteSummaryService(this.openRouterClient);
  }

  /** Default number of new messages that must accumulate past the last milestone before a new one is generated. */
  private static readonly DEFAULT_SUMMARY_INTERVAL = 25;
  /** Default summary mode for new templates and sessions started from templates. */
  private static readonly DEFAULT_TEMPLATE_SUMMARY_MODE: RPGLiteSummaryMode = 'lean';

  /**
   * Drop every milestone whose summary covers messages at or beyond `index`.
   * Called whenever history is mutated at `index` (retry, edit, version switch,
   * truncation) so a summary can never reflect content that no longer exists or
   * has changed. Milestones covering only messages[0 .. index-1] survive.
   */
  private invalidateMilestonesFrom(index: number): void {
    if (!this.currentSession?.milestones) return;
    this.currentSession.milestones = this.currentSession.milestones.filter(m => m.coveredCount <= index);
  }

  /**
   * After a turn completes, cut the next cumulative milestone when the message
   * count crosses an interval boundary (N, 2N, 3N, …). Each milestone folds the
   * previous summary with the messages since the last checkpoint and covers the
   * whole prefix up to that boundary; messages after it are sent verbatim.
   * This makes "summaries every N messages" literally true, independent of
   * maxContextMessages. Runs after the turn is rendered so it never blocks streaming.
   */
  private async maybeCreateMilestone(session: RPGLiteSession): Promise<void> {
    const mode = session.summaryMode ?? 'off';
    if (mode === 'off') return;

    const completed = session.conversation.filter(m => m.content.trim().length > 0);
    const interval = session.summaryInterval ?? RPGLiteView.DEFAULT_SUMMARY_INTERVAL;

    // The checkpoint sits at the largest interval multiple at or below the
    // current message count: floor(count / interval) * interval.
    const desiredCovered = Math.floor(completed.length / interval) * interval;
    if (desiredCovered === 0) return;

    session.milestones ??= [];
    const latest = latestValidMilestone(session, completed.length);
    const latestCovered = latest ? latest.coveredCount : 0;
    if (desiredCovered <= latestCovered) return;

    // 'lean' (rolling): fold the previous summary with only the new interval's
    //   messages — cheap, low-context-friendly, errors can compound.
    // 'full' (accurate): re-summarize every message up to the boundary from
    //   scratch — no drift, but processes the whole covered prefix each checkpoint.
    const latestSummary = latest ? latest.summary : '';
    const previousSummary = mode === 'full' ? '' : latestSummary;
    const sliceStart = mode === 'full' ? 0 : latestCovered;
    const newMessages = completed.slice(sliceStart, desiredCovered);
    if (newMessages.length === 0) return;

    const milestone = await this.summaryService.buildMilestone(
      session,
      previousSummary,
      newMessages,
      desiredCovered
    );
    session.milestones.push(milestone);
    await this.saveSession();
    void this.updateContextStats();
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
    const modelId = state.getModelSelector()?.getSelectedModels()[session.narratorPurpose];
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
    let imagesContainer = queryHTMLElement(msgEl, '[data-role="images"]');
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
    const messagesEl = queryHTMLElement(this.container, '#rpg-lite-messages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  private updateRetriesDisplay(): void {
    if (!this.currentSession) return;
    const session = this.currentSession;
    const remainingEl = queryHTMLElement(this.container, '#rpg-lite-retries-remaining');
    if (!remainingEl) return;
    const used = session.retriesUsed ?? 0;
    // null OR undefined (not yet initialized) both mean unlimited — the default.
    // A finite cap only applies when retryLimit is an explicit number.
    const unlimited = session.retryLimit === null || session.retryLimit === undefined;
    const limit = session.retryLimit ?? 0;
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
    // Migrate sessions persisted before selectionSeed existed: mint a stable seed once
    // so their {{selectonefrom …}} picks stay consistent instead of re-rolling per turn.
    for (const session of this.sessions) {
      if (typeof session.selectionSeed !== 'number') {
        session.selectionSeed = newSelectionSeed();
        await storage.saveRPGLiteSession(session);
      }
    }
    this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    this.presets = await storage.listRPGLiteStartPresets<RPGLiteStartPreset>();
    // Templates created before summaryMode existed stored no mode; lean is the intended default.
    for (const preset of this.presets) {
      if (preset.summaryMode === undefined) {
        preset.summaryMode = RPGLiteView.DEFAULT_TEMPLATE_SUMMARY_MODE;
        await storage.saveRPGLiteStartPreset(preset);
      }
    }
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
      this.renderNewSessionDialog(false);
    });

    const newTemplateBtn = this.container.querySelector('#rpg-lite-new-template') as HTMLButtonElement;
    newTemplateBtn.addEventListener('click', () => {
      this.renderNewSessionDialog(true);
    });

    this.renderSessionList();
    this.renderPresetList();
    this.bindPresetEditorEvents();
  }

  private renderSessionList(): void {
    const list = queryHTMLElement(this.container, '#rpg-lite-session-list');
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
    const list = queryHTMLElement(this.container, '#rpg-lite-action-buttons-list');
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

    const inputEl = queryHTMLTextAreaElement(this.container, '#rpg-lite-input');
    if (!inputEl) return;

    inputEl.value = button.text;
    inputEl.focus();
    
    // Automatically send the message
    void this.sendNewUserMessage();
  }

  private async showCreateActionButtonDialog(): Promise<void> {
    const inputEl = queryHTMLTextAreaElement(this.container, '#rpg-lite-input');
    const currentText = inputEl?.value.trim() ?? '';

    const result = await this.showActionButtonEditorModal({
      title: 'Create Action Button',
      labelValue: currentText.length > 0 ? currentText.substring(0, 20) : 'Action',
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

  private async showActionButtonEditorModal(options: {
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
    const list = queryHTMLElement(this.container, '#rpg-lite-preset-list');
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
      maxContextMessages: preset.maxContextMessages,
      shakeOpenings: preset.shakeOpenings ?? false,
      // Carry the source's summary mode; fall back to the lean default for legacy
      // templates that predate the setting.
      summaryMode: preset.summaryMode ?? RPGLiteView.DEFAULT_TEMPLATE_SUMMARY_MODE,
      ...(typeof preset.summaryInterval === 'number' ? { summaryInterval: preset.summaryInterval } : {})
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
    const presetSummaryMode = preset.summaryMode ?? RPGLiteView.DEFAULT_TEMPLATE_SUMMARY_MODE;
    const presetSummariesOn = presetSummaryMode !== 'off';

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
          <label style="display:flex; flex-direction:column; gap:0.35rem; min-width: 12rem;" title="Verbatim recency window used only when summaries are off. When summaries are on, the summary interval controls context instead.">
            <span class="rpg-lite-section-title">Max msgs</span>
            <input id="rpg-lite-preset-editor-max-context" class="rpg-lite-input" type="number" min="2" step="1" value="${String(preset.maxContextMessages)}"${presetSummariesOn ? ' disabled' : ''} />
            <span id="rpg-lite-preset-editor-max-context-note" style="opacity:.6; font-size:0.78rem; font-style:italic; ${presetSummariesOn ? '' : 'display:none;'}">controlled by summary interval</span>
          </label>
          <label style="display:flex; flex-direction:column; gap:0.35rem; min-width: 12rem;" title="When on, sessions started from this template shake up the opening with a random divergent direction (adds one quick brainstorming call per start).">
            <span class="rpg-lite-section-title">Shake openings</span>
            <label style="display:flex; align-items:center; gap:.4rem; cursor:pointer; height: 100%;">
              <input type="checkbox" id="rpg-lite-preset-editor-shake" ${preset.shakeOpenings ? 'checked' : ''} />
              <span style="opacity:.85;">Shake things up</span>
            </label>
          </label>
          <label style="display:flex; flex-direction:column; gap:0.35rem; min-width: 12rem;" title="Periodical 'story so far' summaries lighten LLM load. A checkpoint is cut every N messages: everything before the latest checkpoint is condensed, everything after is sent verbatim. Lean = cheap rolling summary (errors can drift). Full = re-summarize everything each checkpoint (accurate, costlier, needs more context).">
            <span class="rpg-lite-section-title">Summaries</span>
            <div style="display:flex; align-items:center; gap:.5rem; height: 100%;">
              <select id="rpg-lite-preset-editor-summary-mode" class="rpg-lite-select">
                <option value="off"${presetSummaryMode === 'off' ? ' selected' : ''}>Off</option>
                <option value="lean"${presetSummaryMode === 'lean' ? ' selected' : ''}>Lean (rolling)</option>
                <option value="full"${presetSummaryMode === 'full' ? ' selected' : ''}>Full (accurate)</option>
              </select>
              <span style="opacity:.85;">every</span>
              <input id="rpg-lite-preset-editor-summary-interval" class="rpg-lite-input" type="number" min="2" step="1" value="${String(preset.summaryInterval ?? RPGLiteView.DEFAULT_SUMMARY_INTERVAL)}" style="max-width: 4.5rem;"${presetSummariesOn ? '' : ' disabled'} />
              <span style="opacity:.85;">msgs</span>
            </div>
          </label>
        </div>

        <label style="display:flex; flex-direction:column; gap:0.35rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
            <span class="rpg-lite-section-title">System Prompt</span>
            <span style="font-size: 0.8rem; opacity: 0.7;">
              Available: <code style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 3px;">{{noise_names}}</code>
              <code style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 3px;" title="Picks one option at random. The pick stays fixed while you play and only reshuffles when the opening is (re)generated (e.g. retrying the first message). Use ; to separate (or , when there is no ;).">{{selectonefrom a;b;c}}</code>
            </span>
          </div>
          <textarea id="rpg-lite-preset-editor-system" class="rpg-lite-textarea rpg-lite-preset-editor-textarea">${preset.systemPrompt}</textarea>
        </label>

        <label style="display:flex; flex-direction:column; gap:0.35rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
            <span class="rpg-lite-section-title">Prefix Context</span>
            <span style="font-size: 0.8rem; opacity: 0.7;">
              Available: <code style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 3px;" title="Picks one option at random. The pick stays fixed while you play and only reshuffles when the opening is (re)generated (e.g. retrying the first message). Use ; to separate (or , when there is no ;).">{{selectonefrom a;b;c}}</code>
            </span>
          </div>
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

    const cancelBtn = queryHTMLButtonElement(this.container, '#rpg-lite-preset-editor-cancel');
    const saveBtn = queryHTMLButtonElement(this.container, '#rpg-lite-preset-editor-save');
    if (!cancelBtn || !saveBtn) return;

    cancelBtn.addEventListener('click', () => {
      this.editingPresetId = null;
      this.prefixContextHistory = [];
      this.renderSelector();
    });

    saveBtn.addEventListener('click', () => {
      void this.saveEditedPreset(preset.id);
    });

    const summaryModeEl = this.container.querySelector('#rpg-lite-preset-editor-summary-mode') as HTMLSelectElement;
    const summaryIntervalEl = this.container.querySelector('#rpg-lite-preset-editor-summary-interval') as HTMLInputElement;
    const presetMaxContextEl = this.container.querySelector('#rpg-lite-preset-editor-max-context') as HTMLInputElement;
    const presetMaxContextNoteEl = this.container.querySelector('#rpg-lite-preset-editor-max-context-note') as HTMLElement;
    summaryModeEl.addEventListener('change', () => {
      const on = summaryModeEl.value !== 'off';
      summaryIntervalEl.disabled = !on;
      presetMaxContextEl.disabled = on;
      presetMaxContextNoteEl.style.display = on ? '' : 'none';
    });

    // Prefix context refinement buttons
    const moreDetailsBtn = queryHTMLButtonElement(this.container, '#rpg-lite-prefix-more-details');
    const variationBtn = queryHTMLButtonElement(this.container, '#rpg-lite-prefix-variation');
    const backBtn = queryHTMLButtonElement(this.container, '#rpg-lite-prefix-back');

    if (moreDetailsBtn && variationBtn && backBtn) {
      moreDetailsBtn.addEventListener('click', () => {
        void this.refinePrefixContext('more-details');
      });

      variationBtn.addEventListener('click', () => {
        void this.refinePrefixContext('variation');
      });

      backBtn.addEventListener('click', () => {
        const prefixEl = queryHTMLTextAreaElement(this.container, '#rpg-lite-preset-editor-prefix');
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
    const shakeEl = this.container.querySelector('#rpg-lite-preset-editor-shake') as HTMLInputElement;
    const summaryModeEl = this.container.querySelector('#rpg-lite-preset-editor-summary-mode') as HTMLSelectElement;
    const summaryIntervalEl = this.container.querySelector('#rpg-lite-preset-editor-summary-interval') as HTMLInputElement;
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
    preset.shakeOpenings = shakeEl.checked;
    preset.summaryMode = summaryModeEl.value as RPGLiteSummaryMode;
    preset.summaryInterval = Math.max(2, Math.floor(Number(summaryIntervalEl.value) || RPGLiteView.DEFAULT_SUMMARY_INTERVAL));
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
    // Migrate sessions persisted before selectionSeed existed (see loadAll).
    if (typeof session.selectionSeed !== 'number') {
      session.selectionSeed = newSelectionSeed();
      await storage.saveRPGLiteSession(session);
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
      selectionSeed: newSelectionSeed(),
      narratorPurpose: preset.narratorPurpose ?? this.defaultNarratorPurpose,
      maxContextMessages: preset.maxContextMessages,
      shakeOpenings: preset.shakeOpenings ?? false,
      // Inherit the template's summary mode; fall back to the lean default for legacy
      // templates that predate the setting.
      summaryMode: preset.summaryMode ?? RPGLiteView.DEFAULT_TEMPLATE_SUMMARY_MODE,
      ...(typeof preset.summaryInterval === 'number' ? { summaryInterval: preset.summaryInterval } : {}),
      milestones: [],
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

  private renderNewSessionDialog(isTemplate: boolean): void {
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
                <label style="display:flex; gap:.4rem; align-items:center; cursor:pointer;" title="When on, the opening scene is nudged in a random direction to avoid the AI's default/clichéd scene. Adds one quick brainstorming call per start.">
                  <input type="checkbox" id="rpg-lite-shake-new" />
                  <span style="opacity:.85;">Shake things up</span>
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
    const prefixEl = queryHTMLTextAreaElement(this.container, '#rpg-lite-preset-editor-prefix');
    const statusEl = queryHTMLElement(this.container, '#rpg-lite-prefix-status');
    const moreDetailsBtn = queryHTMLButtonElement(this.container, '#rpg-lite-prefix-more-details');
    const variationBtn = queryHTMLButtonElement(this.container, '#rpg-lite-prefix-variation');
    const backBtn = queryHTMLButtonElement(this.container, '#rpg-lite-prefix-back');

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
    const shakeEl = this.container.querySelector('#rpg-lite-shake-new') as HTMLInputElement;
    const statusEl = this.container.querySelector('#rpg-lite-status') as HTMLElement;
    const btn = this.container.querySelector('#rpg-lite-analyze') as HTMLButtonElement;

    const adventurePrompt = promptEl.value.trim();
    if (adventurePrompt.length === 0) {
      alert('Please enter an adventure prompt.');
      return;
    }

    const maxContext = Math.max(2, Math.floor(Number(maxContextEl.value)));
    const narratorPurpose = purposeEl.value as RPGLiteModelPurpose;
    const shakeOpenings = shakeEl.checked;

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
        maxContextMessages: maxContext,
        shakeOpenings,
        // Lean summaries are the economical default for new templates.
        summaryMode: RPGLiteView.DEFAULT_TEMPLATE_SUMMARY_MODE
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
        selectionSeed: newSelectionSeed(),
        narratorPurpose,
        maxContextMessages: maxContext,
        shakeOpenings,
        // Lean summaries are the economical default for new sessions.
        summaryMode: RPGLiteView.DEFAULT_TEMPLATE_SUMMARY_MODE,
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

    // Initialize temperature if not set
    session.temperature ??= 1.0;

    // Initialize the per-session "Shake things up" flag if not set (default: off)
    session.shakeOpenings ??= false;

    // Initialize retry fields if not set (default: unlimited retries, 0 used)
    if (session.retryLimit === undefined) {
      session.retryLimit = null;
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
          <button id="rpg-lite-settings" class="rpg-lite-btn" title="Session settings (narrator, temperature, context, summaries, retries)">⚙️ Settings</button>
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

    (this.container.querySelector('#rpg-lite-settings') as HTMLButtonElement).addEventListener('click', () => {
      this.showSessionSettingsModal();
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
      void this.saveSession().then(async () => this.updateContextStats());
    });

    const prefixEl = this.container.querySelector('#rpg-lite-prefix') as HTMLTextAreaElement;
    prefixEl.value = session.prefixContext;
    prefixEl.addEventListener('input', () => {
      session.prefixContext = prefixEl.value;
      void this.saveSession().then(async () => this.updateContextStats());
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
    const list = queryHTMLElement(this.container, '#rpg-lite-preset-list-session');
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
    const statsEl = queryHTMLElement(this.container, '#rpg-lite-context-stats-topbar');
    if (!statsEl) return;

    // "msgs" reflects the conversation's content messages (the same count that
    // drives summarization), NOT the LLM payload length. "chars" still reflects
    // the actual context payload size so the effect of an active summary is
    // visible (the story grows while the payload stays lean).
    const { promptChars } = await computeContextCharCount(this.currentSession);
    const completedCount = this.currentSession.conversation.filter(m => m.content.trim().length > 0).length;
    let text = `📊 ${promptChars.toLocaleString()} chars · ${completedCount} msgs`;
    if (summariesEnabled(this.currentSession)) {
      const milestone = latestValidMilestone(this.currentSession, completedCount);
      const modeLabel = this.currentSession.summaryMode === 'full' ? 'full' : 'lean';
      text += milestone
        ? ` · 🧭 summary covers ${milestone.coveredCount} msgs (${modeLabel})`
        : ` · 🧭 summaries on (${modeLabel})`;
    }
    statsEl.textContent = text;
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

    const clonedMilestones: RPGLiteMilestone[] = (base.milestones ?? []).map((m) => ({
      id: newId('rpg_lite_milestone'),
      coveredCount: m.coveredCount,
      summary: m.summary,
      createdAt: m.createdAt,
      ...(m.generation ? { generation: { ...m.generation } } : {})
    }));

    const newSession: RPGLiteSession = {
      id: newId('rpg_lite_session'),
      title: finalTitle,
      createdAt: now(),
      updatedAt: now(),
      systemPrompt: base.systemPrompt,
      prefixContext: base.prefixContext,
      selectionSeed: base.selectionSeed,
      narratorPurpose: base.narratorPurpose,
      maxContextMessages: base.maxContextMessages,
      shakeOpenings: base.shakeOpenings ?? false,
      summaryMode: base.summaryMode ?? 'off',
      ...(typeof base.summaryInterval === 'number' ? { summaryInterval: base.summaryInterval } : {}),
      milestones: clonedMilestones,
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

    // Determine where the active summary boundary sits: the first message NOT
    // covered by the latest valid milestone. A marker is rendered just above it
    // so the player can see that everything earlier is condensed into a summary
    // in the model's context (the visible transcript itself is unchanged).
    const session = this.currentSession;
    const completedCount = session.conversation.filter(m => m.content.trim().length > 0).length;
    const activeMilestone = summariesEnabled(session)
      ? latestValidMilestone(session, completedCount)
      : null;
    const markerAt = activeMilestone && activeMilestone.coveredCount < completedCount
      ? activeMilestone.coveredCount
      : -1;

    let completedIndex = 0;
    for (const msg of session.conversation) {
      const hasContent = msg.content.trim().length > 0;
      if (hasContent && completedIndex === markerAt && activeMilestone) {
        messagesEl.appendChild(this.renderMilestoneMarker(activeMilestone));
      }
      messagesEl.appendChild(this.renderMessage(msg));
      if (hasContent) completedIndex += 1;
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    void this.updateContextStats();
  }

  /**
   * A boundary marker shown above the first message that is NOT covered by the
   * active milestone summary. Everything above the marker is represented to the
   * model by the "story so far" summary; messages below are sent verbatim.
   */
  private renderMilestoneMarker(milestone: RPGLiteMilestone): HTMLElement {
    const el = document.createElement('div');
    el.className = 'rpg-lite-milestone-marker';
    el.dataset['role'] = 'milestone-marker';
    el.title =
      `Summary checkpoint: the earlier ${milestone.coveredCount} messages are condensed into a ` +
      `"story so far" summary in the model's context. Messages below this line are sent verbatim. ` +
      `Click to view the summary.`;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '0.75rem';
    el.style.width = '100%';
    el.style.margin = '0.85rem 0';
    el.style.opacity = '0.7';
    el.style.userSelect = 'none';
    el.style.cursor = 'pointer';
    el.innerHTML =
      `<span style="flex:1 1 auto; height:0; border-top:1px dashed currentColor; opacity:.5;"></span>` +
      `<span style="flex:0 0 auto; font-size:0.78rem; white-space:nowrap; padding:0.15rem 0.6rem; border:1px solid currentColor; border-radius:1rem;">` +
      `📜 Summary checkpoint · earlier ${milestone.coveredCount} messages condensed · 🔍 view` +
      `</span>` +
      `<span style="flex:1 1 auto; height:0; border-top:1px dashed currentColor; opacity:.5;"></span>`;
    el.addEventListener('click', () => { this.showMilestoneSummaryModal(milestone); });
    return el;
  }

  /**
   * Read-only modal that displays a milestone's "story so far" summary plus its
   * generation metadata. Purely a debugging/inspection aid so summarization
   * problems (drift, omissions, hallucinations) can be spotted directly.
   */
  private showMilestoneSummaryModal(milestone: RPGLiteMilestone): void {
    const overlay = document.createElement('div');
    overlay.className = 'rpg-lite-action-editor-overlay';
    overlay.innerHTML = `
      <div class="rpg-lite-action-editor-modal">
        <div class="rpg-lite-action-editor-header">
          <h3>Story-so-far summary</h3>
          <button class="rpg-lite-action-editor-close" title="Close">✕</button>
        </div>
        <div class="rpg-lite-action-editor-body">
          <div style="font-size:0.82rem; opacity:0.75; line-height:1.5;" data-role="meta"></div>
          <div class="rpg-lite-action-editor-field">
            <label>Summary text (read-only)</label>
            <textarea class="rpg-lite-textarea rpg-lite-action-editor-textarea" readonly data-role="summary"></textarea>
          </div>
        </div>
        <div class="rpg-lite-action-editor-footer">
          <button class="rpg-lite-btn rpg-lite-btn-secondary" data-role="copy">Copy</button>
          <button class="rpg-lite-btn rpg-lite-btn-primary" data-role="close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const metaEl = overlay.querySelector('[data-role="meta"]') as HTMLElement;
    const summaryEl = overlay.querySelector('[data-role="summary"]') as HTMLTextAreaElement;
    const headerCloseBtn = overlay.querySelector('.rpg-lite-action-editor-close') as HTMLButtonElement;
    const footerCloseBtn = overlay.querySelector('[data-role="close"]') as HTMLButtonElement;
    const copyBtn = overlay.querySelector('[data-role="copy"]') as HTMLButtonElement;

    summaryEl.value = milestone.summary;

    const metaParts = [
      `Covers first ${milestone.coveredCount} messages`,
      `created ${new Date(milestone.createdAt).toLocaleString()}`
    ];
    const gen = milestone.generation;
    if (gen) {
      metaParts.push(`model ${gen.model}`);
      metaParts.push(`${gen.completionChars.toLocaleString()} chars`);
      if (typeof gen.totalCostUsd === 'number') {
        metaParts.push(`$${gen.totalCostUsd.toFixed(4)}`);
      }
    }
    metaEl.textContent = metaParts.join(' · ');

    const cleanup = () => { overlay.remove(); };
    headerCloseBtn.addEventListener('click', cleanup);
    footerCloseBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(milestone.summary);
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
    });
  }

  /** Human-readable description of what each summary mode does, shown in settings. */
  private summaryModeDescription(mode: RPGLiteSummaryMode): string {
    if (mode === 'lean') {
      return 'Rolling: each checkpoint folds the previous summary with only the newest messages. ' +
        'Cheapest and works on low-context models, but summary errors can compound over time.';
    }
    if (mode === 'full') {
      return 'Accurate: each checkpoint re-summarizes the entire story so far from scratch. ' +
        'No drift, but costs more per checkpoint and needs a model that can hold the whole covered history.';
    }
    return 'No summaries. Only the last N messages (Max msgs) are sent to the model; older messages are dropped.';
  }

  /**
   * Session settings modal: houses the per-session configuration that used to
   * crowd the topbar (narrator model, temperature, context/summaries, retries).
   * All controls save live to the session.
   */
  private showSessionSettingsModal(): void {
    if (!this.currentSession) throw new Error('No current session.');
    const session = this.currentSession;

    const modelSelector = state.getModelSelector();
    const selectedModels = modelSelector?.getSelectedModels() ?? {};
    const modelName = selectedModels[session.narratorPurpose] ?? 'Not configured';

    const mode: RPGLiteSummaryMode = session.summaryMode ?? 'off';
    const summariesOn = mode !== 'off';
    const temperature = session.temperature ?? 1.0;
    const retryUnlimited = session.retryLimit === null;
    const retryLimitValue = session.retryLimit ?? 10;

    const overlay = document.createElement('div');
    overlay.className = 'rpg-lite-action-editor-overlay';
    overlay.innerHTML = `
      <div class="rpg-lite-action-editor-modal">
        <div class="rpg-lite-action-editor-header">
          <h3>Session settings</h3>
          <button class="rpg-lite-action-editor-close" title="Close">✕</button>
        </div>
        <div class="rpg-lite-action-editor-body">
          <div class="rpg-lite-action-editor-field">
            <label>Narrator model</label>
            <div style="display:flex; align-items:center; gap:.6rem;">
              <select id="rpg-lite-settings-purpose" class="rpg-lite-select">
                <option value="prose">Prose</option>
                <option value="creator">Creator</option>
                <option value="editor">Editor</option>
                <option value="rater">Rater</option>
              </select>
              <span id="rpg-lite-settings-model-name" style="opacity:.7; font-size:0.85rem;" title="Current model for this purpose">${modelName}</span>
            </div>
          </div>

          <div class="rpg-lite-action-editor-field">
            <label>Temperature: <span id="rpg-lite-settings-temp-value">${temperature.toFixed(1)}</span></label>
            <input id="rpg-lite-settings-temperature" type="range" min="0" max="2" step="0.1" value="${temperature}" style="width:100%;" />
          </div>

          <div class="rpg-lite-action-editor-field">
            <label>Summaries</label>
            <div style="display:flex; align-items:center; gap:.6rem; flex-wrap:wrap;">
              <select id="rpg-lite-settings-summary-mode" class="rpg-lite-select">
                <option value="off"${mode === 'off' ? ' selected' : ''}>Off</option>
                <option value="lean"${mode === 'lean' ? ' selected' : ''}>Lean (rolling)</option>
                <option value="full"${mode === 'full' ? ' selected' : ''}>Full (accurate)</option>
              </select>
              <span style="opacity:.85;">every</span>
              <input id="rpg-lite-settings-summary-interval" class="rpg-lite-input" type="number" min="2" step="1" value="${String(session.summaryInterval ?? RPGLiteView.DEFAULT_SUMMARY_INTERVAL)}" style="max-width:5rem;"${summariesOn ? '' : ' disabled'} />
              <span style="opacity:.85;">messages</span>
            </div>
            <div id="rpg-lite-settings-summary-desc" style="opacity:.7; font-size:0.82rem; line-height:1.5;">${this.summaryModeDescription(mode)}</div>
          </div>

          <div class="rpg-lite-action-editor-field">
            <label>Max messages (context window)</label>
            <div style="display:flex; align-items:center; gap:.6rem;">
              <input id="rpg-lite-settings-max-context" class="rpg-lite-input" type="number" min="2" step="1" value="${String(session.maxContextMessages)}" style="max-width:8rem;"${summariesOn ? ' disabled' : ''} />
              <span id="rpg-lite-settings-max-context-note" style="opacity:.6; font-size:0.8rem; font-style:italic; ${summariesOn ? '' : 'display:none;'}">controlled by summary interval</span>
            </div>
          </div>

          <div class="rpg-lite-action-editor-field">
            <label style="display:flex; align-items:center; gap:.5rem; cursor:pointer;">
              <input type="checkbox" id="rpg-lite-settings-shake"${session.shakeOpenings ? ' checked' : ''} />
              <span>Shake openings (random divergent opening direction; adds one brainstorming call)</span>
            </label>
          </div>

          <div class="rpg-lite-action-editor-field">
            <label>Retries</label>
            <div style="display:flex; align-items:center; gap:.6rem; flex-wrap:wrap;">
              <input id="rpg-lite-settings-retry-limit" class="rpg-lite-input" type="number" min="1" step="1" value="${retryLimitValue}" style="max-width:5rem;"${retryUnlimited ? ' disabled' : ''} />
              <label style="display:flex; align-items:center; gap:.35rem; cursor:pointer;" title="Unlimited retries">
                <input type="checkbox" id="rpg-lite-settings-retry-unlimited"${retryUnlimited ? ' checked' : ''} />
                <span>∞ unlimited</span>
              </label>
              <span id="rpg-lite-retries-remaining" class="rpg-lite-retries-remaining"></span>
              <button id="rpg-lite-settings-retry-reset" class="rpg-lite-btn rpg-lite-btn-sm" title="Reset retry counter">↺ reset</button>
            </div>
          </div>
        </div>
        <div class="rpg-lite-action-editor-footer">
          <button class="rpg-lite-btn rpg-lite-btn-primary" data-role="close">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const purposeSelect = overlay.querySelector('#rpg-lite-settings-purpose') as HTMLSelectElement;
    const modelNameEl = overlay.querySelector('#rpg-lite-settings-model-name') as HTMLElement;
    const tempSlider = overlay.querySelector('#rpg-lite-settings-temperature') as HTMLInputElement;
    const tempValueEl = overlay.querySelector('#rpg-lite-settings-temp-value') as HTMLElement;
    const summaryModeEl = overlay.querySelector('#rpg-lite-settings-summary-mode') as HTMLSelectElement;
    const summaryIntervalEl = overlay.querySelector('#rpg-lite-settings-summary-interval') as HTMLInputElement;
    const summaryDescEl = overlay.querySelector('#rpg-lite-settings-summary-desc') as HTMLElement;
    const maxContextEl = overlay.querySelector('#rpg-lite-settings-max-context') as HTMLInputElement;
    const maxContextNoteEl = overlay.querySelector('#rpg-lite-settings-max-context-note') as HTMLElement;
    const shakeEl = overlay.querySelector('#rpg-lite-settings-shake') as HTMLInputElement;
    const retryLimitEl = overlay.querySelector('#rpg-lite-settings-retry-limit') as HTMLInputElement;
    const retryUnlimitedEl = overlay.querySelector('#rpg-lite-settings-retry-unlimited') as HTMLInputElement;
    const retryResetBtn = overlay.querySelector('#rpg-lite-settings-retry-reset') as HTMLButtonElement;
    const headerCloseBtn = overlay.querySelector('.rpg-lite-action-editor-close') as HTMLButtonElement;
    const footerCloseBtn = overlay.querySelector('[data-role="close"]') as HTMLButtonElement;

    purposeSelect.value = session.narratorPurpose;
    this.updateRetriesDisplay();

    purposeSelect.addEventListener('change', () => {
      session.narratorPurpose = purposeSelect.value as RPGLiteModelPurpose;
      const models = state.getModelSelector()?.getSelectedModels() ?? {};
      modelNameEl.textContent = models[session.narratorPurpose] ?? 'Not configured';
      void this.saveSession();
    });

    tempSlider.addEventListener('input', () => {
      const temp = parseFloat(tempSlider.value);
      session.temperature = temp;
      tempValueEl.textContent = temp.toFixed(1);
      void this.saveSession();
    });

    summaryModeEl.addEventListener('change', () => {
      const newMode = summaryModeEl.value as RPGLiteSummaryMode;
      session.summaryMode = newMode;
      const on = newMode !== 'off';
      summaryIntervalEl.disabled = !on;
      maxContextEl.disabled = on;
      maxContextNoteEl.style.display = on ? '' : 'none';
      summaryDescEl.textContent = this.summaryModeDescription(newMode);
      void this.saveSession();
      void this.updateContextStats();
      this.renderConversation();
    });

    summaryIntervalEl.addEventListener('input', () => {
      session.summaryInterval = Math.max(2, Math.floor(Number(summaryIntervalEl.value) || RPGLiteView.DEFAULT_SUMMARY_INTERVAL));
      void this.saveSession();
    });

    maxContextEl.addEventListener('input', () => {
      session.maxContextMessages = Math.max(2, Math.floor(Number(maxContextEl.value)));
      void this.saveSession();
      void this.updateContextStats();
    });

    shakeEl.addEventListener('change', () => {
      session.shakeOpenings = shakeEl.checked;
      void this.saveSession();
    });

    retryUnlimitedEl.addEventListener('change', () => {
      if (retryUnlimitedEl.checked) {
        session.retryLimit = null;
        retryLimitEl.disabled = true;
      } else {
        session.retryLimit = Math.max(1, Math.floor(Number(retryLimitEl.value) || 10));
        retryLimitEl.disabled = false;
      }
      this.updateRetriesDisplay();
      void this.saveSession();
    });

    retryLimitEl.addEventListener('input', () => {
      if (session.retryLimit === null) return;
      session.retryLimit = Math.max(1, Math.floor(Number(retryLimitEl.value) || 1));
      this.updateRetriesDisplay();
      void this.saveSession();
    });

    retryResetBtn.addEventListener('click', () => {
      session.retriesUsed = 0;
      this.updateRetriesDisplay();
      this.renderConversation();
      void this.saveSession();
    });

    const cleanup = () => { overlay.remove(); };
    headerCloseBtn.addEventListener('click', cleanup);
    footerCloseBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });
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
      infoParts.push(`🤖 ${g.model}`);
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

    // Determine if retries are exhausted for this session (null/undefined = unlimited)
    const retryLimit = this.currentSession?.retryLimit ?? null;
    const retriesUsed = this.currentSession?.retriesUsed ?? 0;
    const retriesExhausted = retryLimit !== null && retriesUsed >= retryLimit;
    const retryDisabled = retriesExhausted ? ' disabled title="Retry limit reached — reset the counter in Settings"' : '';
    
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
      ${msg.openingShake ? `<div class="rpg-lite-opening-shake" data-role="opening-shake">${this.openingShakeInnerHtml(msg.openingShake)}</div>` : ''}
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
    
    const retryBtn = queryHTMLButtonElement(el, '[data-action="retry"]');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        void this.retryFromAssistant(msg.id);
      });
    }
    
    const addToClipboardBtn = queryHTMLButtonElement(el, '[data-action="add-to-clipboard"]');
    if (addToClipboardBtn) {
      addToClipboardBtn.addEventListener('click', () => {
        this.addToClipboard(msg.content);
      });
    }
    
    const prevVersionBtn = queryHTMLButtonElement(el, '[data-action="prev-version"]');
    if (prevVersionBtn) {
      prevVersionBtn.addEventListener('click', () => {
        void this.switchToVersion(msg.id, -1);
      });
    }
    
    const nextVersionBtn = queryHTMLButtonElement(el, '[data-action="next-version"]');
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
        const foldId = toggle instanceof HTMLElement ? toggle.dataset['toggleId'] : undefined;
        if (!foldId) return;
        
        const foldable = queryHTMLElement(container, `[data-fold-id="${foldId}"]`);
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
    
    const clipboardEl = queryHTMLTextAreaElement(this.container, '#rpg-lite-clipboard');
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
    const editIndex = this.currentSession.conversation.findIndex((m) => m.id === messageId);
    if (editIndex === -1) throw new Error(`Message not found: ${messageId}`);
    const msg = this.currentSession.conversation[editIndex];
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
              msg.versions[activeIndex].content = textarea.value;
            }
          }

          // The edited message's content changed, so drop summaries covering it or later.
          this.invalidateMilestonesFrom(editIndex);

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
              msg.versions[activeIndex].content = textarea.value;
            }
          }

          // The edited message's content changed, so drop summaries covering it or later.
          this.invalidateMilestonesFrom(editIndex);

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
    
    const msgIndex = this.currentSession.conversation.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) throw new Error(`Message not found: ${messageId}`);
    const msg = this.currentSession.conversation[msgIndex];
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

    // This message's content changed, so any summary covering it (or later) is stale.
    this.invalidateMilestonesFrom(msgIndex);

    await this.saveSession();
    this.renderConversation();
  }

  private async retryFromAssistant(assistantMessageId: string): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');

    // Enforce retry limit (null/undefined = unlimited)
    const retryLimit = this.currentSession.retryLimit ?? null;
    const retriesUsed = this.currentSession.retriesUsed ?? 0;
    if (retryLimit !== null && retriesUsed >= retryLimit) {
      alert(`Retry limit of ${retryLimit} reached. Reset the counter in Settings to continue.`);
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
      // Drop summaries that covered the regenerated message or anything after it.
      this.invalidateMilestonesFrom(idx);
      // Reset the message content to prepare for new generation
      assistantMsg.content = '';
      await this.saveSession();
      this.renderConversation();
      await this.generateOpeningMessage(assistantMsg);
      return;
    }

    // Remove all messages after the one we're retrying, keep the message to be updated
    this.currentSession.conversation = this.currentSession.conversation.slice(0, idx + 1);
    // Drop summaries that covered the regenerated message or anything after it.
    this.invalidateMilestonesFrom(idx);
    // Reset the message content to prepare for new generation
    assistantMsg.content = '';
    await this.saveSession();
    this.renderConversation();

    await this.generateAssistantReply(assistantMsg);
  }

  /**
   * Inner HTML for the distinct "Shake things up" brainstorm block shown on an
   * opening message. Passing null renders the transient "brainstorming…" state.
   */
  private openingShakeInnerHtml(shake: RPGLiteOpeningShake | null): string {
    if (!shake) {
      return `<div class="rpg-lite-opening-shake-title"><span class="rpg-lite-opening-shake-badge">🎲 Shake things up</span> brainstorming divergent opening directions…</div>`;
    }
    const items = shake.directions.map((d, i) => {
      const chosen = i === shake.chosenIndex;
      return `<li class="rpg-lite-opening-shake-item${chosen ? ' rpg-lite-opening-shake-chosen' : ''}">${escapeHtmlText(d)}</li>`;
    }).join('');
    return `<div class="rpg-lite-opening-shake-title"><span class="rpg-lite-opening-shake-badge">🎲 Shake things up</span> random opening direction — picked ${shake.chosenIndex + 1} of ${shake.directions.length}</div><ol class="rpg-lite-opening-shake-list">${items}</ol>`;
  }

  /**
   * Insert (or replace) the distinct opening-shake block above the message content.
   * Returns the block element so its contents can be swapped once brainstorming ends.
   */
  private showOpeningShakeBlock(msgEl: HTMLElement, shake: RPGLiteOpeningShake | null): HTMLElement {
    msgEl.querySelector('[data-role="opening-shake"]')?.remove();
    const block = document.createElement('div');
    block.className = `rpg-lite-opening-shake${shake ? '' : ' rpg-lite-opening-shake-loading'}`;
    block.dataset['role'] = 'opening-shake';
    block.innerHTML = this.openingShakeInnerHtml(shake);
    const contentEl = msgEl.querySelector('[data-role="content"]') as HTMLElement;
    msgEl.insertBefore(block, contentEl);
    return block;
  }

  /**
   * "Shake things up": brainstorm several divergent opening directions with the
   * creator model (seeded with fresh {{noise_opening}} entropy), then pick ONE at
   * random on the client. Returns the full brainstorm (directions + chosen index)
   * so it can be shown in the chat, or null if brainstorming failed (logged
   * loudly) so the opening still generates normally.
   */
  private async generateOpeningDirection(session: RPGLiteSession, operationId: string): Promise<RPGLiteOpeningShake | null> {
    const DIRECTION_COUNT = 6;
    try {
      const template = getPromptText('rpg_lite_opening_directions');
      const settingsManager = await SettingsManager.getInstance();
      const expansionService = createPromptExpansionService(settingsManager);

      // Fill user-provided placeholders literally, resolving {{selectonefrom …}} with the
      // session seed so the brainstorm is grounded in the same scenario picks the opening
      // will use, then expand {{noise_opening}} (and other global placeholders).
      const filled = template
        .split('{{system_prompt}}').join(expansionService.expandSelectOneFrom(session.systemPrompt, session.selectionSeed))
        .split('{{prefix_context}}').join(expansionService.expandSelectOneFrom(session.prefixContext, session.selectionSeed))
        .split('{{direction_count}}').join(String(DIRECTION_COUNT));
      const prompt = expansionService.expandPrompt(filled, {});

      const messages: OpenRouterMessage[] = [{ role: 'user', content: prompt }];

      let response = '';
      await this.openRouterClient.streamingChat('creator', messages, {
        onStart: () => {},
        onChunk: (chunk: string) => { response += chunk; },
        onComplete: () => {},
        onError: () => {}
      }, operationId);

      const directions = parseJsonStringArray(response);
      const chosenIndex = Math.floor(Math.random() * directions.length);
      void import('../../utils/UILogger').then(({ uiLogger }) => {
        uiLogger.info('RPG Lite: opening shaken up', `Picked ${chosenIndex + 1} of ${directions.length} directions: ${directions[chosenIndex]!}`);
      }).catch(() => {});
      return { directions, chosenIndex };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('RPG Lite: failed to brainstorm opening directions, proceeding without one:', error);
      void import('../../utils/UILogger').then(({ uiLogger }) => {
        uiLogger.warn('RPG Lite: opening entropy skipped', `Could not brainstorm opening directions: ${msg}`);
      }).catch(() => {});
      return null;
    }
  }

  private async generateOpeningMessage(existingMessage?: RPGLiteChatMessage): Promise<void> {
    if (!this.currentSession) throw new Error('No current session.');
    if (this.isStreaming) return;

    const session = this.currentSession;

    // Re-roll {{selectonefrom …}} picks for this playthrough: the opening is being
    // (re)generated, so a fresh seed reshuffles scenario choices. Retrying the first
    // prompt therefore yields a new selection without recreating the session, while
    // later turns reuse this seed and stay stable.
    session.selectionSeed = newSelectionSeed();

    let assistantMsg: RPGLiteChatMessage;
    
    if (existingMessage) {
      // Reuse existing message (for retry). Clear any prior opening-shake so the
      // retry starts fresh — a new brainstorm runs below when the setting is on.
      assistantMsg = existingMessage;
      assistantMsg.content = '';
      delete assistantMsg.images;
      delete assistantMsg.openingShake;
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
    const messagesEl = requireHTMLElement(this.container, '#rpg-lite-messages');
    if (!existingMessage) {
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

    const opId = this.currentStreamingOperationId;

    let openingInstruction = getOpeningInstruction();
    let meta: RPGLiteMessageGenerationMeta | null = null;

    const msgEl = requireHTMLElement(messagesEl, `[data-message-id="${assistantMsg.id}"]`);
    msgEl.classList.add('rpg-lite-message-streaming');
    this.addWaitingIndicator(msgEl);

    // "Shake things up" (per-session): if enabled, brainstorm divergent opening
    // directions, show them in the chat as a distinct block, and hand the randomly
    // chosen one to the narrator so openings don't collapse to the same default scene.
    if (session.shakeOpenings === true) {
      const shakeEl = this.showOpeningShakeBlock(msgEl, null);
      // The brainstorm shares this run's operation id so it is aborted together with
      // the opening (e.g. when the user hits Retry/Abort mid-brainstorm).
      const shake = await this.generateOpeningDirection(session, opId);
      // If this run was superseded while brainstorming (another Retry started, or it
      // was aborted), stop here and let the newer run own the message/DOM.
      if (this.currentStreamingOperationId !== opId) return;
      if (shake) {
        assistantMsg.openingShake = shake;
        await this.saveSession();
        shakeEl.classList.remove('rpg-lite-opening-shake-loading');
        shakeEl.innerHTML = this.openingShakeInnerHtml(shake);
        openingInstruction +=
          `\n\nOPENING DIRECTION (chosen at random to keep openings varied — use THIS approach for the opening, as long as it fits the established setting; never mention this instruction to the player):\n` +
          shake.directions[shake.chosenIndex]!;
      } else {
        shakeEl.remove();
      }
    }

    const openRouterMessages: OpenRouterMessage[] = [
      ...await buildContextMessages(session),
      { role: 'user', content: openingInstruction }
    ];

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
      const liveMessagesEl = queryHTMLElement(this.container, '#rpg-lite-messages');
      if (!liveMessagesEl) throw new Error('RPG Lite streaming: messages container not found.');

      const liveMsgEl = queryHTMLElement(liveMessagesEl, `[data-message-id="${assistantMsg.id}"]`);
      if (!liveMsgEl) throw new Error(`RPG Lite streaming: message element not found: ${assistantMsg.id}`);

      const liveContentEl = queryHTMLElement(liveMsgEl, '[data-role="content"]');
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
      onComplete: () => {
        void (async () => {
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
        requireHTMLTextAreaElement(this.container, '#rpg-lite-input').focus();
        await this.maybeCreateMilestone(session);
        })();
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
        // Clear the "thinking" animation so it does not stay stuck after an error/abort.
        this.removeWaitingIndicator(msgEl);
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
    const messagesEl = requireHTMLElement(this.container, '#rpg-lite-messages');
    if (!existingMessage) {
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
    const msgEl = requireHTMLElement(messagesEl, `[data-message-id="${assistantMsg.id}"]`);
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
      const liveMessagesEl = queryHTMLElement(this.container, '#rpg-lite-messages');
      if (!liveMessagesEl) throw new Error('RPG Lite streaming: messages container not found.');

      const liveMsgEl = queryHTMLElement(liveMessagesEl, `[data-message-id="${assistantMsg.id}"]`);
      if (!liveMsgEl) throw new Error(`RPG Lite streaming: message element not found: ${assistantMsg.id}`);

      const liveContentEl = queryHTMLElement(liveMsgEl, '[data-role="content"]');
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
      onComplete: () => {
        void (async () => {
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
        requireHTMLTextAreaElement(this.container, '#rpg-lite-input').focus();
        await this.maybeCreateMilestone(session);
        })();
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
        // Clear the "thinking" animation so it does not stay stuck after an error/abort.
        this.removeWaitingIndicator(msgEl);
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


