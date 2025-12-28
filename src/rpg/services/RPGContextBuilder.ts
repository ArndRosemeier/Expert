/**
 * RPG Context Builder
 * 
 * Builds PlaceholderContext for prompt expansion based on the current RPG world state.
 * Uses relationship graph traversal to intelligently include relevant entities.
 */

import { PlaceholderContext } from '../../services/PromptExpansionService';
import { RPGPlaceholderContext } from './RPGPlaceholderService';
import { RPGGameSession, RPGLocation, RPGCharacter, RPGLore, RPGDistance, RPGWorldState } from '../types/RPGTypes';
import { WorldStateService } from './WorldStateService';

export class RPGContextBuilder {
    private worldStateService: WorldStateService;
    
    constructor(worldStateService: WorldStateService) {
        this.worldStateService = worldStateService;
    }
    
    /**
     * Build context for Game Narration (Game LLM)
     * Includes: current location, present characters, player character, relevant lore, recent events, known distances
     */
    buildGameNarrationContext(session: RPGGameSession): PlaceholderContext {
        const worldState = session.worldState;
        
        // Get current location
        const currentLocation = this.worldStateService.getLocation(worldState, worldState.currentLocationId);
        const currentLocationText = this.formatLocation(currentLocation);
        
        // Get player character
        const playerCharacter = this.worldStateService.getCharacter(worldState, worldState.playerCharacterId);
        const playerCharacterText = this.formatCharacter(playerCharacter);
        
        // Get characters at current location
        const characterIdsAtLocation = this.worldStateService.getEntitiesAtLocation(worldState, worldState.currentLocationId);
        const charactersAtLocation = characterIdsAtLocation
            .map(id => this.worldStateService.getCharacter(worldState, id))
            .filter(c => c !== undefined && c.id !== worldState.playerCharacterId) as RPGCharacter[];
        const presentCharactersText = this.formatCharacterList(worldState, worldState.playerCharacterId, charactersAtLocation);
        
        // Get related entities via graph traversal (depth 2)
        const startingEntities = [
            worldState.currentLocationId,
            worldState.playerCharacterId,
            ...characterIdsAtLocation
        ];
        
        const relatedEntityIds = new Set<string>();
        for (const entityId of startingEntities) {
            const related = this.worldStateService.getRelatedEntities(worldState, entityId, 2);
            related.forEach(id => relatedEntityIds.add(id));
        }
        
        // Filter related entities to get lore items
        const relevantLore: RPGLore[] = [];
        for (const entityId of relatedEntityIds) {
            const lore = this.worldStateService.getLore(worldState, entityId);
            if (lore) {
                relevantLore.push(lore);
            }
        }
        const relevantLoreText = this.formatLoreList(relevantLore);
        
        // Get recent events summary
        const recentEventsText = worldState.recentEventsSummary || '[No recent events]';
        
        // Get known distances from current location
        const distances = this.worldStateService.getKnownDistances(worldState, worldState.currentLocationId);
        const knownDistancesText = this.formatDistanceList(distances, worldState);
        
        // Build RPG placeholder context
        const rpgContext: RPGPlaceholderContext = {
            rpg_current_location: currentLocationText,
            rpg_present_characters: presentCharactersText,
            rpg_player_character: playerCharacterText,
            rpg_relevant_lore: relevantLoreText,
            rpg_recent_events: recentEventsText,
            rpg_known_distances: knownDistancesText
        };
        
        // Return as PlaceholderContext with custom field
        return {
            custom: rpgContext as unknown as Record<string, string>
        };
    }
    
    /**
     * Build context for State Parser (State Parser LLM)
     * Includes: current world state XML, player action, GM response
     */
    buildStateParserContext(session: RPGGameSession, playerAction: string, gmResponse: string): PlaceholderContext {
        const worldStateXml = this.formatWorldStateAsXML(session.worldState);
        
        const rpgContext: RPGPlaceholderContext = {
            world_state_xml: worldStateXml,
            rpg_player_action: playerAction,
            rpg_gm_response: gmResponse
        };
        
        return {
            custom: rpgContext as unknown as Record<string, string>
        };
    }
    
    // ========================================
    // Formatting Methods
    // ========================================
    
