import { OrchestratorPrompts, defaultPrompts, PROMPT_STORAGE_KEY } from "./PromptManager";
import { QualityCriterion } from "./types";
import { StorageService, IStorageService } from './StorageService';

export const SETTINGS_PROFILES_KEY = 'expert_app_settings_profiles';
export const LAST_USED_PROFILE_KEY = 'expert_app_last_used_profile';

export const DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        name: "Prompt Adherence",
        description: "The response directly addresses the given prompt and stays on topic throughout. It fulfills the specific request without wandering off into tangential areas.",
        goal: 9,
        weight: 1.0
    },
    {
        name: "Clarity & Conciseness",
        description: "The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Natural & Authentic Tone",
        description: "The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Engaging Flow",
        description: "The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Varied Sentence Structure",
        description: "The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.",
        goal: 7,
        weight: 1.0
    },
    {
        name: "Subtlety (Show, Don't Tell)",
        description: "The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Avoids AI Clichés",
        description: "The text avoids common AI phrases like 'In conclusion,' 'It's important to note,' 'delve into,' or 'tapestry of...'",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Understated Language",
        description: "The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Specificity & Concrete Detail",
        description: "The writing uses specific, concrete details and examples rather than vague generalities.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Original Phrasing",
        description: "The text avoids common idioms and clichés, opting for more original ways to express ideas.",
        goal: 7,
        weight: 1.0
    },
    {
        name: 'Human-like Naming',
        goal: 8,
        weight: 1.0,
        description: "If a new character is introduced with a generic placeholder name (e.g., 'a character', 'the archivist'), replace it with a more human-sounding name. Do not change names that are already established."
    }
];

export interface SettingsProfile {
    prompt: string;
    criteria: QualityCriterion[];
    maxIterations: number;
    selectedModels: Record<string, string>;
}

function areValidSettingsProfiles(data: any): data is Record<string, SettingsProfile> {
    if (typeof data !== 'object' || data === null) return false;

    return Object.values(data).every((profile: any) => {
        return (
            typeof profile === 'object' &&
            profile !== null &&
            'prompt' in profile &&
            typeof profile.prompt === 'string' &&
            'criteria' in profile &&
            Array.isArray(profile.criteria) && // Basic array check, can be stricter
            'maxIterations' in profile &&
            typeof profile.maxIterations === 'number' &&
            'selectedModels' in profile &&
            typeof profile.selectedModels === 'object' &&
            profile.selectedModels !== null
        );
    });
}

export class SettingsManager {
    private profiles: Record<string, SettingsProfile> = {};
    private lastUsedProfileName: string | null = null;
    private prompts: OrchestratorPrompts;
    private storageService: Promise<IStorageService>;
    private initializationPromise: Promise<void>;

    constructor() {
        this.storageService = StorageService.getInstance();
        this.prompts = { ...defaultPrompts };
        this.initializationPromise = this.initializeAsync();
    }

    public async waitForInitialization(): Promise<void> {
        return this.initializationPromise;
    }

    private async initializeAsync(): Promise<void> {
        await this.loadProfiles();
        await this.loadLastUsedProfile();
        await this.loadPrompts();
    }

    private async loadProfiles(): Promise<void> {
        try {
            const storage = await this.storageService;
            const saved = await storage.get<Record<string, SettingsProfile>>(SETTINGS_PROFILES_KEY);
            
            if (saved && areValidSettingsProfiles(saved)) {
                this.profiles = saved;
                } else {
                console.warn('Invalid settings profiles found in storage. Ignoring.');
                this.profiles = {};
            }
        } catch (error) {
            console.error('Failed to load settings profiles from storage', error);
            this.profiles = {};
        }

        // If, after all that, we still have no profiles, create a default one.
        if (Object.keys(this.profiles).length === 0) {
            const defaultProfile = {
                prompt: "",
                criteria: DEFAULT_CRITERIA,
                maxIterations: 5,
                selectedModels: {}
            };
            this.profiles = { default: defaultProfile };
            await this.setLastUsedProfile('default');
            await this.saveProfiles();
        }
    }

