import { ProjectTemplate } from './ProjectTemplate';
import { StorageService, IStorageService } from './StorageService';

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
    private storageService: Promise<IStorageService>;

    constructor() {
        this.storageService = StorageService.getInstance();
        this.templates = {};
        this.loadTemplates();
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
            this.templates = { ...defaultTemplates };
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
} 