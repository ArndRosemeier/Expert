import { OrchestratorPrompts, defaultPrompts, PROMPT_STORAGE_KEY } from "./PromptManager";
import { QualityCriterion } from "./types";
import { StorageService, IStorageService } from './StorageService';
import { VersionService } from './VersionService';
import { 
    DEFAULT_MAX_ITERATIONS, 
    STORAGE_KEYS, 
    DEFAULT_CONTEXT_EXTRACTION_PROMPT 
} from './constants';
import { FileDownloadService } from './utils/FileDownloadService';
import * as state from './state';

// Legacy constants - will be removed in favor of STORAGE_KEYS from constants.ts
export const SETTINGS_PROFILES_KEY = STORAGE_KEYS.SETTINGS_PROFILES;
export const LAST_USED_PROFILE_KEY = STORAGE_KEYS.LAST_USED_PROFILE;
export const AI_LOGGING_ENABLED_KEY = STORAGE_KEYS.AI_LOGGING_ENABLED;
export const DEBUG_GENERATION_ENABLED_KEY = STORAGE_KEYS.DEBUG_GENERATION_ENABLED;

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
        goal: 7,
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
        goal: 7,
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
        description: "Avoid overused fantasy/AI-generated names when introducing a new name. Names like Elara, Lyra, Aris, Thorne, Lyria, Chen, Stormrider, Dawnwalker, Shadowblade, Emberheart, Snowsong, Park, Johnson, Thorne, Vance, Kieran, Nova, Soren, Sylas, Astrid, Calix, Xander, Draven, Isolde, Aerin, Kael, Thalia, or Dorian are overused. Instead, use more natural, varied names that feel authentic and less predictable. Do not change names that are already established. If a name that matches the name list exactly is introduced, that is a major flaw.",
        outline: true,
        leaf: true
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
    criteria?: QualityCriterion[]; // Optional - if missing, use defaults
    maxIterations: number;
    selectedModels: Record<string, string>;
    webSearchEnabled?: Record<string, boolean>;
    selectedProviders?: Record<string, string>;
    contextExtractionPrompt: string;
    version?: string; // Version of the application when this profile was saved
    taskModelConfigs?: import('./services/TaskModelService').AllTaskModelConfigs; // Task-based model configurations
}

function areValidSettingsProfiles(data: unknown): data is Record<string, SettingsProfile> {
    if (typeof data !== 'object' || data === null) return false;

    const maybeRecord = data as Record<string, unknown>;
    return Object.values(maybeRecord).every((profile: unknown) => {
        if (typeof profile !== 'object' || profile === null) return false;
        const p = profile as Partial<SettingsProfile> & { [k: string]: unknown };

        // criteria (optional)
        if (p.criteria !== undefined) {
            if (!Array.isArray(p.criteria)) return false;
            const allCriteriaValid = p.criteria.every((criterion: unknown) => {
                if (typeof criterion !== 'object' || criterion === null) return false;
                const c = criterion as { name?: unknown; goal?: unknown; outline?: unknown; leaf?: unknown; description?: unknown };
                return (
                    typeof c.name === 'string' &&
                    typeof c.goal === 'number' &&
                    (c.outline === undefined || typeof c.outline === 'boolean') &&
                    (c.leaf === undefined || typeof c.leaf === 'boolean') &&
                    (c.description === undefined || typeof c.description === 'string')
                );
            });
            if (!allCriteriaValid) return false;
        }

        // required fields
        if (typeof p.maxIterations !== 'number') return false;
        if (typeof p.selectedModels !== 'object' || p.selectedModels === null) return false;

        // optional objects
        if (p.webSearchEnabled !== undefined && (typeof p.webSearchEnabled !== 'object' || p.webSearchEnabled === null)) return false;
        if (p.selectedProviders !== undefined && (typeof p.selectedProviders !== 'object' || p.selectedProviders === null)) return false;
        if (p.contextExtractionPrompt !== undefined && typeof p.contextExtractionPrompt !== 'string') return false;
        if ((p as any).language !== undefined && typeof (p as any).language !== 'string') return false;
        if (p.version !== undefined && typeof p.version !== 'string') return false;
        if (p.taskModelConfigs !== undefined && (typeof p.taskModelConfigs !== 'object' || p.taskModelConfigs === null)) return false;

        return true;
    });
}

