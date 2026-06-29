import { SettingsManager } from '../../SettingsManager';

/**
 * Centralized coherence analysis utilities to avoid code duplication
 */
export class CoherenceUtils {
    
    /**
     * Prepare frozen settings for coherence analysis
     * Used by both action button and auto-coherence to ensure consistency
     */
    static prepareFrozenSettings(settingsManager: SettingsManager) {
        const prompts = settingsManager.getPrompts();
        const profile = settingsManager.getLastUsedProfile();
        
        return {
            coherenceAnalysisPrompt: prompts.coherence_analysis || '',
            fixContradictionPrompt: prompts.fix_contradiction || '',
            language: settingsManager.getLanguage(),
            taskModelConfigs: profile?.taskModelConfigs ?? {
                coherence_analysis: { outline: 'creator', prose: 'prose' },
                fix_contradiction: { outline: 'creator', prose: 'prose' },
                context_adjustment: { outline: 'creator', prose: 'prose' },
                text_polishing: { outline: 'creator', prose: 'prose' }
            }
        };
    }
} 