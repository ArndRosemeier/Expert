import { OrchestratorPrompts, defaultPrompts, PROMPT_STORAGE_KEY } from "./PromptManager";
import { QualityCriterion, isMetricCriterion } from "./types";
import { isRegisteredMetricType } from "./quality/metrics/MetricRegistry";
import { PREVIOUS_DEFAULT_CRITERIA_SETS } from "./quality/historicalDefaultCriteria";
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
const SETTINGS_PROFILES_KEY = STORAGE_KEYS.SETTINGS_PROFILES;
const LAST_USED_PROFILE_KEY = STORAGE_KEYS.LAST_USED_PROFILE;
const AI_LOGGING_ENABLED_KEY = STORAGE_KEYS.AI_LOGGING_ENABLED;
const DEBUG_GENERATION_ENABLED_KEY = STORAGE_KEYS.DEBUG_GENERATION_ENABLED;

export const DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        kind: 'llm',
        name: "Prompt Adherence",
        description: "The response directly addresses the given prompt and stays on topic throughout. It fulfills the specific request without wandering off into tangential areas.",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        kind: 'llm',
        name: "Specificity & Concrete Detail",
        description: "The writing uses specific, concrete details and examples rather than vague generalities or abstract summary.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        kind: 'llm',
        name: "Natural Human Voice",
        description: "The prose reads like a specific person wrote it, not a model. Sentence length and structure vary naturally, creating rhythm without monotony or a formulaic cadence. Word choices are distinctive and occasionally idiosyncratic rather than generic, and phrasing avoids stock idioms and predictable constructions. Flow is smooth but never mechanical or self-consciously 'writerly'.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        kind: 'llm',
        name: "Restraint & Subtlety",
        description: "The writing trusts the reader. It implies emotion and meaning through concrete action and detail rather than naming them, and never inflates ordinary events into something grand, symbolic, or transformative. Tone stays measured — no melodrama, no rhetorical heightening, no telling the reader how to feel.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        kind: 'llm',
        name: "No Antithesis Reframing",
        description: "The text avoids artificially elevating the significance of ordinary actions, objects, or perceptions through dramatic recontextualization. This includes explicit patterns like \"It wasn't X. It was Y.\" as well as subtler rhetorical inflation, where minor events are framed as symbolically profound or transformative without narrative justification. Significance should emerge organically rather than through overt authorial framing. (Applies in the text's own language.)",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        kind: 'llm',
        name: "Keep the essence of the draft intact",
        description: "Creativity can only be on the details level. The essence of the draft is the ultimate truth, if that gets violated, other contents created for the same project will get inconsistent.",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        kind: 'metric',
        name: "Avoids AI Clichés",
        metricType: 'bannedPhrases',
        params: {
            phrases: [
                'in conclusion', "it's important to note", 'it is important to note', 'delve into', 'delve',
                'tapestry', 'a testament to', 'testament to', 'in the realm of', 'navigate the landscape',
                'meticulous examination', 'underscores', 'underscore', 'harness', 'illuminate', 'transformative',
                'fostering', 'utilize', 'furthermore', 'moreover', 'ostensibly', 'boasts', 'nestled', 'myriad',
                'plethora', 'seamless', 'robust', 'leverage', 'vibrant', 'ever-evolving', 'game-changer',
                'unlock', 'unleash', 'elevate', 'when it comes to', "it's worth noting", 'plays a crucial role',
                'stands as a testament', 'serves as a testament', 'in the world of'
            ],
            regexes: [],
            maxOccurrences: 0
        },
        weight: 2,
        enabled: true,
        description: "Flags overused AI cliché phrases. Edit the phrase/regex list to customize.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        kind: 'metric',
        name: "Em-dash Restraint",
        metricType: 'emDashDensity',
        params: { maxPer1000Words: 4 },
        weight: 2,
        enabled: true,
        description: "Limits em-dash density, a strong AI-ism tell.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        kind: 'metric',
        name: "Human-like Naming",
        metricType: 'bannedNames',
        params: {
            names: [
                'Elara', 'Lyra', 'Lyria', 'Thorne', 'Stormrider', 'Dawnwalker', 'Shadowblade',
                'Emberheart', 'Snowsong', 'Kieran', 'Soren', 'Sylas', 'Astrid', 'Calix', 'Xander',
                'Draven', 'Isolde', 'Aerin', 'Kael', 'Thalia', 'Dorian'
            ],
            maxOccurrences: 0
        },
        weight: 2,
        enabled: true,
        description: "Flags the most egregious overused fantasy/AI names. Case-sensitive; edit the list to customize.",
        goal: 7,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface StoredCriterionShape {
    name?: unknown;
    goal?: unknown;
    outline?: unknown;
    leaf?: unknown;
    description?: unknown;
}

