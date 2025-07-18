import { Viewport } from './rendering/Viewport';
import { PostItNote } from './elements/PostItNote';
import { InputManager } from './interaction/InputManager';
import { BoardSerializer } from './persistence/BoardSerializer';
import type { IdeaBoardState, ElementData, Point, BoardElement } from './types/BoardTypes';

export class IdeaBoard {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private viewport: Viewport;
  private elements: Map<string, BoardElement> = new Map();
  private inputManager: InputManager;
  private boardState: IdeaBoardState;
  
  // Interaction state
  private selectedElement: BoardElement | null = null;
  private editingElement: PostItNote | null = null;
  private draggedElement: BoardElement | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private resizingElement: PostItNote | null = null;
  private resizeHandle: 'se' | 'nw' | 'ne' | 'sw' | null = null;
  private isPanning: boolean = false;
  private panStart: Point = { x: 0, y: 0 };
  
  // Rendering
  private animationFrameId: number | null = null;
  private needsRedraw: boolean = true;

  constructor(container: HTMLElement, boardName: string = 'New Board') {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'default';
    container.appendChild(this.canvas);

    // Get context
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.context = context;

    // Initialize viewport
    this.viewport = new Viewport(800, 600);
    this.resizeCanvas();

    // Initialize board state - will be set later by initializeBoard
    this.boardState = BoardSerializer.createNewBoardState(boardName);

    // Setup input handling
    this.inputManager = new InputManager(this.canvas);
    this.setupInputHandlers();

    // Setup resize observer
    this.setupResizeObserver(container);

    // Start render loop
    this.startRenderLoop();

    console.log(`🎨 Idea board initialized: ${boardName}`);
    
    // Initialize board with existing data if available (async)
    this.initializeBoard(boardName).catch(error => {
      console.error('Failed to initialize board data:', error);
    });
  }

  /**
   * Initialize the board by loading existing data or creating new state
   */
  private async initializeBoard(boardName: string): Promise<void> {
    try {
      // Try to find or create board with deterministic ID
      this.boardState = await BoardSerializer.findOrCreateBoard(boardName);
      
      // Load viewport state
      this.viewport.x = this.boardState.viewport.x;
      this.viewport.y = this.boardState.viewport.y;
      this.viewport.zoom = this.boardState.viewport.zoom;

      // Recreate elements from saved data
      this.elements.clear();
      for (const elementData of this.boardState.elements) {
        if (elementData.type === 'post-it') {
          const postIt = new PostItNote({ x: 0, y: 0 });
          postIt.deserialize(elementData);
          this.elements.set(postIt.id, postIt);
        }
      }

      this.requestRedraw();
      console.log(`📂 Board initialized with ${this.elements.size} existing elements`);
    } catch (error) {
      console.error('Failed to initialize board from storage:', error);
      // Fallback to new board if loading fails
      this.boardState = BoardSerializer.createNewBoardState(boardName);
    }
  }

