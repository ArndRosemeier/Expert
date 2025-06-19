import { type QualityCriterion } from "./LoopOrchestrator";

export const SETTINGS_PROFILES_KEY = 'expert_app_settings_profiles';
export const LAST_USED_PROFILE_KEY = 'expert_app_last_used_profile';

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

    constructor() {
        this.loadProfiles();
        this.lastUsedProfileName = localStorage.getItem(LAST_USED_PROFILE_KEY);
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
                    this.profiles = {};
                }
            } catch (error) {
                console.error('Failed to parse settings profiles from localStorage', error);
                this.profiles = {};
            }
        }
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
        localStorage.setItem(SETTINGS_PROFILES_KEY, JSON.stringify(this.profiles));
        this.setLastUsedProfile(name);
    }

    public deleteProfile(name: string) {
        delete this.profiles[name];
        localStorage.setItem(SETTINGS_PROFILES_KEY, JSON.stringify(this.profiles));
        if (this.lastUsedProfileName === name) {
            localStorage.removeItem(LAST_USED_PROFILE_KEY);
            this.lastUsedProfileName = null;
        }
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
} 