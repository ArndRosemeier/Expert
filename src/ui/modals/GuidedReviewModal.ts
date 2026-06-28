/**
 * GuidedReviewModal - chat-driven, multi-node reviewer.
 *
 * Operates on a node and (a selectable subset of) its descendant layers, letting
 * the user instruct an LLM to make sweeping, layer-consistent edits (rename a
 * character everywhere, fix cross-node continuity, tighten prose). Edits are
 * STAGED (never written directly): the model's node-addressed XML commands are
 * applied to an in-memory working copy that is persisted to IndexedDB for crash
 * recovery, previewed per node, and only written to the tree on Commit.
 *
 * WORKSPACE RULES: no defensive programming, strong typing, loud errors, and all
 * layout sizing in relative units filling the available space.
 */

import { SimpleModal } from './core/SimpleModal';
import type { ModalConfig } from './types/ModalTypes';
import { createElement, addEventListenerWithCleanup } from './core/modal-utils';
import { SettingsManager } from '../../SettingsManager';
import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import { ProjectManager } from '../../ProjectManager';
import { DocumentNode } from '../../DocumentNode';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { XmlEchoRenderer, XmlEchoResult } from '../shared/XmlEchoRenderer';
import { ReviewScope } from '../../review/ReviewScope';
import { ReviewContextBuilder } from '../../review/ReviewContextBuilder';
import { ReviewCommandParser } from '../../review/ReviewCommandParser';
import { ReviewStageApplier } from '../../review/ReviewStageApplier';
import { ReviewStageStore } from '../../review/ReviewStageStore';
import { ReviewCommitService } from '../../review/ReviewCommitService';
import {
    ReviewChatMessage,
    ReviewPurpose,
    ReviewSessionState,
    StagedNodeEdit
} from '../../review/ReviewTypes';

const REVIEW_PURPOSES: { key: ReviewPurpose; label: string }[] = [
    { key: 'creator', label: 'Creator' },
    { key: 'prose', label: 'Prose' },
    { key: 'editor', label: 'Editor' },
    { key: 'rater', label: 'Rater' }
];

export interface GuidedReviewModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    projectManager: ProjectManager;
    sourceNode: DocumentNode;
}

export class GuidedReviewModal extends SimpleModal {
    private readonly settingsManager: SettingsManager;
    private readonly openRouterClient: OpenRouterClient;
    private readonly projectManager: ProjectManager;
    private readonly sourceNode: DocumentNode;

    private selectedLevels: number[];
    private purpose: ReviewPurpose = 'creator';
    private conversation: ReviewChatMessage[] = [];
    private stagedEdits: StagedNodeEdit[] = [];
    private scope: ReviewScope;
    private isGenerating = false;
    // Cooperative stop flag, set by the Stop button to halt the current turn.
    private stopRequested = false;
    // Abort controller for the in-flight streaming request, so Stop / a stall
    // watchdog can cancel a request that hangs (e.g. OpenRouter overload).
    private currentAbortController: AbortController | null = null;
    // Safety net only: abort a request that goes this long with no streaming
    // activity. The primary recovery path is the manual Stop button.
    private static readonly STREAM_STALL_TIMEOUT_MS = 15 * 60 * 1000;

    // UI references
    private messagesContainer: HTMLElement | null = null;
    private messageInput: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private stopButton: HTMLButtonElement | null = null;
    private layersContainer: HTMLElement | null = null;
    private stagedContainer: HTMLElement | null = null;
    private sizeLabel: HTMLElement | null = null;
    private commitButton: HTMLButtonElement | null = null;

    constructor(config: GuidedReviewModalConfig) {
        super(
            {
                ...config,
                width: '92vw',
                height: '90vh',
                maxWidth: '92vw',
                maxHeight: '90vh',
                closable: false,
                backdrop: false
            }
        );
        this.settingsManager = config.settingsManager;
        this.openRouterClient = config.openRouterClient;
        this.projectManager = config.projectManager;
        this.sourceNode = config.sourceNode;

        const layers = ReviewScope.computeLayers(this.sourceNode);
        this.selectedLevels = layers.map(l => l.level);
        this.scope = new ReviewScope(this.sourceNode, this.selectedLevels);

        this.hooks = { onOpen: () => this.onOpened() };
    }

