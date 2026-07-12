import { DocumentNode } from '../DocumentNode';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { createPromptExpansionService } from '../services/PromptExpansionService';
import { findProjectByNode } from '../state';
import { 
  OverviewData, 
  EventData, 
  CharacterData, 
  PlaceData, 
  AnalysisRequest, 
  AnalysisResult,
  RawAnalysisResponse,
  CachedOverviewAnalysis,
  SerializedOverviewData
} from './types/OverviewTypes';
// Prompts are now managed through PromptManager

export class OverviewAnalysisService {
  private openRouterClient: OpenRouterClient;
  private settingsManager: SettingsManager;

  constructor(
    openRouterClient: OpenRouterClient,
    settingsManager: SettingsManager
  ) {
    this.openRouterClient = openRouterClient;
    this.settingsManager = settingsManager;
  }

  /**
   * Analyze a layer of nodes to extract narrative elements with caching
   */
  async analyzeLayer(request: AnalysisRequest, triggeringNode: DocumentNode): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Starting overview analysis for layer: ${request.layerName}`);
      console.log(`📊 Analyzing ${request.nodes.length} nodes`);

      // Check cache first
      const cachedResult = this.checkCache(triggeringNode, request.layerName, request.nodes);
      if (cachedResult) {
        console.log(`✨ Using cached analysis from ${cachedResult.timestamp.toLocaleString()}`);
        return {
          success: true,
          data: cachedResult.data,
          processingTime: Date.now() - startTime,
          fromCache: true
        };
      }

      // Aggregate content from all nodes in the layer
      const aggregatedContent = this.aggregateLayerContent(request.nodes);
      
      if (!aggregatedContent.trim()) {
        return {
          success: false,
          error: 'No content found in the selected layer',
          processingTime: Date.now() - startTime
        };
      }

      // Prepare the analysis prompt
      const analysisPrompt = this.prepareAnalysisPrompt(
        request.layerName,
        aggregatedContent
      );

      // Call AI for analysis
      console.log(`🤖 Sending analysis request to AI (${aggregatedContent.length} characters)`);
      const rawResponse = await this.openRouterClient.chat('editor', analysisPrompt);
      
      // Parse the AI response
      const parsedData = this.parseAnalysisResponse(rawResponse);
      
      // Convert to internal data format with connections
      const overviewData = this.convertToOverviewData(
        parsedData,
        request.layerName,
        request.nodes
      );

      // Cache the result
      await this.cacheResult(triggeringNode, request.layerName, overviewData, request.nodes);

      const processingTime = Date.now() - startTime;
      console.log(`✅ Overview analysis completed in ${processingTime}ms`);
      console.log(`📈 Extracted: ${overviewData.events.size} events, ${overviewData.characters.size} characters, ${overviewData.places.size} places`);

      return {
        success: true,
        data: overviewData,
        processingTime,
        fromCache: false
      };

    } catch (error) {
      console.error('❌ Overview analysis failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown analysis error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Aggregate content from all nodes in a layer
   */
  private aggregateLayerContent(nodes: DocumentNode[]): string {
    const contentParts: string[] = [];
    
    for (const node of nodes) {
      if (node.content.trim()) {
        contentParts.push(`=== ${node.title} ===\n${node.content}\n`);
      }
    }
    
    return contentParts.join('\n');
  }

  /**
   * Prepare the AI analysis prompt with content and parameters using PromptExpansionService
   */
  private prepareAnalysisPrompt(layerName: string, content: string): string {
    const prompts = this.settingsManager.getPrompts();
    const template = prompts.overview_board_analysis;
    
    // Use PromptExpansionService for proper placeholder handling
    const expansionService = createPromptExpansionService(this.settingsManager);
    
    // Build context for placeholder expansion - content is a context placeholder that expects node.content
    const context = {
      node: {
        title: 'Story Layer Analysis',
        content: content,
        isLeaf: true
      },
      project: {
        title: 'Story Analysis Project',
        language: this.settingsManager.getLanguage(),
        criteria: []
      },
      custom: {
        layer_name: layerName
      }
    };
    
    return expansionService.expandPrompt(template, context);
  }

  /**
   * Parse the AI response JSON
   */
  private parseAnalysisResponse(response: string): RawAnalysisResponse {
    try {
      // Clean up the response - remove any markdown formatting
      let cleanResponse = response.trim();
      
      // Remove markdown code blocks if present
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.substring(7);
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.substring(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.substring(0, cleanResponse.length - 3);
      }
      
      return JSON.parse(cleanResponse.trim()) as RawAnalysisResponse;
      
    } catch (error) {
      console.error('Failed to parse AI response:', response);
      throw new Error(`Failed to parse analysis response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert raw AI response to internal OverviewData format
   */
  private convertToOverviewData(
    rawData: RawAnalysisResponse,
    layerName: string,
    sourceNodes: DocumentNode[]
  ): OverviewData {
    const events = new Map<string, EventData>();
    const characters = new Map<string, CharacterData>();
    const places = new Map<string, PlaceData>();

    // Process characters first to build ID mapping
    const characterNameToId = new Map<string, string>();
    const placeNameToId = new Map<string, string>();

    // Create characters
    for (const rawChar of rawData.characters) {
      const charId = this.generateId('char', rawChar.name);
      characterNameToId.set(rawChar.name.toLowerCase(), charId);
      
      // Also map aliases to the same ID
      for (const alias of rawChar.aliases) {
        characterNameToId.set(alias.toLowerCase(), charId);
      }

      const characterData: CharacterData = {
        id: charId,
        name: rawChar.name,
        aliases: rawChar.aliases,
        role: rawChar.role,
        connectedEvents: [],
        connectedPlaces: [],
        firstMention: sourceNodes[0]?.id ?? ''
      };
      
      if (rawChar.description) {
        characterData.description = rawChar.description;
      }
      
      characters.set(charId, characterData);
    }

    // Create places
    for (const rawPlace of rawData.places) {
      const placeId = this.generateId('place', rawPlace.name);
      placeNameToId.set(rawPlace.name.toLowerCase(), placeId);

      const placeData: PlaceData = {
        id: placeId,
        name: rawPlace.name,
        type: rawPlace.type,
        significance: rawPlace.significance,
        connectedEvents: [],
        connectedCharacters: []
      };
      
      if (rawPlace.description) {
        placeData.description = rawPlace.description;
      }
      
      places.set(placeId, placeData);
    }

    // Create events and establish connections
    for (const rawEvent of rawData.events) {
      const eventId = this.generateId('event', rawEvent.title);
      
      // Find connected character and place IDs
      const connectedCharacters = rawEvent.characters
        .map(name => characterNameToId.get(name.toLowerCase()))
        .filter((id): id is string => id !== undefined);
        
      const connectedPlaces = rawEvent.places
        .map(name => placeNameToId.get(name.toLowerCase()))
        .filter((id): id is string => id !== undefined);

      events.set(eventId, {
        id: eventId,
        title: rawEvent.title,
        description: rawEvent.description,
        nodeId: this.findSourceNode(rawEvent.title, sourceNodes)?.id ?? '',
        connectedCharacters,
        connectedPlaces,
        significance: rawEvent.significance
      });

      // Update reverse connections
      for (const charId of connectedCharacters) {
        const char = characters.get(charId);
        if (char) {
          char.connectedEvents.push(eventId);
        }
      }

      for (const placeId of connectedPlaces) {
        const place = places.get(placeId);
        if (place) {
          place.connectedEvents.push(eventId);
        }
      }
    }

    // Establish character-place connections through shared events
    this.establishCharacterPlaceConnections(events, characters, places);

    return {
      events,
      characters,
      places,
      layerName,
      sourceNodes: sourceNodes.map(node => node.id),
      lastUpdated: new Date()
    };
  }

