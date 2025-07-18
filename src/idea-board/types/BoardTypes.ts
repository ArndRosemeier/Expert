// Core types for Idea Board functionality

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdeaBoardState {
  id: string;
  name: string;
  projectId?: string;
  created: Date;
  lastModified: Date;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  elements: ElementData[];
  connections: import('../elements/Connection').ConnectionData[];
  metadata: {
    version: string;
    totalElements: number;
  };
}

export interface ElementData {
  id: string;
  type: 'post-it';
  position: Point;
  size: Size;
  content: string;
  style: {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
  };
  metadata: {
    created: Date;
    lastEdited: Date;
  };
}

export interface BoardElement {
  id: string;
  type: 'post-it';
  position: Point;
  size: Size;
  render(context: CanvasRenderingContext2D, viewport: Viewport): void;
  hitTest(point: Point): boolean;
  serialize(): ElementData;
  deserialize(data: ElementData): void;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  screenToWorld(screenX: number, screenY: number): Point;
  worldToScreen(worldX: number, worldY: number): Point;
  isVisible(element: BoardElement): boolean;
} 