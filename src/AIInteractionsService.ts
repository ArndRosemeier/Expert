import { StorageService } from './StorageService';

export class AIInteractionsService {
    private static instance: AIInteractionsService | null = null;
    private isEnabled: boolean = false;
    private overlay: HTMLElement | null = null;
    private promptContent: HTMLElement | null = null;
    private responseContent: HTMLElement | null = null;
    private storageService: StorageService | null = null;

    private constructor() {
        // Don't load settings in constructor - do it in initialize
    }

    public static getInstance(): AIInteractionsService {
        if (!AIInteractionsService.instance) {
            AIInteractionsService.instance = new AIInteractionsService();
        }
        return AIInteractionsService.instance;
    }

    /**
     * Initialize the service and set up event listeners
     */
    public async initialize(): Promise<void> {
        await this.initializeStorage();
        await this.loadSettings();
        this.setupCheckboxListener();
        this.setupOverlayElements();
    }

    /**
     * Initialize storage service
     */
    private async initializeStorage(): Promise<void> {
        this.storageService = await StorageService.getInstance();
    }

    /**
     * Set up the checkbox event listener
     */
    private setupCheckboxListener(): void {
        const checkbox = document.getElementById('ai-interactions-checkbox') as HTMLInputElement;
        if (checkbox) {
            checkbox.checked = this.isEnabled;
            checkbox.addEventListener('change', async (e) => {
                this.isEnabled = (e.target as HTMLInputElement).checked;
                await this.saveSettings();
            });
        }
    }

    /**
     * Set up overlay DOM elements
     */
    private setupOverlayElements(): void {
        this.overlay = document.getElementById('ai-interactions-overlay');
        this.promptContent = document.getElementById('ai-prompt-content');
        this.responseContent = document.getElementById('ai-response-content');

        // Set up close button
        const closeBtn = document.getElementById('close-ai-overlay');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideOverlay());
        }

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay && this.overlay.style.display !== 'none') {
                this.hideOverlay();
            }
        });
    }

    /**
     * Show the AI interactions overlay with prompt content
     */
    public showInteraction(purpose: string, prompt: string): void {
        if (!this.isEnabled || !this.overlay || !this.promptContent || !this.responseContent) {
            return;
        }

        // Update header with purpose
        const header = this.overlay.querySelector('.ai-overlay-header h3');
        if (header) {
            header.textContent = `🤖 AI Interaction - ${purpose}`;
        }

        // Set prompt content
        this.promptContent.textContent = prompt;
        
        // Clear previous response
        this.responseContent.textContent = 'Waiting for response...';

        // Show overlay
        this.overlay.style.display = 'flex';
    }

    /**
     * Update the response content with streaming chunks
     */
    public updateResponse(chunk: string): void {
        if (!this.isEnabled || !this.responseContent) {
            return;
        }

        // If this is the first chunk, clear the "waiting" message
        if (this.responseContent.textContent === 'Waiting for response...') {
            this.responseContent.textContent = '';
        }

        this.responseContent.textContent += chunk;
        
        // Auto-scroll to bottom
        this.responseContent.scrollTop = this.responseContent.scrollHeight;
    }

    /**
     * Complete the interaction (called when streaming is done)
     */
    public completeInteraction(): void {
        if (!this.isEnabled) {
            return;
        }

        // Add a completion indicator
        setTimeout(() => {
            if (this.responseContent && this.responseContent.textContent) {
                this.responseContent.textContent += '\n\n--- Response Complete ---';
                this.responseContent.scrollTop = this.responseContent.scrollHeight;
            }
        }, 500);
    }

    /**
     * Hide the overlay
     */
    public hideOverlay(): void {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }

    /**
     * Check if AI interactions are enabled
     */
    public isInteractionsEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Save settings to StorageService
     */
    private async saveSettings(): Promise<void> {
        try {
            if (!this.storageService) {
                console.warn('StorageService not initialized, cannot save AI interactions setting');
                return;
            }
            await this.storageService.set('ai_interactions_enabled', this.isEnabled);
        } catch (error) {
            console.warn('Failed to save AI interactions setting:', error);
        }
    }

    /**
     * Load settings from StorageService
     */
    private async loadSettings(): Promise<void> {
        try {
            if (!this.storageService) {
                console.warn('StorageService not initialized, cannot load AI interactions setting');
                return;
            }
            const saved = await this.storageService.get('ai_interactions_enabled');
            if (saved !== undefined) {
                this.isEnabled = saved;
            }
        } catch (error) {
            console.warn('Failed to load AI interactions setting:', error);
            this.isEnabled = false;
        }
    }
} 