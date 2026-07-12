import type { Point, ElementData, Viewport } from '../types/BoardTypes';
import { PostItNote } from './PostItNote';

export class BackgroundRectangle extends PostItNote {
  public override type: 'background-rect' = 'background-rect';

  // Predefined light background colors for area marking
  private static readonly BACKGROUND_COLORS = [
    '#f0f9ff', // Very light blue
    '#f0fdf4', // Very light green  
    '#fffbeb', // Very light orange
    '#fdf2f8', // Very light pink
    '#f8fafc', // Very light gray
    '#fefce8', // Very light yellow
    '#f3e8ff', // Very light purple
    '#ecfdf5', // Very light mint
  ];

  constructor(position: Point) {
    // Initialize with empty content - background rectangles don't have content
    super(position, '');
    
    // Update ID to reflect background rectangle type
    this.id = `bgrect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set larger default size (3x normal sticker)
    this.size = { width: 675, height: 450 };
    
    // Set lighter background color and remove text styling
    this.style = {
      backgroundColor: BackgroundRectangle.BACKGROUND_COLORS[0] ?? '#f0f9ff', // Default to light blue
      textColor: 'transparent', // Make text invisible
      fontSize: 14
    };
  }

  /**
   * Get the next available background color in rotation
   */
  public static getNextBackgroundColor(existingRectangles: BackgroundRectangle[]): string {
    const usedColors = existingRectangles.map(rect => rect.style.backgroundColor);
    
    // Find first unused color, or cycle back to start
    for (const color of BackgroundRectangle.BACKGROUND_COLORS) {
      if (!usedColors.includes(color)) {
        return color;
      }
    }
    
    // If all colors used, return first color
    return BackgroundRectangle.BACKGROUND_COLORS[0] ?? '#f0f9ff';
  }

  /**
   * Get all available background colors
   */
  public static getAvailableColors(): string[] {
    return [...BackgroundRectangle.BACKGROUND_COLORS];
  }

  /**
   * Override render to remove text and use lighter styling
   */
  public override render(context: CanvasRenderingContext2D, viewport: Viewport): void {
    const screenPos = viewport.worldToScreen(this.position.x, this.position.y);
    const screenWidth = this.size.width * viewport.zoom;
    const screenHeight = this.size.height * viewport.zoom;

    // Skip rendering if not visible
    if (screenPos.x + screenWidth < 0 || screenPos.y + screenHeight < 0 || 
        screenPos.x > viewport.width || screenPos.y > viewport.height) {
      return;
    }

    context.save();

    // Draw background rectangle with very light colors and subtle border
    context.fillStyle = this.style.backgroundColor;
    context.strokeStyle = this.getSelected() ? '#3b82f6' : 'rgba(0, 0, 0, 0.1)';
    context.lineWidth = this.getSelected() ? 2 : 1;
    
    // Slightly rounded corners for softer appearance
    const radius = 8 * viewport.zoom;
    this.drawRoundedRect(context, screenPos.x, screenPos.y, screenWidth, screenHeight, radius);
    context.fill();
    context.stroke();

    // Note: Selection handles are handled by the base class render method
    // We'll call the parent's render logic for handles if needed
    if (this.getSelected()) {
      // Draw simple selection outline instead of full handles
      context.strokeStyle = '#3b82f6';
      context.lineWidth = 3;
      context.stroke();
    }

    context.restore();
  }

  /**
   * Draw rounded rectangle
   */
  private drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  /**
   * Override to prevent content editing - background rectangles are just visual
   */
  public startEditing(): void {
    // Do nothing - background rectangles cannot be edited
    console.log('Background rectangles cannot be edited - they are visual elements only');
  }

  /**
   * Override to prevent connections - background rectangles are visual elements only
   */
  public override hitTestConnectionDot(): null {
    // Always return null - background rectangles cannot be connected
    return null;
  }

  /**
   * Override to prevent content setting
   */
  public override setContent(content: string): void {
    void content;
    // Do nothing - background rectangles don't have content
  }

  /**
   * Override to always return empty content
   */
  public getContent(): string {
    return '';
  }

  /**
   * Change the background color of this rectangle
   */
  public setBackgroundColor(color: string): void {
    this.style.backgroundColor = color;
  }

  /**
   * Check if this is a background rectangle (always true for this class)
   */
  public isBackgroundRectangle(): boolean {
    return true;
  }

  /**
   * Override serialize method for proper persistence
   */
  public override serialize(): ElementData {
    return {
      id: this.id,
      type: this.type,
      position: { ...this.position },
      size: { ...this.size },
      content: '', // Always empty for background rectangles
      style: { ...this.style },
      metadata: { ...this.metadata }
    };
  }

  /**
   * Convert to data format for serialization (alias for serialize)
   */
  public toData(): ElementData {
    return this.serialize();
  }
} 