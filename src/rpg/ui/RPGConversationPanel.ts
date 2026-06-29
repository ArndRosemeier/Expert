/**
 * RPG Conversation Panel
 * 
 * Chat interface for interacting with the Game LLM.
 * Displays conversation history and allows user input.
 */

import { RPGConversationMessage, RPGGameSession } from '../types/RPGTypes';
import { RPGInteractionService } from '../services/RPGInteractionService';
import { RPGWorldInspector } from './RPGWorldInspector';
import { getActiveProject } from '../../state';

export class RPGConversationPanel {
    private container: HTMLElement;
    private session: RPGGameSession;
    private interactionService: RPGInteractionService;
    private worldInspector: RPGWorldInspector;
    private onUpdate: () => void;
    
    private messagesContainer: HTMLElement | null = null;
    private inputField: HTMLTextAreaElement | null = null;
    private submitButton: HTMLButtonElement | null = null;
    private statusIndicator: HTMLElement | null = null;
    
    constructor(
        container: HTMLElement,
        session: RPGGameSession,
        interactionService: RPGInteractionService,
        worldInspector: RPGWorldInspector,
        onUpdate: () => void
    ) {
        this.container = container;
        this.session = session;
        this.interactionService = interactionService;
        this.worldInspector = worldInspector;
        this.onUpdate = onUpdate;
        
        // Set up callback for when analysis completes
        this.interactionService.setOnAnalysisComplete(() => {
            this.updateStatus('Ready', 'ready');
            // Keep keyboard flow: after GM move + analysis, return focus to input.
            this.focusInput();
        });
        
        this.render();
    }
    
