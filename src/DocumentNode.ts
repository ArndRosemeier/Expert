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

    // --- Content and Context Properties (for future phases) ---
    content: string;
    summary: string;
    inheritedContext: string;
    prompt: string;
    generationHistory: LoopHistoryItem[];
    settingsProfileName: string;

    constructor(level: number, title: string, parentId: string | null = null) {
        this.id = generateId();
        this.level = level;
        this.title = title;
        this.parentId = parentId;
        this.children = [];

        // Initialize future-phase properties to empty values
        this.content = '';
        this.summary = '';
        this.inheritedContext = '';
        this.prompt = '';
        this.generationHistory = [];
        this.settingsProfileName = 'default';
    }
} 