interface StoredProfileShape {
    criteria?: unknown;
    maxIterations?: unknown;
    selectedModels?: unknown;
    webSearchEnabled?: unknown;
    selectedProviders?: unknown;
    contextExtractionPrompt?: unknown;
    language?: unknown;
    version?: unknown;
    taskModelConfigs?: unknown;
}

function isValidStoredCriterion(criterion: unknown): boolean {
    if (!isPlainObject(criterion)) return false;
    const c = criterion as StoredCriterionShape;
    return (
        typeof c.name === 'string' &&
        typeof c.goal === 'number' &&
        (c.outline === undefined || typeof c.outline === 'boolean') &&
        (c.leaf === undefined || typeof c.leaf === 'boolean') &&
        (c.description === undefined || typeof c.description === 'string')
    );
}

function isValidStoredProfile(profile: unknown): boolean {
    if (!isPlainObject(profile)) return false;
    const p = profile as StoredProfileShape;

    if (p.criteria !== undefined) {
        if (!Array.isArray(p.criteria)) return false;
        if (!p.criteria.every(isValidStoredCriterion)) return false;
    }

    if (typeof p.maxIterations !== 'number') return false;
    if (!isPlainObject(p.selectedModels)) return false;
    if (p.webSearchEnabled !== undefined && !isPlainObject(p.webSearchEnabled)) return false;
    if (p.selectedProviders !== undefined && !isPlainObject(p.selectedProviders)) return false;
    if (p.contextExtractionPrompt !== undefined && typeof p.contextExtractionPrompt !== 'string') return false;
    if (p.language !== undefined && typeof p.language !== 'string') return false;
    if (p.version !== undefined && typeof p.version !== 'string') return false;
    if (p.taskModelConfigs !== undefined && !isPlainObject(p.taskModelConfigs)) return false;

    return true;
}