    private async loadPrompts(): Promise<void> {
        try {
            const storage = await this.storageService;
            const saved = await storage.get<OrchestratorPrompts>(PROMPT_STORAGE_KEY);
            
        if (saved) {
                // TODO: Add a type guard for prompts
                this.prompts = { ...defaultPrompts, ...saved };
            } else {
                this.prompts = { ...defaultPrompts };
            }
            } catch (error) {
            console.error('Failed to load prompts from storage', error);
            this.prompts = { ...defaultPrompts };
            }
        }

    private async loadLastUsedProfile(): Promise<void> {
        try {
            const storage = await this.storageService;
            this.lastUsedProfileName = await storage.get<string>(LAST_USED_PROFILE_KEY) || null;
        } catch (error) {
            console.error('Failed to load last used profile from storage', error);
            this.lastUsedProfileName = null;
        }
    }

    public getPrompts(): OrchestratorPrompts {
        return this.prompts;
    }

    public async savePrompts(prompts: OrchestratorPrompts): Promise<void> {
        this.prompts = prompts;
        try {
            const storage = await this.storageService;
            await storage.set(PROMPT_STORAGE_KEY, this.prompts);
        } catch (error) {
            console.error('Failed to save prompts to storage', error);
        }
    }

    public getProfileNames(): string[] {
        return Object.keys(this.profiles);
    }

    public getProfile(name: string): SettingsProfile | undefined {
        return this.profiles[name];
    }

    public async saveProfile(name: string, profile: SettingsProfile): Promise<void> {
        if (!name) throw new Error("Profile name cannot be empty.");
        this.profiles[name] = profile;
        await this.saveProfiles();
    }

    public async deleteProfile(name: string): Promise<void> {
        if (name === 'default') {
            alert("Cannot delete the default profile.");
            return;
        }
        delete this.profiles[name];
        if (this.lastUsedProfileName === name) {
            this.lastUsedProfileName = null;
            try {
                const storage = await this.storageService;
                await storage.delete(LAST_USED_PROFILE_KEY);
            } catch (error) {
                console.error('Failed to remove last used profile from storage', error);
            }
        }
        await this.saveProfiles();
    }

    public getLastUsedProfile(): SettingsProfile | undefined {
        if (this.lastUsedProfileName) {
            return this.getProfile(this.lastUsedProfileName);
        }
        // Return the first profile if no last-used is set
        const names = this.getProfileNames();
        return names.length > 0 ? this.getProfile(names[0]) : undefined;
    }

    public getLastUsedProfileName(): string | null {
        if (this.lastUsedProfileName && this.profiles[this.lastUsedProfileName]) {
            return this.lastUsedProfileName;
        }
        const names = this.getProfileNames();
        return names.length > 0 ? names[0] : null;
    }

    public async setLastUsedProfile(name: string): Promise<void> {
        this.lastUsedProfileName = name;
        try {
            const storage = await this.storageService;
            await storage.set(LAST_USED_PROFILE_KEY, name);
        } catch (error) {
            console.error('Failed to save last used profile to storage', error);
        }
    }

    private async saveProfiles(): Promise<void> {
        try {
            const storage = await this.storageService;
            await storage.set(SETTINGS_PROFILES_KEY, this.profiles);
        } catch (error) {
            console.error("Failed to save settings profiles to storage", error);
        }
    }

    /**
     * Exports a named settings profile and prompts to a JSON object.
     * Excludes the OpenRouter API key for security.
     * @param profileName The name of the profile to export
     * @returns JSON object containing the profile and prompts, or null if profile doesn't exist
     */
    public exportProfile(profileName: string): any | null {
        const profile = this.getProfile(profileName);
        if (!profile) {
            return null;
        }

        const exportData = {
            exportVersion: '1.0',
            exportDate: new Date().toISOString(),
            profileName: profileName,
            profile: {
                prompt: profile.prompt,
                criteria: profile.criteria,
                maxIterations: profile.maxIterations,
                selectedModels: profile.selectedModels
            },
            prompts: this.prompts
        };

        return exportData;
    }

