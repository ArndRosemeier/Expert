import { LoopHistoryItem, Rating } from './LoopOrchestrator';
import { v4 as uuidv4 } from 'uuid';

// A simple utility for generating unique IDs.
// In a real-world scenario, a more robust library like UUID would be used.
function generateId(): string {
    return Math.random().toString(36).substring(2, 15);
}

/**
 * Represents a single iteration attempt during content generation.
 * Each iteration contains the generated content and its quality ratings.
 */
export interface GenerationIteration {
    iteration: number;
    content: string;
    ratings: Rating[];
    wasChosen: boolean; // true if this iteration became the final content
    timestamp: Date;
}

/**
 * Complete generation session data including all iterations and metadata.
 */
export interface GenerationSession {
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    originalPrompt: string;
    iterations: GenerationIteration[];
    finalIterationNumber: number;
    success: boolean;
    totalIterationsAttempted: number;
}

export class DocumentNode {
    id: string;
    level: number;
    title: string;
    parentId: string | null;
    children: DocumentNode[] = [];

    // --- Content and Context Properties ---
    private _content: string = '';
    private _isSettingContentFromGeneration: boolean = false;
    summary: string = '';
    template: string[];
    generationPrompt: string | null = null;
    isPromptGenerating: boolean = false;
    
    // --- Legacy & Internal Properties ---
    generationHistory: LoopHistoryItem[] = [];
    isGenerating: boolean = false;

    // --- Extended Generation History ---
    generationSessions: GenerationSession[] = [];
    currentGenerationSession: GenerationSession | null = null;

    constructor(level: number, title: string, parentId: string | null = null, template: string[] = []) {
        this.id = uuidv4();
        this.level = level;
        this.title = title;
        this.parentId = parentId;
        this.template = template;

        // Initialize properties to empty/default values
        this.generationPrompt = null;
        this.isPromptGenerating = false;
        this.generationHistory = [];
        this.isGenerating = false;
        this.content = '';
        this.summary = '';
        this.generationSessions = [];
        this.currentGenerationSession = null;
    }

    get content(): string {
        return this._content;
    }

    set content(newContent: string) {
        this._content = newContent;
        this.summary = ''; // Clear summary when content changes (summaries are now optional)
        
        // Clear generation history when content is manually changed (not during generation)
        if (!this._isSettingContentFromGeneration) {
            this.generationHistory = [];
            this.generationSessions = [];
            this.currentGenerationSession = null;
        }
    }

    /**
     * Sets content during generation process without clearing generation history.
     * This should only be called by the generation system.
     */
    setContentFromGeneration(newContent: string): void {
        this._isSettingContentFromGeneration = true;
        this.content = newContent;
        this._isSettingContentFromGeneration = false;
    }

    /**
     * Starts a new generation session.
     */
    startGenerationSession(originalPrompt: string): string {
        const sessionId = uuidv4();
        this.currentGenerationSession = {
            sessionId,
            startTime: new Date(),
            originalPrompt,
            iterations: [],
            finalIterationNumber: 0,
            success: false,
            totalIterationsAttempted: 0
        };
        return sessionId;
    }

    /**
     * Adds an iteration to the current generation session.
     */
    addGenerationIteration(iteration: number, content: string, ratings: Rating[]): void {
        if (!this.currentGenerationSession) {
            throw new Error('No active generation session. Call startGenerationSession first.');
        }

        const generationIteration: GenerationIteration = {
            iteration,
            content,
            ratings: ratings.map(r => ({ ...r })), // Deep copy ratings
            wasChosen: false, // Will be set later when session ends
            timestamp: new Date()
        };

        this.currentGenerationSession.iterations.push(generationIteration);
        this.currentGenerationSession.totalIterationsAttempted = Math.max(
            this.currentGenerationSession.totalIterationsAttempted, 
            iteration
        );
    }

    /**
     * Ends the current generation session and marks the final content.
     */
    endGenerationSession(success: boolean, finalContent: string): void {
        if (!this.currentGenerationSession) {
            throw new Error('No active generation session to end.');
        }

        this.currentGenerationSession.endTime = new Date();
        this.currentGenerationSession.success = success;

        // Find and mark the iteration that matches the final content
        const finalIteration = this.currentGenerationSession.iterations.find(
            iter => iter.content === finalContent
        );
        
        if (finalIteration) {
            finalIteration.wasChosen = true;
            this.currentGenerationSession.finalIterationNumber = finalIteration.iteration;
        } else {
            // If no exact match found, assume the last iteration was chosen
            const lastIteration = this.currentGenerationSession.iterations[
                this.currentGenerationSession.iterations.length - 1
            ];
            if (lastIteration) {
                lastIteration.wasChosen = true;
                this.currentGenerationSession.finalIterationNumber = lastIteration.iteration;
            }
        }

        // Move completed session to history
        this.generationSessions.push(this.currentGenerationSession);
        this.currentGenerationSession = null;
    }

    /**
     * Gets the most recent generation session.
     */
    getLatestGenerationSession(): GenerationSession | null {
        return this.generationSessions.length > 0 
            ? this.generationSessions[this.generationSessions.length - 1]
            : null;
    }

    /**
     * Gets all rejected iterations from the latest generation session.
     */
    getRejectedIterations(): GenerationIteration[] {
        const latestSession = this.getLatestGenerationSession();
        return latestSession 
            ? latestSession.iterations.filter(iter => !iter.wasChosen)
            : [];
    }

    /**
     * Gets the chosen iteration from the latest generation session.
     */
    getChosenIteration(): GenerationIteration | null {
        const latestSession = this.getLatestGenerationSession();
        return latestSession 
            ? latestSession.iterations.find(iter => iter.wasChosen) || null
            : null;
    }

    /**
     * Checks if the node is a leaf node according to its template.
     * A node is a leaf if its level is the last one defined in the template.
     */
    get isLeaf(): boolean {
        // Level is 0-indexed, template length is 1-based.
        return this.level >= this.template.length - 1;
    }

    /**
     * Gets the name for the next level of children.
     * e.g., if this node is an "Act" (level 1), it would return "Chapter" (level 2).
     * Returns null if the node is a leaf.
     */
    get childLevelName(): string | null {
        if (this.isLeaf) {
            return null;
        }
        return this.template[this.level + 1] || null;
    }

    /**
     * Custom serializer for JSON.stringify.
     * Ensures private fields and getters are correctly serialized.
     */
    toJSON() {
        return {
            id: this.id,
            level: this.level,
            title: this.title,
            parentId: this.parentId,
            children: this.children,
            content: this._content, // Serialize private _content as 'content'
            summary: this.summary,
            template: this.template,
            generationPrompt: this.generationPrompt,
            isPromptGenerating: this.isPromptGenerating,
            generationHistory: this.generationHistory,
            isGenerating: this.isGenerating,
            generationSessions: this.generationSessions,
        };
    }
} 