    private formatLocation(location: RPGLocation | undefined): string {
        if (!location) {
            return '[Unknown location]';
        }
        
        let text = `**${location.name}**\n`;
        text += `${location.description}\n`;
        
        if (Object.keys(location.state).length > 0) {
            text += `State: ${JSON.stringify(location.state, null, 2)}`;
        }
        
        return text;
    }
    
    private formatCharacter(character: RPGCharacter | undefined): string {
        if (!character) {
            return '[Unknown character]';
        }
        
        let text = `**${character.name}**\n`;
        text += `${character.description}\n`;
        
        if (Object.keys(character.state).length > 0) {
            text += `State: ${JSON.stringify(character.state, null, 2)}`;
        }
        
        return text;
    }
    
    private formatCharacterList(worldState: RPGWorldState, playerCharacterId: string, characters: RPGCharacter[]): string {
        if (characters.length === 0) {
            return '[No other characters present]';
        }
        
        let text = '';
        for (const character of characters) {
            const knowsName = this.worldStateService
                .getRelationshipsForEntity(worldState, character.id)
                .some(r => r.type === 'knows_name_of' && r.toId === playerCharacterId);

            text += `- **${character.name}**: ${character.description}`;
            text += knowsName ? ' (knows your name)' : ' (does not know your name)';
            if (Object.keys(character.state).length > 0) {
                text += ` (State: ${JSON.stringify(character.state)})`;
            }
            text += '\n';
        }
        
        return text.trim();
    }
    
    private formatLoreList(loreItems: RPGLore[]): string {
        if (loreItems.length === 0) {
            return '[No relevant lore]';
        }
        
        let text = '';
        for (const lore of loreItems) {
            text += `### ${lore.title}\n`;
            text += `${lore.content}\n`;
            if (lore.tags.length > 0) {
                text += `Tags: ${lore.tags.join(', ')}\n`;
            }
            text += '\n';
        }
        
        return text.trim();
    }
    
    private formatDistanceList(distances: RPGDistance[], worldState: any): string {
        if (distances.length === 0) {
            return '[No known distances]';
        }
        
        let text = '';
        for (const distance of distances) {
            const toLocation = this.worldStateService.getLocation(worldState, distance.toLocationId);
            const locationName = toLocation?.name || distance.toLocationId;
            
            text += `- **${locationName}**: ${distance.distance} ${distance.unit}\n`;
        }
        
        return text.trim();
    }
    
    /**
     * Format the entire world state as XML for the State Parser
     */
    private formatWorldStateAsXML(worldState: RPGWorldState): string {
        let xml = '<current_world_state>\n';
        
        // Locations
        xml += '  <locations>\n';
        for (const location of worldState.locations.values()) {
            xml += `    <location id="${this.escapeXml(location.id)}" name="${this.escapeXml(location.name)}">\n`;
            xml += `      <description>${this.escapeXml(location.description)}</description>\n`;
            if (Object.keys(location.state).length > 0) {
                xml += `      <state>${this.escapeXml(JSON.stringify(location.state))}</state>\n`;
            }
            xml += '    </location>\n';
        }
        xml += '  </locations>\n';
        
        // Characters
        xml += '  <characters>\n';
        for (const character of worldState.characters.values()) {
            xml += `    <character id="${this.escapeXml(character.id)}" name="${this.escapeXml(character.name)}">\n`;
            xml += `      <description>${this.escapeXml(character.description)}</description>\n`;
            if (Object.keys(character.state).length > 0) {
                xml += `      <state>${this.escapeXml(JSON.stringify(character.state))}</state>\n`;
            }
            xml += '    </character>\n';
        }
        xml += '  </characters>\n';
        
        // Lore
        xml += '  <lore>\n';
        for (const lore of worldState.lore.values()) {
            xml += `    <lore_item id="${this.escapeXml(lore.id)}" title="${this.escapeXml(lore.title)}">\n`;
            xml += `      <content>${this.escapeXml(lore.content)}</content>\n`;
            if (lore.tags.length > 0) {
                xml += `      <tags>${this.escapeXml(lore.tags.join(','))}</tags>\n`;
            }
            xml += '    </lore_item>\n';
        }
        xml += '  </lore>\n';
        
        xml += '</current_world_state>';
        return xml;
    }
    
    /**
     * Escape XML special characters
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