  /**
   * Establish connections between characters and places through shared events
   */
  private establishCharacterPlaceConnections(
    events: Map<string, EventData>,
    characters: Map<string, CharacterData>,
    places: Map<string, PlaceData>
  ): void {
    for (const event of events.values()) {
      // Connect each character to each place in this event
      for (const charId of event.connectedCharacters) {
        const character = characters.get(charId);
        if (!character) continue;

        for (const placeId of event.connectedPlaces) {
          if (!character.connectedPlaces.includes(placeId)) {
            character.connectedPlaces.push(placeId);
          }

          const place = places.get(placeId);
          if (place && !place.connectedCharacters.includes(charId)) {
            place.connectedCharacters.push(charId);
          }
        }
      }
    }
  }

  /**
   * Generate a unique ID for an element
   */
  private generateId(type: string, name: string): string {
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${type}_${clean}_${Date.now()}`;
  }

  /**
   * Find the source node that likely contains this event
   */
  private findSourceNode(eventTitle: string, sourceNodes: DocumentNode[]): DocumentNode | null {
    // Simple heuristic: find node whose content contains keywords from the event title
    const keywords = eventTitle.toLowerCase().split(/\s+/);
    
    for (const node of sourceNodes) {
      if (!node.content) continue;
      
      const nodeContent = node.content.toLowerCase();
      const matchCount = keywords.filter(keyword => nodeContent.includes(keyword)).length;
      
      if (matchCount > 0) {
        return node;
      }
    }
    
    return sourceNodes[0] ?? null;
  }

  /**
   * Get available layers for a project
   */
  getAvailableLayers(rootNode: DocumentNode): Array<{name: string, nodes: DocumentNode[]}> {
    const layers: Array<{name: string, nodes: DocumentNode[]}> = [];
    
    // Get project manager to use centralized level collection
    const projectManager = findProjectByNode(rootNode);
    if (!projectManager) {
      return layers;
    }

    // Find the maximum depth of the tree
    const getMaxDepth = (node: DocumentNode, currentDepth: number = 0): number => {
      if (node.children.length === 0) {
        return currentDepth;
      }
      return Math.max(...node.children.map(child => getMaxDepth(child, currentDepth + 1)));
    };

    const maxDepth = getMaxDepth(rootNode);
    
    // Create layers for each level that has multiple nodes
    for (let relativeLevel = 1; relativeLevel <= maxDepth; relativeLevel++) {
      // Convert relative level to absolute template level
      const absoluteLevel = rootNode.level + relativeLevel;
      const nodesAtLevel = projectManager.getTreeService().getNodesAtTemplateLevel(rootNode, absoluteLevel);
      
      if (nodesAtLevel.length > 1) { // Only include levels with multiple nodes
        const levelName = nodesAtLevel[0]?.template[absoluteLevel] ?? `Level ${absoluteLevel}`;
        layers.push({
          name: levelName,
          nodes: nodesAtLevel.filter(node => node.content.trim()) // Only nodes with content
        });
      }
    }

    return layers;
  }

  /**
   * Check if there's a valid cached analysis for this layer
   */
  private checkCache(triggeringNode: DocumentNode, layerName: string, nodes: DocumentNode[]): CachedOverviewAnalysis | null {
    const cached = triggeringNode.overviewBoardCache.get(layerName);
    if (cached === undefined) {
      return null;
    }

    // Check if all analyzed nodes are still older than or equal to the cache timestamp
    const nodeIds = nodes.map(n => n.id);
    const cacheTimestamp = cached.timestamp.getTime();

    for (const node of nodes) {
      const masterVersion = node.getMasterVersion();
      if (masterVersion && masterVersion.timestamp.getTime() > cacheTimestamp) {
        console.log(`🔄 Cache invalid: Node "${node.title}" modified after cache (${masterVersion.timestamp.toLocaleString()} > ${cached.timestamp.toLocaleString()})`);
        return null;
      }
    }

    // Verify the cached analysis includes the same nodes
    const cachedNodeIds = new Set(cached.analyzedNodeIds);
    const currentNodeIds = new Set(nodeIds);
    
    if (cachedNodeIds.size !== currentNodeIds.size || 
        !Array.from(cachedNodeIds).every(id => currentNodeIds.has(id))) {
      console.log(`🔄 Cache invalid: Different set of nodes analyzed`);
      return null;
    }

    console.log(`✅ Cache valid for layer "${layerName}" (${cached.analyzedNodeIds.length} nodes)`);
    return cached;
  }

  /**
   * Cache the analysis result in the triggering node
   */
  private async cacheResult(triggeringNode: DocumentNode, layerName: string, data: OverviewData, nodes: DocumentNode[]): Promise<void> {
    const serializableData = this.serializeOverviewData(data);
    
    const cached: CachedOverviewAnalysis = {
      layerName,
      timestamp: new Date(),
      data: serializableData as unknown as OverviewData,
      analyzedNodeIds: nodes.map(n => n.id),
      sourceNodeId: triggeringNode.id
    };

    triggeringNode.overviewBoardCache.set(layerName, cached);
    console.log(`💾 Cached analysis for layer "${layerName}" with ${nodes.length} nodes`);

    const { getActiveProject } = await import('../state');
    const projectManager = getActiveProject();
    if (!projectManager) {
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(`❌ CRITICAL: No active project found to save cache for layer "${layerName}". Cache will be lost on page refresh.`);
    }

    try {
      await projectManager.saveToStorage();
      console.log(`💾 Project saved with cached analysis for layer "${layerName}"`);
    } catch (error) {
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(`❌ CRITICAL CACHE SAVE FAILURE: Failed to persist cache for layer "${layerName}" to storage. Cache will be lost on page refresh. Error: ${error}`);
    }
  }

  /**
   * Convert OverviewData Maps to serializable format for JSON persistence.
   */
  private serializeOverviewData(data: OverviewData): SerializedOverviewData {
    return {
      events: Array.from(data.events.entries()),
      characters: Array.from(data.characters.entries()),
      places: Array.from(data.places.entries()),
      layerName: data.layerName,
      sourceNodes: data.sourceNodes,
      lastUpdated: data.lastUpdated
    };
  }

  /**
   * Clear cached analysis for a specific layer
   */
  public async clearCache(triggeringNode: DocumentNode, layerName?: string): Promise<void> {
    if (layerName) {
      triggeringNode.overviewBoardCache.delete(layerName);
      console.log(`🗑️ Cleared cache for layer "${layerName}"`);
    } else {
      triggeringNode.overviewBoardCache.clear();
      console.log(`🗑️ Cleared all overview board cache`);
    }

    try {
      const { getActiveProject } = await import('../state');
      const projectManager = getActiveProject();
      if (projectManager) {
        await projectManager.saveToStorage();
        console.log(`💾 Project saved after clearing cache`);
      }
    } catch (error) {
      console.error(`❌ Failed to save project after clearing cache:`, error);
    }
  }

  /**
   * Get cache info for debugging
   */
  public getCacheInfo(triggeringNode: DocumentNode): Array<{layerName: string; timestamp: Date; nodeCount: number}> {
    const info: Array<{layerName: string; timestamp: Date; nodeCount: number}> = [];
    
    for (const [layerName, cached] of triggeringNode.overviewBoardCache.entries()) {
      info.push({
        layerName,
        timestamp: cached.timestamp,
        nodeCount: cached.analyzedNodeIds.length
      });
    }
    
    return info;
  }
}
