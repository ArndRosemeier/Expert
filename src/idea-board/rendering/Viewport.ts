import type { Point, Viewport as IViewport, BoardElement } from '../types/BoardTypes';

export class Viewport implements IViewport {
  public x: number = 0;
  public y: number = 0;
  public zoom: number = 1.0;
  public width: number = 800;
  public height: number = 600;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX / this.zoom) + this.x,
      y: (screenY / this.zoom) + this.y
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: (worldX - this.x) * this.zoom,
      y: (worldY - this.y) * this.zoom
    };
  }

  /**
   * Check if an element is visible in the current viewport
   */
  isVisible(element: BoardElement): boolean {
    const screenPos = this.worldToScreen(element.position.x, element.position.y);
    const elementWidth = element.size.width * this.zoom;
    const elementHeight = element.size.height * this.zoom;

    // Check if element overlaps with viewport
    return !(
      screenPos.x + elementWidth < 0 ||
      screenPos.y + elementHeight < 0 ||
      screenPos.x > this.width ||
      screenPos.y > this.height
    );
  }

  /**
   * Pan the viewport by the given offset
   */
  pan(deltaX: number, deltaY: number): void {
    this.x += deltaX / this.zoom;
    this.y += deltaY / this.zoom;
  }

  /**
   * Zoom the viewport by the given factor at the specified screen position
   */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const worldPos = this.screenToWorld(screenX, screenY);
    
    const oldZoom = this.zoom;
    this.zoom = Math.max(0.1, Math.min(5.0, this.zoom * factor));
    
    const newWorldPos = this.screenToWorld(screenX, screenY);
    this.x += worldPos.x - newWorldPos.x;
    this.y += worldPos.y - newWorldPos.y;
  }

  /**
   * Resize the viewport
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * Get the world bounds of the current viewport
   */
  getWorldBounds(): { left: number; top: number; right: number; bottom: number } {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.width, this.height);
    
    return {
      left: topLeft.x,
      top: topLeft.y,
      right: bottomRight.x,
      bottom: bottomRight.y
    };
  }
} 