import { ProjectTemplate } from './ProjectTemplate';
import { StorageService, IStorageService } from './StorageService';

export const TEMPLATE_STORAGE_KEY = 'expert_app_project_templates';

// Comprehensive set of default templates for various document types
const defaultTemplates: Record<string, ProjectTemplate> = {
    // === NOVEL TEMPLATES ===
    "Standard Novel": new ProjectTemplate(
        "Standard Novel",
        ['Book', 'Part 3', 'Chapter 8', 'Scene'],
        ['Main Outline', 'Character Profiles', 'Setting Guide', 'Timeline']
    ),

    "Hero's Journey Novel": new ProjectTemplate(
        "Hero's Journey Novel",
        ['Book', 'Journey Stage 17', 'Chapter 5', 'Scene'],
        ['Hero\'s Journey Outline', 'Character Archetypes', 'World Building', 'Theme Notes']
    ),

    "Save the Cat Novel": new ProjectTemplate(
        "Save the Cat Novel",
        ['Book', 'Beat Sheet 15', 'Chapter 6', 'Scene'],
        ['15-Beat Structure', 'Character Arcs', 'Genre Requirements', 'Logline']
    ),

    "Three-Act Novel": new ProjectTemplate(
        "Three-Act Novel",
        ['Book', 'Act 3', 'Chapter 10', 'Scene'],
        ['Plot Structure', 'Character Development', 'Setting Details', 'Themes']
    ),

    "Romance Novel": new ProjectTemplate(
        "Romance Novel",
        ['Book', 'Relationship Arc 8', 'Chapter 12', 'Scene'],
        ['Romance Plot', 'Character Chemistry', 'Emotional Beats', 'Trope Guide']
    ),

    "Mystery Novel": new ProjectTemplate(
        "Mystery Novel",
        ['Book', 'Investigation Phase 6', 'Chapter 15', 'Scene'],
        ['Plot Outline', 'Clue Tracker', 'Character Suspects', 'Red Herrings']
    ),

    "Fantasy Epic": new ProjectTemplate(
        "Fantasy Epic",
        ['Series', 'Book 5', 'Part 4', 'Chapter 12'],
        ['World Bible', 'Magic System', 'Character Lineages', 'Political Map', 'Timeline']
    ),

    "Sci-Fi Novel": new ProjectTemplate(
        "Sci-Fi Novel",
        ['Book', 'Part 3', 'Chapter 10', 'Scene'],
        ['Technology Guide', 'World Building', 'Character Profiles', 'Scientific Concepts']
    ),

    // === SHORT PROSE TEMPLATES ===
    "Short Story": new ProjectTemplate(
        "Short Story",
        ['Story', 'Act 3', 'Scene'],
        ['Character Sketch', 'Theme Notes', 'Setting Details']
    ),

    "Flash Fiction": new ProjectTemplate(
        "Flash Fiction",
        ['Story', 'Beat 5', 'Moment'],
        ['Concept', 'Character Note', 'Twist Ending']
    ),

    "Novella": new ProjectTemplate(
        "Novella",
        ['Novella', 'Part 3', 'Chapter 5', 'Scene'],
        ['Plot Outline', 'Character Development', 'Theme Exploration']
    ),

    "Short Story Collection": new ProjectTemplate(
        "Short Story Collection",
        ['Collection', 'Theme 5', 'Story 8', 'Scene'],
        ['Collection Theme', 'Story Summaries', 'Author Bio', 'Publication Notes']
    ),

    "Memoir Chapter": new ProjectTemplate(
        "Memoir Chapter",
        ['Memoir', 'Life Phase 6', 'Chapter 8', 'Memory'],
        ['Timeline', 'Photo References', 'Reflection Notes', 'Family Tree']
    ),

    "Personal Essay": new ProjectTemplate(
        "Personal Essay",
        ['Essay', 'Section 4', 'Point'],
        ['Thesis Statement', 'Personal Examples', 'Research Notes']
    ),

    // === SCREENWRITING TEMPLATES ===
    "Feature Screenplay": new ProjectTemplate(
        "Feature Screenplay",
        ['Screenplay', 'Act 3', 'Sequence 8', 'Scene'],
        ['Treatment', 'Character Breakdowns', 'Location List', 'Beat Sheet']
    ),

    "TV Series": new ProjectTemplate(
        "TV Series",
        ['Series', 'Season 5', 'Episode 22', 'Act 4'],
        ['Series Bible', 'Character Arcs', 'Season Outlines', 'Episode Templates']
    ),

    "Short Film": new ProjectTemplate(
        "Short Film",
        ['Film', 'Act 3', 'Scene'],
        ['Concept', 'Character Notes', 'Visual Style', 'Production Notes']
    ),

    // === NON-FICTION TEMPLATES ===
    "Technical Manual": new ProjectTemplate(
        "Technical Manual",
        ['Manual', 'Section 8', 'Topic 5', 'Procedure'],
        ['Table of Contents', 'Glossary', 'Index', 'Troubleshooting Guide']
    ),

    "Business Presentation": new ProjectTemplate(
        "Business Presentation",
        ['Presentation', 'Section 7', 'Slide 10'],
        ['Executive Summary', 'Data Sources', 'Appendices', 'Speaker Notes']
    ),

    "Academic Paper": new ProjectTemplate(
        "Academic Paper",
        ['Paper', 'Chapter 6', 'Section 4', 'Subsection'],
        ['Abstract', 'Literature Review', 'Methodology', 'Bibliography']
    ),

    "Research Report": new ProjectTemplate(
        "Research Report",
        ['Report', 'Phase 4', 'Finding 8', 'Detail'],
        ['Executive Summary', 'Data Analysis', 'Recommendations', 'Appendices']
    ),

    "User Guide": new ProjectTemplate(
        "User Guide",
        ['Guide', 'Section 6', 'Task 8', 'Step'],
        ['Quick Start', 'FAQ', 'Troubleshooting', 'Glossary']
    ),

    "Training Manual": new ProjectTemplate(
        "Training Manual",
        ['Manual', 'Module 8', 'Lesson 5', 'Exercise'],
        ['Learning Objectives', 'Assessment Criteria', 'Resources', 'Answer Key']
    ),

    "White Paper": new ProjectTemplate(
        "White Paper",
        ['Paper', 'Section 5', 'Topic 3', 'Point'],
        ['Executive Summary', 'Problem Statement', 'Solution Analysis', 'References']
    ),

    "Blog Series": new ProjectTemplate(
        "Blog Series",
        ['Series', 'Category 5', 'Post 10', 'Section'],
        ['Content Calendar', 'SEO Keywords', 'Style Guide', 'Resource Links']
    ),

    "Marketing Plan": new ProjectTemplate(
        "Marketing Plan",
        ['Plan', 'Quarter 4', 'Campaign 6', 'Activity'],
        ['Market Analysis', 'Target Personas', 'Budget Breakdown', 'KPI Tracker']
    ),

    "Product Documentation": new ProjectTemplate(
        "Product Documentation",
        ['Documentation', 'Feature Set 8', 'Feature 12', 'Detail'],
        ['API Reference', 'Examples', 'Integration Guide', 'Changelog']
    ),

    // === EDUCATIONAL TEMPLATES ===
    "Course Curriculum": new ProjectTemplate(
        "Course Curriculum",
        ['Course', 'Unit 8', 'Lesson 5', 'Activity'],
        ['Learning Objectives', 'Assessment Rubrics', 'Resource Materials', 'Standards Alignment']
    ),

    "Thesis": new ProjectTemplate(
        "Thesis",
        ['Thesis', 'Chapter 6', 'Section 4', 'Subsection'],
        ['Literature Review', 'Methodology', 'Data Analysis', 'Bibliography']
    ),

    // === CREATIVE TEMPLATES ===
    "Poetry Collection": new ProjectTemplate(
        "Poetry Collection",
        ['Collection', 'Section 5', 'Poem'],
        ['Theme Guide', 'Style Notes', 'Publication History', 'Author Bio']
    ),

    "Game Design Document": new ProjectTemplate(
        "Game Design Document",
        ['Game', 'System 8', 'Feature 10', 'Detail'],
        ['Core Mechanics', 'Art Bible', 'Audio Guide', 'Technical Specs']
    ),

    "Cookbook": new ProjectTemplate(
        "Cookbook",
        ['Cookbook', 'Category 8', 'Recipe 15', 'Step'],
        ['Ingredient Glossary', 'Technique Guide', 'Equipment List', 'Nutritional Info']
    )
};

function areValidTemplates(data: any): data is Record<string, ProjectTemplate> {
    if (typeof data !== 'object' || data === null) return false;

    return Object.values(data).every((template: any) => {
        return (
            template &&
            typeof template.name === 'string' &&
            Array.isArray(template.hierarchyLevels) &&
            Array.isArray(template.scaffoldingDocuments)
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