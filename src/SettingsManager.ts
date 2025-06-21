import { OrchestratorPrompts, defaultPrompts, PROMPT_STORAGE_KEY } from "./PromptManager";
import { QualityCriterion } from "./types";

export const SETTINGS_PROFILES_KEY = 'expert_app_settings_profiles';
export const LAST_USED_PROFILE_KEY = 'expert_app_last_used_profile';

export const DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        name: "Clarity & Conciseness",
        description: "The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",
        goal: 8,
        weight: 1.0
    },
    {
        name: "Natural & Authentic Tone",
        description: "The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",
        goal: 9,
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
        goal: 9,
        weight: 1.0
    },
    {
        name: "Understated Language",
        description: "The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",
        goal: 9,
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
        goal: 9,
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

    constructor() {
        this.loadProfiles();
        this.lastUsedProfileName = localStorage.getItem(LAST_USED_PROFILE_KEY);
        this.prompts = this.loadPrompts();
    }

    private loadProfiles() {
        const saved = localStorage.getItem(SETTINGS_PROFILES_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (areValidSettingsProfiles(parsed)) {
                    this.profiles = parsed;
                } else {
                    console.warn('Invalid settings profiles found in localStorage. Ignoring.');
                }
            } catch (error) {
                console.error('Failed to parse settings profiles from localStorage', error);
                this.profiles = {};
            }
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
            this.setLastUsedProfile('default');
            this.saveProfiles();
        }
    }

    private loadPrompts(): OrchestratorPrompts {
        const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
        if (saved) {
            try {
                // TODO: Add a type guard for prompts
                return { ...defaultPrompts, ...JSON.parse(saved) };
            } catch (error) {
                console.error('Failed to parse prompts from localStorage', error);
                return { ...defaultPrompts };
            }
        }
        return { ...defaultPrompts };
    }

    public getPrompts(): OrchestratorPrompts {
        return this.prompts;
    }

    public savePrompts(prompts: OrchestratorPrompts) {
        this.prompts = prompts;
        localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(this.prompts));
    }

    public getProfileNames(): string[] {
        return Object.keys(this.profiles);
    }

    public getProfile(name: string): SettingsProfile | undefined {
        return this.profiles[name];
    }

    public saveProfile(name: string, profile: SettingsProfile) {
        if (!name) throw new Error("Profile name cannot be empty.");
        this.profiles[name] = profile;
        this.saveProfiles();
    }

    public deleteProfile(name: string) {
        if (name === 'default') {
            alert("Cannot delete the default profile.");
            return;
        }
        delete this.profiles[name];
        if (this.lastUsedProfileName === name) {
            this.lastUsedProfileName = null;
            localStorage.removeItem(LAST_USED_PROFILE_KEY);
        }
        this.saveProfiles();
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

    public setLastUsedProfile(name: string) {
        this.lastUsedProfileName = name;
        localStorage.setItem(LAST_USED_PROFILE_KEY, name);
    }

    private loadLastUsedProfile(): void {
        this.lastUsedProfileName = localStorage.getItem(LAST_USED_PROFILE_KEY);
    }

    private saveProfiles(): void {
        try {
            localStorage.setItem(SETTINGS_PROFILES_KEY, JSON.stringify(this.profiles));
        } catch (error) {
            console.error("Failed to save settings profiles to localStorage", error);
        }
    }
} 