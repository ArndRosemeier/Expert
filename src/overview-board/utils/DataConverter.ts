// Data converter utility - transforms AI analysis data into visual elements
import type { Point } from '../../idea-board/types/BoardTypes';
import type { 
  OverviewData, 
  EventData, 
  CharacterData, 
  PlaceData 
} from '../types/OverviewTypes';
import type { 
  OverviewElement, 
  OverviewConnection, 
  CloudTheme 
} from '../types/GraphTypes';
import { EventNode } from '../elements/EventNode';
import { CharacterNode } from '../elements/CharacterNode';
import { PlaceNode } from '../elements/PlaceNode';

export class DataConverter {
  private theme: CloudTheme;
  
  constructor(theme: CloudTheme) {
    this.theme = theme;
  }
  
  /**
   * Convert OverviewData to visual elements and connections
   */
  public convertToVisualElements(data: OverviewData, canvasWidth: number = 1200, canvasHeight: number = 800): {
    elements: OverviewElement[];
    connections: OverviewConnection[];
  } {
    const elements: OverviewElement[] = [];
    const connections: OverviewConnection[] = [];
    
    // Calculate cloud centers using same logic as OverviewRenderer
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const cloudSpacing = 300;
    const cloudRadius = 180; // 50% bigger than original 120
    
    const cloudCenters = {
      events: { x: centerX - cloudSpacing, y: centerY - cloudSpacing / 2 },
      characters: { x: centerX + cloudSpacing, y: centerY - cloudSpacing / 2 },
      places: { x: centerX, y: centerY + cloudSpacing / 2 }
    };
    
    // Convert events to visual elements
    const eventElements = this.createEventElements(Array.from(data.events.values()), cloudCenters.events, cloudRadius);
    elements.push(...eventElements);
    
    // Convert characters to visual elements
    const characterElements = this.createCharacterElements(Array.from(data.characters.values()), cloudCenters.characters, cloudRadius);
    elements.push(...characterElements);
    
    // Convert places to visual elements
    const placeElements = this.createPlaceElements(Array.from(data.places.values()), cloudCenters.places, cloudRadius);
    elements.push(...placeElements);
    
    // Create connections between elements
    const elementConnections = this.createConnections(data);
    connections.push(...elementConnections);
    
    return { elements, connections };
  }

  /**
   * Convert OverviewData to visual elements using exact coordinates from renderer
   */
  public convertToVisualElementsWithCoords(
    data: OverviewData, 
    cloudCenters: { events: Point; characters: Point; places: Point },
    cloudRadius: number
  ): {
    elements: OverviewElement[];
    connections: OverviewConnection[];
  } {
    const elements: OverviewElement[] = [];
    const connections: OverviewConnection[] = [];
    
    // Convert events to visual elements using exact coordinates
    const eventElements = this.createEventElements(Array.from(data.events.values()), cloudCenters.events, cloudRadius);
    elements.push(...eventElements);
    
    // Convert characters to visual elements using exact coordinates
    const characterElements = this.createCharacterElements(Array.from(data.characters.values()), cloudCenters.characters, cloudRadius);
    elements.push(...characterElements);
    
    // Convert places to visual elements using exact coordinates
    const placeElements = this.createPlaceElements(Array.from(data.places.values()), cloudCenters.places, cloudRadius);
    elements.push(...placeElements);
    
    // Create connections between elements
    const elementConnections = this.createConnections(data);
    connections.push(...elementConnections);
    
    return { elements, connections };
  }
  
  /**
   * Create event visual elements with automatic positioning
   */
  private createEventElements(events: EventData[], cloudCenter: Point, cloudRadius: number): OverviewElement[] {
    const elements: OverviewElement[] = [];
    
    events.forEach((event, index) => {
      const position = this.calculateElementPosition(
        index, 
        events.length, 
        cloudCenter, 
        cloudRadius,
        event.significance // Pass significance for size calculation
      );
      
      const element = new EventNode(
        event.id,
        position,
        event,
        this.theme
      );
      
      elements.push(element);
    });
    
    return elements;
  }
  
