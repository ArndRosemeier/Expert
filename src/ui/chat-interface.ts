import { OpenRouterClient, OpenRouterMessage, StreamingCallbacks } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { StorageService } from '../StorageService';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
}

export class ChatInterface {
    private static readonly LAST_CHAT_MODEL_KEY = 'expert_app_last_chat_model';
    
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private messages: ChatMessage[] = [];
    private isStreamingResponse = false;
    private currentStreamingMessageId: string | null = null;
    private selectedModelPurpose: string = 'creator';
    private customSystemPrompt: string | null = null;
    private chatTitle: string = 'AI Chat';
    
    // DOM elements
    private chatContainer: HTMLElement | null = null;
    private messagesContainer: HTMLElement | null = null;
    private messageInput: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private stopButton: HTMLButtonElement | null = null;
    private modelPurposeSelect: HTMLSelectElement | null = null;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager, systemPrompt?: string, title?: string) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.customSystemPrompt = systemPrompt || null;
        this.chatTitle = title || 'AI Chat';
    }

    /**
     * Load the last used chat model from storage
     */
    private async loadLastUsedModel(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const lastModel = await storage.get<string>(ChatInterface.LAST_CHAT_MODEL_KEY);
            if (lastModel && ['creator', 'editor', 'rater'].includes(lastModel)) {
                this.selectedModelPurpose = lastModel;
            }
        } catch (error) {
            console.warn('Failed to load last used chat model:', error);
        }
    }

    /**
     * Save the current chat model to storage
     */
    private async saveLastUsedModel(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            await storage.set(ChatInterface.LAST_CHAT_MODEL_KEY, this.selectedModelPurpose);
        } catch (error) {
            console.warn('Failed to save last used chat model:', error);
        }
    }

    /**
     * Initialize and render the chat interface
     */
    public async initialize(containerElement: HTMLElement): Promise<void> {
        this.chatContainer = containerElement;
        
        // Load the last used model before rendering
        await this.loadLastUsedModel();
        
        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the complete chat interface
     */
    private render(): void {
        if (!this.chatContainer) return;

        this.chatContainer.innerHTML = `
            <div class="chat-interface" style="
                display: flex;
                height: 100%;
                width: 100%;
                font-family: system-ui, -apple-system, sans-serif;
                background: #f7f7f8;
            ">
                <!-- Sidebar -->
                <div class="chat-sidebar" style="
                    width: 260px;
                    background: #171717;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid #333;
                ">
                    <div class="sidebar-header" style="
                        padding: 1rem;
                        border-bottom: 1px solid #333;
                    ">
                        <h3 style="
                            margin: 0;
                            font-size: 1.1rem;
                            font-weight: 600;
                            color: white;
                        ">${this.chatTitle}</h3>
                    </div>
                    <div class="sidebar-content" style="
                        flex: 1;
                        padding: 1rem;
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                    ">
                        <button id="clear-chat-btn" style="
                            background: #333;
                            color: white;
                            border: 1px solid #555;
                            border-radius: 6px;
                            padding: 0.75rem;
                            font-size: 0.9rem;
                            cursor: pointer;
                            transition: background-color 0.2s;
                        " onmouseover="this.style.backgroundColor='#444'" onmouseout="this.style.backgroundColor='#333'">
                            Clear Chat
                        </button>
                        ${this.customSystemPrompt ? `
                        <div style="
                            border-top: 1px solid #444;
                            margin: 0.5rem 0;
                            padding-top: 1rem;
                        ">
                            <div style="
                                font-size: 0.8rem;
                                color: #aaa;
                                margin-bottom: 0.75rem;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            ">Standard Actions</div>
                            <button id="consistency-check-btn" style="
                                width: 100%;
                                background: #17a2b8;
                                color: white;
                                border: 1px solid #138496;
                                border-radius: 6px;
                                padding: 0.75rem;
                                font-size: 0.9rem;
                                cursor: pointer;
                                transition: background-color 0.2s;
                                margin-bottom: 0.5rem;
                                text-align: left;
                            " onmouseover="this.style.backgroundColor='#138496'" onmouseout="this.style.backgroundColor='#17a2b8'">
                                📋 Check Consistency
                            </button>
                            <button id="story-improvements-btn" style="
                                width: 100%;
                                background: #28a745;
                                color: white;
                                border: 1px solid #218838;
                                border-radius: 6px;
                                padding: 0.75rem;
                                font-size: 0.9rem;
                                cursor: pointer;
                                transition: background-color 0.2s;
                                text-align: left;
                            " onmouseover="this.style.backgroundColor='#218838'" onmouseout="this.style.backgroundColor='#28a745'">
                                ✨ Suggest Improvements
                            </button>
                        </div>
                        ` : ''}
                        <div style="
                            font-size: 0.8rem;
                            color: #888;
                            line-height: 1.4;
                        ">
                            ${this.customSystemPrompt ? 
                                '<p style="color: #10b981; margin-bottom: 0.5rem;"><strong>✓ Context Loaded</strong></p><p>This chat has specific context about your document structure. Ask questions about the content, request edits, or get suggestions.</p>' 
                                : '<p>Select a model and start chatting. Your conversation will build context as you continue.</p>'
                            }
                        </div>
                    </div>
                    <div class="sidebar-footer" style="
                        padding: 1rem;
                        border-top: 1px solid #333;
                        font-size: 0.8rem;
                        color: #888;
                        text-align: center;
                    ">
                        Expert AI Assistant
                    </div>
                </div>

                <!-- Main Chat Area -->
                <div class="chat-main" style="
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: white;
                ">
                    <!-- Messages Container -->
                    <div class="messages-container" id="messages-container" style="
                        flex: 1;
                        overflow-y: auto;
                        padding: 1rem;
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                    ">
                        <!-- Messages will be populated here -->
                    </div>

                    <!-- Input Container -->
                    <div class="input-container" style="
                        border-top: 1px solid #e5e5e5;
                        padding: 1rem;
                        background: white;
                    ">
                        <!-- Model Selector -->
                        <div class="model-selector" style="
                            max-width: 800px;
                            margin: 0 auto 1rem auto;
                            display: flex;
                            align-items: center;
                            gap: 1rem;
                            padding: 0.75rem;
                            background: #f8f9fa;
                            border-radius: 8px;
                            border: 1px solid #e5e5e5;
                        ">
                            <label for="model-purpose-select" style="
                                font-size: 0.9rem;
                                font-weight: 500;
                                color: #374151;
                                white-space: nowrap;
                            ">Model:</label>
                            <select id="model-purpose-select" style="
                                flex: 1;
                                padding: 0.5rem;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 0.9rem;
                                background: white;
                                color: #374151;
                            ">
                                <option value="creator">Creator: ${this.getModelDisplayName('creator')}</option>
                                <option value="editor">Editor: ${this.getModelDisplayName('editor')}</option>
                                <option value="rater">Rater: ${this.getModelDisplayName('rater')}</option>
                            </select>
                        </div>
                        <div class="input-wrapper" style="
                            max-width: 800px;
                            margin: 0 auto;
                            position: relative;
                        ">
                            <textarea 
                                id="message-input" 
                                placeholder="Type your message here..."
                                style="
                                    width: 100%;
                                    min-height: 60px;
                                    max-height: 200px;
                                    padding: 1rem 3rem 1rem 1rem;
                                    border: 1px solid #d1d5db;
                                    border-radius: 12px;
                                    resize: none;
                                    font-family: inherit;
                                    font-size: 1rem;
                                    line-height: 1.5;
                                    outline: none;
                                    box-sizing: border-box;
                                "
                            ></textarea>
                            <button 
                                id="send-btn" 
                                class="send-button"
                                style="
                                    position: absolute;
                                    right: 8px;
                                    bottom: 8px;
                                    background: #007bff;
                                    color: white;
                                    border: none;
                                    border-radius: 8px;
                                    width: 32px;
                                    height: 32px;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    transition: background-color 0.2s;
                                    opacity: 0.6;
                                "
                                disabled
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="m22 2-7 20-4-9-9-4Z"/>
                                    <path d="M22 2 11 13"/>
                                </svg>
                            </button>
                            <button 
                                id="stop-btn" 
                                class="stop-button"
                                style="
                                    position: absolute;
                                    right: 8px;
                                    bottom: 8px;
                                    background: #dc3545;
                                    color: white;
                                    border: none;
                                    border-radius: 8px;
                                    width: 32px;
                                    height: 32px;
                                    cursor: pointer;
                                    display: none;
                                    align-items: center;
                                    justify-content: center;
                                    transition: background-color 0.2s;
                                "
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Store references to DOM elements
        this.messagesContainer = this.chatContainer.querySelector('#messages-container');
        this.messageInput = this.chatContainer.querySelector('#message-input') as HTMLTextAreaElement;
        this.sendButton = this.chatContainer.querySelector('#send-btn') as HTMLButtonElement;
        this.stopButton = this.chatContainer.querySelector('#stop-btn') as HTMLButtonElement;
        this.modelPurposeSelect = this.chatContainer.querySelector('#model-purpose-select') as HTMLSelectElement;
        
        // Set the selected model purpose
        if (this.modelPurposeSelect) {
            this.modelPurposeSelect.value = this.selectedModelPurpose;
        }
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        if (!this.messageInput || !this.sendButton || !this.stopButton || !this.modelPurposeSelect) return;

        // Message input events
        this.messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.updateSendButtonState();
        });

        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.isStreamingResponse && this.messageInput!.value.trim()) {
                    void this.sendMessage();
                }
            }
        });

        // Button events
        this.sendButton.addEventListener('click', () => {
            if (!this.isStreamingResponse && this.messageInput!.value.trim()) {
                void this.sendMessage();
            }
        });

        this.stopButton.addEventListener('click', () => {
            this.stopGeneration();
        });

        // Model selection
        this.modelPurposeSelect.addEventListener('change', (e) => {
            this.selectedModelPurpose = (e.target as HTMLSelectElement).value;
            void this.saveLastUsedModel(); // Save the selection
        });

        // Clear chat button
        const clearButton = this.chatContainer?.querySelector('#clear-chat-btn');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearMessages();
            });
        }

        // Standard action buttons
        const consistencyButton = this.chatContainer?.querySelector('#consistency-check-btn');
        if (consistencyButton) {
            consistencyButton.addEventListener('click', () => {
                void this.checkConsistency();
            });
        }

        const improvementsButton = this.chatContainer?.querySelector('#story-improvements-btn');
        if (improvementsButton) {
            improvementsButton.addEventListener('click', () => {
                void this.suggestImprovements();
            });
        }
    }

    /**
     * Auto-resize textarea based on content
     */
    private autoResizeTextarea(): void {
        if (!this.messageInput) return;
        
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = `${Math.min(this.messageInput.scrollHeight, 200)}px`;
    }

    /**
     * Update send button state based on input
     */
    private updateSendButtonState(): void {
        if (!this.sendButton || !this.messageInput) return;

        const hasText = this.messageInput.value.trim().length > 0;
        const canSend = hasText && !this.isStreamingResponse;

        this.sendButton.disabled = !canSend;
        this.sendButton.style.opacity = canSend ? '1' : '0.6';
        this.sendButton.style.cursor = canSend ? 'pointer' : 'not-allowed';
    }

    /**
     * Toggle between send and stop buttons
     */
    private toggleButtons(isStreaming: boolean): void {
        if (!this.sendButton || !this.stopButton) return;

        if (isStreaming) {
            this.sendButton.style.display = 'none';
            this.stopButton.style.display = 'flex';
        } else {
            this.sendButton.style.display = 'flex';
            this.stopButton.style.display = 'none';
        }
    }

    /**
     * Send a message
     */
    private async sendMessage(): Promise<void> {
        if (!this.messageInput || !this.messagesContainer) return;
        
        const messageContent = this.messageInput.value.trim();
        if (!messageContent || this.isStreamingResponse) return;

        // Clear input and update UI
        this.messageInput.value = '';
        this.autoResizeTextarea();
        this.updateSendButtonState();

        // Create user message
        const userMessage: ChatMessage = {
            id: this.generateId(),
            role: 'user',
            content: messageContent,
            timestamp: new Date(),
            isStreaming: false
        };

        // Add user message to conversation
        this.messages.push(userMessage);
        this.displayMessage(userMessage);

        // Create assistant message placeholder
        const assistantMessage: ChatMessage = {
            id: this.generateId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true
        };

        this.messages.push(assistantMessage);
        const messageElement = this.displayMessage(assistantMessage);

        // Set streaming state
        this.isStreamingResponse = true;
        this.currentStreamingMessageId = assistantMessage.id;
        this.toggleButtons(true);
        this.updateSendButtonState();

        // Prepare conversation context
        const conversationMessages: OpenRouterMessage[] = [];
        
        // Add system prompt if we have one
        if (this.customSystemPrompt) {
            conversationMessages.push({
                role: 'system',
                content: this.customSystemPrompt
            });
        }
        
        // Add previous messages (excluding streaming ones)
        const previousMessages = this.messages
            .filter(m => !m.isStreaming)
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content
            }));
        
        conversationMessages.push(...previousMessages);

        // Add current user message
        conversationMessages.push({
            role: 'user',
            content: messageContent
        });

        // Stream the response
        const callbacks: StreamingCallbacks = {
            onStart: () => {
                // Already handled above
            },
            onChunk: (chunk: string) => {
                assistantMessage.content += chunk;
                this.updateMessageContent(messageElement, assistantMessage.content);
                this.scrollToBottom();
            },
            onComplete: (fullResponse: string) => {
                assistantMessage.content = fullResponse;
                assistantMessage.isStreaming = false;
                this.updateMessageContent(messageElement, fullResponse);
                this.isStreamingResponse = false;
                this.currentStreamingMessageId = null;
                this.toggleButtons(false);
                this.updateSendButtonState();
            },
            onError: (error: Error) => {
                console.error('Chat streaming error:', error);
                assistantMessage.content = `Error: ${error.message}`;
                assistantMessage.isStreaming = false;
                this.updateMessageContent(messageElement, assistantMessage.content);
                this.isStreamingResponse = false;
                this.currentStreamingMessageId = null;
                this.toggleButtons(false);
                this.updateSendButtonState();
            }
        };

        try {
            // Use the selected model purpose and conversation format
            await this.openRouterClient.chatStreamConversation(this.selectedModelPurpose, conversationMessages, callbacks);
        } catch (error) {
            console.error('Failed to start chat stream:', error);
            callbacks.onError?.(error instanceof Error ? error : new Error('Unknown error'));
        }
    }

    /**
     * Stop the current generation
     */
    private stopGeneration(): void {
        if (this.isStreamingResponse) {
            this.openRouterClient.abort();
            this.isStreamingResponse = false;
            this.currentStreamingMessageId = null;
            this.toggleButtons(false);
            this.updateSendButtonState();

            // Update the streaming message to indicate it was stopped
            if (this.currentStreamingMessageId) {
                const message = this.messages.find(m => m.id === this.currentStreamingMessageId);
                if (message) {
                    message.isStreaming = false;
                    message.content += '\n\n[Generation stopped by user]';
                }
            }
        }
    }

    /**
     * Display a message in the chat
     */
    private displayMessage(message: ChatMessage): HTMLElement {
        if (!this.messagesContainer) throw new Error('Messages container not found');

        const messageElement = document.createElement('div');
        messageElement.id = `message-${message.id}`;
        messageElement.className = `message message-${message.role}`;
        
        const isUser = message.role === 'user';
        
        messageElement.style.cssText = `
            display: flex;
            flex-direction: column;
            max-width: 70%;
            align-self: ${isUser ? 'flex-end' : 'flex-start'};
            margin-bottom: 1rem;
        `;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.style.cssText = `
            background: ${isUser ? '#007bff' : '#f1f3f4'};
            color: ${isUser ? 'white' : '#333'};
            padding: 0.75rem 1rem;
            border-radius: 18px;
            word-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.4;
            ${isUser ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}
        `;

        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = message.content;

        // Add streaming indicator for assistant messages
        if (message.isStreaming) {
            const streamingIndicator = document.createElement('span');
            streamingIndicator.className = 'streaming-cursor';
            streamingIndicator.textContent = '▋';
            streamingIndicator.style.cssText = `
                animation: blink 1s infinite;
                margin-left: 2px;
            `;
            messageText.appendChild(streamingIndicator);

            // Add CSS animation if not already present
            if (!document.querySelector('#streaming-animation')) {
                const style = document.createElement('style');
                style.id = 'streaming-animation';
                style.textContent = `
                    @keyframes blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        messageContent.appendChild(messageText);
        messageElement.appendChild(messageContent);

        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.style.cssText = `
            font-size: 0.75rem;
            color: #888;
            margin-top: 0.25rem;
            text-align: ${isUser ? 'right' : 'left'};
        `;
        timestamp.textContent = this.formatTimestamp(message.timestamp);
        messageElement.appendChild(timestamp);

        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();

        return messageElement;
    }

    /**
     * Update the content of a message element
     */
    private updateMessageContent(messageElement: HTMLElement, content: string): void {
        const messageText = messageElement.querySelector('.message-text');
        if (messageText) {
            // Get the message ID to check if it's still streaming
            const messageId = messageElement.id.replace('message-', '');
            const message = this.messages.find(m => m.id === messageId);
            
            // Only preserve streaming cursor if the message is still streaming
            const streamingCursor = messageText.querySelector('.streaming-cursor');
            messageText.textContent = content;
            
            // Only re-add the cursor if the message is still actively streaming
            if (streamingCursor && message?.isStreaming) {
                messageText.appendChild(streamingCursor);
            }
        }
    }

    /**
     * Clear all messages from the display
     */
    private clearMessages(): void {
        this.messages = [];
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
        }
    }

    /**
     * Scroll to the bottom of the messages container
     */
    private scrollToBottom(): void {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * Format timestamp for display
     */
    private formatTimestamp(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return date.toLocaleDateString();
    }

    /**
     * Generate a unique ID
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    /**
     * Get display name for a model purpose
     */
    private getModelDisplayName(purpose: string): string {
        const modelId = this.openRouterClient.getModelForPurpose(purpose);
        return modelId || 'Not configured';
    }

    /**
     * Get all messages
     */
    public getMessages(): ChatMessage[] {
        return this.messages;
    }

    /**
     * Check consistency of all leaf nodes
     */
    private async checkConsistency(): Promise<void> {
        if (this.isStreamingResponse || !this.customSystemPrompt) return;

        const consistencyPrompt = `Please analyze all the leaf nodes (the actual content sections) for consistency. 

Check for:
- Consistent tone and writing style
- Coherent narrative flow and continuity
- Consistent character portrayal (if applicable)
- Consistent world-building and setting details
- Logical progression of ideas or plot
- Consistent terminology and naming conventions

Provide a detailed commentary on whether the text is consistent across all sections, and point out any inconsistencies or areas where the coherence could be improved.`;

        await this.sendPredefinedMessage(consistencyPrompt);
    }

    /**
     * Suggest story improvements for leaf nodes
     */
    private async suggestImprovements(): Promise<void> {
        if (this.isStreamingResponse || !this.customSystemPrompt) return;

        const improvementPrompt = `Please review all the leaf nodes (the actual content sections) and suggest what you would change to improve the story.

Focus on:
- Areas where the narrative could be strengthened
- Character development opportunities
- Plot pacing and structure improvements
- Dialogue enhancement suggestions
- Setting and atmosphere improvements
- Areas that could benefit from more detail or emotion
- Sections that might be redundant or unclear

For each suggestion, provide clear justification for why the change would improve the overall story. Be specific about which sections need attention and what kind of improvements would be most beneficial.`;

        await this.sendPredefinedMessage(improvementPrompt);
    }

    /**
     * Send a predefined message automatically
     */
    private async sendPredefinedMessage(message: string): Promise<void> {
        if (!this.messageInput) return;

        // Set the message in the input field and send it
        this.messageInput.value = message;
        this.autoResizeTextarea();
        this.updateSendButtonState();
        await this.sendMessage();
    }
} 