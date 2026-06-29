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
  CachedOverviewAnalysis
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
      if (node.content && node.content.trim()) {
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
      
      const parsed = JSON.parse(cleanResponse.trim());
      
      // Validate the structure
      if (!parsed.events || !parsed.characters || !parsed.places) {
        throw new Error('Invalid response structure - missing required arrays');
      }
      
      return parsed as RawAnalysisResponse;
      
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
      for (const alias of rawChar.aliases || []) {
        characterNameToId.set(alias.toLowerCase(), charId);
      }

      const characterData: CharacterData = {
        id: charId,
        name: rawChar.name,
        aliases: rawChar.aliases || [],
        role: rawChar.role,
        connectedEvents: [],
        connectedPlaces: [],
        firstMention: sourceNodes[0]?.id || ''
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
        .filter(id => id !== undefined) as string[];
        
      const connectedPlaces = rawEvent.places
        .map(name => placeNameToId.get(name.toLowerCase()))
        .filter(id => id !== undefined) as string[];

      events.set(eventId, {
        id: eventId,
        title: rawEvent.title,
        description: rawEvent.description,
        nodeId: this.findSourceNode(rawEvent.title, sourceNodes)?.id || '',
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
    
    return sourceNodes[0] || null;
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
        const levelName = nodesAtLevel[0]?.template[absoluteLevel] || `Level ${absoluteLevel}`;
        layers.push({
          name: levelName,
          nodes: nodesAtLevel.filter((node: DocumentNode) => node.content && node.content.trim()) // Only nodes with content
        });
      }
    }

    return layers;
  }

  /**
   * Check if there's a valid cached analysis for this layer
   */
  private checkCache(triggeringNode: DocumentNode, layerName: string, nodes: DocumentNode[]): CachedOverviewAnalysis | null {
    const cached = triggeringNode.overviewBoardCache.get(layerName) as CachedOverviewAnalysis;
    if (!cached) {
      return null;
    }

    // FAIL LOUDLY: Validate cache structure - corruption should not be silently handled
    if (!cached.timestamp || !cached.data || !cached.analyzedNodeIds) {
      const errorMsg = `❌ CACHE CORRUPTION DETECTED: Malformed cache data for layer "${layerName}". Missing: ${!cached.timestamp ? 'timestamp ' : ''}${!cached.data ? 'data ' : ''}${!cached.analyzedNodeIds ? 'analyzedNodeIds' : ''}`;
      console.error(errorMsg);
      // Remove corrupted cache but FAIL LOUDLY
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(errorMsg);
    }

    // FAIL LOUDLY: Invalid timestamp is a serious deserialization error
    if (!(cached.timestamp instanceof Date)) {
      const errorMsg = `❌ CACHE CORRUPTION DETECTED: Timestamp is not a Date object for layer "${layerName}". Got: ${typeof cached.timestamp} = ${cached.timestamp}`;
      console.error(errorMsg);
      // Remove corrupted cache but FAIL LOUDLY  
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(errorMsg);
    }

    // FAIL LOUDLY: Validate Map objects exist and are functional
    if (!cached.data.events || typeof cached.data.events.values !== 'function') {
      const errorMsg = `❌ CACHE CORRUPTION DETECTED: Events is not a proper Map for layer "${layerName}". Type: ${typeof cached.data.events}, hasValues: ${Boolean(cached.data.events?.values)}`;
      console.error(errorMsg);
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(errorMsg);
    }

    if (!cached.data.characters || typeof cached.data.characters.values !== 'function') {
      const errorMsg = `❌ CACHE CORRUPTION DETECTED: Characters is not a proper Map for layer "${layerName}". Type: ${typeof cached.data.characters}, hasValues: ${Boolean(cached.data.characters?.values)}`;
      console.error(errorMsg);
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(errorMsg);
    }

    if (!cached.data.places || typeof cached.data.places.values !== 'function') {
      const errorMsg = `❌ CACHE CORRUPTION DETECTED: Places is not a proper Map for layer "${layerName}". Type: ${typeof cached.data.places}, hasValues: ${Boolean(cached.data.places?.values)}`;
      console.error(errorMsg);
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(errorMsg);
    }

    // Check if all analyzed nodes are still older than or equal to the cache timestamp
    const nodeIds = nodes.map(n => n.id);
    const cacheTimestamp = cached.timestamp.getTime();

    for (const node of nodes) {
      // Get the node's last modified time from its master version
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
    // Create a serializable version of the data with Maps converted to arrays
    const serializableData = this.serializeOverviewData(data);
    
    const cached: CachedOverviewAnalysis = {
      layerName,
      timestamp: new Date(),
      data: serializableData as OverviewData, // Cast back to maintain type compatibility
      analyzedNodeIds: nodes.map(n => n.id),
      sourceNodeId: triggeringNode.id
    };

    triggeringNode.overviewBoardCache.set(layerName, cached);
    console.log(`💾 Cached analysis for layer "${layerName}" with ${nodes.length} nodes`);

    // Persist cache to storage - FAIL LOUDLY if save fails
    try {
      const { getActiveProject } = await import('../state');
      const projectManager = getActiveProject();
      if (!projectManager) {
        throw new Error(`❌ CRITICAL: No active project found to save cache for layer "${layerName}". Cache will be lost on page refresh.`);
      }
      await projectManager.saveToStorage();
      console.log(`💾 Project saved with cached analysis for layer "${layerName}"`);
    } catch (error) {
      const errorMsg = `❌ CRITICAL CACHE SAVE FAILURE: Failed to persist cache for layer "${layerName}" to storage. Cache will be lost on page refresh. Error: ${error}`;
      console.error(errorMsg);
      // Remove the cache since it's not persisted
      triggeringNode.overviewBoardCache.delete(layerName);
      throw new Error(errorMsg);
    }
  }

  /**
   * Convert OverviewData Maps to serializable format - FAIL LOUDLY on invalid data
   */
  private serializeOverviewData(data: OverviewData): any {
    // FAIL LOUDLY: Validate input data structure
    if (!data || typeof data !== 'object') {
      throw new Error(`❌ SERIALIZATION ERROR: Invalid OverviewData - expected object, got: ${typeof data}`);
    }

    // FAIL LOUDLY: Validate Map objects exist and are functional
    if (!data.events || typeof data.events.entries !== 'function') {
      throw new Error(`❌ SERIALIZATION ERROR: events is not a proper Map. Type: ${typeof data.events}, hasEntries: ${Boolean(data.events?.entries)}`);
    }

    if (!data.characters || typeof data.characters.entries !== 'function') {
      throw new Error(`❌ SERIALIZATION ERROR: characters is not a proper Map. Type: ${typeof data.characters}, hasEntries: ${Boolean(data.characters?.entries)}`);
    }

    if (!data.places || typeof data.places.entries !== 'function') {
      throw new Error(`❌ SERIALIZATION ERROR: places is not a proper Map. Type: ${typeof data.places}, hasEntries: ${Boolean(data.places?.entries)}`);
    }

    // FAIL LOUDLY: Validate required fields
    if (!data.layerName || typeof data.layerName !== 'string') {
      throw new Error(`❌ SERIALIZATION ERROR: Invalid layerName - expected string, got: ${typeof data.layerName} = ${data.layerName}`);
    }

    if (!Array.isArray(data.sourceNodes)) {
      throw new Error(`❌ SERIALIZATION ERROR: Invalid sourceNodes - expected array, got: ${typeof data.sourceNodes}`);
    }

    if (!data.lastUpdated || !(data.lastUpdated instanceof Date)) {
      throw new Error(`❌ SERIALIZATION ERROR: Invalid lastUpdated - expected Date, got: ${typeof data.lastUpdated} = ${data.lastUpdated}`);
    }

    // Serialize with validation
    try {
      return {
        events: Array.from(data.events.entries()),
        characters: Array.from(data.characters.entries()),
        places: Array.from(data.places.entries()),
        layerName: data.layerName,
        sourceNodes: data.sourceNodes,
        lastUpdated: data.lastUpdated
      };
    } catch (error) {
      throw new Error(`❌ SERIALIZATION ERROR: Failed to serialize OverviewData: ${error}`);
    }
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

    // Persist cache changes to storage
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
   * Get cache info for debugging - FAIL LOUDLY on corruption
   */
  public getCacheInfo(triggeringNode: DocumentNode): Array<{layerName: string; timestamp: Date; nodeCount: number}> {
    const info: Array<{layerName: string; timestamp: Date; nodeCount: number}> = [];
    
    for (const [layerName, cached] of triggeringNode.overviewBoardCache.entries()) {
      const cachedAnalysis = cached as CachedOverviewAnalysis;
      
      // FAIL LOUDLY: Don't silently skip corrupted cache entries
      if (!cachedAnalysis) {
        throw new Error(`❌ CACHE CORRUPTION: Null cache entry for layer "${layerName}"`);
      }
      
      if (!cachedAnalysis.timestamp) {
        throw new Error(`❌ CACHE CORRUPTION: Missing timestamp in cache entry for layer "${layerName}"`);
      }
      
      if (!cachedAnalysis.analyzedNodeIds) {
        throw new Error(`❌ CACHE CORRUPTION: Missing analyzedNodeIds in cache entry for layer "${layerName}"`);
      }

      // FAIL LOUDLY: Invalid timestamp should crash, not be silently handled
      let timestamp: Date;
      if (cachedAnalysis.timestamp instanceof Date) {
        timestamp = cachedAnalysis.timestamp;
      } else {
        try {
          timestamp = new Date(cachedAnalysis.timestamp);
          if (isNaN(timestamp.getTime())) {
            throw new Error(`Invalid timestamp value: ${cachedAnalysis.timestamp}`);
          }
        } catch (error) {
          throw new Error(`❌ CACHE CORRUPTION: Invalid timestamp in cache entry for layer "${layerName}": ${cachedAnalysis.timestamp}. Error: ${error}`);
        }
      }
      
      info.push({
        layerName,
        timestamp,
        nodeCount: cachedAnalysis.analyzedNodeIds.length
      });
    }
    
    return info;
  }
} 