  /**
   * Create character visual elements with automatic positioning
   */
  private createCharacterElements(characters: CharacterData[], cloudCenter: Point, cloudRadius: number): OverviewElement[] {
    const elements: OverviewElement[] = [];
    
    characters.forEach((character, index) => {
      // Determine significance from character role
      const significance = (character.role === 'protagonist' || character.role === 'antagonist') ? 'major' : 'minor';
      
      const position = this.calculateElementPosition(
        index, 
        characters.length, 
        cloudCenter, 
        cloudRadius,
        significance
      );
      
      const element = new CharacterNode(
        character.id,
        position,
        character,
        this.theme
      );
      
      elements.push(element);
    });
    
    return elements;
  }
  
  /**
   * Create place visual elements with automatic positioning
   */
  private createPlaceElements(places: PlaceData[], cloudCenter: Point, cloudRadius: number): OverviewElement[] {
    const elements: OverviewElement[] = [];
    
    places.forEach((place, index) => {
      const position = this.calculateElementPosition(
        index, 
        places.length, 
        cloudCenter, 
        cloudRadius,
        place.significance
      );
      
      const element = new PlaceNode(
        place.id,
        position,
        place,
        this.theme
      );
      
      elements.push(element);
    });
    
    return elements;
  }
  
  /**
   * Calculate position for element within cloud using circular layout
   */
  private calculateElementPosition(
    index: number, 
    totalElements: number, 
    cloudCenter: Point, 
    cloudRadius: number,
    significance: 'major' | 'minor'
  ): Point {
    if (totalElements === 1) {
      // Convert center position to top-left position for single element
      const elementSize = significance === 'major' ? 80 : 60;
      return { 
        x: cloudCenter.x - elementSize / 2,
        y: cloudCenter.y - elementSize / 2
      };
    }
    
    const angle = (index / totalElements) * 2 * Math.PI;
    
    // Add randomness back for natural positioning
    const baseRadius = cloudRadius * 0.5; // Base radius at 50% of cloud radius
    const radiusVariation = cloudRadius * 0.2; // ±20% variation
    const angleVariation = Math.PI / 6; // ±30 degrees
    
    // Create deterministic randomness based on element index for consistency
    const seed = index * 1337; // Simple seed for consistency
    const radiusOffset = (Math.sin(seed) * radiusVariation);
    const angleOffset = (Math.cos(seed * 1.5) * angleVariation);
    
    const actualRadius = baseRadius + radiusOffset;
    const actualAngle = angle + angleOffset;
    
    // Calculate center position with randomness
    const centerX = cloudCenter.x + Math.cos(actualAngle) * actualRadius;
    const centerY = cloudCenter.y + Math.sin(actualAngle) * actualRadius;
    
    // Convert from center position to top-left position (element.position is top-left)
    const elementSize = significance === 'major' ? 80 : 60; // Actual size from OverviewElementBase
    const position = {
      x: centerX - elementSize / 2,
      y: centerY - elementSize / 2
    };


    
    return position;
  }
  