    /**
     * Imports a settings profile from exported JSON data.
     * Does not overwrite existing OpenRouter API keys.
     * @param exportData The exported JSON data
     * @param overwriteExisting Whether to overwrite if profile name already exists
     * @returns Promise resolving to success status and any error message
     */
    public async importProfile(exportData: any, overwriteExisting: boolean = false): Promise<{ success: boolean; message: string; profileName?: string }> {
        try {
            // Validate export data structure
            if (!exportData || typeof exportData !== 'object') {
                return { success: false, message: 'Invalid export data format' };
            }

            if (!exportData.profileName || !exportData.profile || !exportData.prompts) {
                return { success: false, message: 'Export data is missing required fields (profileName, profile, or prompts)' };
    }

            const profileName = exportData.profileName;
            const profileData = exportData.profile;

            // Validate profile structure
            if (!this.isValidProfileStructure(profileData)) {
                return { success: false, message: 'Invalid profile structure in export data' };
            }

            // Check if profile already exists
            if (this.profiles[profileName] && !overwriteExisting) {
                return { 
                    success: false, 
                    message: `Profile "${profileName}" already exists. Do you want to overwrite it?`,
                    profileName 
                };
            }

            // Preserve existing OpenRouter API key if we're overwriting
            let finalSelectedModels = profileData.selectedModels;
            if (this.profiles[profileName] && overwriteExisting) {
                // Keep the existing selected models to preserve API key association
                finalSelectedModels = this.profiles[profileName].selectedModels;
            }

            // Create the imported profile
            const importedProfile: SettingsProfile = {
                prompt: profileData.prompt,
                criteria: profileData.criteria,
                maxIterations: profileData.maxIterations,
                selectedModels: finalSelectedModels
            };

            // Save the profile
            await this.saveProfile(profileName, importedProfile);

            // Import prompts (merge with existing ones)
            if (exportData.prompts && typeof exportData.prompts === 'object') {
                const mergedPrompts = { ...this.prompts, ...exportData.prompts };
                await this.savePrompts(mergedPrompts);
            }

            return { 
                success: true, 
                message: `Profile "${profileName}" imported successfully`,
                profileName 
            };

        } catch (error) {
            console.error('Error importing profile:', error);
            return { 
                success: false, 
                message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
            };
        }
    }

    /**
     * Validates the structure of a profile object
     */
    private isValidProfileStructure(profile: any): boolean {
        return (
            typeof profile === 'object' &&
            profile !== null &&
            'prompt' in profile &&
            typeof profile.prompt === 'string' &&
            'criteria' in profile &&
            Array.isArray(profile.criteria) &&
            'maxIterations' in profile &&
            typeof profile.maxIterations === 'number' &&
            'selectedModels' in profile &&
            typeof profile.selectedModels === 'object' &&
            profile.selectedModels !== null
        );
    }

    /**
     * Exports a profile to a downloadable JSON file
     * @param profileName The name of the profile to export
     */
    public downloadProfileExport(profileName: string): void {
        const exportData = this.exportProfile(profileName);
        if (!exportData) {
            alert(`Profile "${profileName}" not found.`);
            return;
        }

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `expert-app-profile-${profileName}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Handles file import from a file input element
     * @param file The uploaded file
     * @param overwriteCallback Callback to ask user about overwriting existing profiles
     * @returns Promise resolving to import result
     */
    public async importProfileFromFile(
        file: File, 
        overwriteCallback?: (profileName: string) => Promise<boolean>
    ): Promise<{ success: boolean; message: string }> {
        try {
            const text = await file.text();
            const exportData = JSON.parse(text);
            
            const result = await this.importProfile(exportData, false);
            
            // If profile exists and we have a callback to ask about overwriting
            if (!result.success && result.profileName && result.message.includes('already exists') && overwriteCallback) {
                const shouldOverwrite = await overwriteCallback(result.profileName);
                if (shouldOverwrite) {
                    return await this.importProfile(exportData, true);
                } else {
                    return { success: false, message: 'Import cancelled by user' };
                }
            }
            
            return result;
            
        } catch (error) {
            return { 
                success: false, 
                message: `Failed to parse import file: ${error instanceof Error ? error.message : 'Invalid JSON format'}` 
            };
        }
    }
} 