import { StorageService } from '../StorageService';
import { DocumentNode } from '../DocumentNode';
import { SettingsManager } from '../SettingsManager';
import { PromptContextBuilder } from '../services/PromptContextBuilder.js';
import { createPromptExpansionService } from '../services/PromptExpansionService.js';
import { OpenRouterClient, OpenRouterMessage, StreamingCallbacks } from '../OpenRouterClient';
import * as state from '../state.js';

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
    private nodeStructure: DocumentNode | null = null; // Store the actual node structure for roleplay
    
    // DOM elements
    private chatContainer: HTMLElement | null = null;
    private messagesContainer: HTMLElement | null = null;
    private messageInput: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private stopButton: HTMLButtonElement | null = null;
    private retryButton: HTMLButtonElement | null = null;
    private rewindButton: HTMLButtonElement | null = null;
    private modelPurposeSelect: HTMLSelectElement | null = null;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager, systemPrompt?: string, title?: string, nodeStructure?: DocumentNode) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.customSystemPrompt = systemPrompt || null;
        this.chatTitle = title || 'AI Chat';
        this.nodeStructure = nodeStructure || null;
    }

    /**
     * Load the last used chat model from storage
     */
    private async loadLastUsedModel(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const lastModel = await storage.get<string>(ChatInterface.LAST_CHAT_MODEL_KEY);
            if (lastModel && ['creator', 'editor', 'rater', 'prose'].includes(lastModel)) {
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
                            margin-bottom: 0.5rem;
                        " onmouseover="this.style.backgroundColor='#444'" onmouseout="this.style.backgroundColor='#333'">
                            🗑️ Clear Chat
                        </button>
                        <button id="copy-conversation-btn" style="
                            background: #6c757d;
                            color: white;
                            border: 1px solid #5a6268;
                            border-radius: 6px;
                            padding: 0.75rem;
                            font-size: 0.9rem;
                            cursor: pointer;
                            transition: background-color 0.2s;
                            width: 100%;
                        " onmouseover="this.style.backgroundColor='#5a6268'" onmouseout="this.style.backgroundColor='#6c757d'">
                            📋 Copy Conversation
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
                                margin-bottom: 0.5rem;
                            " onmouseover="this.style.backgroundColor='#218838'" onmouseout="this.style.backgroundColor='#28a745'">
                                ✨ Suggest Improvements
                            </button>
                            <button id="roleplay-adventure-btn" style="
                                width: 100%;
                                background: #6f42c1;
                                color: white;
                                border: 1px solid #5a2d91;
                                border-radius: 6px;
                                padding: 0.75rem;
                                font-size: 0.9rem;
                                cursor: pointer;
                                transition: background-color 0.2s;
                                text-align: left;
                            " onmouseover="this.style.backgroundColor='#5a2d91'" onmouseout="this.style.backgroundColor='#6f42c1'">
                                🎭 Roleplay Adventure
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
                                <option value="prose">Prose: ${this.getModelDisplayName('prose')}</option>
                            </select>
                        </div>
                        <div class="input-wrapper" style="
                            max-width: 800px;
                            margin: 0 auto;
                            position: relative;
                            display: flex;
                            gap: 0.5rem;
                            align-items: flex-start;
                        ">
                            <div style="flex: 1; position: relative;">
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
                            
                            <!-- Action buttons next to input, stacked vertically -->
                            <div class="action-buttons" style="
                                display: flex;
                                flex-direction: column;
                                gap: 4px;
                                margin-top: 8px;
                            ">
                                <button 
                                    id="retry-btn" 
                                    class="retry-button"
                                    style="
                                        background: #007bff;
                                        color: white;
                                        border: none;
                                        border-radius: 4px;
                                        width: 24px;
                                        height: 24px;
                                        cursor: pointer;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        transition: background-color 0.2s;
                                        font-size: 12px;
                                        opacity: 0.8;
                                    "
                                    title="Retry last message"
                                    onmouseover="this.style.opacity='1'; this.style.backgroundColor='#0056b3';"
                                    onmouseout="this.style.opacity='0.8'; this.style.backgroundColor='#007bff';"
                                >
                                    🔄
                                </button>
                                <button 
                                    id="rewind-btn" 
                                    class="rewind-button"
                                    style="
                                        background: #dc3545;
                                        color: white;
                                        border: none;
                                        border-radius: 4px;
                                        width: 24px;
                                        height: 24px;
                                        cursor: pointer;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        transition: background-color 0.2s;
                                        font-size: 12px;
                                        opacity: 0.8;
                                    "
                                    title="Delete last conversation step"
                                    onmouseover="this.style.opacity='1'; this.style.backgroundColor='#c82333';"
                                    onmouseout="this.style.opacity='0.8'; this.style.backgroundColor='#dc3545';"
                                >
                                    🗑️
                                </button>
                            </div>
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
        this.retryButton = this.chatContainer.querySelector('#retry-btn') as HTMLButtonElement;
        this.rewindButton = this.chatContainer.querySelector('#rewind-btn') as HTMLButtonElement;
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

        // New symbol buttons
        if (this.retryButton) {
            this.retryButton.addEventListener('click', () => {
                void this.retryLastMessage();
            });
        }

        if (this.rewindButton) {
            this.rewindButton.addEventListener('click', () => {
                this.rewindConversation();
            });
        }

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

        // Copy conversation button
        const copyConversationButton = this.chatContainer?.querySelector('#copy-conversation-btn');
        if (copyConversationButton) {
            copyConversationButton.addEventListener('click', () => {
                this.copyConversationToClipboard();
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

        const roleplayButton = this.chatContainer?.querySelector('#roleplay-adventure-btn');
        if (roleplayButton) {
            roleplayButton.addEventListener('click', () => {
                void this.startRoleplayAdventure();
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
                
                // Show detailed error modal for chat errors
                import('./modals').then(({ GenerationErrorService }) => {
                    const errorService = GenerationErrorService.getInstance();
                    void errorService.showStreamingError(error, this.selectedModelPurpose);
                }).catch(console.error);
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
        try {
            const modelSelector = state.getModelSelector();
            if (!modelSelector) return 'Not configured';
            
            const selectedModels = modelSelector.getSelectedModels();
            return selectedModels[purpose] || 'Not configured';
        } catch (error) {
            console.warn(`Failed to get model display name for ${purpose}:`, error);
            return 'Not configured';
        }
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

    /**
     * Retry the last message by removing the last AI response and user input, then resending
     */
    private async retryLastMessage(): Promise<void> {
        if (this.isStreamingResponse) {
            alert('Cannot retry while a response is being generated. Please wait or stop the current generation.');
            return;
        }

        // Find the last user message
        const lastUserMessageIndex = this.messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i !== -1).pop();
        
        if (lastUserMessageIndex === undefined) {
            alert('No user message found to retry.');
            return;
        }

        const lastUserMessage = this.messages[lastUserMessageIndex];
        
        if (!lastUserMessage) {
            alert('Could not find the last user message to retry.');
            return;
        }
        
        // Remove all messages from the last user message onwards (including any AI responses after it)
        this.messages = this.messages.slice(0, lastUserMessageIndex);
        
        // Re-render the messages
        this.displayAllMessages();
        
        // Set the message in the input field and send it
        if (this.messageInput) {
            this.messageInput.value = lastUserMessage.content;
            this.autoResizeTextarea();
            this.updateSendButtonState();
            await this.sendMessage();
        }
    }

    /**
     * Rewind the conversation by removing the last user message and assistant response
     */
    private rewindConversation(): void {
        if (this.isStreamingResponse) {
            alert('Cannot rewind while a response is being generated. Please wait or stop the current generation.');
            return;
        }

        if (this.messages.length === 0) {
            alert('No messages to rewind.');
            return;
        }

        // Find the last user message
        const lastUserMessageIndex = this.messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i !== -1).pop();
        
        if (lastUserMessageIndex === undefined) {
            alert('No user message found to rewind.');
            return;
        }

        // Remove all messages from the last user message onwards (including any AI responses after it)
        this.messages = this.messages.slice(0, lastUserMessageIndex);
        
        // Re-render the messages
        this.displayAllMessages();
        
        // Show feedback
        if (this.messages.length === 0) {
            // If no messages left, show a subtle confirmation
            console.log('Conversation rewound to the beginning.');
        } else {
            console.log('Conversation rewound one step.');
        }
    }

    /**
     * Copy the entire conversation to clipboard
     */
    private async copyConversationToClipboard(): Promise<void> {
        if (this.messages.length === 0) {
            alert('No conversation to copy.');
            return;
        }

        try {
            // Format the conversation
            let conversationText = `=== ${this.chatTitle} ===\n`;
            conversationText += `Generated on: ${new Date().toLocaleString()}\n\n`;

            for (const message of this.messages) {
                const role = message.role === 'user' ? 'User' : 'Assistant';
                const timestamp = this.formatTimestamp(message.timestamp);
                conversationText += `[${timestamp}] ${role}:\n`;
                conversationText += `${message.content}\n\n`;
            }

            // Copy to clipboard
            await navigator.clipboard.writeText(conversationText);
            
            // Show temporary success feedback
            const button = this.chatContainer?.querySelector('#copy-conversation-btn') as HTMLElement;
            if (button && button.textContent) {
                const originalText = button.textContent;
                button.textContent = '✅ Copied!';
                setTimeout(() => {
                    if (button) {
                        button.textContent = originalText;
                    }
                }, 2000);
            }
            
        } catch (error) {
            console.error('Failed to copy conversation:', error);
            alert('Failed to copy conversation to clipboard. This might be due to browser permissions.');
        }
    }

    /**
     * Re-display all messages in the chat
     */
    private displayAllMessages(): void {
        if (!this.messagesContainer) return;
        
        // Clear the messages container
        this.messagesContainer.innerHTML = '';
        
        // Re-display all messages
        for (const message of this.messages) {
            this.displayMessage(message);
        }
        
        this.scrollToBottom();
    }

    /**
     * Start a roleplay adventure using the roleplay prompt
     */
    private async startRoleplayAdventure(): Promise<void> {
        if (this.isStreamingResponse || !this.customSystemPrompt) return;

        // First, extract the lowest level nodes for starting position selection
        const lowestLevelNodes = this.nodeStructure ? 
            this.extractLowestLevelNodesFromStructure(this.nodeStructure) : 
            this.extractLowestLevelNodes(this.customSystemPrompt || '');
        
        if (lowestLevelNodes.length === 0) {
            alert('No suitable starting locations found in the content. The story needs some detailed scenes or sections to start a roleplay adventure.');
            return;
        }

        // Present starting location selection to user
        const selectedStartingNode = await this.showStartingLocationDialog(lowestLevelNodes);
        if (!selectedStartingNode) {
            return; // User cancelled
        }

        // Get the roleplay adventure system prompt from settings
        const prompts = this.settingsManager.getPrompts();
        const roleplayPrompt = prompts.roleplay_adventure_system;

        if (!roleplayPrompt) {
            console.error('Roleplay adventure prompt not found');
            return;
        }

        // Replace placeholders in the roleplay prompt using centralized service
        const promptContext = PromptContextBuilder.forUI(this.settingsManager, {
            nodeData: this.customSystemPrompt,
            startingNode: selectedStartingNode
        });

        // Get settings manager from active project
        const activeProject = state.getActiveProject();
        if (!activeProject) {
            throw new Error('No active project for roleplay');
        }
        const settingsManager = activeProject.getSettingsManager();
        const expansionService = createPromptExpansionService(settingsManager);
        
        const roleplaySystemPrompt = expansionService.expandPrompt(roleplayPrompt, promptContext);

        // Create roleplay message
        const roleplayMessage: ChatMessage = {
            id: this.generateId(),
            role: 'user',
            content: `Start roleplay adventure mode in: "${selectedStartingNode}"`,
            timestamp: new Date(),
            isStreaming: false
        };

        // Add user message to conversation
        this.messages.push(roleplayMessage);
        this.displayMessage(roleplayMessage);

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

        // Prepare conversation messages with roleplay system prompt
        const conversationMessages: OpenRouterMessage[] = [
            {
                role: 'system',
                content: roleplaySystemPrompt
            },
            {
                role: 'user',
                content: `Please analyze the story content and present me with the available characters I can roleplay as, focusing on those who would be present in or connected to "${selectedStartingNode}".`
            }
        ];

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
                console.error('Roleplay adventure streaming error:', error);
                assistantMessage.content = `Error starting roleplay adventure: ${error.message}`;
                assistantMessage.isStreaming = false;
                this.updateMessageContent(messageElement, assistantMessage.content);
                this.isStreamingResponse = false;
                this.currentStreamingMessageId = null;
                this.toggleButtons(false);
                this.updateSendButtonState();
                
                // Show detailed error modal for roleplay errors
                import('./modals').then(({ GenerationErrorService }) => {
                    const errorService = GenerationErrorService.getInstance();
                    void errorService.showStreamingError(error, this.selectedModelPurpose);
                }).catch(console.error);
            }
        };

        try {
            // Use the selected model purpose for roleplay
            await this.openRouterClient.chatStreamConversation(this.selectedModelPurpose, conversationMessages, callbacks);
        } catch (error) {
            console.error('Failed to start roleplay adventure stream:', error);
            callbacks.onError?.(error instanceof Error ? error : new Error('Unknown error'));
        }
    }

    /**
     * Extract the lowest level nodes (leaf nodes) from the actual node structure
     */
    private extractLowestLevelNodesFromStructure(node: DocumentNode): string[] {
        const leafNodes: DocumentNode[] = [];
        
        // Find all leaf nodes (nodes with no children)
        const findLeafNodes = (currentNode: DocumentNode): void => {
            if (currentNode.children.length === 0) {
                // This is a leaf node
                leafNodes.push(currentNode);
            } else {
                // Recursively check children
                for (const child of currentNode.children) {
                    findLeafNodes(child);
                }
            }
        };
        
        findLeafNodes(node);
        
        // Return the titles of leaf nodes
        return leafNodes.map(n => n.title);
    }

    /**
     * Extract the lowest level nodes (leaf nodes) from the context for starting location selection (fallback)
     */
    private extractLowestLevelNodes(systemPrompt: string): string[] {
        const nodes: string[] = [];
        
        // Parse the system prompt to find node structure
        // Look for patterns like "### Node Title" or "## Node Title" (markdown headers)
        const lines = systemPrompt.split('\n');
        let currentPath: string[] = [];
        let deepestLevel = 0;
        const allNodes: { title: string; level: number; path: string[] }[] = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Check for markdown headers (### Title, ## Title, etc.)
            const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                const level = headerMatch[1]!.length;
                const title = headerMatch[2]!.trim();
                
                // Update current path based on level
                currentPath = currentPath.slice(0, level - 1);
                currentPath.push(title);
                
                // Track deepest level
                if (level > deepestLevel) {
                    deepestLevel = level;
                }
                
                allNodes.push({
                    title,
                    level,
                    path: [...currentPath]
                });
            }
        }
        
        // Extract nodes at the deepest level (leaf nodes)
        const leafNodes = allNodes.filter(node => node.level === deepestLevel);
        
        // If we have leaf nodes, return their titles
        if (leafNodes.length > 0) {
            return leafNodes.map(node => node.title);
        }
        
        // Fallback: if no clear hierarchy, look for any content sections
        // Look for lines that might be titles or section headers
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length > 0 && 
                !trimmedLine.startsWith('You are') && 
                !trimmedLine.startsWith('Here is') && 
                !trimmedLine.startsWith('This is') &&
                trimmedLine.length < 100 && // Reasonable title length
                !trimmedLine.includes(':') && // Avoid metadata lines
                trimmedLine !== trimmedLine.toLowerCase()) { // Has some capitalization
                nodes.push(trimmedLine);
            }
        }
        
        // Remove duplicates and limit to reasonable number
        return [...new Set(nodes)].slice(0, 20);
    }

    /**
     * Show a dialog for selecting the starting location
     */
    private async showStartingLocationDialog(locations: string[]): Promise<string | null> {
        return new Promise((resolve) => {
            // Create modal backdrop
            const backdrop = document.createElement('div');
            backdrop.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

            // Create modal dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 2rem;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            `;

            // Create dialog content
            dialog.innerHTML = `
                <h2 style="margin: 0 0 1rem 0; color: #333; font-size: 1.5rem;">
                    🎭 Choose Starting Location
                </h2>
                <p style="margin: 0 0 1.5rem 0; color: #666; line-height: 1.5;">
                    Select where you want your roleplay adventure to begin. These are the detailed scenes and locations available in your story:
                </p>
                <div id="location-list" style="margin: 0 0 1.5rem 0;">
                    ${locations.map((location, index) => `
                        <div class="location-option" data-location="${location}" style="
                            padding: 1rem;
                            margin: 0.5rem 0;
                            border: 2px solid #e1e5e9;
                            border-radius: 8px;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            background: #f8f9fa;
                        ">
                            <strong>${index + 1}. ${location}</strong>
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 1rem;">
                    <button id="cancel-roleplay" style="
                        padding: 0.75rem 1.5rem;
                        border: 2px solid #6c757d;
                        background: transparent;
                        color: #6c757d;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 1rem;
                    ">Cancel</button>
                </div>
            `;

            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            // Add event listeners
            const locationOptions = dialog.querySelectorAll('.location-option');
            locationOptions.forEach(option => {
                option.addEventListener('mouseenter', () => {
                    const element = option as HTMLElement;
                    element.style.borderColor = '#007bff';
                    element.style.background = '#e7f3ff';
                });
                
                option.addEventListener('mouseleave', () => {
                    const element = option as HTMLElement;
                    element.style.borderColor = '#e1e5e9';
                    element.style.background = '#f8f9fa';
                });
                
                option.addEventListener('click', () => {
                    const location = option.getAttribute('data-location');
                    document.body.removeChild(backdrop);
                    resolve(location);
                });
            });

            const cancelButton = dialog.querySelector('#cancel-roleplay');
            cancelButton?.addEventListener('click', () => {
                document.body.removeChild(backdrop);
                resolve(null);
            });

            // Close on backdrop click
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    document.body.removeChild(backdrop);
                    resolve(null);
                }
            });
        });
    }
} 