    public render(): HTMLElement {
        const root = createElement('div', {
            attributes: { style: 'display:flex;flex-direction:column;width:100%;height:100%;min-height:0;gap:0.75rem;' }
        });

        root.appendChild(this.renderHeader());
        root.appendChild(this.renderLayerBar());
        root.appendChild(this.renderBody());

        return root;
    }

    private renderHeader(): HTMLElement {
        const header = createElement('div', {
            attributes: { style: 'display:flex;align-items:center;justify-content:space-between;gap:1rem;flex:0 0 auto;' }
        });

        const titleWrap = createElement('div', {});
        const title = createElement('h2', {
            attributes: { style: 'margin:0;font-size:1.25rem;color:#111827;' },
            content: '🔎 Guided Reviewer'
        });
        const subtitle = createElement('div', {
            attributes: { style: 'font-size:0.8rem;color:#6b7280;margin-top:0.15rem;' },
            content: `Reviewing "${this.sourceNode.title}" and its subtree`
        });
        titleWrap.appendChild(title);
        titleWrap.appendChild(subtitle);

        const controls = createElement('div', {
            attributes: { style: 'display:flex;align-items:center;gap:0.75rem;' }
        });

        const purposeLabel = createElement('label', {
            attributes: { style: 'font-size:0.8rem;color:#374151;display:flex;align-items:center;gap:0.35rem;' },
            content: 'Model:'
        });
        const purposeSelect = createElement('select', {
            attributes: { style: 'padding:0.35rem 0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;' }
        });
        for (const p of REVIEW_PURPOSES) {
            const opt = createElement('option', { attributes: { value: p.key }, content: p.label });
            if (p.key === this.purpose) {
                opt.setAttribute('selected', 'selected');
            }
            purposeSelect.appendChild(opt);
        }
        addEventListenerWithCleanup(purposeSelect, 'change', () => {
            this.purpose = purposeSelect.value as ReviewPurpose;
            void this.persist();
        }, this.cleanupHandlers);
        purposeLabel.appendChild(purposeSelect);

        this.sizeLabel = createElement('div', {
            attributes: { style: 'font-size:0.75rem;color:#6b7280;' }
        });

        const closeButton = this.makeButton('Close', '#e5e7eb', '#111827');
        addEventListenerWithCleanup(closeButton, 'click', () => this.guardedClose(), this.cleanupHandlers);

        controls.appendChild(purposeLabel);
        controls.appendChild(this.sizeLabel);
        controls.appendChild(closeButton);

        header.appendChild(titleWrap);
        header.appendChild(controls);
        return header;
    }

