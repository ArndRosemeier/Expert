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
      backgroundColor: '#fff9c4', // Light yellow post-it default
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

    // Save context state
    context.save();

    // Draw the main post-it body
    context.fillStyle = this.style.backgroundColor;
    context.strokeStyle = this.isSelected ? '#2196F3' : 'rgba(0, 0, 0, 0.1)';
    context.lineWidth = this.isSelected ? 2 : 1;
    
    // Round corners
    const radius = 8 * viewport.zoom;
    context.beginPath();
    context.roundRect(screenPos.x, screenPos.y, screenWidth, screenHeight, radius);
    context.fill();
    context.stroke();

    // Draw shadow (only if not selected to avoid visual clutter)
    if (!this.isSelected) {
      context.shadowColor = 'rgba(0, 0, 0, 0.1)';
      context.shadowBlur = 4 * viewport.zoom;
      context.shadowOffsetX = 2 * viewport.zoom;
      context.shadowOffsetY = 2 * viewport.zoom;
    }

    // Draw text content with basic line break support and height constraints
    if (this.content.trim()) {
      context.fillStyle = this.style.textColor;
      context.font = `${this.style.fontSize * viewport.zoom}px Arial`;
      context.textAlign = 'left';
      context.textBaseline = 'top';

      const padding = 10 * viewport.zoom;
      const maxWidth = screenWidth - padding * 2;
      // Available height for text
      // const maxHeight = screenHeight - padding * 2;
      const lineHeight = this.style.fontSize * viewport.zoom * 1.2;

      // Split text by line breaks first, then handle word wrapping for each line
      const lines = this.content.split('\n');
      let currentY = screenPos.y + padding;
      let isTextTruncated = false;

      for (const line of lines) {
        // Check if we have space for another line
        if (currentY + lineHeight > screenPos.y + screenHeight - padding) {
          isTextTruncated = true;
          break;
        }

        if (line.trim() === '') {
          // Empty line - just advance Y
          currentY += lineHeight;
          continue;
        }

        // Handle word wrapping for this line
        const words = line.split(' ');
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const metrics = context.measureText(testLine);
          
          if (metrics.width > maxWidth && currentLine !== '') {
            // Check if we have space for this line
            if (currentY + lineHeight > screenPos.y + screenHeight - padding) {
              isTextTruncated = true;
              break;
            }
            
            // Draw current line and start new one
            context.fillText(currentLine, screenPos.x + padding, currentY);
            currentY += lineHeight;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        if (isTextTruncated) {
          break;
        }
        
        // Draw remaining text if we have space
        if (currentLine) {
          if (currentY + lineHeight <= screenPos.y + screenHeight - padding) {
            context.fillText(currentLine, screenPos.x + padding, currentY);
            currentY += lineHeight;
          } else {
            isTextTruncated = true;
          }
        }
      }

      // Show truncation indicator if text was cut off
      if (isTextTruncated) {
        context.save();
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.font = `${Math.max(10, this.style.fontSize * viewport.zoom * 0.8)}px Arial`;
        const truncationText = '...';
        const truncationY = screenPos.y + screenHeight - padding - (this.style.fontSize * viewport.zoom * 0.8);
        const truncationX = screenPos.x + screenWidth - padding - context.measureText(truncationText).width;
        context.fillText(truncationText, truncationX, truncationY);
        context.restore();
      }
    }

    // Draw connection dots on all sides
    this.renderConnectionDots(context, screenPos, screenWidth, screenHeight, viewport.zoom);

    // Draw resize handles if selected
    if (this.isSelected) {
      this.drawResizeHandles(context, screenPos, screenWidth, screenHeight);
    }

    // Restore context state
    context.restore();
  }

  /**
   * Render connection dots on all four sides
   */
  private renderConnectionDots(context: CanvasRenderingContext2D, screenPos: Point, screenWidth: number, screenHeight: number, zoom: number): void {
    const dotRadius = 4 * zoom;
    const dotColor = '#4CAF50'; // Green dots
    const dotBorderColor = '#2E7D32'; // Darker green border

    // Calculate dot positions
    const dots = this.getConnectionDotPositions(screenPos, screenWidth, screenHeight);

    dots.forEach(dot => {
      // Draw dot with border
      context.fillStyle = dotColor;
      context.strokeStyle = dotBorderColor;
      context.lineWidth = 1 * zoom;
      
      context.beginPath();
      context.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  }

  /**
   * Get the screen positions of all connection dots
   */
  getConnectionDotPositions(screenPos: Point, screenWidth: number, screenHeight: number): Array<Point & { side: 'top' | 'right' | 'bottom' | 'left' }> {
    const halfWidth = screenWidth / 2;
    const halfHeight = screenHeight / 2;

    return [
      { x: screenPos.x + halfWidth, y: screenPos.y, side: 'top' as const },
      { x: screenPos.x + screenWidth, y: screenPos.y + halfHeight, side: 'right' as const },
      { x: screenPos.x + halfWidth, y: screenPos.y + screenHeight, side: 'bottom' as const },
      { x: screenPos.x, y: screenPos.y + halfHeight, side: 'left' as const }
    ];
  }

  /**
   * Check if a point hits any connection dot
   */
  hitTestConnectionDot(point: Point, viewport: Viewport): { side: 'top' | 'right' | 'bottom' | 'left' } | null {
    const screenPos = viewport.worldToScreen(this.position.x, this.position.y);
    const screenWidth = this.size.width * viewport.zoom;
    const screenHeight = this.size.height * viewport.zoom;
    const dotRadius = 4 * viewport.zoom;

    const dots = this.getConnectionDotPositions(screenPos, screenWidth, screenHeight);

    for (const dot of dots) {
      const dx = point.x - dot.x;
      const dy = point.y - dot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Increased tolerance for easier clicking - much larger hit area
      const hitRadius = Math.max(dotRadius + 12, 20); // At least 20px hit radius, or dot + 12px padding
      if (distance <= hitRadius) {
        return { side: dot.side };
      }
    }

    return null;
  }

  /**
   * Draw resize handles at corners and edges
   */
  private drawResizeHandles(context: CanvasRenderingContext2D, screenPos: Point, screenWidth: number, screenHeight: number): void {
    const handleSize = 12; // Increased from 8 to 12 for better visibility
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
   * Check if a point hits any resize handle
   */
  hitTestResize(point: Point, viewport: Viewport): 'se' | 'nw' | 'ne' | 'sw' | null {
    if (!this.isSelected) {
      return null;
    }

    const screenPos = viewport.worldToScreen(this.position.x, this.position.y);
    const screenWidth = this.size.width * viewport.zoom;
    const screenHeight = this.size.height * viewport.zoom;
    const handleSize = 24; // Increased from 8 to 24 for much easier clicking

    // Define resize handle positions
    const handles = {
      'nw': { x: screenPos.x - handleSize/2, y: screenPos.y - handleSize/2 },
      'ne': { x: screenPos.x + screenWidth - handleSize/2, y: screenPos.y - handleSize/2 },
      'sw': { x: screenPos.x - handleSize/2, y: screenPos.y + screenHeight - handleSize/2 },
      'se': { x: screenPos.x + screenWidth - handleSize/2, y: screenPos.y + screenHeight - handleSize/2 }
    };

    // Check each handle
    for (const [handle, pos] of Object.entries(handles)) {
      if (point.x >= pos.x && point.x <= pos.x + handleSize &&
          point.y >= pos.y && point.y <= pos.y + handleSize) {
        return handle as 'se' | 'nw' | 'ne' | 'sw';
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
   * Set selected state
   */
  setSelected(selected: boolean): void {
    this.isSelected = selected;
  }

  /**
   * Set the background color of the post-it note
   */
  setColor(color: string): void {
    this.style.backgroundColor = color;
    this.metadata.lastEdited = new Date();
  }

  /**
   * Get selected state
   */
  getSelected(): boolean {
    return this.isSelected;
  }

  /**
   * Set editing state
   */
  setEditing(editing: boolean): void {
    this.isEditing = editing;
  }

  /**
   * Get current editing state
   */
  getEditing(): boolean {
    return this.isEditing;
  }
} 