export class SettingsManager {
    private static instance: SettingsManager | null = null;
    private static initializationPromise: Promise<SettingsManager> | null = null;

    private profiles: Record<string, SettingsProfile> = {};
    private lastUsedProfileName: string | null = null;
    private prompts: OrchestratorPrompts;
    private storageService: Promise<IStorageService>;
    private aiLoggingEnabled: boolean = false;
    private debugGenerationEnabled: boolean = false;
    private hasVersionMismatch: boolean = false;
    private initialized: boolean = false;
    private globalLanguage: string = 'English'; // Global language setting

    private constructor() {
        this.storageService = StorageService.getInstance();
        this.prompts = { ...defaultPrompts };
    }

    /**
     * Get the singleton instance (async version for proper initialization)
     */
    public static async getInstance(): Promise<SettingsManager> {
        if (SettingsManager.instance && SettingsManager.instance.initialized) {
            return SettingsManager.instance;
        }

        if (!SettingsManager.initializationPromise) {
            SettingsManager.initializationPromise = SettingsManager.initializeInstance();
        }

        return SettingsManager.initializationPromise;
    }

    /**
     * Get the singleton instance (sync version for when you know it's already initialized)
     * Use this only after calling getInstance() at least once
     */
    public static getInstanceSync(): SettingsManager {
        if (!SettingsManager.instance || !SettingsManager.instance.initialized) {
            throw new Error('SettingsManager not initialized. Call getInstance() first.');
        }
        return SettingsManager.instance;
    }

    /**
     * Initialize the singleton instance
     */
    private static async initializeInstance(): Promise<SettingsManager> {
        if (SettingsManager.instance) {
            return SettingsManager.instance;
        }

        SettingsManager.instance = new SettingsManager();
        await SettingsManager.instance.initializeAsync();
        SettingsManager.instance.initialized = true;
        

        return SettingsManager.instance;
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use getInstance() instead
     */
    public async waitForInitialization(): Promise<void> {
        await SettingsManager.getInstance();
    }

    private async initializeAsync(): Promise<void> {
        await this.loadProfiles();
        await this.loadLastUsedProfile();
        await this.loadPrompts();
        await this.loadAILoggingSetting();
        await this.loadDebugGenerationSetting();
        await this.loadGlobalLanguage();
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
        
                let hasDefaultCriteria = false;
                
                Object.keys(this.profiles).forEach(profileName => {
                    const profile = this.profiles[profileName];
                    if (profile) {
                        // Check for version mismatch
                        if (!profile.version || profile.version !== currentVersion) {
                            hasVersionMismatch = true;
                        } else {
        
                        }
                        
                        // Handle criteria - add defaults if missing, detect if existing are default
                        if (!profile.criteria) {
                            // Missing criteria is expected after cleanup - just populate with defaults
                            profile.criteria = DEFAULT_CRITERIA;
                        } else if (this.areDefaultCriteria(profile.criteria)) {
                            // Found explicitly stored default criteria - needs cleanup
                            hasDefaultCriteria = true;
                        }
                        
                        // Add default context extraction prompt and web search preferences to existing profiles that don't have them
                        if (!profile.contextExtractionPrompt) {
                            profile.contextExtractionPrompt = DEFAULT_CONTEXT_EXTRACTION_PROMPT;
                        }
                        if (!profile.webSearchEnabled) {
                            profile.webSearchEnabled = {};
                        }
                        // Add default task model configs to existing profiles that don't have them
                        if (!profile.taskModelConfigs) {
                            profile.taskModelConfigs = {
                                coherence_analysis: {
                                    outline: 'creator' as const,
                                    prose: 'prose' as const
                                },
                                fix_contradiction: {
                                    outline: 'creator' as const,
                                    prose: 'prose' as const
                                },
                                text_polishing: {
                                    outline: 'creator' as const,
                                    prose: 'prose' as const
                                },
                                context_adjustment: {
                                    outline: 'creator' as const,
                                    prose: 'prose' as const
                                },
                                context_rating: {
                                    outline: 'creator' as const,
                                    prose: 'prose' as const
                                },
                                logic_error_analysis: {
                                    outline: 'rater' as const,
                                    prose: 'rater' as const
                                },
                                logic_child_fix: {
                                    outline: 'creator' as const,
                                    prose: 'creator' as const
                                }
                            };
                        }
                        

                    }
                });
                
                // Store version mismatch status for UI to check
                if (hasVersionMismatch) {
                    this.hasVersionMismatch = true;
                }
                
                // Clean up default criteria immediately to prevent old defaults from overriding new system criteria
                if (hasDefaultCriteria) {
                    console.log('🧹 Cleaning up default criteria from profiles...');
                    
                    // Re-save to storage with smart criteria logic (but keep full profiles in memory)
                    await this.saveProfiles(true);
                } else {
                    // Save the updated profiles with the new field
                    await this.saveProfiles();
                }
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
            const defaultProfile: SettingsProfile = {
                criteria: DEFAULT_CRITERIA,
                maxIterations: DEFAULT_MAX_ITERATIONS,
                selectedModels: {},
                webSearchEnabled: {},
                contextExtractionPrompt: DEFAULT_CONTEXT_EXTRACTION_PROMPT,
                taskModelConfigs: {
                    coherence_analysis: {
                        outline: 'creator' as const,
                        prose: 'prose' as const
                    },
                    fix_contradiction: {
                        outline: 'creator' as const,
                        prose: 'prose' as const
                    },
                    text_polishing: {
                        outline: 'creator' as const,
                        prose: 'prose' as const
                    },
                    context_adjustment: {
                        outline: 'creator' as const,
                        prose: 'prose' as const
                    },
                    context_rating: {
                        outline: 'creator' as const,
                        prose: 'prose' as const
                    },
                    logic_error_analysis: {
                        outline: 'rater' as const,
                        prose: 'rater' as const
                    },
                    logic_child_fix: {
                        outline: 'creator' as const,
                        prose: 'creator' as const
                    }
                }
            };
            this.profiles = { default: defaultProfile };
            await this.setLastUsedProfile('default');
            await this.saveProfiles();
        }
    }

