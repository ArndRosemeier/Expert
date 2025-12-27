/**
 * RPG State Parser
 * 
 * Parses XML output from the State Parser LLM to extract world state changes.
 */

import { RPGStateUpdateXML } from '../types/RPGTypes';

export class RPGStateParser {
    
    /**
     * Parse XML response from State Parser LLM
     */
    parseStateUpdate(xmlString: string): RPGStateUpdateXML {
        const result: RPGStateUpdateXML = {};
        
        try {
            // Parse XML string
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            
            // Check for parse errors
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error('XML Parse Error:', parseError.textContent);
                throw new Error(`Failed to parse XML: ${parseError.textContent}`);
            }
            
            const root = xmlDoc.querySelector('rpg_state_update');
            if (!root) {
                console.warn('No rpg_state_update root element found');
                return result;
            }
            
            // Parse locations
            const parsedLocations = this.parseLocations(root);
            if (parsedLocations) result.locations = parsedLocations;
            
            // Parse characters
            const parsedCharacters = this.parseCharacters(root);
            if (parsedCharacters) result.characters = parsedCharacters;
            
            // Parse lore
            const parsedLore = this.parseLore(root);
            if (parsedLore) result.lore = parsedLore;
            
            // Parse relationships
            const parsedRelationships = this.parseRelationships(root);
            if (parsedRelationships) result.relationships = parsedRelationships;
            
            // Parse distances
            const parsedDistances = this.parseDistances(root);
            if (parsedDistances) result.distances = parsedDistances;
            
            // Parse recent events summary
            const recentEventsElement = root.querySelector('recent_events_summary');
            if (recentEventsElement?.textContent) {
                result.recentEventsSummary = recentEventsElement.textContent.trim();
            }
            
            // Parse player location
            const playerLocationElement = root.querySelector('player_location > current_location_id');
            if (playerLocationElement?.textContent) {
                result.playerLocation = {
                    currentLocationId: playerLocationElement.textContent.trim()
                };
            }
            
            return result;
            
        } catch (error) {
            console.error('Error parsing state update XML:', error);
            throw error;
        }
    }
    
    // ========================================
    // Entity Parsers
    // ========================================
    
    private parseLocations(root: Element): RPGStateUpdateXML['locations'] {
        const locations: RPGStateUpdateXML['locations'] = [];
        const locationsContainer = root.querySelector('locations');
        
        if (!locationsContainer) {
            return undefined;
        }
        
        const locationElements = locationsContainer.querySelectorAll('location');
        
        for (const element of Array.from(locationElements)) {
            const action = element.getAttribute('action') as 'create' | 'update';
            if (!action) {
                console.warn('Location element missing action attribute, skipping');
                continue;
            }
            
            const idElement = element.querySelector('id');
            if (!idElement?.textContent) {
                console.warn('Location element missing id, skipping');
                continue;
            }
            
            const location: NonNullable<RPGStateUpdateXML['locations']>[number] = {
                action,
                id: idElement.textContent.trim()
            };
            
            const nameElement = element.querySelector('name');
            if (nameElement?.textContent) {
                location.name = nameElement.textContent.trim();
            }
            
            const descriptionElement = element.querySelector('description');
            if (descriptionElement?.textContent) {
                location.description = descriptionElement.textContent.trim();
            }
            
            const stateElement = element.querySelector('state');
            if (stateElement?.textContent) {
                try {
                    location.state = JSON.parse(stateElement.textContent.trim());
                } catch (error) {
                    console.warn(`Failed to parse location state JSON for ${location.id}:`, error);
                }
            }
            
            locations.push(location);
        }
        
        return locations.length > 0 ? locations : undefined;
    }
    
    private parseCharacters(root: Element): RPGStateUpdateXML['characters'] {
        const characters: RPGStateUpdateXML['characters'] = [];
        const charactersContainer = root.querySelector('characters');
        
        if (!charactersContainer) {
            return undefined;
        }
        
        const characterElements = charactersContainer.querySelectorAll('character');
        
        for (const element of Array.from(characterElements)) {
            const action = element.getAttribute('action') as 'create' | 'update';
            if (!action) {
                console.warn('Character element missing action attribute, skipping');
                continue;
            }
            
            const idElement = element.querySelector('id');
            if (!idElement?.textContent) {
                console.warn('Character element missing id, skipping');
                continue;
            }
            
            const character: NonNullable<RPGStateUpdateXML['characters']>[number] = {
                action,
                id: idElement.textContent.trim()
            };
            
            const nameElement = element.querySelector('name');
            if (nameElement?.textContent) {
                character.name = nameElement.textContent.trim();
            }
            
            const descriptionElement = element.querySelector('description');
            if (descriptionElement?.textContent) {
                character.description = descriptionElement.textContent.trim();
            }
            
            const stateElement = element.querySelector('state');
            if (stateElement?.textContent) {
                try {
                    character.state = JSON.parse(stateElement.textContent.trim());
                } catch (error) {
                    console.warn(`Failed to parse character state JSON for ${character.id}:`, error);
                }
            }
            
            characters.push(character);
        }
        
        return characters.length > 0 ? characters : undefined;
    }
    
    private parseLore(root: Element): RPGStateUpdateXML['lore'] {
        const lore: RPGStateUpdateXML['lore'] = [];
        const loreContainer = root.querySelector('lore');
        
        if (!loreContainer) {
            return undefined;
        }
        
        const loreElements = loreContainer.querySelectorAll('lore_item');
        
        for (const element of Array.from(loreElements)) {
            const action = element.getAttribute('action') as 'create' | 'update';
            if (!action) {
                console.warn('Lore element missing action attribute, skipping');
                continue;
            }
            
            const idElement = element.querySelector('id');
            if (!idElement?.textContent) {
                console.warn('Lore element missing id, skipping');
                continue;
            }
            
            const loreItem: NonNullable<RPGStateUpdateXML['lore']>[number] = {
                action,
                id: idElement.textContent.trim()
            };
            
            const titleElement = element.querySelector('title');
            if (titleElement?.textContent) {
                loreItem.title = titleElement.textContent.trim();
            }
            
            const contentElement = element.querySelector('content');
            if (contentElement?.textContent) {
                loreItem.content = contentElement.textContent.trim();
            }
            
            const tagsElement = element.querySelector('tags');
            if (tagsElement?.textContent) {
                loreItem.tags = tagsElement.textContent.trim().split(',').map(t => t.trim());
            }
            
            lore.push(loreItem);
        }
        
        return lore.length > 0 ? lore : undefined;
    }
    
    private parseRelationships(root: Element): RPGStateUpdateXML['relationships'] {
        const relationships: RPGStateUpdateXML['relationships'] = [];
        const relationshipsContainer = root.querySelector('relationships');
        
        if (!relationshipsContainer) {
            return undefined;
        }
        
        const relationshipElements = relationshipsContainer.querySelectorAll('relationship');
        
        for (const element of Array.from(relationshipElements)) {
            const action = element.getAttribute('action') as 'create' | 'update' | 'delete';
            if (!action) {
                console.warn('Relationship element missing action attribute, skipping');
                continue;
            }
            
            const fromIdElement = element.querySelector('from_id');
            const toIdElement = element.querySelector('to_id');
            const typeElement = element.querySelector('type');
            
            if (!fromIdElement?.textContent || !toIdElement?.textContent || !typeElement?.textContent) {
                console.warn('Relationship element missing required fields, skipping');
                continue;
            }
            
            const relationship: NonNullable<RPGStateUpdateXML['relationships']>[number] = {
                action,
                fromId: fromIdElement.textContent.trim(),
                toId: toIdElement.textContent.trim(),
                type: typeElement.textContent.trim()
            };
            
            const descriptionElement = element.querySelector('description');
            if (descriptionElement?.textContent) {
                relationship.description = descriptionElement.textContent.trim();
            }
            
            relationships.push(relationship);
        }
        
        return relationships.length > 0 ? relationships : undefined;
    }
    
    private parseDistances(root: Element): RPGStateUpdateXML['distances'] {
        const distances: RPGStateUpdateXML['distances'] = [];
        const distancesContainer = root.querySelector('distances');
        
        if (!distancesContainer) {
            return undefined;
        }
        
        const distanceElements = distancesContainer.querySelectorAll('distance');
        
        for (const element of Array.from(distanceElements)) {
            const fromLocationIdElement = element.querySelector('from_location_id');
            const toLocationIdElement = element.querySelector('to_location_id');
            const distanceValueElement = element.querySelector('distance');
            const unitElement = element.querySelector('unit');
            
            if (!fromLocationIdElement?.textContent || !toLocationIdElement?.textContent || 
                !distanceValueElement?.textContent || !unitElement?.textContent) {
                console.warn('Distance element missing required fields, skipping');
                continue;
            }
            
            // Try to parse distance as number, fallback to string
            const distanceText = distanceValueElement.textContent.trim();
            const distanceValue: number | string = isNaN(Number(distanceText)) ? distanceText : Number(distanceText);
            
            const distance: NonNullable<RPGStateUpdateXML['distances']>[number] = {
                fromLocationId: fromLocationIdElement.textContent.trim(),
                toLocationId: toLocationIdElement.textContent.trim(),
                distance: distanceValue,
                unit: unitElement.textContent.trim()
            };
            
            distances.push(distance);
        }
        
        return distances.length > 0 ? distances : undefined;
    }
}

