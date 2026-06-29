// Place node for Overview Board visualization
import type { Point, Size } from '../../idea-board/types/BoardTypes';
import type { Viewport } from '../../idea-board/rendering/Viewport';
import type { PlaceElement, CloudTheme } from '../types/GraphTypes';
import type { PlaceData } from '../types/OverviewTypes';
import { OverviewElementBase } from './OverviewElementBase';

export class PlaceNode extends OverviewElementBase implements PlaceElement {
  public override cloudType: 'places' = 'places';
  public override data: PlaceData;

  constructor(
    id: string,
    position: Point,
    data: PlaceData,
    theme: CloudTheme
  ) {
    super(id, 'places', position, data, theme);
    this.data = data;
  }

  /**
   * Render place content (name text in circle)
   */
  protected renderContent(
    context: CanvasRenderingContext2D,
    screenPos: Point,
    scaledSize: Size,
    viewport: Viewport
  ): void {
    const centerX = screenPos.x + scaledSize.width / 2;
    const centerY = screenPos.y + scaledSize.height / 2;
    const radius = Math.min(scaledSize.width, scaledSize.height) / 2;

    // Set text properties
    context.fillStyle = this.style.textColor;
    context.font = `${this.style.fontSize * viewport.zoom}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Wrap text to fit in circle
    const maxWidth = radius * 1.4; // Allow some padding
    const lines = this.wrapText(context, this.data.name, maxWidth);
    
    // Calculate total height of text
    const lineHeight = this.style.fontSize * viewport.zoom * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = centerY - totalHeight / 2 + lineHeight / 2;

    // Draw each line
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      context.fillText(line, centerX, y);
    });

    // Draw place icon based on type
    if (viewport.zoom > 0.5) {
      this.drawPlaceIcon(context, centerX, centerY - radius * 0.7, viewport.zoom);
    }
  }

  /**
   * Draw a place icon based on type
   */
  private drawPlaceIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    zoom: number
  ): void {
    const size = 12 * zoom;
    let icon = '📍'; // Default location pin
    
    // Select icon based on place type
    switch (this.data.type) {
      case 'location':
        icon = '📍'; // Location pin
        break;
      case 'building':
        icon = '🏢'; // Building
        break;
      case 'region':
        icon = '🗺️'; // Map for region
        break;
      case 'world':
        icon = '🌍'; // Globe for world
        break;
    }
    
    context.save();
    context.fillStyle = this.style.textColor;
    context.font = `${size}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, x, y);
    context.restore();
  }

  /**
   * Wrap text to fit within specified width
   */
  private wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = context.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }

    // Limit to 2 lines for place names
    if (lines.length > 2) {
      const secondLine = lines[1];
      if (secondLine && secondLine.length > 3) {
        lines[1] = secondLine.substring(0, secondLine.length - 3) + '...';
      }
      return lines.slice(0, 2);
    }

    return lines;
  }

  /**
   * Get detailed information for tooltip or details panel
   */
  public getDetailedInfo(): string {
    const description = this.data.description ?? 'No description available';
    
    return `Place: ${this.data.name}\n\nType: ${this.data.type}\n\nSignificance: ${this.significance}\n\nDescription: ${description}\n\nConnected Events: ${this.data.connectedEvents.length}\nConnected Characters: ${this.data.connectedCharacters.length}`;
  }

  /**
   * Get place category for filtering/grouping
   */
  public getCategory(): string {
    return this.data.type;
  }

  /**
   * Check if this place is of a specific type
   */
  public isOfType(type: string): boolean {
    return this.data.type.toLowerCase() === type.toLowerCase();
  }
} 