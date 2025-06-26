import { ChatInterface } from './chat-interface';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';

/**
 * Demo initialization for the chat interface
 * This shows how to set up and use the chat interface
 */
export function initializeChatDemo(): void {
    // Get or create a container for the chat interface
    const chatContainer = document.getElementById('chat-container') || createChatContainer();
    
    // Initialize required services (you'll need to adapt this to your app's initialization)
    const settingsManager = new SettingsManager();
    
    // Initialize OpenRouter client (you'll need to provide actual API key and models)
    const openRouterClient = new OpenRouterClient('your-api-key-here', {
        'creator': 'openai/gpt-4o' // Configure your preferred model
    });
    
    openRouterClient.setSettingsManager(settingsManager);
    
    // Create and initialize the chat interface
    const chatInterface = new ChatInterface(openRouterClient, settingsManager);
    chatInterface.initialize(chatContainer);
    
    console.log('Chat interface initialized successfully!');
}

/**
 * Create a container for the chat interface if it doesn't exist
 */
function createChatContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'chat-container';
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 1000;
        background: white;
    `;
    
    document.body.appendChild(container);
    return container;
}

/**
 * Initialize chat in a modal/overlay
 */
export function initializeChatModal(): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        box-sizing: border-box;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 90%;
        max-width: 1200px;
        height: 80%;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
        overflow: hidden;
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Initialize services and chat interface
    const settingsManager = new SettingsManager();
    const openRouterClient = new OpenRouterClient('your-api-key-here', {
        'creator': 'openai/gpt-4o'
    });
    openRouterClient.setSettingsManager(settingsManager);
    
    const chatInterface = new ChatInterface(openRouterClient, settingsManager);
    chatInterface.initialize(modal);
    
    // Close modal on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
    
    // Close modal on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
}

// Example of how you might integrate this into your existing app
export function addChatButton(): void {
    const button = document.createElement('button');
    button.textContent = '💬 Open Chat';
    button.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 1rem 1.5rem;
        font-size: 1rem;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        z-index: 999;
        transition: transform 0.2s;
    `;
    
    button.addEventListener('click', initializeChatModal);
    button.addEventListener('mouseover', () => {
        button.style.transform = 'scale(1.05)';
    });
    button.addEventListener('mouseout', () => {
        button.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(button);
} 