function areValidSettingsProfiles(data: unknown): data is Record<string, SettingsProfile> {
    if (!isPlainObject(data)) return false;

    return Object.values(data).every(isValidStoredProfile);
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
        if (SettingsManager.instance?.initialized) {
            return SettingsManager.instance;
        }

        SettingsManager.initializationPromise ??= SettingsManager.initializeInstance();

        return SettingsManager.initializationPromise;
    }

    /**
     * Get the singleton instance (sync version for when you know it's already initialized)
     * Use this only after calling getInstance() at least once
     */
    public static getInstanceSync(): SettingsManager {
        if (!SettingsManager.instance?.initialized) {
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
                const currentVersion = VersionService.getBuildNumber();

                // Self-healing load: profiles are backfilled with any missing
                // fields and silently stamped to the current version. There is no
                // user-facing migration - settings carry no cross-version state
                // that needs reconciling, so any structurally valid profile is
                // simply brought up to date here.
                let hasDefaultCriteria = false;
                
                for (const profileName of Object.keys(this.profiles)) {
                    const profile = this.profiles[profileName];
                    if (!profile) {
                        throw new Error(`Profile "${profileName}" is missing from loaded settings`);
                    }
                    // Always bring the profile up to the current version.
                    profile.version = currentVersion;

                    // Handle criteria - add defaults if missing, detect if existing are default
                    if (!profile.criteria) {
                        // Missing criteria is expected after cleanup - just populate with defaults
                        profile.criteria = DEFAULT_CRITERIA;
                    } else if (this.isKnownDefaultCriteria(profile.criteria)) {
                        // Stored criteria match the current OR a previous default set, which
                        // means the user never customized them. Adopt the current defaults
                        // (upgrading any outdated default set) and let save strip them so
                        // future default changes keep propagating automatically.
                        profile.criteria = DEFAULT_CRITERIA;
                        hasDefaultCriteria = true;
                    } else {
                        // Customized criteria are kept as-is, but drop any metric
                        // criterion whose metric type was retired so evaluation
                        // never hits an unregistered type.
                        profile.criteria = this.sanitizeCriteria(profile.criteria);
                    }

                    // Add default context extraction prompt and web search preferences to existing profiles that don't have them
                    if (!profile.contextExtractionPrompt) {
                        profile.contextExtractionPrompt = DEFAULT_CONTEXT_EXTRACTION_PROMPT;
                    }
                    const storedProfile = profile as SettingsProfile & {
                        webSearchEnabled?: Record<string, boolean> | null;
                        taskModelConfigs?: SettingsProfile['taskModelConfigs'] | null;
                    };
                    storedProfile.webSearchEnabled ??= {};
                    storedProfile.taskModelConfigs ??= {
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
                        // context_adjustment removed - traditional context system removed
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
                
                // Clean up default criteria immediately to prevent old defaults from overriding new system criteria
                if (hasDefaultCriteria) {
                    
                    
                    // Re-save to storage with smart criteria logic (but keep full profiles in memory)
                    await this.saveProfiles();
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
                    // context_adjustment removed - traditional context system removed
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
            this.lastUsedProfileName = savedProfile ?? null;
        } catch (error) {
            console.error('Failed to load last used profile from storage', error);
            this.lastUsedProfileName = null;
        }
    }

    private async loadAILoggingSetting(): Promise<void> {
        try {
            const storage = await this.storageService;
            this.aiLoggingEnabled = await storage.get<boolean>(AI_LOGGING_ENABLED_KEY) ?? false;
        } catch (error) {
            console.error('Failed to load AI logging setting from storage', error);
            this.aiLoggingEnabled = false;
        }
    }

    private async loadDebugGenerationSetting(): Promise<void> {
        try {
            const storage = await this.storageService;
            this.debugGenerationEnabled = await storage.get<boolean>(DEBUG_GENERATION_ENABLED_KEY) ?? false;
            
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
            this.globalLanguage = await storage.get<string>(STORAGE_KEYS.GLOBAL_LANGUAGE) ?? 'English';
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
     * Check whether a criteria array is content-identical to a given target set.
     * The `kind` discriminant is intentionally ignored so legacy sets (saved
     * before the discriminant existed) still match.
     */
    /**
     * Removes metric criteria that reference a metric type which is no longer
     * registered (e.g. a retired deterministic metric). This is a one-time data
     * migration, not a silent fallback: every dropped criterion is logged so the
     * change is visible.
     */
    private sanitizeCriteria(criteria: QualityCriterion[]): QualityCriterion[] {
        return criteria.filter(criterion => {
            if (isMetricCriterion(criterion) && !isRegisteredMetricType(criterion.metricType)) {
                console.warn(`Dropping criterion "${criterion.name}": metric type "${criterion.metricType}" is no longer supported.`);
                return false;
            }
            return true;
        });
    }

    private criteriaMatch(criteria: QualityCriterion[], target: QualityCriterion[]): boolean {
        if (criteria.length !== target.length) {
            return false;
        }

        return criteria.every((criterion, index) => {
            const targetCriterion = target[index];
            if (!targetCriterion) return false;

            return (
                criterion.name === targetCriterion.name &&
                criterion.description === targetCriterion.description &&
                criterion.goal === targetCriterion.goal &&
                criterion.outline === targetCriterion.outline &&
                criterion.leaf === targetCriterion.leaf
            );
        });
    }

    /**
     * Check if criteria array is identical to the CURRENT defaults.
     * Used by save to decide whether criteria can be stripped from storage.
     */
    private areDefaultCriteria(criteria: QualityCriterion[]): boolean {
        return this.criteriaMatch(criteria, DEFAULT_CRITERIA);
    }

    /**
     * Check if criteria array matches the current defaults OR any previously
     * released default set. A match means the user never customized the
     * criteria, so the stored set is safe to upgrade to the current defaults.
     */
    private isKnownDefaultCriteria(criteria: QualityCriterion[]): boolean {
        if (this.areDefaultCriteria(criteria)) {
            return true;
        }
        return PREVIOUS_DEFAULT_CRITERIA_SETS.some(set => this.criteriaMatch(criteria, set));
    }

    /**
     * Get profiles that have been modified from their default criteria
     */
    public getModifiedCriteriaProfiles(): Array<{ profileName: string; isDefault: boolean }> {
        const modifiedProfiles: Array<{ profileName: string; isDefault: boolean }> = [];
        
        Object.entries(this.profiles).forEach(([profileName, profile]) => {
            modifiedProfiles.push({
                profileName,
                isDefault: this.areDefaultCriteria(profile.criteria ?? DEFAULT_CRITERIA)
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
            
            for (const key of Object.keys(prompts) as (keyof OrchestratorPrompts)[]) {
                const value = prompts[key];
                if (value !== defaultPrompts[key]) {
                    modifiedPrompts[key] = value;
                }
            }
            
            // Save only the modified prompts
            await storage.set(PROMPT_STORAGE_KEY, modifiedPrompts);
            
            
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
                criteria: profile.criteria ?? DEFAULT_CRITERIA
            };
        }
        return undefined;
    }

    public async saveProfile(name: string, profile: SettingsProfile): Promise<void> {
        if (!name) throw new Error("Profile name cannot be empty.");
        
        // Store profile in memory with criteria always populated for immediate use
        // Deep copy to prevent cross-profile contamination
        const profileToSave: SettingsProfile = {
            selectedModels: { ...profile.selectedModels },
            selectedProviders: { ...(profile.selectedProviders ?? {}) },
            webSearchEnabled: { ...(profile.webSearchEnabled ?? {}) },
            criteria: profile.criteria ? [...profile.criteria] : [...DEFAULT_CRITERIA],
            maxIterations: profile.maxIterations,
            contextExtractionPrompt: profile.contextExtractionPrompt || '',
            version: VersionService.getBuildNumber()
        };
        
        // Deep copy taskModelConfigs if present
        if (profile.taskModelConfigs) {
            profileToSave.taskModelConfigs = { ...profile.taskModelConfigs };
        }

        

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
                    criteria: profile.criteria ?? DEFAULT_CRITERIA
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
                    criteria: profile.criteria ?? DEFAULT_CRITERIA
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
     * Get the effective language setting for general operations.
     * IMPORTANT: This should return the GLOBAL language, not the active project.
     * Project-specific language resolution must be handled by services that
     * know the triggering node (e.g., UnifiedGenerationService.getProjectLanguageForNode).
     */
    public getLanguage(): string {
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



    private omitCriteriaForStorage(profile: SettingsProfile): SettingsProfile {
        const profileWithoutCriteria = { ...profile };
        delete profileWithoutCriteria.criteria;
        return profileWithoutCriteria;
    }

    private async saveProfiles(): Promise<void> {
        try {
            const storage = await this.storageService;
            
            // Create a storage version with default criteria removed to prevent old defaults
            // from overriding new system criteria in future versions
            const profilesForStorage: Record<string, SettingsProfile> = {};
            
            for (const [profileName, profile] of Object.entries(this.profiles)) {
                const isDefaultCriteria = this.areDefaultCriteria(profile.criteria ?? DEFAULT_CRITERIA);

                if (isDefaultCriteria) {
                    // Remove criteria from storage version - they'll be populated from defaults on load
                    profilesForStorage[profileName] = this.omitCriteriaForStorage(profile);
                } else {
                    // Keep custom criteria in storage
                    profilesForStorage[profileName] = profile;
                }
            }
            
            await storage.set(SETTINGS_PROFILES_KEY, profilesForStorage);
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
                criteria: profileData.criteria ?? DEFAULT_CRITERIA,
                maxIterations: profileData.maxIterations,
                selectedModels: finalSelectedModels,
                contextExtractionPrompt: profileData.contextExtractionPrompt || DEFAULT_CONTEXT_EXTRACTION_PROMPT
            };

            // Save the profile
            await this.saveProfile(profileName, importedProfile);

            // Import prompts (merge with existing ones)
            const mergedPrompts = { ...this.prompts, ...(data.prompts as Partial<OrchestratorPrompts>) };
            await this.savePrompts(mergedPrompts);

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
        return isValidStoredProfile(profile);
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
     * Reset all profiles to defaults with current version
     */
    public async resetToDefaults(preserveModels?: { selectedModels?: Record<string, string>; webSearchEnabled?: Record<string, boolean> }): Promise<void> {
        
        // Preserve model selections if provided, otherwise use empty objects
        const modelsToKeep = preserveModels?.selectedModels ?? {};
        const webSearchToKeep = preserveModels?.webSearchEnabled ?? {};
        
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
                // context_adjustment removed - traditional context system removed
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
    }
} 