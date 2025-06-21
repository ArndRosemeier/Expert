import { LoopHistoryItem, QualityCriterion } from './LoopOrchestrator';

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
    children: DocumentNode[];

    // --- Content and Context Properties ---
    content: string;
    summary: string;
    template: string[];
    generationPrompt: string | null;
    
    // --- Legacy & Internal Properties ---
    generationHistory: LoopHistoryItem[];
    settingsProfileName: string;

    constructor(level: number, title: string, parentId: string | null = null, template: string[] = []) {
        this.id = generateId();
        this.level = level;
        this.title = title;
        this.parentId = parentId;
        this.children = [];
        this.template = template;

        // Initialize properties to empty/default values
        this.content = '';
        this.summary = '';
        this.generationPrompt = null;
        this.generationHistory = [];
        this.settingsProfileName = 'default';
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
} 