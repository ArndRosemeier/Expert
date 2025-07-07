export class AIInteractionsService {
    private static instance: AIInteractionsService | null = null;
    private isEnabled: boolean = false;
    private overlay: HTMLElement | null = null;
    private promptContent: HTMLElement | null = null;
    private responseContent: HTMLElement | null = null;

    private constructor() {
        this.loadSettings();
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
    public initialize(): void {
        this.setupCheckboxListener();
        this.setupOverlayElements();
    }

    /**
     * Set up the checkbox event listener
     */
    private setupCheckboxListener(): void {
        const checkbox = document.getElementById('ai-interactions-checkbox') as HTMLInputElement;
        if (checkbox) {
            checkbox.checked = this.isEnabled;
            checkbox.addEventListener('change', (e) => {
                this.isEnabled = (e.target as HTMLInputElement).checked;
                this.saveSettings();
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
     * Save settings to localStorage
     */
    private saveSettings(): void {
        try {
            localStorage.setItem('ai_interactions_enabled', JSON.stringify(this.isEnabled));
        } catch (error) {
            console.warn('Failed to save AI interactions setting:', error);
        }
    }

    /**
     * Load settings from localStorage
     */
    private loadSettings(): void {
        try {
            const saved = localStorage.getItem('ai_interactions_enabled');
            if (saved !== null) {
                this.isEnabled = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Failed to load AI interactions setting:', error);
            this.isEnabled = false;
        }
    }
} 