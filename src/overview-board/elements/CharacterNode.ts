// Character node for Overview Board visualization
import type { Point, Size } from '../../idea-board/types/BoardTypes';
import type { Viewport } from '../../idea-board/rendering/Viewport';
import type { CharacterElement, CloudTheme } from '../types/GraphTypes';
import type { CharacterData } from '../types/OverviewTypes';
import { OverviewElementBase } from './OverviewElementBase';

export class CharacterNode extends OverviewElementBase implements CharacterElement {
  public override cloudType: 'characters' = 'characters';
  public override data: CharacterData;

  constructor(
    id: string,
    position: Point,
    data: CharacterData,
    theme: CloudTheme
  ) {
    super(id, 'characters', position, data, theme);
    this.data = data;
  }

  /**
   * Render character content (name text in circle)
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

    // Draw character icon based on role
    if (viewport.zoom > 0.5) {
      this.drawCharacterIcon(context, centerX, centerY - radius * 0.7, viewport.zoom);
    }
  }

  /**
   * Draw a character icon based on role
   */
  private drawCharacterIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    zoom: number
  ): void {
    const size = 12 * zoom;
    let icon = '👤'; // Default person icon
    
    // Select icon based on character role
    switch (this.data.role) {
      case 'protagonist':
        icon = '⭐'; // Star for protagonist
        break;
      case 'antagonist':
        icon = '⚔️'; // Sword for antagonist
        break;
      case 'supporting':
        icon = '👥'; // Group for supporting
        break;
      case 'minor':
        icon = '👤'; // Person for minor
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

    // Limit to 2 lines for character names (usually shorter)
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
    const description = this.data.description || 'No description available';
    const aliases = this.data.aliases.length > 0 ? this.data.aliases.join(', ') : 'None';
    
    return `Character: ${this.data.name}\n\nRole: ${this.data.role}\n\nDescription: ${description}\n\nAliases: ${aliases}\n\nConnected Events: ${this.data.connectedEvents.length}\nConnected Places: ${this.data.connectedPlaces.length}`;
  }

  /**
   * Check if this character has a specific alias
   */
  public hasAlias(alias: string): boolean {
    return this.data.aliases.some(a => a.toLowerCase() === alias.toLowerCase()) ||
           this.data.name.toLowerCase() === alias.toLowerCase();
  }

  /**
   * Get all names (primary name + aliases) for this character
   */
  public getAllNames(): string[] {
    return [this.data.name, ...this.data.aliases];
  }
} 