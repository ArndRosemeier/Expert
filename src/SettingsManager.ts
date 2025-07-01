import { OrchestratorPrompts, defaultPrompts, PROMPT_STORAGE_KEY } from "./PromptManager";
import { QualityCriterion } from "./types";
import { StorageService, IStorageService } from './StorageService';
import { VersionService } from './VersionService';

export const SETTINGS_PROFILES_KEY = 'expert_app_settings_profiles';
export const LAST_USED_PROFILE_KEY = 'expert_app_last_used_profile';
export const AI_LOGGING_ENABLED_KEY = 'expert_app_ai_logging_enabled';

// Default context extraction prompt template
export const DEFAULT_CONTEXT_EXTRACTION_PROMPT = `You are an expert at analyzing text and extracting specific information. Your task is to analyze the following content and extract information about: {{extraction_request}}

Please provide a clear, organized list or summary of the requested information. Be thorough but concise, and focus only on the specific type of information requested.

Content to analyze from "{{node_title}}":
---
{{content}}
---

Please extract and list all instances of: {{extraction_request}}

Format your response as a clear, organized summary that would be useful for reference.`;

export const DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        name: "Prompt Adherence",
        description: "The response directly addresses the given prompt and stays on topic throughout. It fulfills the specific request without wandering off into tangential areas.",
        goal: 9,
        outline: true,
        leaf: true
    },
    {
        name: "Clarity & Conciseness",
        description: "The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",
        goal: 7,
        outline: true,
        leaf: true
    },
    {
        name: "Natural & Authentic Tone",
        description: "The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",
        goal: 7,
        outline: true,
        leaf: true
    },
    {
        name: "Engaging Flow",
        description: "The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Varied Sentence Structure",
        description: "The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Subtlety (Show, Don't Tell)",
        description: "The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Avoids AI Clichés",
        description: "The text avoids common AI phrases like 'In conclusion,' 'It's important to note,' 'delve into,' 'tapestry of,' 'testament to,' 'in the realm of,' 'navigate the landscape,' 'meticulous examination of,' 'crucial,' 'pivotal,' 'essential,' 'underscores,' 'harness,' 'illuminate,' 'transformative,' 'fostering,' 'utilize,' 'thus,' 'furthermore,' or 'ostensibly'",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        name: "Understated Language",
        description: "The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        name: "Specificity & Concrete Detail",
        description: "The writing uses specific, concrete details and examples rather than vague generalities.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Original Phrasing",
        description: "The text avoids common idioms and clichés, opting for more original ways to express ideas.",
        goal: 7,
        outline: true,
        leaf: true
    },
    {
        name: "Stylistic Variation",
        description: "Natural shifts in rhythm, tone, and phrasing that reflect a human voice.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Emotional Subtlety",
        description: "Emotions are implied or layered rather than explicitly stated.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Lexical Character",
        description: "Word choices feel personal, distinctive, or slightly idiosyncratic without being distracting.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: 'Human-like Naming',
        goal: 8,
        description: "If a new character is introduced with a generic placeholder name (e.g., 'a character', 'the archivist'), replace it with a more human-sounding name. Avoid overused fantasy/AI-generated names like Elara, Lyra, Lyria, Chen, Kai, Raven, Yuki, Marcus, Zara, Voss, Aria, Moonshadow, Seraphina, Ashwood, Clive, Maximilian, Everett, Benedict, Oswald, Rupert, Magnus, Stormrider, Dawnwalker, Shadowblade, Emberheart, Snowsong, Park, Johnson, Thorne, Alaric, Nyx, Orion, Cassian, Mira, Selene, Vale, Kieran, Nova, Soren, Sylas, Astrid, Calix, Xander, Draven, Isolde, Aerin, Kael, Thalia, or Dorian. Instead, use more natural, varied names that feel authentic and less predictable. Do not change names that are already established.",
        outline: true,
        leaf: false
    },
    {
        name: "Avoids Dramatical Reframing",
        description: "The text avoids artificially elevating the significance of ordinary actions, objects, or perceptions through dramatic recontextualization. This includes explicit patterns like \"It wasn't X. It was Y.\" as well as subtler forms of rhetorical inflation — where minor events are presented as symbolically profound, emotionally transformative, or mythically significant without narrative justification.\n\nExamples to avoid:\n• \"It wasn't just food. It was fuel.\"\n• \"He wasn't waiting. He was strategizing.\"\n• \"Fixing the cart wasn't a simple repair; it was the beginning of an unlikely alliance.\"\n\nStrong writing presents events and choices with clarity and restraint, allowing significance to emerge organically rather than through overt authorial framing.",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        name: "Immediate clarity",
        description: "Prose won't tell how things are not only to immediately tell how they are. Constructs like \"He was not x, he was y\" are way overused and should be severely limited.",
        goal: 8,
        outline: true,
        leaf: true
    }
];

