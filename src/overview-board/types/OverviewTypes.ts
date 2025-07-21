import type { DocumentNode } from '../../DocumentNode';
import type { Point } from '../../idea-board/types/BoardTypes';

export interface EventData {
  id: string;
  title: string;
  description: string;
  nodeId: string; // Source DocumentNode
  connectedCharacters: string[]; // Character IDs
  connectedPlaces: string[]; // Place IDs
  significance: 'major' | 'minor';
  position?: Point; // For persistence
}

export interface CharacterData {
  id: string;
  name: string;
  aliases: string[]; // For smart renaming
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  description?: string;
  connectedEvents: string[]; // Event IDs
  connectedPlaces: string[]; // Place IDs
  firstMention: string; // NodeId where first mentioned
  position?: Point;
}

export interface PlaceData {
  id: string;
  name: string;
  type: 'location' | 'building' | 'region' | 'world';
  description?: string;
  significance: 'major' | 'minor';
  connectedEvents: string[]; // Event IDs
  connectedCharacters: string[]; // Character IDs
  position?: Point;
}

export interface OverviewData {
  events: Map<string, EventData>;
  characters: Map<string, CharacterData>;
  places: Map<string, PlaceData>;
  layerName: string;
  sourceNodes: string[]; // DocumentNode IDs analyzed
  lastUpdated: Date;
}

// Cached analysis for persistence in DocumentNode
export interface CachedOverviewAnalysis {
  layerName: string;
  timestamp: Date;
  data: OverviewData;
  analyzedNodeIds: string[]; // Which nodes were included in this analysis
  sourceNodeId: string; // The node that triggered the analysis
}

// Raw AI response interfaces
export interface RawAnalysisEvent {
  title: string;
  description: string;
  significance: 'major' | 'minor';
  characters: string[];
  places: string[];
}

export interface RawAnalysisCharacter {
  name: string;
  aliases: string[];
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  description?: string;
}

export interface RawAnalysisPlace {
  name: string;
  type: 'location' | 'building' | 'region' | 'world';
  significance: 'major' | 'minor';
  description?: string;
}

export interface RawAnalysisResponse {
  events: RawAnalysisEvent[];
  characters: RawAnalysisCharacter[];
  places: RawAnalysisPlace[];
}

// Analysis request and result interfaces
export interface AnalysisRequest {
  layerName: string;
  nodes: DocumentNode[];
}

export interface AnalysisResult {
  success: boolean;
  data?: OverviewData;
  error?: string;
  processingTime: number;
  fromCache?: boolean; // Indicates if result came from cache
}

// Connection data for relationships between elements
export interface ConnectionData {
  id: string;
  fromId: string;
  fromType: 'event' | 'character' | 'place';
  toId: string;
  toType: 'event' | 'character' | 'place';
  strength: 'strong' | 'medium' | 'weak';
} 