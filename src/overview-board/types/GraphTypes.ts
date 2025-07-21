// Graph types for Overview Board - extending IdeaBoard infrastructure
import type { BoardElement, Point, Size, Viewport } from '../../idea-board/types/BoardTypes';
import type { EventData, CharacterData, PlaceData } from './OverviewTypes';

// Cloud types
export type CloudType = 'events' | 'characters' | 'places';

// Extended board element for Overview Board
export interface OverviewElement extends BoardElement {
  cloudType: CloudType;
  significance: 'major' | 'minor';
  connections: string[]; // Connected element IDs
  data: EventData | CharacterData | PlaceData; // Original data
  
  // Override render method to support opacity for fade effects
  render(context: CanvasRenderingContext2D, viewport: Viewport, opacity?: number): void;
  
  // State management methods
  setHovered(hovered: boolean): void;
  setSelected(selected: boolean): void;
  setDragging(dragging: boolean): void;
  getDisplayName(): string;
  getDescription(): string;
}

// Specific element types
export interface EventElement extends OverviewElement {
  cloudType: 'events';
  data: EventData;
}

export interface CharacterElement extends OverviewElement {
  cloudType: 'characters';
  data: CharacterData;
}

export interface PlaceElement extends OverviewElement {
  cloudType: 'places';
  data: PlaceData;
}

// Cloud region definition
export interface CloudRegion {
  id: CloudType;
  center: Point;
  radius: number;
  color: string;
  backgroundColor: string;
  borderColor: string;
  elements: Set<string>; // Element IDs in this cloud
  visible: boolean;
  label: string;
}

// Connection between elements
export interface OverviewConnection {
  id: string;
  fromElementId: string;
  toElementId: string;
  fromCloudType: CloudType;
  toCloudType: CloudType;
  strength: 'strong' | 'medium' | 'weak';
  color: string;
  thickness: number;
  animated: boolean;
}

// Rendering styles
export interface ElementStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  fontSize: number;
  borderWidth: number;
  shadowBlur: number;
  shadowColor: string;
}

export interface CloudTheme {
  events: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    label: string;
    icon: string;
  };
  characters: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    label: string;
    icon: string;
  };
  places: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    label: string;
    icon: string;
  };
}

// Layout and positioning
export interface CloudLayout {
  events: Point;
  characters: Point;
  places: Point;
  cloudRadius: number;
  cloudSpacing: number;
}

export interface LayoutConstraints {
  minElementSize: number;
  maxElementSize: number;
  elementSpacing: number;
  cloudPadding: number;
  connectionCurveStrength: number;
}

// Interaction state
export interface OverviewInteractionState {
  selectedElement: OverviewElement | null;
  hoveredElement: OverviewElement | null;
  draggedElement: OverviewElement | null;
  dragOffset: Point;
  isDragging: boolean;
  isPanning: boolean;
  panStart: Point;
  showConnections: boolean;
  highlightedConnections: Set<string>;
}

// Animation state
export interface AnimationState {
  isAnimating: boolean;
  animationType: 'fadeIn' | 'expand' | 'pulse' | 'highlight';
  targetElementId: string | null;
  startTime: number;
  duration: number;
  progress: number;
}

// Overview Board state
export interface OverviewBoardState {
  elements: Map<string, OverviewElement>;
  connections: Map<string, OverviewConnection>;
  cloudRegions: Map<CloudType, CloudRegion>;
  theme: CloudTheme;
  layout: CloudLayout;
  constraints: LayoutConstraints;
  interaction: OverviewInteractionState;
  animation: AnimationState;
  needsRedraw: boolean;
}

// Serialization for persistence
export interface SerializedOverviewBoard {
  version: string;
  timestamp: Date;
  layerName: string;
  sourceNodes: string[];
  elements: Array<{
    id: string;
    type: CloudType;
    position: Point;
    size: Size;
    data: EventData | CharacterData | PlaceData;
  }>;
  connections: Array<{
    id: string;
    fromElementId: string;
    toElementId: string;
    strength: 'strong' | 'medium' | 'weak';
  }>;
  layout: CloudLayout;
} 