    private renderLayerBar(): HTMLElement {
        const bar = createElement('div', {
            attributes: { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:0.75rem;padding:0.5rem 0.75rem;background:#f3f4f6;border-radius:8px;flex:0 0 auto;' }
        });
        const label = createElement('span', {
            attributes: { style: 'font-size:0.8rem;color:#374151;font-weight:600;' },
            content: 'Layers in scope:'
        });
        bar.appendChild(label);

        this.layersContainer = createElement('div', {
            attributes: { style: 'display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;' }
        });
        bar.appendChild(this.layersContainer);
        this.renderLayerCheckboxes();
        return bar;
    }

    private renderLayerCheckboxes(): void {
        if (!this.layersContainer) {
            return;
        }
        this.layersContainer.innerHTML = '';
        const layers = ReviewScope.computeLayers(this.sourceNode);
        const selected = new Set(this.selectedLevels);
        for (const layer of layers) {
            const wrap = createElement('label', {
                attributes: { style: 'display:flex;align-items:center;gap:0.35rem;font-size:0.8rem;color:#374151;cursor:pointer;' }
            });
            const checkbox = createElement('input', { attributes: { type: 'checkbox' } });
            if (selected.has(layer.level)) {
                checkbox.setAttribute('checked', 'checked');
            }
            addEventListenerWithCleanup(checkbox, 'change', () => this.onLayerToggle(layer.level, checkbox), this.cleanupHandlers);
            wrap.appendChild(checkbox);
            wrap.appendChild(document.createTextNode(`${layer.label} (${layer.nodeCount})`));
            this.layersContainer.appendChild(wrap);
        }
    }

    private renderBody(): HTMLElement {
        const body = createElement('div', {
            attributes: { style: 'display:flex;gap:0.75rem;flex:1 1 auto;min-height:0;' }
        });
        body.appendChild(this.renderChatColumn());
        body.appendChild(this.renderStagedColumn());
        return body;
    }

    private renderChatColumn(): HTMLElement {
        const column = createElement('div', {
            attributes: { style: 'display:flex;flex-direction:column;flex:2 1 0;min-width:0;min-height:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;' }
        });

        this.messagesContainer = createElement('div', {
            attributes: { style: 'flex:1 1 auto;min-height:0;overflow-y:auto;padding:0.75rem;background:#ffffff;display:flex;flex-direction:column;gap:0.6rem;' }
        });
        column.appendChild(this.messagesContainer);

        const inputRow = createElement('div', {
            attributes: { style: 'display:flex;gap:0.5rem;padding:0.6rem;border-top:1px solid #e5e7eb;background:#f9fafb;flex:0 0 auto;' }
        });
        this.messageInput = createElement('textarea', {
            attributes: {
                style: 'flex:1 1 auto;min-height:3rem;max-height:8rem;resize:vertical;padding:0.5rem;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:0.9rem;',
                placeholder: 'Discuss the text, or request a change (e.g. "Rename Elara to Mira everywhere, including context").'
            }
        });
        addEventListenerWithCleanup(this.messageInput, 'keydown', (e) => {
            const ev = e as KeyboardEvent;
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                void this.sendMessage();
            }
        }, this.cleanupHandlers);

        this.sendButton = this.makeButton('Send', '#2563eb', '#ffffff');
        addEventListenerWithCleanup(this.sendButton, 'click', () => void this.sendMessage(), this.cleanupHandlers);

        // Stop button: shown only while generating. It cancels the in-flight
        // request so a hung stream cannot lock the modal with no recovery.
        this.stopButton = this.makeButton('Stop', '#dc2626', '#ffffff');
        this.stopButton.style.display = 'none';
        addEventListenerWithCleanup(this.stopButton, 'click', () => {
            this.stopRequested = true;
            this.currentAbortController?.abort();
            if (this.stopButton) {
                this.stopButton.disabled = true;
                this.stopButton.textContent = 'Stopping…';
            }
        }, this.cleanupHandlers);

        inputRow.appendChild(this.messageInput);
        inputRow.appendChild(this.sendButton);
        inputRow.appendChild(this.stopButton);
        column.appendChild(inputRow);
        return column;
    }

