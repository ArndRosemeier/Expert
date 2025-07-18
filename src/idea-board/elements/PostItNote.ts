import type { Point, Size, BoardElement, ElementData, Viewport } from '../types/BoardTypes';

export class PostItNote implements BoardElement {
  public id: string;
  public type: 'post-it' = 'post-it';
  public position: Point;
  public size: Size;
  public content: string;
  public style: {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
  };
  public metadata: {
    created: Date;
    lastEdited: Date;
  };

  private isSelected: boolean = false;
  private isEditing: boolean = false;
  private isResizing: boolean = false;
  private minSize: Size = { width: 100, height: 100 };

  constructor(position: Point, content: string = '') {
    this.id = `postit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.position = { ...position };
    this.size = { width: 150, height: 150 };
    this.content = content;
    this.style = {
      backgroundColor: '#ffeb3b', // Yellow post-it default
      textColor: '#333333',
      fontSize: 14
    };
    this.metadata = {
      created: new Date(),
      lastEdited: new Date()
    };
  }

  /**
   * Render the post-it note on the canvas
   */
  render(context: CanvasRenderingContext2D, viewport: Viewport): void {
    if (!viewport.isVisible(this)) {
      return; // Don't render if not visible
    }

    const screenPos = viewport.worldToScreen(this.position.x, this.position.y);
    const screenWidth = this.size.width * viewport.zoom;
    const screenHeight = this.size.height * viewport.zoom;

    context.save();

    // Draw post-it shadow
    context.fillStyle = 'rgba(0, 0, 0, 0.1)';
    context.fillRect(screenPos.x + 2, screenPos.y + 2, screenWidth, screenHeight);

    // Draw post-it background
    context.fillStyle = this.style.backgroundColor;
    context.fillRect(screenPos.x, screenPos.y, screenWidth, screenHeight);

    // Draw border
    context.strokeStyle = this.isSelected ? '#2196f3' : 'rgba(0, 0, 0, 0.1)';
    context.lineWidth = this.isSelected ? 2 : 1;
    context.strokeRect(screenPos.x, screenPos.y, screenWidth, screenHeight);

    // Draw resize handles if selected
    if (this.isSelected && viewport.zoom > 0.5) {
      this.drawResizeHandles(context, screenPos, screenWidth, screenHeight);
    }

    // Draw text content
    if (this.content && viewport.zoom > 0.3) { // Only show text when zoomed in enough
      context.fillStyle = this.style.textColor;
      context.font = `${this.style.fontSize * viewport.zoom}px Arial`;
      
      const padding = 8 * viewport.zoom;
      const maxWidth = screenWidth - (padding * 2);
      const lineHeight = this.style.fontSize * viewport.zoom * 1.2;
      
      this.wrapText(context, this.content, screenPos.x + padding, screenPos.y + padding + lineHeight, maxWidth, lineHeight);
    }

    // Draw editing indicator
    if (this.isEditing) {
      context.strokeStyle = '#4caf50';
      context.lineWidth = 3;
      context.strokeRect(screenPos.x - 2, screenPos.y - 2, screenWidth + 4, screenHeight + 4);
    }

    context.restore();
  }

  /**
   * Draw resize handles at corners and edges
   */
  private drawResizeHandles(context: CanvasRenderingContext2D, screenPos: Point, screenWidth: number, screenHeight: number): void {
    const handleSize = 8;
    const handleColor = '#2196f3';
    
    context.fillStyle = handleColor;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;

    // Corner handles
    const handles = [
      // Bottom-right corner (most important)
      { x: screenPos.x + screenWidth - handleSize/2, y: screenPos.y + screenHeight - handleSize/2 },
      // Top-left corner
      { x: screenPos.x - handleSize/2, y: screenPos.y - handleSize/2 },
      // Top-right corner
      { x: screenPos.x + screenWidth - handleSize/2, y: screenPos.y - handleSize/2 },
      // Bottom-left corner
      { x: screenPos.x - handleSize/2, y: screenPos.y + screenHeight - handleSize/2 }
    ];

    handles.forEach(handle => {
      context.fillRect(handle.x, handle.y, handleSize, handleSize);
      context.strokeRect(handle.x, handle.y, handleSize, handleSize);
    });
  }

  /**
   * Check if a point hits this post-it note
   */
  hitTest(point: Point): boolean {
    return (
      point.x >= this.position.x &&
      point.x <= this.position.x + this.size.width &&
      point.y >= this.position.y &&
      point.y <= this.position.y + this.size.height
    );
  }

  /**
   * Check if a point hits a resize handle
   */
  hitTestResizeHandle(point: Point, viewport: Viewport): 'se' | 'nw' | 'ne' | 'sw' | null {
    if (!this.isSelected || viewport.zoom <= 0.5) {
      return null;
    }

    const handleSize = 8 / viewport.zoom; // Convert to world coordinates
    const tolerance = handleSize / 2;

    // Check each corner handle
    const corners = {
      'se': { x: this.position.x + this.size.width, y: this.position.y + this.size.height }, // Bottom-right
      'nw': { x: this.position.x, y: this.position.y }, // Top-left
      'ne': { x: this.position.x + this.size.width, y: this.position.y }, // Top-right
      'sw': { x: this.position.x, y: this.position.y + this.size.height } // Bottom-left
    };

    for (const [corner, pos] of Object.entries(corners)) {
      if (
        point.x >= pos.x - tolerance &&
        point.x <= pos.x + tolerance &&
        point.y >= pos.y - tolerance &&
        point.y <= pos.y + tolerance
      ) {
        return corner as 'se' | 'nw' | 'ne' | 'sw';
      }
    }

    return null;
  }

  /**
   * Resize the post-it note
   */
  resize(corner: 'se' | 'nw' | 'ne' | 'sw', newPoint: Point): void {
    const oldPos = { ...this.position };
    const oldSize = { ...this.size };

    switch (corner) {
      case 'se': // Bottom-right: only resize
        this.size.width = Math.max(this.minSize.width, newPoint.x - this.position.x);
        this.size.height = Math.max(this.minSize.height, newPoint.y - this.position.y);
        break;
        
      case 'nw': // Top-left: move position and resize
        const newWidth = oldPos.x + oldSize.width - newPoint.x;
        const newHeight = oldPos.y + oldSize.height - newPoint.y;
        
        if (newWidth >= this.minSize.width) {
          this.position.x = newPoint.x;
          this.size.width = newWidth;
        }
        if (newHeight >= this.minSize.height) {
          this.position.y = newPoint.y;
          this.size.height = newHeight;
        }
        break;
        
      case 'ne': // Top-right: move Y position, resize width and height
        const neWidth = newPoint.x - this.position.x;
        const neHeight = oldPos.y + oldSize.height - newPoint.y;
        
        if (neWidth >= this.minSize.width) {
          this.size.width = neWidth;
        }
        if (neHeight >= this.minSize.height) {
          this.position.y = newPoint.y;
          this.size.height = neHeight;
        }
        break;
        
      case 'sw': // Bottom-left: move X position, resize width and height
        const swWidth = oldPos.x + oldSize.width - newPoint.x;
        const swHeight = newPoint.y - this.position.y;
        
        if (swWidth >= this.minSize.width) {
          this.position.x = newPoint.x;
          this.size.width = swWidth;
        }
        if (swHeight >= this.minSize.height) {
          this.size.height = swHeight;
        }
        break;
    }

    this.metadata.lastEdited = new Date();
  }

  /**
   * Set resizing state
   */
  setResizing(resizing: boolean): void {
    this.isResizing = resizing;
  }

  /**
   * Get current resizing state
   */
  getResizing(): boolean {
    return this.isResizing;
  }

  /**
   * Serialize to data format
   */
  serialize(): ElementData {
    return {
      id: this.id,
      type: this.type,
      position: { ...this.position },
      size: { ...this.size },
      content: this.content,
      style: { ...this.style },
      metadata: { ...this.metadata }
    };
  }

  /**
   * Deserialize from data format
   */
  deserialize(data: ElementData): void {
    this.id = data.id;
    this.position = { ...data.position };
    this.size = { ...data.size };
    this.content = data.content;
    this.style = { ...data.style };
    this.metadata = { ...data.metadata };
  }

  /**
   * Move the post-it to a new position
   */
  moveTo(newPosition: Point): void {
    this.position = { ...newPosition };
    this.metadata.lastEdited = new Date();
  }

  /**
   * Set the content of the post-it
   */
  setContent(content: string): void {
    this.content = content;
    this.metadata.lastEdited = new Date();
  }

  /**
   * Set selection state
   */
  setSelected(selected: boolean): void {
    this.isSelected = selected;
  }

  /**
   * Set editing state
   */
  setEditing(editing: boolean): void {
    this.isEditing = editing;
  }

  /**
   * Get current selection state
   */
  getSelected(): boolean {
    return this.isSelected;
  }

  /**
   * Get current editing state
   */
  getEditing(): boolean {
    return this.isEditing;
  }

  /**
   * Helper method to wrap text within post-it bounds
   */
  private wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, currentY);
  }
} 