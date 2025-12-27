/**
 * RPG Placeholder Service
 * 
 * Registers RPG-specific placeholders for use in prompt templates.
 * These placeholders are dynamically populated by RPGContextBuilder based on current world state.
 */

import { PlaceholderContext, createPromptExpansionService } from '../../services/PromptExpansionService';
import { SettingsManager } from '../../SettingsManager';

/**
 * RPG-specific placeholder context
 * This extends the standard PlaceholderContext with RPG-specific fields
 */
export interface RPGPlaceholderContext {
    rpg_current_location?: string;
    rpg_present_characters?: string;
    rpg_player_character?: string;
    rpg_relevant_lore?: string;
    rpg_recent_events?: string;
    rpg_known_distances?: string;
    rpg_player_action?: string;
    rpg_gm_response?: string;
    world_state_xml?: string;  // Full world state in XML format for State Parser
}

/**
 * Register all RPG-specific placeholders with the PromptExpansionService
 */
export function registerRPGPlaceholders(expansionService: ReturnType<typeof createPromptExpansionService>): void {
    // Register context placeholders for RPG
    
    expansionService.registerContextPlaceholder('rpg_current_location', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_current_location || '[No location data]',
            description: 'Current location name, description, and state'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_present_characters', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_present_characters || '[No characters present]',
            description: 'Characters present at current location'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_player_character', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_player_character || '[No player character data]',
            description: 'Player character name, description, and state'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_relevant_lore', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_relevant_lore || '[No relevant lore]',
            description: 'Lore connected to current location or present characters'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_recent_events', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_recent_events || '[No recent events]',
            description: 'Recent events summary for continuity'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_known_distances', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_known_distances || '[No known distances]',
            description: 'Distances from current location to other locations'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_player_action', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_player_action || '[No player action]',
            description: 'The last player message/action'
        };
    });
    
    expansionService.registerContextPlaceholder('rpg_gm_response', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.rpg_gm_response || '[No GM response]',
            description: 'The last Game Master response'
        };
    });
    
    expansionService.registerContextPlaceholder('world_state_xml', (context: PlaceholderContext) => {
        const rpgContext = context.custom as RPGPlaceholderContext | undefined;
        return {
            value: rpgContext?.world_state_xml || '<current_world_state></current_world_state>',
            description: 'Complete world state in XML format (locations, characters, lore with IDs)'
        };
    });
}

/**
 * Create a PromptExpansionService instance with RPG placeholders registered
 */
export function createRPGPromptExpansionService(settingsManager: SettingsManager): ReturnType<typeof createPromptExpansionService> {
    const expansionService = createPromptExpansionService(settingsManager);
    registerRPGPlaceholders(expansionService);
    return expansionService;
}