export interface SettingsProfile {
    prompt: string;
    criteria: QualityCriterion[];
    maxIterations: number;
    selectedModels: Record<string, string>;
    webSearchEnabled?: Record<string, boolean>;
    contextExtractionPrompt: string;
    version?: string; // Version of the application when this profile was saved
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
            Array.isArray(profile.criteria) && 
            profile.criteria.every((criterion: any) => 
                typeof criterion === 'object' &&
                criterion !== null &&
                'name' in criterion &&
                'goal' in criterion &&
                typeof criterion.name === 'string' &&
                typeof criterion.goal === 'number' &&
                // Optional properties - if present, must be boolean
                (criterion.outline === undefined || typeof criterion.outline === 'boolean') &&
                (criterion.leaf === undefined || typeof criterion.leaf === 'boolean') &&
                (criterion.description === undefined || typeof criterion.description === 'string')
            ) &&
            'maxIterations' in profile &&
            typeof profile.maxIterations === 'number' &&
            'selectedModels' in profile &&
            typeof profile.selectedModels === 'object' &&
            profile.selectedModels !== null &&
            // webSearchEnabled is optional for backward compatibility
            (profile.webSearchEnabled === undefined || (typeof profile.webSearchEnabled === 'object' && profile.webSearchEnabled !== null)) &&
            // contextExtractionPrompt is optional for backward compatibility
            (profile.contextExtractionPrompt === undefined || typeof profile.contextExtractionPrompt === 'string') &&
            // version is optional for backward compatibility
            (profile.version === undefined || typeof profile.version === 'string')
        );
    });
}