  /**
   * Setup input event handlers
   */
  private setupInputHandlers(): void {
    this.inputManager.on('onMouseDown', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);
      
      if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
        // Middle mouse or Ctrl+click = pan mode
        this.startPanning(point);
      } else if (event.button === 0) {
        // Left click = select/edit/resize
        this.handleLeftClick(worldPoint, event);
      }
    });

    this.inputManager.on('onMouseMove', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);
      
      if (this.isPanning) {
        this.handlePanning(point);
      } else if (this.resizingElement && this.resizeHandle) {
        this.handleElementResize(worldPoint);
      } else if (this.draggedElement) {
        this.handleElementDrag(point);
      } else {
        // Update cursor based on what's under mouse
        this.updateCursor(worldPoint);
      }
    });

    this.inputManager.on('onMouseUp', (point, event) => {
      this.isPanning = false;
      if (this.resizingElement) {
        this.finishElementResize();
      } else if (this.draggedElement) {
        this.finishElementDrag();
      }
    });

    this.inputManager.on('onDoubleClick', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);
      this.handleDoubleClick(worldPoint);
    });

    this.inputManager.on('onWheel', (delta, point, event) => {
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      this.viewport.zoomAt(zoomFactor, point.x, point.y);
      this.requestRedraw();
    });

    this.inputManager.on('onKeyDown', (event) => {
      this.handleKeyDown(event);
    });
  }

  /**
   * Handle left mouse click
   */
  private handleLeftClick(worldPoint: Point, event: MouseEvent): void {
    const hitElement = this.findElementAt(worldPoint);
    
    if (hitElement instanceof PostItNote) {
      // Check if clicking on a resize handle
      const resizeHandle = hitElement.hitTestResizeHandle(worldPoint, this.viewport);
      
      if (resizeHandle) {
        this.startElementResize(hitElement, resizeHandle);
        return;
      }
    }
    
    if (hitElement) {
      this.selectElement(hitElement);
      
      // Start dragging if not already editing
      if (this.editingElement !== hitElement) {
        this.startElementDrag(hitElement, worldPoint);
      }
    } else {
      this.clearSelection();
    }
  }

  /**
   * Handle double click to create new post-it or edit existing
   */
  private handleDoubleClick(worldPoint: Point): void {
    const hitElement = this.findElementAt(worldPoint);
    
    if (hitElement && hitElement instanceof PostItNote) {
      this.startEditing(hitElement);
    } else {
      this.createNewPostIt(worldPoint);
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  private handleKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Delete':
        if (this.selectedElement) {
          this.deleteElement(this.selectedElement);
        }
        break;
        
      case 'Escape':
        if (this.editingElement) {
          this.stopEditing();
        } else {
          this.clearSelection();
        }
        break;
        
      case ' ': // Spacebar for pan mode
        event.preventDefault();
        if (!this.isPanning) {
          this.canvas.style.cursor = 'grab';
        }
        break;
    }
  }

  /**
   * Create a new post-it note at the specified position
   */
  createNewPostIt(position: Point, content: string = ''): PostItNote {
    const postIt = new PostItNote(position, content);
    this.elements.set(postIt.id, postIt);
    this.boardState.elements.push(postIt.serialize());
    this.boardState.metadata.totalElements = this.elements.size;
    
    this.selectElement(postIt);
    this.requestRedraw();
    this.autoSave();
    
    console.log(`📝 Created new post-it at (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`);
    return postIt;
  }

  /**
   * Delete an element
   */
  deleteElement(element: BoardElement): void {
    this.elements.delete(element.id);
    this.boardState.elements = this.boardState.elements.filter(e => e.id !== element.id);
    this.boardState.metadata.totalElements = this.elements.size;
    
    if (this.selectedElement === element) {
      this.selectedElement = null;
    }
    if (this.editingElement === element) {
      this.editingElement = null;
    }
    
    this.requestRedraw();
    this.autoSave();
    
    console.log(`🗑️ Deleted element: ${element.id}`);
  }

  /**
   * Start editing a post-it note
   */
  startEditing(postIt: PostItNote): void {
    if (this.editingElement) {
      this.stopEditing();
    }
    
    this.editingElement = postIt;
    postIt.setEditing(true);
    this.selectElement(postIt);
    
    // Create a temporary input for editing
    this.createEditingInput(postIt);
    this.requestRedraw();
  }

  /**
   * Stop editing current post-it
   */
  stopEditing(): void {
    if (this.editingElement) {
      this.editingElement.setEditing(false);
      this.editingElement = null;
      this.removeEditingInput();
      this.requestRedraw();
      this.autoSave();
    }
  }

  /**
   * Create temporary input for editing post-it content
   */
  private createEditingInput(postIt: PostItNote): void {
    const screenPos = this.viewport.worldToScreen(postIt.position.x, postIt.position.y);
    const screenWidth = postIt.size.width * this.viewport.zoom;
    const screenHeight = postIt.size.height * this.viewport.zoom;
    
    const input = document.createElement('textarea');
    input.id = 'postit-editor';
    input.value = postIt.content;
    input.style.position = 'absolute';
    input.style.left = `${this.canvas.offsetLeft + screenPos.x + 8}px`;
    input.style.top = `${this.canvas.offsetTop + screenPos.y + 8}px`;
    input.style.width = `${screenWidth - 16}px`;
    input.style.height = `${screenHeight - 16}px`;
    input.style.background = postIt.style.backgroundColor;
    input.style.color = postIt.style.textColor;
    input.style.border = '2px solid #4caf50';
    input.style.borderRadius = '4px';
    input.style.padding = '4px';
    input.style.fontSize = `${postIt.style.fontSize * this.viewport.zoom}px`;
    input.style.fontFamily = 'Arial, sans-serif';
    input.style.resize = 'none';
    input.style.zIndex = '1000';
    
    document.body.appendChild(input);
    input.focus();
    input.select();
    
    // Handle input events
    const handleChange = () => {
      postIt.setContent(input.value);
      this.updateElementData(postIt);
      this.requestRedraw();
    };
    
    const handleBlur = () => {
      this.stopEditing();
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.stopEditing();
      }
      e.stopPropagation(); // Prevent board keyboard shortcuts
    };
    
    input.addEventListener('input', handleChange);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Remove the editing input
   */
  private removeEditingInput(): void {
    const input = document.getElementById('postit-editor');
    if (input) {
      input.remove();
    }
  }

  /**
   * Find element at world coordinates
   */
  private findElementAt(worldPoint: Point): BoardElement | null {
    // Check elements in reverse order (last rendered = on top)
    const elementsArray = Array.from(this.elements.values());
    for (let i = elementsArray.length - 1; i >= 0; i--) {
      const element = elementsArray[i];
      if (element.hitTest(worldPoint)) {
        return element;
      }
    }
    
    return null;
  }

  /**
   * Select an element
   */
  private selectElement(element: BoardElement): void {
    if (this.selectedElement) {
      if (this.selectedElement instanceof PostItNote) {
        this.selectedElement.setSelected(false);
      }
    }
    
    this.selectedElement = element;
    if (element instanceof PostItNote) {
      element.setSelected(true);
    }
    
    this.requestRedraw();
  }

  /**
   * Clear selection
   */
  private clearSelection(): void {
    if (this.selectedElement) {
      if (this.selectedElement instanceof PostItNote) {
        this.selectedElement.setSelected(false);
      }
      this.selectedElement = null;
      this.requestRedraw();
    }
  }

  /**
   * Start dragging an element
   */
  private startElementDrag(element: BoardElement, worldPoint: Point): void {
    this.draggedElement = element;
    this.dragOffset = {
      x: worldPoint.x - element.position.x,
      y: worldPoint.y - element.position.y
    };
    this.canvas.style.cursor = 'grabbing';
    
    // Bring the dragged element to front
    this.bringElementToFront(element);
  }

  /**
   * Handle element dragging
   */
  private handleElementDrag(screenPoint: Point): void {
    if (!this.draggedElement) return;
    
    const worldPoint = this.viewport.screenToWorld(screenPoint.x, screenPoint.y);
    const newPosition = {
      x: worldPoint.x - this.dragOffset.x,
      y: worldPoint.y - this.dragOffset.y
    };
    
    if (this.draggedElement instanceof PostItNote) {
      this.draggedElement.moveTo(newPosition);
    }
    
    this.requestRedraw();
  }

  /**
   * Finish dragging an element
   */
  private finishElementDrag(): void {
    if (this.draggedElement) {
      this.updateElementData(this.draggedElement);
      this.draggedElement = null;
      this.canvas.style.cursor = 'default';
      this.autoSave();
    }
  }

  /**
   * Start panning the viewport
   */
  private startPanning(screenPoint: Point): void {
    this.isPanning = true;
    this.panStart = screenPoint;
    this.canvas.style.cursor = 'grabbing';
  }

  /**
   * Handle viewport panning
   */
  private handlePanning(screenPoint: Point): void {
    if (!this.isPanning) return;
    
    const deltaX = this.panStart.x - screenPoint.x;
    const deltaY = this.panStart.y - screenPoint.y;
    
    this.viewport.pan(deltaX, deltaY);
    this.panStart = screenPoint;
    this.requestRedraw();
  }

  /**
   * Update element data in board state
   */
  private updateElementData(element: BoardElement): void {
    const index = this.boardState.elements.findIndex(e => e.id === element.id);
    if (index >= 0) {
      this.boardState.elements[index] = element.serialize();
    }
  }

  /**
   * Auto-save board state
   */
  private autoSave(): void {
    this.boardState.viewport.x = this.viewport.x;
    this.boardState.viewport.y = this.viewport.y;
    this.boardState.viewport.zoom = this.viewport.zoom;
    void BoardSerializer.autoSave(this.boardState);
  }

  /**
   * Load board from storage
   */
  async loadBoard(boardId: string): Promise<boolean> {
    const loadedState = await BoardSerializer.load(boardId);
    if (!loadedState) {
      return false;
    }

    this.boardState = loadedState;
    this.viewport.x = loadedState.viewport.x;
    this.viewport.y = loadedState.viewport.y;
    this.viewport.zoom = loadedState.viewport.zoom;

    // Recreate elements
    this.elements.clear();
    for (const elementData of loadedState.elements) {
      if (elementData.type === 'post-it') {
        const postIt = new PostItNote({ x: 0, y: 0 });
        postIt.deserialize(elementData);
        this.elements.set(postIt.id, postIt);
      }
    }

    this.requestRedraw();
    console.log(`📂 Loaded board: ${loadedState.name} with ${this.elements.size} elements`);
    return true;
  }

  /**
   * Setup canvas resize observer
   */
  private setupResizeObserver(container: HTMLElement): void {
    const resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    resizeObserver.observe(container);
  }

  /**
   * Resize canvas to fit container
   */
  private resizeCanvas(): void {
    const container = this.canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.context.scale(dpr, dpr);
    this.viewport.resize(rect.width, rect.height);
    this.requestRedraw();
  }

  /**
   * Request a redraw on next frame
   */
  private requestRedraw(): void {
    this.needsRedraw = true;
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    const render = () => {
      if (this.needsRedraw) {
        this.render();
        this.needsRedraw = false;
      }
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Render the entire board
   */
  private render(): void {
    // Clear canvas
    this.context.clearRect(0, 0, this.viewport.width, this.viewport.height);

    // Draw grid (optional)
    this.drawGrid();

    // Draw all elements in order (Map preserves insertion order)
    for (const element of this.elements.values()) {
      element.render(this.context, this.viewport);
    }

    // Draw UI overlay
    this.drawUI();
  }

  /**
   * Draw grid overlay
   */
  private drawGrid(): void {
    const gridSize = 50;
    const bounds = this.viewport.getWorldBounds();
    
    this.context.save();
    this.context.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    this.context.lineWidth = 1;

    // Vertical lines
    const startX = Math.floor(bounds.left / gridSize) * gridSize;
    for (let x = startX; x <= bounds.right; x += gridSize) {
      const screenX = this.viewport.worldToScreen(x, 0).x;
      this.context.beginPath();
      this.context.moveTo(screenX, 0);
      this.context.lineTo(screenX, this.viewport.height);
      this.context.stroke();
    }

    // Horizontal lines
    const startY = Math.floor(bounds.top / gridSize) * gridSize;
    for (let y = startY; y <= bounds.bottom; y += gridSize) {
      const screenY = this.viewport.worldToScreen(0, y).y;
      this.context.beginPath();
      this.context.moveTo(0, screenY);
      this.context.lineTo(this.viewport.width, screenY);
      this.context.stroke();
    }

    this.context.restore();
  }

  /**
   * Draw UI overlay
   */
  private drawUI(): void {
    // Status bar
    this.context.save();
    this.context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.context.fillRect(0, this.viewport.height - 30, this.viewport.width, 30);
    
    this.context.fillStyle = 'white';
    this.context.font = '12px Arial';
    const statusText = `Zoom: ${(this.viewport.zoom * 100).toFixed(0)}% | Position: (${this.viewport.x.toFixed(0)}, ${this.viewport.y.toFixed(0)}) | Elements: ${this.elements.size}`;
    this.context.fillText(statusText, 10, this.viewport.height - 10);
    this.context.restore();
  }

  /**
   * Update cursor based on what's under the mouse
   */
  private updateCursor(worldPoint: Point): void {
    const hitElement = this.findElementAt(worldPoint);
    
    if (hitElement instanceof PostItNote && hitElement.getSelected()) {
      const resizeHandle = hitElement.hitTestResizeHandle(worldPoint, this.viewport);
      
      if (resizeHandle) {
        // Set cursor based on resize handle
        const cursors = {
          'se': 'se-resize',
          'nw': 'nw-resize',
          'ne': 'ne-resize',
          'sw': 'sw-resize'
        };
        this.canvas.style.cursor = cursors[resizeHandle];
        return;
      }
    }
    
    if (hitElement) {
      this.canvas.style.cursor = 'move';
    } else {
      this.canvas.style.cursor = 'default';
    }
  }

  /**
   * Start resizing an element
   */
  private startElementResize(element: PostItNote, handle: 'se' | 'nw' | 'ne' | 'sw'): void {
    this.resizingElement = element;
    this.resizeHandle = handle;
    element.setResizing(true);
    
    const cursors = {
      'se': 'se-resize',
      'nw': 'nw-resize', 
      'ne': 'ne-resize',
      'sw': 'sw-resize'
    };
    this.canvas.style.cursor = cursors[handle];
  }

  /**
   * Handle element resizing
   */
  private handleElementResize(worldPoint: Point): void {
    if (!this.resizingElement || !this.resizeHandle) return;
    
    this.resizingElement.resize(this.resizeHandle, worldPoint);
    this.requestRedraw();
  }

  /**
   * Finish resizing an element
   */
  private finishElementResize(): void {
    if (this.resizingElement) {
      this.resizingElement.setResizing(false);
      this.updateElementData(this.resizingElement);
      this.resizingElement = null;
      this.resizeHandle = null;
      this.canvas.style.cursor = 'default';
      this.autoSave();
    }
  }

  /**
   * Bring an element to the front by moving it to the end of the elements collection
   */
  private bringElementToFront(element: BoardElement): void {
    // Remove from current position and add to end (rendered last = appears on top)
    this.elements.delete(element.id);
    this.elements.set(element.id, element);
    
    // Also update the order in boardState.elements
    const elementIndex = this.boardState.elements.findIndex(e => e.id === element.id);
    if (elementIndex >= 0) {
      const elementData = this.boardState.elements.splice(elementIndex, 1)[0];
      this.boardState.elements.push(elementData);
    }
    
    this.requestRedraw();
  }

  /**
   * Get board state for external access
   */
  getBoardState(): IdeaBoardState {
    return { ...this.boardState };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.inputManager.destroy();
    this.removeEditingInput();
    this.canvas.remove();
  }
} 