    /**
     * Render the conversation panel
     */
    private render(): void {
        const html = `
            <div class="rpg-conversation-panel">
                <div class="rpg-conversation-header">
                    <h3>Conversation</h3>
                    <div id="rpg-status-indicator" class="rpg-status-ready">Ready</div>
                </div>
                <div id="rpg-messages-container" class="rpg-messages"></div>
                <div class="rpg-input-area">
                    <textarea 
                        id="rpg-input-field" 
                        placeholder="Describe your action..." 
                        rows="3"
                    ></textarea>
                    <button id="rpg-submit-btn">Send</button>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // Get references
        this.messagesContainer = this.container.querySelector('#rpg-messages-container');
        this.inputField = this.container.querySelector('#rpg-input-field');
        this.submitButton = this.container.querySelector('#rpg-submit-btn');
        this.statusIndicator = this.container.querySelector('#rpg-status-indicator');
        
        // Render existing messages
        this.renderMessages();
        
        // Attach event listeners
        this.submitButton?.addEventListener('click', () => {
            void this.handleSubmit();
        });
        
        this.inputField?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.handleSubmit();
            }
        });

        // Initial UX: focus input immediately when the chat opens.
        this.focusInput();
    }
    
    /**
     * Render all messages in the conversation history
     */
    private renderMessages(): void {
        if (!this.messagesContainer) return;
        
        this.messagesContainer.innerHTML = '';
        
        const lastIndex = this.session.conversationHistory.length - 1;
        for (let i = 0; i < this.session.conversationHistory.length; i++) {
            const message = this.session.conversationHistory[i] as RPGConversationMessage;
            const showRetry = i === lastIndex && message.role === 'assistant' && this.canRetryLastTurn();
            const showRestore = message.role === 'assistant' && Boolean(message.checkpointSnapshotId);
            this.appendMessage(message, showRetry, showRestore);
        }
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private canRetryLastTurn(): boolean {
        const history = this.session.conversationHistory;
        if (history.length < 2) return false;

        const last = history[history.length - 1];
        const prev = history[history.length - 2];
        if (!last || !prev) return false;
        if (last.role !== 'assistant' || prev.role !== 'user') return false;

        // 1) Best case: in-memory rollback exists (only for non-reloaded sessions)
        const rollbackId = last.preTurnRollbackId;
        if (rollbackId && this.interactionService.hasRollbackPoint(rollbackId)) {
            return true;
        }

        // 2) Reload-safe: we can retry by restoring the previous assistant checkpoint (turn-1)
        if (history.length < 3) return false;
        const beforeLastAssistant = history[history.length - 3];
        if (!beforeLastAssistant) return false;
        return beforeLastAssistant.role === 'assistant' && Boolean(beforeLastAssistant.checkpointSnapshotId);
    }
    
    /**
     * Append a single message to the display
     */
    private appendMessage(message: RPGConversationMessage, showRetry: boolean = false, showRestore: boolean = false): void {
        if (!this.messagesContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `rpg-message rpg-message-${message.role}`;
        
        const roleLabel = message.role === 'user' ? 'You' : 'Game Master';
        const checkpointId = message.role === 'assistant' ? message.checkpointSnapshotId : undefined;
        
        const actions: string[] = [];
        if (showRestore && checkpointId) {
            actions.push(`<button class="rpg-checkpoint-btn" type="button" data-snapshot-id="${checkpointId}">Restore checkpoint</button>`);
        }
        if (showRetry) {
            actions.push(`<button class="rpg-retry-btn" type="button">Retry</button>`);
        }

        const actionsHtml = actions.length > 0
            ? `<div class="rpg-message-actions">${actions.join('')}</div>`
            : '';

        const metaHtml =
            message.role === 'assistant' &&
            message.narratorPromptCharCount !== undefined &&
            message.narratorWorldItemsSentCount !== undefined &&
            message.narratorWorldItemsTotalCount !== undefined
                ? `<div class="rpg-llm-meta">LLM msg: ${message.narratorPromptCharCount} chars · World sent: ${message.narratorWorldItemsSentCount} items · World total: ${message.narratorWorldItemsTotalCount} items</div>`
                : '';

        messageDiv.innerHTML = `
            <div class="rpg-message-role">${roleLabel}</div>
            ${metaHtml}
            <div class="rpg-message-content">${this.formatContent(message.content)}</div>
            ${actionsHtml}
        `;

        const retryBtn = messageDiv.querySelector('.rpg-retry-btn') as HTMLButtonElement | null;
        retryBtn?.addEventListener('click', () => {
            void this.retryLastTurn();
        });

        const restoreBtn = messageDiv.querySelector('.rpg-checkpoint-btn') as HTMLButtonElement | null;
        restoreBtn?.addEventListener('click', () => {
            const snapshotId = restoreBtn.getAttribute('data-snapshot-id');
            if (!snapshotId) {
                throw new Error('Restore checkpoint clicked but snapshot id missing.');
            }
            void this.restoreCheckpoint(snapshotId);
        });
        
        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private async restoreCheckpoint(snapshotId: string): Promise<void> {
        if (!this.inputField || !this.submitButton) return;

        if (this.interactionService.isAnalyzing()) {
            this.updateStatus('Waiting for analysis...', 'analyzing');
            await this.interactionService.waitForAnalysisCompletion();
        }

        if (!confirm('Restore this checkpoint? Progress after this point will be lost.')) {
            return;
        }

        this.inputField.disabled = true;
        this.submitButton.disabled = true;
        this.updateStatus('Restoring checkpoint...', 'analyzing');

        try {
            await this.interactionService.restoreCheckpointIntoSession(this.session, snapshotId);
            this.onUpdate();
            this.renderMessages();
            this.updateStatus('Ready', 'ready');
        } catch (error) {
            console.error('Error restoring checkpoint:', error);
            alert(`Failed to restore checkpoint: ${error instanceof Error ? error.message : error}`);
            this.updateStatus('Error', 'error');
        } finally {
            this.inputField.disabled = false;
            this.submitButton.disabled = false;
        }
    }

    private async retryLastTurn(): Promise<void> {
        if (!this.inputField || !this.submitButton) return;
        if (this.interactionService.isAnalyzing()) {
            this.updateStatus('Waiting for analysis...', 'analyzing');
            await this.interactionService.waitForAnalysisCompletion();
        }

        const history = this.session.conversationHistory;
        if (history.length < 2) {
            alert('Nothing to retry yet.');
            return;
        }

        const last = history[history.length - 1];
        const prev = history[history.length - 2];
        if (!last || !prev) {
            alert('Nothing to retry yet.');
            return;
        }

        if (last.role !== 'assistant' || prev.role !== 'user') {
            alert('Retry is only available for the most recent GM answer.');
            return;
        }

        const playerAction = prev.content;

        this.inputField.disabled = true;
        this.submitButton.disabled = true;
        this.updateStatus('Retrying (restoring state)...', 'analyzing');

        // Capture checkpoint id (if present) before any restore mutates the conversation.
        const lastCheckpointId = last.checkpointSnapshotId;

        // Prefer the in-memory rollback point when available (no extra snapshot restore needed).
        const rollbackId = last.preTurnRollbackId;
        if (rollbackId && this.interactionService.hasRollbackPoint(rollbackId)) {
            this.interactionService.restoreRollbackPointIntoSession(this.session, rollbackId);
            this.interactionService.dropRollbackPoint(rollbackId);
        } else {
            // Reload-safe path: restore the previous assistant checkpoint (turn-1), which is the pre-turn state.
            if (history.length < 3) {
                throw new Error('Cannot retry: no previous checkpoint available.');
            }
            const prevAssistant = history[history.length - 3];
            if (!prevAssistant || prevAssistant.role !== 'assistant' || !prevAssistant.checkpointSnapshotId) {
                throw new Error('Cannot retry: missing previous assistant checkpoint.');
            }
            await this.interactionService.restoreCheckpointIntoSession(this.session, prevAssistant.checkpointSnapshotId);
        }

        // Remove checkpoint snapshot associated with this assistant message (created by analysis)
        if (lastCheckpointId) {
            await this.interactionService.deleteSnapshotById(lastCheckpointId);
            delete last.checkpointSnapshotId;
        }

        // Remove last user + assistant messages, then resend the same user text.
        this.session.conversationHistory = this.session.conversationHistory.slice(0, -2);
        this.session.last2Messages = this.session.conversationHistory.slice(-2);

        this.onUpdate();
        this.renderMessages();

        this.inputField.disabled = false;
        this.submitButton.disabled = false;

        this.inputField.value = playerAction;
        await this.handleSubmit();
    }
    
    /**
     * Format message content (basic markdown support)
     */
    private formatContent(content: string): string {
        // Escape HTML
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Convert newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');
        
        // First, normalize consecutive asterisks that are close together
        // This prevents issues with patterns like "** text *" creating unclosed tags
        formatted = formatted.replace(/(\*{2,})/g, '*');
        
        // Bold: **text** (at least 1 char between, non-greedy)
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic: *text* (at least 1 char between, not preceded/followed by *)
        formatted = formatted.replace(/(?<!\*)(\*([^*]+?)\*)(?!\*)/g, '<em>$2</em>');
        
        return formatted;
    }
    
    /**
     * Handle user input submission
     */
    private async handleSubmit(): Promise<void> {
        if (!this.inputField || !this.submitButton) return;
        
        const playerAction = this.inputField.value.trim();
        if (!playerAction) return;
        
        // Wait for any ongoing analysis to complete
        if (this.interactionService.isAnalyzing()) {
            this.updateStatus('Waiting for analysis...', 'analyzing');
            await this.interactionService.waitForAnalysisCompletion();
        }
        
        // Clear input
        this.inputField.value = '';
        
        // Disable input during processing
        this.inputField.disabled = true;
        this.submitButton.disabled = true;
        this.updateStatus('Generating response...', 'generating');
        
        try {
            // Display user message immediately (optimistic UI)
            this.appendMessage({ role: 'user', content: playerAction, timestamp: Date.now() });
            
            // Create a placeholder for streaming response
            const assistantMessageDiv = document.createElement('div');
            assistantMessageDiv.className = 'rpg-message rpg-message-assistant';
            assistantMessageDiv.innerHTML = `
                <div class="rpg-message-role">Game Master</div>
                <div class="rpg-message-content"></div>
            `;
            this.messagesContainer?.appendChild(assistantMessageDiv);
            
            // Get the content div directly (not by ID, to avoid conflicts with previous messages)
            const streamingContent = assistantMessageDiv.querySelector('.rpg-message-content') as HTMLElement;
            let accumulatedResponse = '';
            
            // Get settings manager
            const activeProject = getActiveProject();
            if (!activeProject) {
                throw new Error('No active project');
            }
            const settingsManager = activeProject.getSettingsManager();
            
            // Send action with streaming callback
            await this.interactionService.sendPlayerAction(
                this.session,
                settingsManager,
                playerAction,
                this.worldInspector.debugMode,
                (chunk: string) => {
                    accumulatedResponse += chunk;
                    if (streamingContent) {
                        streamingContent.innerHTML = this.formatContent(accumulatedResponse);
                    }
                    this.messagesContainer!.scrollTop = this.messagesContainer!.scrollHeight;
                },
                () => {
                    // Called when state analysis completes
                    this.updateStatus('Ready', 'ready');
                    this.onUpdate(); // Notify parent to refresh world inspector
                }
            );

            // Re-render from canonical conversation history so the last assistant message gets the Retry button
            this.renderMessages();
            
            // Update status to show analysis is running
            this.updateStatus('Analyzing world state...', 'analyzing');
            
            // Re-enable input (user can type while analysis runs)
            this.inputField.disabled = false;
            this.submitButton.disabled = false;
            // GM move finished streaming; focus input so the user can continue typing immediately.
            this.focusInput();
            
        } catch (error) {
            console.error('Error sending player action:', error);
            alert(`Error: ${error instanceof Error ? error.message : error}`);

            // The interaction service records a stable error message into the session history.
            // Re-render from canonical history to avoid leaving the streaming placeholder in the DOM.
            this.renderMessages();
            // Put the user's action back so they can edit + resend immediately if desired.
            this.inputField.value = playerAction;
            
            // Re-enable input on error
            this.inputField.disabled = false;
            this.submitButton.disabled = false;
            this.updateStatus('Error', 'error');
            this.focusInput();
        }
    }

    private focusInput(): void {
        if (!this.inputField) return;
        if (this.inputField.disabled) return;
        this.inputField.focus();
        const end = this.inputField.value.length;
        this.inputField.setSelectionRange(end, end);
    }
    
    /**
     * Update status indicator
     */
    private updateStatus(text: string, state: 'ready' | 'generating' | 'analyzing' | 'error'): void {
        if (!this.statusIndicator) return;
        
        this.statusIndicator.textContent = text;
        this.statusIndicator.className = `rpg-status-${state}`;
    }
    
    /**
     * Refresh the panel (reload messages)
     */
    refresh(): void {
        this.renderMessages();
        this.focusInput();
    }
}