export class SettingsManager {
    private profiles: Record<string, SettingsProfile> = {};
    private lastUsedProfileName: string | null = null;
    private prompts: OrchestratorPrompts;
    private storageService: Promise<IStorageService>;
    private initializationPromise: Promise<void>;
    private aiLoggingEnabled: boolean = false;
    private hasVersionMismatch: boolean = false;

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
        await this.loadAILoggingSetting();
    }

    private async loadProfiles(): Promise<void> {
        try {
            const storage = await this.storageService;
            const saved = await storage.get<Record<string, SettingsProfile>>(SETTINGS_PROFILES_KEY);
            
            if (saved && areValidSettingsProfiles(saved)) {
                this.profiles = saved;
                let hasVersionMismatch = false;
                const currentVersion = VersionService.getBuildNumber();
                
                // Check for version mismatches and update legacy profiles
                Object.keys(this.profiles).forEach(profileName => {
                    const profile = this.profiles[profileName];
                    if (profile) {
                        // Check for version mismatch
                        if (!profile.version || profile.version !== currentVersion) {
                            hasVersionMismatch = true;
                            console.log(`📋 Profile "${profileName}" has version mismatch. Profile version: ${profile.version || 'unknown'}, Current version: ${currentVersion}`);
                        }
                        
                        // Add default context extraction prompt and web search preferences to existing profiles that don't have them
                        if (!profile.contextExtractionPrompt) {
                            profile.contextExtractionPrompt = DEFAULT_CONTEXT_EXTRACTION_PROMPT;
                        }
                        if (!profile.webSearchEnabled) {
                            profile.webSearchEnabled = {};
                        }
                    }
                });
                
                // Store version mismatch status for UI to check
                if (hasVersionMismatch) {
                    this.hasVersionMismatch = true;
                }
                
                // Save the updated profiles with the new field
                await this.saveProfiles();
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
                maxIterations: 3,
                selectedModels: {},
                webSearchEnabled: {},
                contextExtractionPrompt: DEFAULT_CONTEXT_EXTRACTION_PROMPT
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
            const savedProfile = await storage.get<string>(LAST_USED_PROFILE_KEY);
            this.lastUsedProfileName = savedProfile || null;
        } catch (error) {
            console.error('Failed to load last used profile from storage', error);
            this.lastUsedProfileName = null;
        }
    }

    private async loadAILoggingSetting(): Promise<void> {
        try {
            const storage = await this.storageService;
            this.aiLoggingEnabled = await storage.get<boolean>(AI_LOGGING_ENABLED_KEY) || false;
        } catch (error) {
            console.error('Failed to load AI logging setting from storage', error);
            this.aiLoggingEnabled = false;
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
        
        // Add current version to the profile
        const profileWithVersion: SettingsProfile = {
            ...profile,
            version: VersionService.getBuildNumber()
        };
        
        this.profiles[name] = profileWithVersion;
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
            console.error('❌ Failed to save last used profile to storage', error);
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
                selectedModels: profile.selectedModels,
                contextExtractionPrompt: profile.contextExtractionPrompt
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
                selectedModels: finalSelectedModels,
                contextExtractionPrompt: profileData.contextExtractionPrompt || DEFAULT_CONTEXT_EXTRACTION_PROMPT
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
            profile.criteria.every((criterion: any) => 
                typeof criterion === 'object' &&
                criterion !== null &&
                'name' in criterion &&
                'goal' in criterion &&
                typeof criterion.name === 'string' &&
                typeof criterion.goal === 'number' &&
                // Optional properties - if present, must be boolean
                (criterion.outline === undefined || typeof criterion.outline === 'boolean') &&
                (criterion.leaf === undefined || typeof criterion.leaf === 'boolean') &&
                (criterion.description === undefined || typeof criterion.description === 'string')
            ) &&
            'maxIterations' in profile &&
            typeof profile.maxIterations === 'number' &&
            'selectedModels' in profile &&
            typeof profile.selectedModels === 'object' &&
            profile.selectedModels !== null &&
            // contextExtractionPrompt is optional for backward compatibility
            (profile.contextExtractionPrompt === undefined || typeof profile.contextExtractionPrompt === 'string')
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

    public isAILoggingEnabled(): boolean {
        return this.aiLoggingEnabled;
    }

    public async setAILoggingEnabled(enabled: boolean): Promise<void> {
        this.aiLoggingEnabled = enabled;
        try {
            const storage = await this.storageService;
            await storage.set(AI_LOGGING_ENABLED_KEY, enabled);
        } catch (error) {
            console.error('Failed to save AI logging setting to storage', error);
        }
    }

    /**
     * Check if there are version mismatches in loaded profiles
     */
    public hasVersionMismatchDetected(): boolean {
        return this.hasVersionMismatch;
    }

    /**
     * Clear the version mismatch flag (typically called after user has been notified)
     */
    public clearVersionMismatchFlag(): void {
        this.hasVersionMismatch = false;
    }

    /**
     * Get detailed version mismatch information for all profiles
     */
    public getVersionMismatchInfo(): Array<{ profileName: string; profileVersion: string | undefined; currentVersion: string }> {
        const currentVersion = VersionService.getBuildNumber();
        const mismatches: Array<{ profileName: string; profileVersion: string | undefined; currentVersion: string }> = [];
        
        Object.keys(this.profiles).forEach(profileName => {
            const profile = this.profiles[profileName];
            if (profile && (!profile.version || profile.version !== currentVersion)) {
                mismatches.push({
                    profileName,
                    profileVersion: profile.version,
                    currentVersion
                });
            }
        });
        
        return mismatches;
    }

    /**
     * Reset all profiles to defaults with current version
     */
    public async resetToDefaults(): Promise<void> {
        console.log('🔄 Resetting all profiles to defaults...');
        
        // Create a new default profile with current version
        const defaultProfile: SettingsProfile = {
            prompt: "",
            criteria: DEFAULT_CRITERIA,
            maxIterations: 3,
            selectedModels: {},
            webSearchEnabled: {},
            contextExtractionPrompt: DEFAULT_CONTEXT_EXTRACTION_PROMPT,
            version: VersionService.getBuildNumber()
        };
        
        // Reset profiles to just the default
        this.profiles = { default: defaultProfile };
        
        // Reset prompts to defaults
        this.prompts = { ...defaultPrompts };
        
        // Set default as last used profile
        await this.setLastUsedProfile('default');
        
        // Save everything
        await this.saveProfiles();
        await this.savePrompts(this.prompts);
        
        // Clear version mismatch flag
        this.hasVersionMismatch = false;
        
        console.log('✅ All profiles and prompts reset to defaults');
    }
} 