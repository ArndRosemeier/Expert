import { LoopHistoryItem, Rating } from './LoopOrchestrator';
import { v4 as uuidv4 } from 'uuid';



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
    context: string = '';
    template: string[];
    generationPrompt: string | null = null;
    isPromptGenerating: boolean = false;
    generationChildrenCount: number = 5; // Default count for child generation
    
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
        this.context = '';
        this.generationSessions = [];
        this.currentGenerationSession = null;
        
        // Initialize generation count from template or default
        this.generationChildrenCount = this.parseGenerationCountFromTemplate();
    }

    /**
     * Parses generation count from template lines.
     * Looks for patterns like "Chapter 4" to extract the number 4 as the count.
     * @returns The extracted count or default value of 5.
     */
    private parseGenerationCountFromTemplate(): number {
        if (!this.template || this.isLeaf) {
            return 5; // Default count for leaf nodes or missing template
        }
        
        // Look at the CHILD level name (the level this node will generate)
        const childLevelIndex = this.level + 1;
        if (childLevelIndex >= this.template.length) {
            return 5; // Default count if no child level
        }
        
        const childLevelName = this.template[childLevelIndex];
        if (!childLevelName) {
            return 5; // Default count
        }
        
        // Look for numbers in the child level name
        // Pattern: "Chapter 4", "Act 3", "Section 7", etc.
        const match = childLevelName.match(/(\w+)\s+(\d+)/);
        if (match && match[2]) {
            const extractedCount = parseInt(match[2], 10);
            if (!isNaN(extractedCount) && extractedCount > 0 && extractedCount <= 20) {
                return extractedCount;
            }
        }
        
        return 5; // Default count if no valid number found
    }

    get content(): string {
        return this._content;
    }

    set content(newContent: string) {
        this._content = newContent;
        
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
            ? this.generationSessions[this.generationSessions.length - 1] ?? null
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
     * Extracts just the base name, so "Part 3" becomes "Part".
     * Returns null if the node is a leaf.
     */
    get childLevelName(): string | null {
        if (this.isLeaf) {
            return null;
        }
        const rawChildLevelName = this.template[this.level + 1] ?? null;
        if (!rawChildLevelName) {
            return null;
        }
        
        // Extract just the base name (remove numbers)
        // Pattern: "Part 3" -> "Part", "Chapter 10" -> "Chapter"
        const match = rawChildLevelName.match(/^(\w+)(?:\s+\d+)?$/);
        return match && match[1] ? match[1] : rawChildLevelName;
    }

    /**
     * Gets the current state of the node based on its content.
     * @returns 'Empty' if no content, 'Draft' if content starts with 'Draft:', 'Final' if has other content
     */
    getState(): 'Empty' | 'Draft' | 'Final' {
        if (!this.content || this.content.trim() === '') {
            return 'Empty';
        }
        
        if (this.content.trim().startsWith('Draft:')) {
            return 'Draft';
        }
        
        return 'Final';
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
            context: this.context,
            template: this.template,
            generationPrompt: this.generationPrompt,
            isPromptGenerating: this.isPromptGenerating,
            generationHistory: this.generationHistory,
            isGenerating: this.isGenerating,
            generationSessions: this.generationSessions,
            generationChildrenCount: this.generationChildrenCount,
        };
    }
} 