import { SettingsManager } from '../SettingsManager';

/**
 * Available model purposes that users can select from
 */
export const MODEL_PURPOSES = [
    { key: 'creator', label: 'Creator' },
    { key: 'rater', label: 'Rater' },
    { key: 'editor', label: 'Editor' },
    { key: 'prose', label: 'Prose' },
] as const;

type ModelPurpose = typeof MODEL_PURPOSES[number]['key'];

/**
 * Task types that can have configurable model selection
 */
export interface TaskModelConfig {
    /** Model purpose to use for outline (non-leaf) nodes */
    outline: ModelPurpose;
    /** Model purpose to use for prose (leaf) nodes */
    prose: ModelPurpose;
}

/**
 * All configurable tasks and their model settings
 */
export interface AllTaskModelConfigs {
    coherence_analysis: TaskModelConfig;
    fix_contradiction: TaskModelConfig;
    text_polishing: TaskModelConfig;
    // context_adjustment removed - traditional context system removed
    context_rating: TaskModelConfig;
    logic_error_analysis: TaskModelConfig;
    logic_child_fix: TaskModelConfig;
    // Future tasks can be added here:
    // context_analysis: TaskModelConfig;
}

/**
 * Default model configurations for all tasks
 */
const DEFAULT_TASK_MODEL_CONFIGS: AllTaskModelConfigs = {
    coherence_analysis: {
        outline: 'creator',
        prose: 'prose'
    },
    fix_contradiction: {
        outline: 'creator',  // Default to creator for fixing contradictions in outline nodes
        prose: 'prose'       // Default to prose for fixing contradictions in prose nodes
    },
    logic_error_analysis: {
        outline: 'rater',    // Use rater model for analyzing logic errors in outline nodes
        prose: 'rater'       // Use rater model for analyzing logic errors in prose nodes
    },
    text_polishing: {
        outline: 'creator',  // Default to creator for polishing outline nodes
        prose: 'prose'       // Default to prose for polishing prose nodes
    },
    // context_adjustment removed - traditional context system removed
    context_rating: {
        outline: 'creator',  // Default to creator for context rating in outline nodes
        prose: 'prose'       // Default to prose for context rating in prose nodes
    },
    logic_child_fix: {
        outline: 'creator',  // Default to creator for fixing child nodes based on truth node
        prose: 'creator'     // Default to creator for fixing child nodes based on truth node
    }
};

/**
 * Service for managing task-based model configurations
 * Provides centralized, user-configurable model selection for different tasks
 */
export class TaskModelService {
    private settingsManager: SettingsManager;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
    }

    /**
     * Get the model purpose to use for a specific task and node type
     */
    public getModelPurposeForTask(taskType: keyof AllTaskModelConfigs, isLeafNode: boolean): ModelPurpose {
        const taskConfigs = this.getTaskModelConfigs();
        const taskConfig = taskConfigs[taskType];
        
        if (!taskConfig) {
            // Fallback to defaults if task not configured
            const defaultConfig = DEFAULT_TASK_MODEL_CONFIGS[taskType];
            return isLeafNode ? defaultConfig.prose : defaultConfig.outline;
        }
        
        return isLeafNode ? taskConfig.prose : taskConfig.outline;
    }

    /**
     * Get the actual AI model to use for a specific task and node type
     */
    public getModelForTask(taskType: keyof AllTaskModelConfigs, isLeafNode: boolean): string {
        const purpose = this.getModelPurposeForTask(taskType, isLeafNode);
        const profile = this.settingsManager.getLastUsedProfile();
        if (!profile) {
            throw new Error('No active profile available - settings configuration corrupted');
        }
        if (!profile.selectedModels) {
            throw new Error('Profile has no selectedModels configuration - profile data corrupted');
        }
        const selectedModels = profile.selectedModels;
        const modelId = selectedModels[purpose];
        
        if (!modelId) {
            throw new Error(`No model configured for purpose: ${purpose}`);
        }
        
        return modelId;
    }

    /**
     * Get all task model configurations from settings
     */
    public getTaskModelConfigs(): AllTaskModelConfigs {
        const profile = this.settingsManager.getLastUsedProfile();
        if (!profile) {
            throw new Error('No active profile available - settings configuration corrupted');
        }
        if (!profile.taskModelConfigs) {
            throw new Error('Profile has no taskModelConfigs - profile data corrupted, using defaults instead');
        }
        return profile.taskModelConfigs;
    }

    /**
     * Update task model configuration for a specific task
     */
    public async updateTaskModelConfig(
        taskType: keyof AllTaskModelConfigs, 
        config: TaskModelConfig
    ): Promise<void> {
        const profile = this.settingsManager.getLastUsedProfile();
        if (!profile) {
            throw new Error('No active profile found');
        }

        // Get current task configs or use defaults
        const currentConfigs = profile.taskModelConfigs ?? { ...DEFAULT_TASK_MODEL_CONFIGS };
        
        // Update the specific task config
        currentConfigs[taskType] = config;

        // Save the updated profile
        const updatedProfile = {
            ...profile,
            taskModelConfigs: currentConfigs
        };

        const profileName = this.settingsManager.getLastUsedProfileName();
        if (profileName) {
            await this.settingsManager.saveProfile(profileName, updatedProfile);
        }
    }

    /**
     * Get available model purposes for UI selection
     */
    public getAvailableModelPurposes(): readonly typeof MODEL_PURPOSES[number][] {
        return MODEL_PURPOSES;
    }

    /**
     * Get human-readable label for a model purpose
     */
    public getModelPurposeLabel(purpose: ModelPurpose): string {
        const found = MODEL_PURPOSES.find(p => p.key === purpose);
        return found ? found.label : purpose;
    }

    /**
     * Validate that a model purpose is valid
     */
    public isValidModelPurpose(purpose: string): purpose is ModelPurpose {
        return MODEL_PURPOSES.some(p => p.key === purpose);
    }

    /**
     * Get the current model name for a purpose (for display)
     */
    public getCurrentModelName(purpose: ModelPurpose): string {
        const profile = this.settingsManager.getLastUsedProfile();
        const selectedModels = profile?.selectedModels ?? {};
        return selectedModels[purpose] ?? 'Not configured';
    }

    /**
     * Get display information for a task configuration
     */
    public getTaskConfigDisplay(taskType: keyof AllTaskModelConfigs): {
        taskName: string;
        outline: { purpose: string; model: string };
        prose: { purpose: string; model: string };
    } {
        const config = this.getTaskModelConfigs()[taskType];
        const taskNames = {
            coherence_analysis: 'Coherence Analysis',
            fix_contradiction: 'Fix Contradiction',
            text_polishing: 'Text Polishing',
            // context_adjustment removed - traditional context system removed
            context_rating: 'Context Rating',
            logic_error_analysis: 'Logic Error Analysis',
            logic_child_fix: 'Logic Child Fix'
        };

        return {
            taskName: taskNames[taskType] || taskType,
            outline: {
                purpose: this.getModelPurposeLabel(config.outline),
                model: this.getCurrentModelName(config.outline)
            },
            prose: {
                purpose: this.getModelPurposeLabel(config.prose),
                model: this.getCurrentModelName(config.prose)
            }
        };
    }
} 