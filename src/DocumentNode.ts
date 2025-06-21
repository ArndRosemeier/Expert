import { LoopHistoryItem } from './LoopOrchestrator';
import { v4 as uuidv4 } from 'uuid';

// A simple utility for generating unique IDs.
// In a real-world scenario, a more robust library like UUID would be used.
function generateId(): string {
    return Math.random().toString(36).substring(2, 15);
}

export class DocumentNode {
    id: string;
    level: number;
    title: string;
    parentId: string | null;
    children: DocumentNode[] = [];

    // --- Content and Context Properties ---
    private _content: string = '';
    summary: string = '';
    template: string[];
    generationPrompt: string | null = null;
    isPromptGenerating: boolean = false;
    
    // --- Legacy & Internal Properties ---
    generationHistory: LoopHistoryItem[] = [];
    settingsProfileName: string = 'default';
    isGenerating: boolean = false;

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
        this.settingsProfileName = 'default';
        this.isGenerating = false;
        this.content = '';
        this.summary = '';
    }

    get content(): string {
        return this._content;
    }

    set content(newContent: string) {
        this._content = newContent;
        this.summary = ''; // Automatically clear summary when content changes.
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
            settingsProfileName: this.settingsProfileName,
            isGenerating: this.isGenerating,
        };
    }
} 