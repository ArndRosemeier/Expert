export class AIProgressService {
    private static instance: AIProgressService | null = null;
    private progressElement: HTMLElement | null = null;
    private characterCount: number = 0;
    private vanishTimer: number | null = null;
    private isActive: boolean = false;

    private constructor() {}

    public static getInstance(): AIProgressService {
        if (!AIProgressService.instance) {
            AIProgressService.instance = new AIProgressService();
        }
        return AIProgressService.instance;
    }

    /**
     * Initialize the service and get the progress element
     */
    public initialize(): void {
        this.progressElement = document.getElementById('ai-progress-report');
    }

    /**
     * Start tracking a new AI interaction
     */
    public startInteraction(): void {
        if (!this.progressElement) return;

        this.isActive = true;
        this.characterCount = 0;
        this.clearVanishTimer();
        
        this.progressElement.textContent = 'Waiting for response...';
        this.progressElement.style.display = 'block';
    }

    /**
     * Update with received characters
     */
    public updateCharacters(chunk: string): void {
        if (!this.progressElement || !this.isActive) return;

        this.characterCount += chunk.length;
        this.clearVanishTimer();
        
        this.progressElement.textContent = `${this.characterCount} characters received so far...`;
    }

    /**
     * Mark interaction as complete
     */
    public completeInteraction(): void {
        if (!this.progressElement || !this.isActive) return;

        this.clearVanishTimer();
        this.progressElement.textContent = `Done. ${this.characterCount} characters received.`;
        
        // Set 3-second auto-vanish timer
        this.vanishTimer = window.setTimeout(() => {
            this.hideProgress();
        }, 3000);
    }

    /**
     * Hide the progress display
     */
    private hideProgress(): void {
        if (this.progressElement) {
            this.progressElement.style.display = 'none';
        }
        this.isActive = false;
        this.characterCount = 0;
        this.clearVanishTimer();
    }

    /**
     * Clear the vanish timer
     */
    private clearVanishTimer(): void {
        if (this.vanishTimer !== null) {
            clearTimeout(this.vanishTimer);
            this.vanishTimer = null;
        }
    }

    /**
     * Check if currently tracking an interaction
     */
    public isTrackingInteraction(): boolean {
        return this.isActive;
    }
} 