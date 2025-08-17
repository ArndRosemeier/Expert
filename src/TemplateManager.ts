import { ProjectTemplate } from './ProjectTemplate';
import { StorageService, IStorageService } from './StorageService';
import { STORAGE_KEYS } from './constants';

const TEMPLATE_STORAGE_KEY = STORAGE_KEYS.PROJECT_TEMPLATES;

// Comprehensive set of default templates for various document types
const defaultTemplates: Record<string, ProjectTemplate> = {
    // === NOVEL TEMPLATES ===
    "Standard Novel": new ProjectTemplate(
        "Standard Novel",
        ['Book', 'Act 3', 'Chapter', 'Scene']
    ),

    "Hero's Journey Novel": new ProjectTemplate(
        "Hero's Journey Novel",
        ['Book', 'Journey Stage 17', 'Chapter', 'Scene']
    ),

    "Save the Cat Novel": new ProjectTemplate(
        "Save the Cat Novel",
        ['Book', 'Beat Sheet 15', 'Chapter', 'Scene']
    ),

    "Three-Act Novel": new ProjectTemplate(
        "Three-Act Novel",
        ['Book', 'Act 3', 'Chapter', 'Scene']
    ),

    "Romance Novel": new ProjectTemplate(
        "Romance Novel",
        ['Book', 'Relationship Arc 8', 'Chapter', 'Scene']
    ),

    "Mystery Novel": new ProjectTemplate(
        "Mystery Novel",
        ['Book', 'Investigation Phase 6', 'Chapter', 'Scene']
    ),

    "Epic": new ProjectTemplate(
        "Epic",
        ['Series', 'Book 3', 'Act 3', 'Chapter', 'Scene']
    ),

    // === SHORT PROSE TEMPLATES ===
    "Short Story": new ProjectTemplate(
        "Short Story",
        ['Story', 'Chapter', 'Scene']
    ),

    "Personal Essay": new ProjectTemplate(
        "Personal Essay",
        ['Essay', 'Section 4', 'Point']
    ),

    // === NON-FICTION TEMPLATES ===
    "Technical Manual": new ProjectTemplate(
        "Technical Manual",
        ['Manual', 'Section', 'Topic', 'Procedure']
    ),

    "Business Presentation": new ProjectTemplate(
        "Business Presentation",
        ['Presentation', 'Section', 'Slide']
    ),

    "Academic Paper": new ProjectTemplate(
        "Academic Paper",
        ['Paper', 'Chapter', 'Section', 'Subsection']
    ),

    "Research Report": new ProjectTemplate(
        "Research Report",
        ['Report', 'Phase', 'Finding', 'Detail']
    ),

    "User Guide": new ProjectTemplate(
        "User Guide",
        ['Guide', 'Section', 'Task', 'Step']
    ),

    "Training Manual": new ProjectTemplate(
        "Training Manual",
        ['Manual', 'Module', 'Lesson', 'Exercise']
    ),

    "White Paper": new ProjectTemplate(
        "White Paper",
        ['Paper', 'Section', 'Topic', 'Point']
    ),

    "Marketing Plan": new ProjectTemplate(
        "Marketing Plan",
        ['Plan', 'Quarter 4', 'Campaign', 'Activity']
    ),

    // === EDUCATIONAL TEMPLATES ===
    "Thesis": new ProjectTemplate(
        "Thesis",
        ['Thesis', 'Chapter', 'Section', 'Subsection']
    ),

    // === CREATIVE TEMPLATES ===
    "Poetry Collection": new ProjectTemplate(
        "Poetry Collection",
        ['Collection', 'Section', 'Poem']
    ),

    "Game Design Document": new ProjectTemplate(
        "Game Design Document",
        ['Game', 'System', 'Feature', 'Detail']
    ),

    "Cookbook": new ProjectTemplate(
        "Cookbook",
        ['Cookbook', 'Category', 'Recipe', 'Step']
    )
};

function areValidTemplates(data: any): data is Record<string, ProjectTemplate> {
    if (typeof data !== 'object' || data === null) return false;

    return Object.values(data).every((template: any) => {
        return (
            template &&
            typeof template.name === 'string' &&
            Array.isArray(template.hierarchyLevels)
        );
    });
}

export class TemplateManager {
    private templates: Record<string, ProjectTemplate>;
    private storageService: Promise<IStorageService>;

    constructor() {
        this.storageService = StorageService.getInstance();
        this.templates = {};
        void this.loadTemplates();
    }

    private async loadTemplates(): Promise<void> {
        try {
            const storage = await this.storageService;
            const saved = await storage.get<Record<string, ProjectTemplate>>(TEMPLATE_STORAGE_KEY);
            
            if (saved && areValidTemplates(saved)) {
                this.templates = saved;
            } else {
                console.warn('Invalid templates found in storage. Reverting to defaults.');
                this.templates = { ...defaultTemplates };
                await this.saveAllTemplates();
            }
            } catch (error) {
            console.error('Failed to load templates from storage', error);
            // Still fall back to defaults but let the application know there was an issue
            this.templates = { ...defaultTemplates };
            // Note: Not throwing here as template loading should be resilient,
            // but the error is logged for debugging
        }
    }

    private async saveAllTemplates(): Promise<void> {
        try {
            const storage = await this.storageService;
            await storage.set(TEMPLATE_STORAGE_KEY, this.templates);
        } catch (error) {
            console.error('Failed to save templates to storage', error);
        }
    }

    public getTemplate(name: string): ProjectTemplate | undefined {
        return this.templates[name];
    }

    public getTemplateNames(): string[] {
        return Object.keys(this.templates);
    }

    public async saveTemplate(name: string, template: ProjectTemplate): Promise<void> {
        if (!name.trim()) {
            throw new Error("Template name cannot be empty.");
        }
        // Ensure the name property on the object matches the key
        template.name = name; 
        this.templates[name] = template;
        await this.saveAllTemplates();
    }

    public async deleteTemplate(name: string): Promise<void> {
        if (Object.keys(this.templates).length <= 1) {
            throw new Error("Cannot delete the last remaining template.");
        }
        delete this.templates[name];
        await this.saveAllTemplates();
    }

    public async restoreDefaults(): Promise<void> {
        this.templates = { ...defaultTemplates };
        await this.saveAllTemplates();
    }

    public getDefaultTemplateNames(): string[] {
        return Object.keys(defaultTemplates);
    }
} 