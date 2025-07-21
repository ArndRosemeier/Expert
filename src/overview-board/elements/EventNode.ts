// Event node for Overview Board visualization
import type { Point, Size } from '../../idea-board/types/BoardTypes';
import type { Viewport } from '../../idea-board/rendering/Viewport';
import type { EventElement, CloudTheme } from '../types/GraphTypes';
import type { EventData } from '../types/OverviewTypes';
import { OverviewElementBase } from './OverviewElementBase';

export class EventNode extends OverviewElementBase implements EventElement {
  public override cloudType: 'events' = 'events';
  public override data: EventData;

  constructor(
    id: string,
    position: Point,
    data: EventData,
    theme: CloudTheme
  ) {
    super(id, 'events', position, data, theme);
    this.data = data;
  }

  /**
   * Render event content (title text in circle)
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
    const lines = this.wrapText(context, this.data.title, maxWidth);
    
    // Calculate total height of text
    const lineHeight = this.style.fontSize * viewport.zoom * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = centerY - totalHeight / 2 + lineHeight / 2;

    // Draw each line
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      context.fillText(line, centerX, y);
    });

    // Draw event icon (optional)
    if (viewport.zoom > 0.5) {
      this.drawEventIcon(context, centerX, centerY - radius * 0.7, viewport.zoom);
    }
  }

  /**
   * Draw a small event icon
   */
  private drawEventIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    zoom: number
  ): void {
    const size = 12 * zoom;
    
    context.save();
    context.fillStyle = this.style.textColor;
    context.font = `${size}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('📅', x, y); // Calendar emoji for events
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

    // Limit to 3 lines for readability
    if (lines.length > 3) {
      const thirdLine = lines[2];
      if (thirdLine && thirdLine.length > 3) {
        lines[2] = thirdLine.substring(0, thirdLine.length - 3) + '...';
      }
      return lines.slice(0, 3);
    }

    return lines;
  }

  /**
   * Get detailed information for tooltip or details panel
   */
  public getDetailedInfo(): string {
    const description = this.data.description || 'No description available';
    return `Event: ${this.data.title}\n\nDescription: ${description}\n\nSignificance: ${this.significance}\n\nConnected Characters: ${this.data.connectedCharacters.length}\nConnected Places: ${this.data.connectedPlaces.length}`;
  }
} 