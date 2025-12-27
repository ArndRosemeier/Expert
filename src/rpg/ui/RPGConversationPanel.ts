/**
 * RPG Conversation Panel
 * 
 * Chat interface for interacting with the Game LLM.
 * Displays conversation history and allows user input.
 */

import { RPGGameSession } from '../types/RPGTypes';
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
    }
    
    /**
     * Render all messages in the conversation history
     */
    private renderMessages(): void {
        if (!this.messagesContainer) return;
        
        this.messagesContainer.innerHTML = '';
        
        for (const message of this.session.conversationHistory) {
            this.appendMessage(message.role, message.content);
        }
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    /**
     * Append a single message to the display
     */
    private appendMessage(role: 'user' | 'assistant', content: string): void {
        if (!this.messagesContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `rpg-message rpg-message-${role}`;
        
        const roleLabel = role === 'user' ? 'You' : 'Game Master';
        
        messageDiv.innerHTML = `
            <div class="rpg-message-role">${roleLabel}</div>
            <div class="rpg-message-content">${this.formatContent(content)}</div>
        `;
        
        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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
        
        // Bold: **text**
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic: *text*
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
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
            // Display user message immediately
            this.appendMessage('user', playerAction);
            
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
            
            // Update status to show analysis is running
            this.updateStatus('Analyzing world state...', 'analyzing');
            
            // Re-enable input (user can type while analysis runs)
            this.inputField.disabled = false;
            this.submitButton.disabled = false;
            
        } catch (error) {
            console.error('Error sending player action:', error);
            alert(`Error: ${error instanceof Error ? error.message : error}`);
            
            // Re-enable input on error
            this.inputField.disabled = false;
            this.submitButton.disabled = false;
            this.updateStatus('Error', 'error');
        }
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
    }
}