    private renderStagedColumn(): HTMLElement {
        const column = createElement('div', {
            attributes: { style: 'display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;' }
        });

        const header = createElement('div', {
            attributes: { style: 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.6rem;border-bottom:1px solid #e5e7eb;background:#f9fafb;flex:0 0 auto;' }
        });
        const heading = createElement('div', {
            attributes: { style: 'font-weight:600;font-size:0.9rem;color:#111827;' },
            content: 'Staged changes'
        });
        const buttons = createElement('div', { attributes: { style: 'display:flex;gap:0.4rem;' } });
        this.commitButton = this.makeButton('Commit', '#16a34a', '#ffffff');
        addEventListenerWithCleanup(this.commitButton, 'click', () => void this.commit(), this.cleanupHandlers);
        const discardButton = this.makeButton('Discard', '#dc2626', '#ffffff');
        addEventListenerWithCleanup(discardButton, 'click', () => void this.discard(), this.cleanupHandlers);
        buttons.appendChild(this.commitButton);
        buttons.appendChild(discardButton);
        header.appendChild(heading);
        header.appendChild(buttons);
        column.appendChild(header);

        this.stagedContainer = createElement('div', {
            attributes: { style: 'flex:1 1 auto;min-height:0;overflow-y:auto;padding:0.6rem;display:flex;flex-direction:column;gap:0.6rem;background:#ffffff;' }
        });
        column.appendChild(this.stagedContainer);
        return column;
    }

    // ---------------- Lifecycle / recovery ----------------

    private async onOpened(): Promise<void> {
        const recovered = await ReviewStageStore.load(this.projectManager.rootNode.id, this.sourceNode.id);
        if (recovered) {
            this.purpose = recovered.purpose;
            this.selectedLevels = recovered.selectedLevels;
            this.conversation = recovered.conversation;
            this.stagedEdits = recovered.stagedEdits;
            this.scope = new ReviewScope(this.sourceNode, this.selectedLevels);
            this.renderLayerCheckboxes();
        }

        // Escape-to-close with the staged-changes guard.
        const escapeHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                void this.guardedClose();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        this.cleanupHandlers.push(() => document.removeEventListener('keydown', escapeHandler));

        this.renderConversation();
        this.renderStaged();
        this.updateSizeLabel();
    }

    // ---------------- Chat ----------------

    private async sendMessage(): Promise<void> {
        if (!this.messageInput || this.isGenerating) {
            return;
        }
        const message = this.messageInput.value.trim();
        if (message === '') {
            return;
        }
        this.messageInput.value = '';
        this.stopRequested = false;
        this.setGenerating(true);

        this.conversation.push({ role: 'user', content: message });
        this.appendUserBubble(message);

        const streamingBubble = this.appendAssistantBubble();

        try {
            const prompts = this.settingsManager.getPrompts();
            const expansion = createPromptExpansionService(this.settingsManager);
            const language = this.settingsManager.getLanguage();

            const systemPrompt = await expansion.expandPromptAsync(prompts.guided_reviewer, { project: { language } });
            const serialized = ReviewContextBuilder.build(this.scope, this.stagedMap());
            const scopePrompt = await expansion.expandPromptAsync(prompts.guided_reviewer_user, {
                project: { language },
                custom: { serialized_scope: serialized.text }
            });

            const conversation: OpenRouterMessage[] = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'system' as const, content: scopePrompt },
                ...this.conversation.map(m => ({ role: m.role, content: m.content }))
            ];

            const response = await this.streamAssistantResponse(conversation, streamingBubble);
            this.finishAssistantTurn(response, streamingBubble);
        } catch (error) {
            // Surface a recoverable message instead of leaving the modal stuck.
            // A user-initiated Stop is reported calmly; staged edits are intact.
            let reason: string;
            if (this.isStopRequested()) {
                reason = 'Generation stopped. Your staged changes are intact — you can continue or send another message.';
            } else {
                reason = error instanceof Error ? error.message : 'The AI request failed.';
            }
            streamingBubble.textContent = `⚠️ ${reason}`;
        } finally {
            this.setGenerating(false);
        }
    }

    /**
     * Read the cooperative stop flag through a method so the compiler does not
     * narrow it to a constant across awaits (it is mutated from the Stop button).
     */
    private isStopRequested(): boolean {
        return this.stopRequested;
    }

    /**
     * Stream one assistant response into the given bubble with recovery built in:
     * an AbortController (cancellable via Stop) and a stall watchdog that aborts
     * if no streaming activity arrives within STREAM_STALL_TIMEOUT_MS. Throws on
     * abort/stall/error so the caller's finally re-enables the UI; a stall is
     * reported as a clear, recoverable message.
     */
    private async streamAssistantResponse(conversation: OpenRouterMessage[], bubble: HTMLElement): Promise<string> {
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        let response = '';
        // Holder object (not a bare `let`) so the flag's type stays `boolean` and
        // the compiler does not narrow it to a constant across the await below.
        const stall = { triggered: false };
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        const armStallTimer = (): void => {
            if (stallTimer !== null) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
                stall.triggered = true;
                abortController.abort();
            }, GuidedReviewModal.STREAM_STALL_TIMEOUT_MS);
        };
        const clearStallTimer = (): void => {
            if (stallTimer !== null) {
                clearTimeout(stallTimer);
                stallTimer = null;
            }
        };

        armStallTimer();
        try {
            await this.openRouterClient.streamingChat(this.purpose, conversation, {
                onStart: () => {
                    armStallTimer();
                },
                onChunk: (chunk: string) => {
                    armStallTimer();
                    response += chunk;
                    bubble.textContent = response;
                    this.scrollMessagesToBottom();
                },
                onComplete: (fullContent: string) => {
                    clearStallTimer();
                    response = fullContent;
                },
                onError: (error: Error) => {
                    clearStallTimer();
                    throw error;
                }
            }, undefined, abortController.signal);
        } catch (error) {
            if (stall.triggered) {
                throw new Error('The AI request stalled with no response (the provider may be overloaded). It was cancelled — your staged changes are intact, please try again.');
            }
            throw error instanceof Error ? error : new Error('Streaming failed.');
        } finally {
            clearStallTimer();
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }

        return response;
    }

    private finishAssistantTurn(response: string, bubble: HTMLElement): void {
        const parseResult = ReviewCommandParser.parse(response);
        const applier = new ReviewStageApplier(this.scope, this.stagedEdits);
        const results = applier.applyCommands(parseResult.commands);
        this.stagedEdits = applier.getStagedEdits();

        const echoResults: XmlEchoResult[] = results.map(r => ({ rawXml: r.rawXml, ok: r.ok, message: r.message }));
        bubble.innerHTML = XmlEchoRenderer.render(response, echoResults);

        if (parseResult.errors.length > 0) {
            const errorBlock = createElement('div', {
                attributes: { style: 'border:1px solid #dc2626;background:#fef2f2;color:#991b1b;border-radius:6px;padding:0.5rem;font-size:0.8rem;margin-top:0.4rem;' }
            });
            const lines = parseResult.errors.map(e => `• ${e.message}`);
            errorBlock.textContent = `Some commands could not be parsed:\n${lines.join('\n')}`;
            errorBlock.style.whiteSpace = 'pre-wrap';
            bubble.appendChild(errorBlock);
        }

        this.conversation.push({ role: 'assistant', content: response });
        this.renderStaged();
        this.updateSizeLabel();
        this.scrollMessagesToBottom();
        void this.persist();
    }

    private renderConversation(): void {
        if (!this.messagesContainer) {
            return;
        }
        this.messagesContainer.innerHTML = '';
        for (const message of this.conversation) {
            if (message.role === 'user') {
                this.appendUserBubble(message.content);
            } else {
                const bubble = this.appendAssistantBubble();
                bubble.innerHTML = XmlEchoRenderer.render(message.content, []);
            }
        }
        this.scrollMessagesToBottom();
    }

    private appendUserBubble(text: string): HTMLElement {
        const bubble = createElement('div', {
            attributes: { style: 'align-self:flex-end;max-width:85%;background:#2563eb;color:#ffffff;padding:0.5rem 0.7rem;border-radius:10px 10px 2px 10px;font-size:0.9rem;white-space:pre-wrap;' }
        });
        bubble.textContent = text;
        this.messagesContainer!.appendChild(bubble);
        this.scrollMessagesToBottom();
        return bubble;
    }

    private appendAssistantBubble(): HTMLElement {
        const bubble = createElement('div', {
            attributes: { style: 'align-self:flex-start;max-width:95%;background:#f3f4f6;color:#111827;padding:0.5rem 0.7rem;border-radius:10px 10px 10px 2px;font-size:0.9rem;white-space:pre-wrap;' }
        });
        this.messagesContainer!.appendChild(bubble);
        this.scrollMessagesToBottom();
        return bubble;
    }

    // ---------------- Staged panel ----------------

    private renderStaged(): void {
        if (!this.stagedContainer) {
            return;
        }
        this.stagedContainer.innerHTML = '';

        if (this.stagedEdits.length === 0) {
            const empty = createElement('div', {
                attributes: { style: 'color:#6b7280;font-size:0.85rem;padding:0.5rem;' },
                content: 'No staged changes yet. Ask the reviewer to make edits.'
            });
            this.stagedContainer.appendChild(empty);
            this.updateCommitButton();
            return;
        }

        for (const edit of this.stagedEdits) {
            this.stagedContainer.appendChild(this.renderStagedCard(edit));
        }
        this.updateCommitButton();
    }

    private renderStagedCard(edit: StagedNodeEdit): HTMLElement {
        const card = createElement('div', {
            attributes: { style: 'border:1px solid #e5e7eb;border-radius:8px;padding:0.5rem;background:#fafafa;display:flex;flex-direction:column;gap:0.4rem;' }
        });

        const head = createElement('label', {
            attributes: { style: 'display:flex;align-items:center;gap:0.4rem;font-weight:600;font-size:0.85rem;color:#111827;cursor:pointer;' }
        });
        const include = createElement('input', { attributes: { type: 'checkbox' } });
        if (edit.include) {
            include.setAttribute('checked', 'checked');
        }
        addEventListenerWithCleanup(include, 'change', () => {
            edit.include = include.checked;
            this.updateCommitButton();
            void this.persist();
        }, this.cleanupHandlers);
        head.appendChild(include);
        head.appendChild(document.createTextNode(`${edit.handle} — ${edit.pathLabel}`));
        card.appendChild(head);

        if (edit.titleAfter !== edit.titleBefore) {
            const titleLine = createElement('div', {
                attributes: { style: 'font-size:0.78rem;color:#374151;' }
            });
            titleLine.innerHTML = `Title: <span style="text-decoration:line-through;color:#9ca3af;">${this.escapeHtml(edit.titleBefore)}</span> → <strong>${this.escapeHtml(edit.titleAfter)}</strong>`;
            card.appendChild(titleLine);
        }

        if (edit.contentAfter !== edit.contentBefore) {
            card.appendChild(this.renderBeforeAfter('Content', edit.contentBefore, edit.contentAfter));
        }

        if (this.contextChanged(edit)) {
            card.appendChild(this.renderContextChange(edit));
        }

        return card;
    }

    private renderBeforeAfter(label: string, before: string, after: string): HTMLElement {
        const wrap = createElement('div', { attributes: { style: 'display:flex;flex-direction:column;gap:0.25rem;' } });
        const title = createElement('div', { attributes: { style: 'font-size:0.72rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;' }, content: label });
        wrap.appendChild(title);
        const grid = createElement('div', { attributes: { style: 'display:flex;gap:0.4rem;' } });
        grid.appendChild(this.preBlock(before, '#fef2f2', '#fecaca'));
        grid.appendChild(this.preBlock(after, '#ecfdf5', '#bbf7d0'));
        wrap.appendChild(grid);
        return wrap;
    }

    private preBlock(text: string, bg: string, border: string): HTMLElement {
        const pre = createElement('pre', {
            attributes: { style: `flex:1 1 0;min-width:0;max-height:9rem;overflow:auto;margin:0;padding:0.4rem;background:${bg};border:1px solid ${border};border-radius:6px;font-size:0.72rem;white-space:pre-wrap;word-break:break-word;` }
        });
        pre.textContent = text.length > 0 ? text : '(empty)';
        return pre;
    }

    private renderContextChange(edit: StagedNodeEdit): HTMLElement {
        const wrap = createElement('div', { attributes: { style: 'display:flex;flex-direction:column;gap:0.2rem;' } });
        const title = createElement('div', { attributes: { style: 'font-size:0.72rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;' }, content: 'Conditional context' });
        wrap.appendChild(title);
        const list = createElement('div', { attributes: { style: 'display:flex;flex-direction:column;gap:0.15rem;font-size:0.74rem;color:#374151;' } });
        for (const item of edit.contextAfter) {
            const tag = item.id === null ? '+ new' : 'edit';
            const trigger = item.trigger ? `trigger="${item.trigger}"` : 'global';
            const line = createElement('div', {});
            line.textContent = `[${tag}] (${trigger}) ${item.text}`;
            list.appendChild(line);
        }
        const removedCount = edit.contextBefore.filter(b => b.id !== null && !edit.contextAfter.some(a => a.id === b.id)).length;
        if (removedCount > 0) {
            const removed = createElement('div', { attributes: { style: 'color:#991b1b;' } });
            removed.textContent = `− ${removedCount} item(s) removed`;
            list.appendChild(removed);
        }
        wrap.appendChild(list);
        return wrap;
    }

    private contextChanged(edit: StagedNodeEdit): boolean {
        if (edit.contextBefore.length !== edit.contextAfter.length) {
            return true;
        }
        for (let i = 0; i < edit.contextBefore.length; i++) {
            const b = edit.contextBefore[i]!;
            const a = edit.contextAfter[i]!;
            if (b.workingId !== a.workingId || b.text !== a.text || b.trigger !== a.trigger || b.id !== a.id) {
                return true;
            }
        }
        return false;
    }

    // ---------------- Commit / discard / scope ----------------

    private async commit(): Promise<void> {
        const included = this.stagedEdits.filter(e => e.include);
        if (included.length === 0) {
            alert('No staged nodes are selected for commit.');
            return;
        }
        const result = await ReviewCommitService.commit(this.projectManager, this.sourceNode.id, this.stagedEdits);
        await ReviewStageStore.clear(this.projectManager.rootNode.id, this.sourceNode.id);
        this.stagedEdits = [];
        // Rebuild scope so subsequent edits seed from the freshly committed state.
        this.scope = new ReviewScope(this.sourceNode, this.selectedLevels);
        this.renderStaged();
        this.updateSizeLabel();
        this.appendSystemNote(`Committed ${result.committedNodeCount} node(s).`);
    }

    private async discard(): Promise<void> {
        if (this.stagedEdits.length > 0 && !confirm('Discard all staged changes? This cannot be undone.')) {
            return;
        }
        await ReviewStageStore.clear(this.projectManager.rootNode.id, this.sourceNode.id);
        this.stagedEdits = [];
        this.renderStaged();
        this.updateSizeLabel();
        this.appendSystemNote('Discarded all staged changes.');
    }

    private onLayerToggle(level: number, checkbox: HTMLInputElement): void {
        if (this.stagedEdits.length > 0) {
            alert('Commit or discard your staged changes before changing the layer scope.');
            checkbox.checked = this.selectedLevels.includes(level);
            return;
        }
        if (checkbox.checked) {
            if (!this.selectedLevels.includes(level)) {
                this.selectedLevels.push(level);
            }
        } else {
            this.selectedLevels = this.selectedLevels.filter(l => l !== level);
        }
        if (this.selectedLevels.length === 0) {
            alert('At least one layer must remain selected.');
            this.selectedLevels.push(level);
            checkbox.checked = true;
            return;
        }
        this.scope = new ReviewScope(this.sourceNode, this.selectedLevels);
        this.updateSizeLabel();
        void this.persist();
    }

    private appendSystemNote(text: string): void {
        if (!this.messagesContainer) {
            return;
        }
        const note = createElement('div', {
            attributes: { style: 'align-self:center;background:#eef2ff;color:#3730a3;padding:0.25rem 0.6rem;border-radius:999px;font-size:0.75rem;' },
            content: text
        });
        this.messagesContainer.appendChild(note);
        this.scrollMessagesToBottom();
    }

    private async guardedClose(): Promise<void> {
        if (this.stagedEdits.length > 0) {
            const proceed = confirm('You have uncommitted staged changes. They are saved and will be recovered next time you open the reviewer for this node. Close anyway?');
            if (!proceed) {
                return;
            }
        }
        await this.close();
    }

    // ---------------- Helpers ----------------

    private stagedMap(): Map<string, StagedNodeEdit> {
        return new Map(this.stagedEdits.map(e => [e.nodeId, e]));
    }

    private async persist(): Promise<void> {
        if (this.stagedEdits.length === 0) {
            await ReviewStageStore.clear(this.projectManager.rootNode.id, this.sourceNode.id);
            return;
        }
        const state: ReviewSessionState = {
            reviewRootId: this.sourceNode.id,
            projectRootId: this.projectManager.rootNode.id,
            purpose: this.purpose,
            selectedLevels: this.selectedLevels,
            conversation: this.conversation,
            stagedEdits: this.stagedEdits
        };
        await ReviewStageStore.save(state);
    }

    private updateSizeLabel(): void {
        if (!this.sizeLabel) {
            return;
        }
        const serialized = ReviewContextBuilder.build(this.scope, this.stagedMap());
        this.sizeLabel.textContent = `${this.scope.size} nodes · ~${serialized.approxTokens.toLocaleString()} tokens`;
    }

    private updateCommitButton(): void {
        if (!this.commitButton) {
            return;
        }
        const includedCount = this.stagedEdits.filter(e => e.include).length;
        this.commitButton.textContent = includedCount > 0 ? `Commit (${includedCount})` : 'Commit';
        this.commitButton.disabled = includedCount === 0;
        this.commitButton.style.opacity = includedCount === 0 ? '0.5' : '1';
    }

    private setGenerating(generating: boolean): void {
        this.isGenerating = generating;
        if (this.sendButton) {
            this.sendButton.disabled = generating;
            this.sendButton.textContent = generating ? 'Working…' : 'Send';
            this.sendButton.style.opacity = generating ? '0.6' : '1';
        }
        // The Stop button is the escape hatch while a request is in flight.
        if (this.stopButton) {
            this.stopButton.style.display = generating ? '' : 'none';
            this.stopButton.disabled = false;
            this.stopButton.textContent = 'Stop';
        }
        if (this.messageInput) {
            this.messageInput.disabled = generating;
        }
    }

    private scrollMessagesToBottom(): void {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    private makeButton(label: string, bg: string, color: string): HTMLButtonElement {
        return createElement('button', {
            attributes: {
                type: 'button',
                style: `padding:0.45rem 0.9rem;border:none;border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;background:${bg};color:${color};`
            },
            content: label
        });
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
