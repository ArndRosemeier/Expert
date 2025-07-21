// Base class for Overview Board elements - extends IdeaBoard patterns
import type { Point, Size } from '../../idea-board/types/BoardTypes';
import type { Viewport } from '../../idea-board/rendering/Viewport';
import type { 
  OverviewElement, 
  CloudType, 
  ElementStyle,
  CloudTheme 
} from '../types/GraphTypes';
import type { EventData, CharacterData, PlaceData } from '../types/OverviewTypes';

export abstract class OverviewElementBase implements OverviewElement {
  public id: string;
  public type: 'post-it' | 'background-rect' = 'post-it'; // Required by BoardElement
  public cloudType: CloudType;
  public position: Point;
  public size: Size;
  public significance: 'major' | 'minor';
  public connections: string[] = [];
  public data: EventData | CharacterData | PlaceData;
  
  // Visual state
  protected isHovered: boolean = false;
  protected isSelected: boolean = false;
  protected isDragging: boolean = false;
  protected style: ElementStyle;

  constructor(
    id: string,
    cloudType: CloudType,
    position: Point,
    data: EventData | CharacterData | PlaceData,
    theme: CloudTheme
  ) {
    this.id = id;
    this.cloudType = cloudType;
    this.position = position;
    this.data = data;
    this.significance = this.extractSignificance(data);
    
    // Calculate size based on significance
    const baseSize = this.significance === 'major' ? 80 : 60;
    this.size = { width: baseSize, height: baseSize };
    
    // Set style based on cloud theme
    this.style = this.createStyleFromTheme(theme[cloudType]);
  }

  /**
   * Extract significance from data based on type
   */
  private extractSignificance(data: EventData | CharacterData | PlaceData): 'major' | 'minor' {
    if ('significance' in data) {
      return data.significance; // EventData or PlaceData
    } else {
      // CharacterData - determine significance from role
      const characterData = data as CharacterData;
      return characterData.role === 'protagonist' || characterData.role === 'antagonist' ? 'major' : 'minor';
    }
  }

  /**
   * Create element style from cloud theme
   */
  private createStyleFromTheme(cloudTheme: any): ElementStyle {
    return {
      backgroundColor: cloudTheme.backgroundColor,
      borderColor: cloudTheme.borderColor,
      textColor: '#FFFFFF',
      fontSize: this.significance === 'major' ? 12 : 10,
      borderWidth: 2,
      shadowBlur: 4,
      shadowColor: 'rgba(0, 0, 0, 0.2)'
    };
  }

  /**
   * Render the element on canvas
   */
  public render(context: CanvasRenderingContext2D, viewport: Viewport, opacity: number = 1.0): void {
    const screenPos = viewport.worldToScreen(this.position.x, this.position.y);
    const scaledSize = {
      width: this.size.width * viewport.zoom,
      height: this.size.height * viewport.zoom
    };



    // Skip rendering if element is not visible
    if (!this.isVisibleInViewport(viewport)) {
      return;
    }

    context.save();

    // Apply opacity for fade effect
    context.globalAlpha = opacity;

    // Draw shadow
    if (this.style.shadowBlur > 0) {
      context.shadowColor = this.style.shadowColor;
      context.shadowBlur = this.style.shadowBlur * viewport.zoom;
      context.shadowOffsetX = 2 * viewport.zoom;
      context.shadowOffsetY = 2 * viewport.zoom;
    }

    // Draw element background
    this.renderBackground(context, screenPos, scaledSize);

    // Reset shadow for text
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;

    // Draw element content
    this.renderContent(context, screenPos, scaledSize, viewport);

    // Draw selection/hover indicator
    if (this.isSelected || this.isHovered) {
      this.renderHighlight(context, screenPos, scaledSize);
    }

    context.restore();
  }

  /**
   * Render the background shape (circle for all Overview Board elements)
   */
  protected renderBackground(
    context: CanvasRenderingContext2D, 
    screenPos: Point, 
    scaledSize: Size
  ): void {
    const radius = Math.min(scaledSize.width, scaledSize.height) / 2;
    const centerX = screenPos.x + scaledSize.width / 2;
    const centerY = screenPos.y + scaledSize.height / 2;

    // Draw filled circle
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    context.fillStyle = this.style.backgroundColor;
    context.fill();

    // Draw border
    context.strokeStyle = this.style.borderColor;
    context.lineWidth = this.style.borderWidth;
    context.stroke();
  }

  /**
   * Render element content (text) - abstract method for subclasses
   */
  protected abstract renderContent(
    context: CanvasRenderingContext2D,
    screenPos: Point,
    scaledSize: Size,
    viewport: Viewport
  ): void;

  /**
   * Render selection/hover highlight
   */
  protected renderHighlight(
    context: CanvasRenderingContext2D,
    screenPos: Point,
    scaledSize: Size
  ): void {
    const radius = Math.min(scaledSize.width, scaledSize.height) / 2;
    const centerX = screenPos.x + scaledSize.width / 2;
    const centerY = screenPos.y + scaledSize.height / 2;

    context.beginPath();
    context.arc(centerX, centerY, radius + 4, 0, 2 * Math.PI);
    context.strokeStyle = this.isSelected ? '#FFD700' : '#87CEEB'; // Gold for selected, light blue for hover
    context.lineWidth = 3;
    context.stroke();
  }

  /**
   * Check if point hits this element
   */
  public hitTest(point: Point): boolean {
    const centerX = this.position.x + this.size.width / 2;
    const centerY = this.position.y + this.size.height / 2;
    const radius = Math.min(this.size.width, this.size.height) / 2;
    
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance <= radius;
  }

  /**
   * Check if element is visible in viewport
   */
  private isVisibleInViewport(viewport: Viewport): boolean {
    const screenPos = viewport.worldToScreen(this.position.x, this.position.y);
    const scaledSize = {
      width: this.size.width * viewport.zoom,
      height: this.size.height * viewport.zoom
    };

    return !(
      screenPos.x + scaledSize.width < 0 ||
      screenPos.y + scaledSize.height < 0 ||
      screenPos.x > viewport.width ||
      screenPos.y > viewport.height
    );
  }

  /**
   * Serialize element data
   */
  public serialize(): any {
    return {
      id: this.id,
      type: this.type,
      cloudType: this.cloudType,
      position: this.position,
      size: this.size,
      significance: this.significance,
      connections: this.connections,
      data: this.data
    };
  }

  /**
   * Deserialize element data
   */
  public deserialize(data: any): void {
    this.position = data.position;
    this.size = data.size;
    this.significance = data.significance;
    this.connections = data.connections || [];
    this.data = data.data;
  }

  // State management methods
  public setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;
  }

  public setDragging(dragging: boolean): void {
    this.isDragging = dragging;
  }

  public getDisplayName(): string {
    if ('title' in this.data) {
      return this.data.title; // EventData
    } else {
      return this.data.name; // CharacterData or PlaceData
    }
  }

  public getDescription(): string {
    return this.data.description || '';
  }
} 