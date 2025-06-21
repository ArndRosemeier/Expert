import { ProjectTemplate } from './ProjectTemplate';

export const TEMPLATE_STORAGE_KEY = 'expert_app_project_templates';

// A simple default template to ensure the app has something to start with.
const defaultNovelTemplate = new ProjectTemplate(
    "Standard Novel",
    ['Book', 'Act', 'Chapter', 'Scene'],
    ['Main Outline', 'Character Bios']
);

const defaultTemplates: Record<string, ProjectTemplate> = {
    "Standard Novel": defaultNovelTemplate
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

    constructor() {
        this.templates = this.loadTemplates();
    }

    private loadTemplates(): Record<string, ProjectTemplate> {
        const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (areValidTemplates(parsed)) {
                    return parsed;
                }
                console.warn('Invalid templates found in localStorage. Reverting to defaults.');
            } catch (error) {
                console.error('Failed to parse templates from localStorage', error);
            }
        }
        // If nothing is saved or parsing fails, return the default.
        return { ...defaultTemplates };
    }

    private saveAllTemplates() {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(this.templates));
    }

    public getTemplate(name: string): ProjectTemplate | undefined {
        return this.templates[name];
    }

    public getTemplateNames(): string[] {
        return Object.keys(this.templates);
    }

    public saveTemplate(name: string, template: ProjectTemplate) {
        if (!name.trim()) {
            throw new Error("Template name cannot be empty.");
        }
        // Ensure the name property on the object matches the key
        template.name = name; 
        this.templates[name] = template;
        this.saveAllTemplates();
    }

    public deleteTemplate(name: string) {
        if (Object.keys(this.templates).length <= 1) {
            throw new Error("Cannot delete the last remaining template.");
        }
        delete this.templates[name];
        this.saveAllTemplates();
    }
} 