    private async loadPrompts(): Promise<void> {
        try {
            const storage = await this.storageService;
            const saved = await storage.get<Partial<OrchestratorPrompts>>(PROMPT_STORAGE_KEY);
            
            if (saved) {
                // Only apply non-default prompts from storage
                this.prompts = { ...defaultPrompts, ...saved };
                
                // Clean up: immediately re-save to remove any default prompts that were stored
                // This prevents old default prompts from overriding new system prompts in future versions
                const hasDefaultPrompts = Object.entries(saved).some(([key, value]) => {
                    const defaultValue = defaultPrompts[key as keyof OrchestratorPrompts];
                    return value === defaultValue;
                });
                
                if (hasDefaultPrompts) {
                    console.log('🧹 Cleaning up default prompts from storage...');
                    await this.savePrompts(this.prompts);
                }
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

    private async loadDebugGenerationSetting(): Promise<void> {
        try {
            const storage = await this.storageService;
            this.debugGenerationEnabled = await storage.get<boolean>(DEBUG_GENERATION_ENABLED_KEY) || false;
            
            // Update the global debug flag
            const { setDebugStatelessGeneration } = await import('./constants');
            setDebugStatelessGeneration(this.debugGenerationEnabled);
        } catch (error) {
            console.error('Failed to load debug generation setting from storage', error);
            this.debugGenerationEnabled = false;
            
            // Ensure global flag is false on error
            const { setDebugStatelessGeneration } = await import('./constants');
            setDebugStatelessGeneration(false);
        }
    }

    private async loadGlobalLanguage(): Promise<void> {
        try {
            const storage = await this.storageService;
            this.globalLanguage = await storage.get<string>(STORAGE_KEYS.GLOBAL_LANGUAGE) || 'English';
        } catch (error) {
            console.error('Failed to load global language setting from storage', error);
            this.globalLanguage = 'English';
        }
    }

    private async saveGlobalLanguage(): Promise<void> {
        try {
            const storage = await this.storageService;
            await storage.set(STORAGE_KEYS.GLOBAL_LANGUAGE, this.globalLanguage);
        } catch (error) {
            console.error('Failed to save global language setting to storage', error);
        }
    }

    public getPrompts(): OrchestratorPrompts {
        return this.prompts;
    }

    /**
     * Get list of prompts that have been modified from their default values
     */
    public getModifiedPrompts(): Array<{ key: keyof OrchestratorPrompts; isModified: boolean }> {
        const modifiedPrompts: Array<{ key: keyof OrchestratorPrompts; isModified: boolean }> = [];
        
        for (const [key, value] of Object.entries(this.prompts)) {
            const defaultValue = defaultPrompts[key as keyof OrchestratorPrompts];
            modifiedPrompts.push({
                key: key as keyof OrchestratorPrompts,
                isModified: value !== defaultValue
            });
        }
        
        return modifiedPrompts;
    }

    /**
     * Reset a specific prompt to its default value
     */
    public async resetPromptToDefault(promptKey: keyof OrchestratorPrompts): Promise<void> {
        this.prompts[promptKey] = defaultPrompts[promptKey];
        await this.savePrompts(this.prompts);
    }

    /**
     * Check if criteria array is identical to defaults
     */
    private areDefaultCriteria(criteria: QualityCriterion[]): boolean {
        if (criteria.length !== DEFAULT_CRITERIA.length) {
            return false;
        }

        return criteria.every((criterion, index) => {
            const defaultCriterion = DEFAULT_CRITERIA[index];
            if (!defaultCriterion) return false;
            
            return (
                criterion.name === defaultCriterion.name &&
                criterion.description === defaultCriterion.description &&
                criterion.goal === defaultCriterion.goal &&
                criterion.outline === defaultCriterion.outline &&
                criterion.leaf === defaultCriterion.leaf
            );
        });
    }

    /**
     * Get profiles that have been modified from their default criteria
     */
    public getModifiedCriteriaProfiles(): Array<{ profileName: string; isDefault: boolean }> {
        const modifiedProfiles: Array<{ profileName: string; isDefault: boolean }> = [];
        
        Object.entries(this.profiles).forEach(([profileName, profile]) => {
            modifiedProfiles.push({
                profileName,
                isDefault: this.areDefaultCriteria(profile.criteria || DEFAULT_CRITERIA)
            });
        });
        
        return modifiedProfiles;
    }

    /**
     * Reset a specific profile's criteria to defaults
     */
    public async resetCriteriaToDefault(profileName: string): Promise<void> {
        const profile = this.getProfile(profileName);
        if (profile) {
            const updatedProfile: SettingsProfile = {
                ...profile,
                criteria: DEFAULT_CRITERIA
            };
            await this.saveProfile(profileName, updatedProfile);
        }
    }

    public async savePrompts(prompts: OrchestratorPrompts): Promise<void> {
        this.prompts = prompts;
        try {
            const storage = await this.storageService;
            
            // Only save prompts that differ from defaults to prevent old defaults 
            // from overriding new system prompts in future versions
            const modifiedPrompts: Partial<OrchestratorPrompts> = {};
            
            for (const [key, value] of Object.entries(prompts)) {
                const defaultValue = defaultPrompts[key as keyof OrchestratorPrompts];
                if (value !== defaultValue) {
                    (modifiedPrompts as any)[key] = value;
                }
            }
            
            // Save only the modified prompts
            await storage.set(PROMPT_STORAGE_KEY, modifiedPrompts);
            
            console.log(`💾 Saved ${Object.keys(modifiedPrompts).length} modified prompts (out of ${Object.keys(prompts).length} total)`);
        } catch (error) {
            console.error('Failed to save prompts to storage', error);
        }
    }

    public getProfileNames(): string[] {
        return Object.keys(this.profiles);
    }

    public getProfile(name: string): SettingsProfile | undefined {
        const profile = this.profiles[name];
        if (profile) {
            // Ensure criteria are populated with defaults if missing
            return {
                ...profile,
                criteria: profile.criteria || DEFAULT_CRITERIA
            };
        }
        return undefined;
    }

    public async saveProfile(name: string, profile: SettingsProfile): Promise<void> {
        if (!name) throw new Error("Profile name cannot be empty.");
        
        // Store profile in memory with criteria always populated for immediate use
        // Deep copy to prevent cross-profile contamination
        const profileToSave: SettingsProfile = {
            selectedModels: { ...(profile.selectedModels || {}) },
            selectedProviders: { ...(profile.selectedProviders || {}) },
            webSearchEnabled: { ...(profile.webSearchEnabled || {}) },
            criteria: profile.criteria ? [...profile.criteria] : [...DEFAULT_CRITERIA],
            maxIterations: profile.maxIterations,
            contextExtractionPrompt: profile.contextExtractionPrompt || '',
            version: VersionService.getBuildNumber()
        };
        
        // Deep copy taskModelConfigs if present
        if (profile.taskModelConfigs) {
            profileToSave.taskModelConfigs = { ...profile.taskModelConfigs };
        }

        console.log(`💾 Saving profile "${name}" with deep-copied settings`);
        console.log(`🔍 Profile references - Original models object:`, profile.selectedModels);
        console.log(`🔍 Profile references - Deep copied models object:`, profileToSave.selectedModels);
        console.log(`🔍 Objects are different references:`, profile.selectedModels !== profileToSave.selectedModels);

        this.profiles[name] = profileToSave;
        
        // saveProfiles() will handle excluding default criteria from storage
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
            const profile = this.getProfile(this.lastUsedProfileName);
            if (profile) {
                // Ensure criteria are populated with defaults if missing
                return {
                    ...profile,
                    criteria: profile.criteria || DEFAULT_CRITERIA
                };
            }
        }
        // Return the first profile if no last-used is set
        const names = this.getProfileNames();
        if (names.length > 0) {
            const profile = this.getProfile(names[0]!);
            if (profile) {
                return {
                    ...profile,
                    criteria: profile.criteria || DEFAULT_CRITERIA
                };
            }
        }
        return undefined;
    }

    public getLastUsedProfileName(): string | null {
        if (this.lastUsedProfileName && this.profiles[this.lastUsedProfileName]) {
            return this.lastUsedProfileName;
        }
        const names = this.getProfileNames();
        return names.length > 0 ? names[0]! : null;
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

    /**
     * Get the effective language setting - project language first, then global language
     * This is used by generation services to determine what language to use
     */
    public getLanguage(): string {
        // Check active project first
        const activeProject = state.getActiveProject();
        
        if (activeProject) {
            const projectLanguage = activeProject.getLanguage();
            if (projectLanguage) {
                return projectLanguage;
            }
        }
        
        // Fallback to global language setting
        return this.globalLanguage;
    }

    /**
     * Get the global default language setting (regardless of active project)
     */
    public getGlobalLanguage(): string {
        return this.globalLanguage;
    }

    /**
     * Set the global default language - DECOUPLED: only affects global setting
     */
    public async setLanguage(language: string): Promise<void> {
        // Only update global language setting
        this.globalLanguage = language;
        await this.saveGlobalLanguage();
        
        // DECOUPLED: No longer automatically syncs to active project
        // Use explicit "Set Project Language" action instead
    }

    /**
     * Set project language for the active project (explicit action)
     */
    public async setProjectLanguage(language: string): Promise<void> {
        const activeProject = state.getActiveProject();
        if (!activeProject) {
            throw new Error('No active project to set language for');
        }
        
        activeProject.setLanguage(language);
        
        // Save the project to persist the language change
        try {
            await activeProject.saveToStorage();
            
            // Refresh the tree to show updated language flag
            const { renderMultiProjectTree } = await import('./ui/project-ui');
            renderMultiProjectTree();
        } catch (error) {
            console.error('Failed to save project language:', error);
            throw error;
        }
    }



    private async saveProfiles(isCleanupOperation: boolean = false): Promise<void> {
        try {
            const storage = await this.storageService;
            
            // Create a storage version with default criteria removed to prevent old defaults
            // from overriding new system criteria in future versions
            const profilesForStorage: Record<string, SettingsProfile> = {};
            
            Object.entries(this.profiles).forEach(([profileName, profile]) => {
                if (profile) {
                    const isDefaultCriteria = this.areDefaultCriteria(profile.criteria || DEFAULT_CRITERIA);
                    
                    if (isDefaultCriteria) {
                        // Remove criteria from storage version - they'll be populated from defaults on load
                        const { criteria, ...profileWithoutCriteria } = profile;
                        profilesForStorage[profileName] = profileWithoutCriteria as SettingsProfile;
                    } else {
                        // Keep custom criteria in storage
                        profilesForStorage[profileName] = profile;
                    }
                }
            });
            
            await storage.set(SETTINGS_PROFILES_KEY, profilesForStorage);
            
            // Only log detailed info during cleanup operations
            if (isCleanupOperation) {
                const defaultCount = Object.values(this.profiles).filter(p => p && this.areDefaultCriteria(p.criteria || DEFAULT_CRITERIA)).length;
                const customCount = Object.keys(this.profiles).length - defaultCount;
                
                console.log(`💾 Cleanup complete: ${Object.keys(this.profiles).length} profiles (${customCount} with custom criteria, ${defaultCount} using defaults)`);
            }
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
    public exportProfile(profileName: string): {
        exportVersion: '1.0';
        exportDate: string;
        profileName: string;
        profile: Pick<SettingsProfile, 'criteria' | 'maxIterations' | 'selectedModels' | 'contextExtractionPrompt'>;
        prompts: OrchestratorPrompts;
    } | null {
        const profile = this.getProfile(profileName);
        if (!profile) {
            return null;
        }
        
        const exportData: {
            exportVersion: '1.0';
            exportDate: string;
            profileName: string;
            profile: Pick<SettingsProfile, 'criteria' | 'maxIterations' | 'selectedModels' | 'contextExtractionPrompt'>;
            prompts: OrchestratorPrompts;
        } = {
            exportVersion: '1.0',
            exportDate: new Date().toISOString(),
            profileName: profileName,
            profile: {
                criteria: profile.criteria!,
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
    public async importProfile(exportData: unknown, overwriteExisting: boolean = false): Promise<{ success: boolean; message: string; profileName?: string }> {
        try {
            // Validate export data structure
            if (!exportData || typeof exportData !== 'object') {
                return { success: false, message: 'Invalid export data format' };
            }

            const data = exportData as { profileName?: unknown; profile?: unknown; prompts?: unknown };

            if (typeof data.profileName !== 'string' || typeof data.profile !== 'object' || data.profile === null || typeof data.prompts !== 'object' || data.prompts === null) {
                return { success: false, message: 'Export data is missing required fields (profileName, profile, or prompts)' };
    }

            const profileName = data.profileName;
            const profileData = data.profile as unknown;

            // Validate profile structure
            if (!SettingsManager.validateProfileStructure(profileData)) {
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
                criteria: profileData.criteria || DEFAULT_CRITERIA,
                maxIterations: profileData.maxIterations,
                selectedModels: finalSelectedModels,
                contextExtractionPrompt: profileData.contextExtractionPrompt || DEFAULT_CONTEXT_EXTRACTION_PROMPT
            };

            // Save the profile
            await this.saveProfile(profileName, importedProfile);

            // Import prompts (merge with existing ones)
            if (data.prompts && typeof data.prompts === 'object') {
                const mergedPrompts = { ...this.prompts, ...(data.prompts as Partial<OrchestratorPrompts>) };
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
     * Validates the structure of a single profile object
     */
    private static validateProfileStructure(profile: unknown): profile is SettingsProfile {
        if (typeof profile !== 'object' || profile === null) return false;
        const p = profile as Partial<SettingsProfile> & { [k: string]: unknown };
        if (typeof p.maxIterations !== 'number') return false;
        if (typeof p.selectedModels !== 'object' || p.selectedModels === null) return false;
        if (p.criteria !== undefined) {
            if (!Array.isArray(p.criteria)) return false;
            const ok = p.criteria.every((c: unknown) => {
                if (typeof c !== 'object' || c === null) return false;
                const cc = c as { name?: unknown; goal?: unknown; outline?: unknown; leaf?: unknown; description?: unknown };
                return (
                    typeof cc.name === 'string' &&
                    typeof cc.goal === 'number' &&
                    (cc.outline === undefined || typeof cc.outline === 'boolean') &&
                    (cc.leaf === undefined || typeof cc.leaf === 'boolean') &&
                    (cc.description === undefined || typeof cc.description === 'string')
                );
            });
            if (!ok) return false;
        }
        if (p.selectedProviders !== undefined && (typeof p.selectedProviders !== 'object' || p.selectedProviders === null)) return false;
        if (p.webSearchEnabled !== undefined && (typeof p.webSearchEnabled !== 'object' || p.webSearchEnabled === null)) return false;
        if (p.contextExtractionPrompt !== undefined && typeof p.contextExtractionPrompt !== 'string') return false;
        return true;
    }



    /**
     * Exports a profile to a downloadable JSON file
     * @param profileName The name of the profile to export
     */
    public async downloadProfileExport(profileName: string): Promise<{ success: boolean; message: string }> {
        const exportData = this.exportProfile(profileName);
        if (!exportData) {
            const message = `Profile "${profileName}" not found.`;
            alert(message);
            return { success: false, message };
        }

        const filename = `expert-app-profile-${profileName}-${new Date().toISOString().split('T')[0]}.json`;
        const downloadResult = await FileDownloadService.downloadJson(exportData, filename, 'Expert Profile Export');
        
        if (downloadResult.success && !downloadResult.cancelled) {
            return { success: true, message: `Profile "${profileName}" exported successfully.` };
        } else if (downloadResult.cancelled) {
            return { success: false, message: 'Export cancelled by user.' };
        } else {
            return { success: false, message: 'Failed to export profile. Please try again.' };
        }
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
    ): Promise<{ success: boolean; message: string; profileName?: string }> {
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

    public isDebugGenerationEnabled(): boolean {
        return this.debugGenerationEnabled;
    }

    public async setDebugGenerationEnabled(enabled: boolean): Promise<void> {
        this.debugGenerationEnabled = enabled;
        
        // Update the global debug flag immediately
        const { setDebugStatelessGeneration } = await import('./constants');
        setDebugStatelessGeneration(enabled);
        
        try {
            const storage = await this.storageService;
            await storage.set(DEBUG_GENERATION_ENABLED_KEY, enabled);
        } catch (error) {
            console.error('Failed to save debug generation setting to storage', error);
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
    public async resetToDefaults(preserveModels?: { selectedModels?: Record<string, string>; webSearchEnabled?: Record<string, boolean> }): Promise<void> {
        
        // Preserve model selections if provided, otherwise use empty objects
        const modelsToKeep = preserveModels?.selectedModels || {};
        const webSearchToKeep = preserveModels?.webSearchEnabled || {};
        
        // Create a new default profile with current version
        const defaultProfile: SettingsProfile = {
            criteria: DEFAULT_CRITERIA,
            maxIterations: DEFAULT_MAX_ITERATIONS,
            selectedModels: modelsToKeep,
            webSearchEnabled: webSearchToKeep,
            contextExtractionPrompt: DEFAULT_CONTEXT_EXTRACTION_PROMPT,
            version: VersionService.getBuildNumber(),
            taskModelConfigs: {
                coherence_analysis: {
                    outline: 'creator' as const,
                    prose: 'prose' as const
                },
                fix_contradiction: {
                    outline: 'creator' as const,
                    prose: 'prose' as const
                },
                text_polishing: {
                    outline: 'creator' as const,
                    prose: 'prose' as const
                },
                context_adjustment: {
                    outline: 'creator' as const,
                    prose: 'prose' as const
                },
                context_rating: {
                    outline: 'creator' as const,
                    prose: 'prose' as const
                },
                logic_error_analysis: {
                    outline: 'rater' as const,
                    prose: 'rater' as const
                },
                logic_child_fix: {
                    outline: 'creator' as const,
                    prose: 'creator' as const
                }
            }
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
    }
} 