  /**
   * Create connections between elements based on relationships - FAIL LOUDLY on invalid data
   */
  private createConnections(data: OverviewData): OverviewConnection[] {
    const connections: OverviewConnection[] = [];
    
    // FAIL LOUDLY: Validate OverviewData structure
    if (!data?.events || typeof data.events.values !== 'function') {
      throw new Error(`❌ DATA STRUCTURE ERROR: Invalid events data in OverviewData. Type: ${typeof data?.events}, hasValues: ${Boolean(data?.events?.values)}`);
    }
    
    // Create connections from events to characters and places
    for (const event of data.events.values()) {
      // FAIL LOUDLY: Validate event structure before using
      if (!event) {
        throw new Error(`❌ DATA STRUCTURE ERROR: Null event found in events data`);
      }
      
      if (!event.id || typeof event.id !== 'string') {
        throw new Error(`❌ DATA STRUCTURE ERROR: Event missing valid id. Got: ${typeof event.id} = ${event.id}`);
      }
      
      if (!Array.isArray(event.connectedCharacters)) {
        throw new Error(`❌ DATA STRUCTURE ERROR: Event ${event.id} connectedCharacters is not an array. Type: ${typeof event.connectedCharacters}, Value: ${event.connectedCharacters}`);
      }
      
      if (!Array.isArray(event.connectedPlaces)) {
        throw new Error(`❌ DATA STRUCTURE ERROR: Event ${event.id} connectedPlaces is not an array. Type: ${typeof event.connectedPlaces}, Value: ${event.connectedPlaces}`);
      }
      
      // FAIL LOUDLY: Validate characters and places Maps before using
      if (!data.characters || typeof data.characters.has !== 'function') {
        throw new Error(`❌ DATA STRUCTURE ERROR: Invalid characters data in OverviewData. Type: ${typeof data.characters}, hasHas: ${Boolean(data.characters?.has)}`);
      }
      
      if (!data.places || typeof data.places.has !== 'function') {
        throw new Error(`❌ DATA STRUCTURE ERROR: Invalid places data in OverviewData. Type: ${typeof data.places}, hasHas: ${Boolean(data.places?.has)}`);
      }
      
      // Event to character connections
      for (const characterId of event.connectedCharacters) {
        // FAIL LOUDLY: Validate characterId type
        if (typeof characterId !== 'string') {
          throw new Error(`❌ DATA STRUCTURE ERROR: Event ${event.id} has invalid characterId type: ${typeof characterId} = ${characterId}`);
        }
        
        if (data.characters.has(characterId)) {
          const connection: OverviewConnection = {
            id: `${event.id}-${characterId}`,
            fromElementId: event.id,
            toElementId: characterId,
            fromCloudType: 'events',
            toCloudType: 'characters',
            strength: this.calculateConnectionStrength(event, data.characters.get(characterId)!),
            color: this.theme.events.color,
            thickness: 2,
            animated: false
          };
          connections.push(connection);
        }
      }
      
      // Event to place connections
      for (const placeId of event.connectedPlaces) {
        // FAIL LOUDLY: Validate placeId type
        if (typeof placeId !== 'string') {
          throw new Error(`❌ DATA STRUCTURE ERROR: Event ${event.id} has invalid placeId type: ${typeof placeId} = ${placeId}`);
        }
        
        if (data.places.has(placeId)) {
          const connection: OverviewConnection = {
            id: `${event.id}-${placeId}`,
            fromElementId: event.id,
            toElementId: placeId,
            fromCloudType: 'events',
            toCloudType: 'places',
            strength: this.calculateConnectionStrength(event, data.places.get(placeId)!),
            color: this.theme.events.color,
            thickness: 2,
            animated: false
          };
          connections.push(connection);
        }
      }
    }
    
    // Create connections from characters to places
    for (const character of data.characters.values()) {
      for (const placeId of character.connectedPlaces) {
        if (data.places.has(placeId)) {
          const connection: OverviewConnection = {
            id: `${character.id}-${placeId}`,
            fromElementId: character.id,
            toElementId: placeId,
            fromCloudType: 'characters',
            toCloudType: 'places',
            strength: this.calculateConnectionStrength(character, data.places.get(placeId)!),
            color: this.theme.characters.color,
            thickness: 2,
            animated: false
          };
          connections.push(connection);
        }
      }
    }
    
    return connections;
  }
  
  /**
   * Calculate connection strength based on element significance
   */
  private calculateConnectionStrength(
    from: EventData | CharacterData | PlaceData,
    to: EventData | CharacterData | PlaceData
  ): 'strong' | 'medium' | 'weak' {
    const fromSignificance = this.getElementSignificance(from);
    const toSignificance = this.getElementSignificance(to);
    
    if (fromSignificance === 'major' && toSignificance === 'major') {
      return 'strong';
    } else if (fromSignificance === 'major' || toSignificance === 'major') {
      return 'medium';
    } else {
      return 'weak';
    }
  }
  
  /**
   * Get element significance
   */
  private getElementSignificance(element: EventData | CharacterData | PlaceData): 'major' | 'minor' {
    if ('significance' in element) {
      return element.significance; // EventData or PlaceData
    } else {
      // CharacterData - determine from role
      const characterData = element as CharacterData;
      return characterData.role === 'protagonist' || characterData.role === 'antagonist' ? 'major' : 'minor';
    }
  }
  
  /**
   * Create default cloud theme
   */
  public static createDefaultTheme(): CloudTheme {
    return {
      events: {
        color: '#3B82F6',
        backgroundColor: '#3B82F6',
        borderColor: '#1E40AF',
        label: 'Events',
        icon: '📅'
      },
      characters: {
        color: '#10B981',
        backgroundColor: '#10B981',
        borderColor: '#059669',
        label: 'Characters', 
        icon: '👤'
      },
      places: {
        color: '#F59E0B',
        backgroundColor: '#F59E0B',
        borderColor: '#D97706',
        label: 'Places',
        icon: '📍'
      }
    };
  }
} 