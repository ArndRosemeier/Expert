// Overview Board renderer - simple layered rendering like IdeaBoard
import { Viewport } from '../../idea-board/rendering/Viewport';
import { InputManager } from '../../idea-board/interaction/InputManager';
import type { Point } from '../../idea-board/types/BoardTypes';
import type { 
  OverviewElement, 
  OverviewConnection, 
  CloudRegion, 
  CloudTheme,
  OverviewBoardState,
  OverviewInteractionState
} from '../types/GraphTypes';

export class OverviewRenderer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private viewport: Viewport;
  private inputManager: InputManager;
  
  // Simple lists for rendering order (like IdeaBoard)
  private cloudRegions: CloudRegion[] = [];
  private connections: OverviewConnection[] = [];
  private elements: OverviewElement[] = [];
  
  // Interaction state
  private interactionState: OverviewInteractionState = {
    selectedElement: null,
    hoveredElement: null,
    draggedElement: null,
    dragOffset: { x: 0, y: 0 },
    isDragging: false,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    showConnections: true,
    highlightedConnections: new Set()
  };
  
  // Rendering state
  private needsRedraw: boolean = true;
  private animationFrameId: number | null = null;
  
  // Theme and layout
  private theme: CloudTheme;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.context = context;
    
    // Initialize viewport and input manager (reuse IdeaBoard infrastructure)
    this.viewport = new Viewport(canvas.width, canvas.height);
    this.inputManager = new InputManager(canvas);
    
    // Set up default theme
    this.theme = this.createDefaultTheme();
    
    // Initialize cloud regions
    this.initializeCloudRegions();
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Start render loop
    this.startRenderLoop();
  }
  
  /**
   * Create default cloud theme
   */
  private createDefaultTheme(): CloudTheme {
    return {
      events: {
        color: '#3B82F6',
        backgroundColor: '#3B82F6',
        borderColor: '#1E40AF',
        label: 'Events',
        icon: '📅'
      },
      characters: {
        color: '#10B981',
        backgroundColor: '#10B981',
        borderColor: '#059669',
        label: 'Characters', 
        icon: '👤'
      },
      places: {
        color: '#F59E0B',
        backgroundColor: '#F59E0B',
        borderColor: '#D97706',
        label: 'Places',
        icon: '📍'
      }
    };
  }
  
  /**
   * Initialize the three cloud regions
   */
  private initializeCloudRegions(): void {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const cloudSpacing = 300;
    const cloudRadius = 180; // 50% bigger than original 120
    
    this.cloudRegions = [
      {
        id: 'events',
        center: { x: centerX - cloudSpacing, y: centerY - cloudSpacing / 2 },
        radius: cloudRadius,
        color: this.theme.events.color,
        backgroundColor: this.theme.events.backgroundColor + '20', // 20% opacity
        borderColor: this.theme.events.borderColor,
        elements: new Set(),
        visible: true,
        label: this.theme.events.label
      },
      {
        id: 'characters',
        center: { x: centerX + cloudSpacing, y: centerY - cloudSpacing / 2 },
        radius: cloudRadius,
        color: this.theme.characters.color,
        backgroundColor: this.theme.characters.backgroundColor + '20',
        borderColor: this.theme.characters.borderColor,
        elements: new Set(),
        visible: true,
        label: this.theme.characters.label
      },
      {
        id: 'places',
        center: { x: centerX, y: centerY + cloudSpacing / 2 },
        radius: cloudRadius,
        color: this.theme.places.color,
        backgroundColor: this.theme.places.backgroundColor + '20',
        borderColor: this.theme.places.borderColor,
        elements: new Set(),
        visible: true,
        label: this.theme.places.label
      }
    ];
  }
  
  /**
   * Set up event handlers using InputManager
   */
  private setupEventHandlers(): void {
    this.inputManager.on('onMouseDown', this.handleMouseDown.bind(this));
    this.inputManager.on('onMouseMove', this.handleMouseMove.bind(this));
    this.inputManager.on('onMouseUp', this.handleMouseUp.bind(this));
    this.inputManager.on('onDoubleClick', this.handleDoubleClick.bind(this));
    this.inputManager.on('onWheel', this.handleWheel.bind(this));
    this.inputManager.on('onKeyDown', this.handleKeyDown.bind(this));
    this.inputManager.on('onKeyUp', this.handleKeyUp.bind(this));
  }
  
  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    const renderFrame = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(renderFrame);
    };
    renderFrame();
  }
  
  /**
   * Main render function - simple layered approach like IdeaBoard
   */
  private render(): void {
    if (!this.needsRedraw) {
      return;
    }
    
    // Clear canvas (reuse IdeaBoard pattern)
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.restore();
    
    // Draw background
    this.context.fillStyle = '#f5f5f5';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Layer 1: Cloud regions (background)
    this.renderCloudRegions();
    
    // Layer 2: Connections (middle)
    this.renderConnections();
    
    // Layer 3: Elements (top) - render in list order
    this.renderElements();
    
    this.needsRedraw = false;
  }
  
  /**
   * Render cloud regions as background circles
   */
  private renderCloudRegions(): void {
    for (const cloud of this.cloudRegions) {
      if (!cloud.visible) continue;
      
      const screenPos = this.viewport.worldToScreen(cloud.center.x, cloud.center.y);
      const radius = cloud.radius * this.viewport.zoom;


      
      this.context.save();
      
      // Draw cloud background circle
      this.context.beginPath();
      this.context.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI);
      this.context.fillStyle = cloud.backgroundColor;
      this.context.fill();
      this.context.strokeStyle = cloud.borderColor;
      this.context.lineWidth = 2;
      this.context.stroke();
      
      // Draw cloud label
      this.context.fillStyle = cloud.borderColor;
      this.context.font = `${16 * this.viewport.zoom}px Arial`;
      this.context.textAlign = 'center';
      this.context.textBaseline = 'middle';
      const labelY = screenPos.y - radius - (20 * this.viewport.zoom);
      this.context.fillText(cloud.label, screenPos.x, labelY);
      
      this.context.restore();
    }
  }
  
  /**
   * Render connections between elements
   */
  private renderConnections(): void {
    const selectedElement = this.interactionState.selectedElement;
    
    for (const connection of this.connections) {
      if (!this.interactionState.showConnections) continue;
      
      const fromElement = this.elements.find(e => e.id === connection.fromElementId);
      const toElement = this.elements.find(e => e.id === connection.toElementId);
      
      if (!fromElement || !toElement) continue;
      
      // Calculate connection opacity based on selection
      let connectionOpacity = 1.0;
      if (selectedElement) {
        // If an element is selected, only show full opacity for connections involving that element
        const isConnectedToSelected = (connection.fromElementId === selectedElement.id || 
                                     connection.toElementId === selectedElement.id);
        connectionOpacity = isConnectedToSelected ? 1.0 : 0.3;
      }
      
      this.renderConnection(connection, fromElement, toElement, connectionOpacity);
    }
  }
  
  /**
   * Render a single connection as a curved line
   */
  private renderConnection(
    connection: OverviewConnection, 
    fromElement: OverviewElement, 
    toElement: OverviewElement,
    opacity: number = 1.0
  ): void {
    const fromPos = this.viewport.worldToScreen(
      fromElement.position.x + fromElement.size.width / 2,
      fromElement.position.y + fromElement.size.height / 2
    );
    const toPos = this.viewport.worldToScreen(
      toElement.position.x + toElement.size.width / 2,
      toElement.position.y + toElement.size.height / 2
    );
    
    this.context.save();
    
    // Set connection style
    this.context.strokeStyle = connection.color;
    this.context.lineWidth = connection.thickness * this.viewport.zoom;
    this.context.lineCap = 'round';
    
    // Apply opacity for fade effect
    this.context.globalAlpha = opacity;
    
    // Draw curved line (simple quadratic curve)
    this.context.beginPath();
    this.context.moveTo(fromPos.x, fromPos.y);
    
    // Calculate control point for curve
    const midX = (fromPos.x + toPos.x) / 2;
    const midY = (fromPos.y + toPos.y) / 2;
    const curveOffset = 50 * this.viewport.zoom;
    const controlX = midX;
    const controlY = midY - curveOffset;
    
    this.context.quadraticCurveTo(controlX, controlY, toPos.x, toPos.y);
    this.context.stroke();
    
    this.context.restore();
  }
  
  /**
   * Render all elements in list order (like IdeaBoard)
   */
  private renderElements(): void {
    const selectedElement = this.interactionState.selectedElement;
    const connectedElementIds = selectedElement ? this.getConnectedElementIds(selectedElement) : new Set<string>();
    
    for (const element of this.elements) {
      // Update element visual state
      element.setHovered(element === this.interactionState.hoveredElement);
      element.setSelected(element === this.interactionState.selectedElement);
      element.setDragging(element === this.interactionState.draggedElement);
      
      // Calculate opacity based on selection and connections
      let opacity = 1.0;
      if (selectedElement && selectedElement !== element) {
        // If an element is selected and this isn't it, check if connected
        opacity = connectedElementIds.has(element.id) ? 1.0 : 0.3;
      }
      
      // Render element with calculated opacity
      element.render(this.context, this.viewport, opacity);
    }
  }

  /**
   * Get all element IDs connected to the given element
   */
  private getConnectedElementIds(element: OverviewElement): Set<string> {
    const connectedIds = new Set<string>();
    
    // Find all connections involving this element
    for (const connection of this.connections) {
      if (connection.fromElementId === element.id) {
        connectedIds.add(connection.toElementId);
      } else if (connection.toElementId === element.id) {
        connectedIds.add(connection.fromElementId);
      }
    }
    
    return connectedIds;
  }
  
  /**
   * Bring selected element and its connected elements to front (render last)
   */
  private bringElementsToFront(selectedElement: OverviewElement): void {
    const connectedIds = this.getConnectedElementIds(selectedElement);
    
    // Find elements to bring to front: selected element + connected elements
    const elementsToMove: OverviewElement[] = [];
    const remainingElements: OverviewElement[] = [];
    
    for (const element of this.elements) {
      if (element === selectedElement || connectedIds.has(element.id)) {
        elementsToMove.push(element);
      } else {
        remainingElements.push(element);
      }
    }
    
    // Reorder: remaining elements first, then elements to bring to front
    this.elements = [...remainingElements, ...elementsToMove];
  }

  /**
   * Get cloud centers for element positioning - ensures exact coordinate match
   */
  public getCloudCenters(): { events: Point; characters: Point; places: Point } {
    const eventsCloud = this.cloudRegions.find(c => c.id === 'events');
    const charactersCloud = this.cloudRegions.find(c => c.id === 'characters');
    const placesCloud = this.cloudRegions.find(c => c.id === 'places');
    
    if (!eventsCloud || !charactersCloud || !placesCloud) {
      throw new Error('❌ RENDERER ERROR: Cloud regions not properly initialized');
    }
    
    return {
      events: eventsCloud.center,
      characters: charactersCloud.center,
      places: placesCloud.center
    };
  }

  /**
   * Get cloud radius for element positioning
   */
  public getCloudRadius(): number {
    const cloud = this.cloudRegions[0];
    if (!cloud) {
      throw new Error('❌ RENDERER ERROR: No cloud regions found');
    }
    return cloud.radius;
  }

  /**
   * Add elements to the board
   */
  public addElements(elements: OverviewElement[]): void {
    this.elements.push(...elements);
    
    // Add elements to their respective clouds
    for (const element of elements) {
      const cloud = this.cloudRegions.find(c => c.id === element.cloudType);
      if (cloud) {
        cloud.elements.add(element.id);
      }
    }
    
    this.needsRedraw = true;
  }
  
  /**
   * Add connections to the board
   */
  public addConnections(connections: OverviewConnection[]): void {
    this.connections.push(...connections);
    this.needsRedraw = true;
  }
  
  /**
   * Clear all elements and connections
   */
  public clear(): void {
    this.elements = [];
    this.connections = [];
    this.cloudRegions.forEach(cloud => { cloud.elements.clear(); });
    this.interactionState.selectedElement = null;
    this.interactionState.hoveredElement = null;
    this.needsRedraw = true;
  }
  
  /**
   * Resize the renderer
   */
  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.viewport.resize(width, height);
    this.initializeCloudRegions(); // Recalculate cloud positions
    this.needsRedraw = true;
  }
  
  // Event handlers (reuse IdeaBoard patterns)
  private handleMouseDown(point: Point, event: MouseEvent): void {
    const worldPos = this.viewport.screenToWorld(point.x, point.y);
    
    // Check for middle mouse button or Ctrl+click to start panning
    if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
      this.interactionState.isPanning = true;
      this.interactionState.panStart = point;
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    
    const hitElement = this.findElementAt(worldPos);
    
    if (hitElement) {
      this.interactionState.selectedElement = hitElement;
      this.interactionState.draggedElement = hitElement;
      this.interactionState.dragOffset = {
        x: worldPos.x - hitElement.position.x,
        y: worldPos.y - hitElement.position.y
      };
      this.updateConnectionHighlights(hitElement);
      this.bringElementsToFront(hitElement);
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.interactionState.selectedElement = null;
      this.interactionState.highlightedConnections.clear();
    }
    
    this.needsRedraw = true;
  }
  
  private handleMouseMove(point: Point, _event: MouseEvent): void {
    const worldPos = this.viewport.screenToWorld(point.x, point.y);
    
    // Handle panning
    if (this.interactionState.isPanning) {
      const dx = point.x - this.interactionState.panStart.x;
      const dy = point.y - this.interactionState.panStart.y;
      // Direct viewport movement for natural "grab and drag" feeling
      // Move viewport in opposite direction of cursor movement (so content follows cursor)
      this.viewport.x -= dx / this.viewport.zoom;
      this.viewport.y -= dy / this.viewport.zoom;
      this.interactionState.panStart = point;
      this.needsRedraw = true;
      return;
    }
    
    if (this.interactionState.draggedElement) {
      // Drag element
      this.interactionState.isDragging = true;
      this.interactionState.draggedElement.position = {
        x: worldPos.x - this.interactionState.dragOffset.x,
        y: worldPos.y - this.interactionState.dragOffset.y
      };
    } else {
      // Update hover state
      const hitElement = this.findElementAt(worldPos);
      if (hitElement !== this.interactionState.hoveredElement) {
        this.interactionState.hoveredElement = hitElement;
        if (hitElement) {
          this.canvas.style.cursor = 'pointer';
        } else {
          this.canvas.style.cursor = 'default';
        }
      }
    }
    
    this.needsRedraw = true;
  }
  
  private handleMouseUp(_point: Point, _event: MouseEvent): void {
    // Handle panning end
    if (this.interactionState.isPanning) {
      this.interactionState.isPanning = false;
      this.canvas.style.cursor = 'default';
      return;
    }
    
    // Handle dragging end
    if (this.interactionState.draggedElement) {
      this.interactionState.draggedElement = null;
      this.interactionState.isDragging = false;
      this.canvas.style.cursor = 'default';
    }
    
    this.needsRedraw = true;
  }
  
  private handleDoubleClick(point: Point, _event: MouseEvent): void {
    const worldPos = this.viewport.screenToWorld(point.x, point.y);
    const hitElement = this.findElementAt(worldPos);
    
    if (hitElement) {
      // Emit event for element details/editing
      this.onElementDoubleClick?.(hitElement);
    }
  }
  
  private handleWheel(delta: number, point: Point, _event: WheelEvent): void {
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    this.viewport.zoomAt(zoomFactor, point.x, point.y);
    this.needsRedraw = true;
  }
  
  private handleKeyDown(event: KeyboardEvent): void {
    // Only handle keyboard shortcuts when the canvas has focus or is being interacted with
    if (!this.canvas.matches(':focus') && !this.interactionState.hoveredElement && !this.interactionState.selectedElement) {
      return;
    }
    
    if (event.key === 'Delete' && this.interactionState.selectedElement) {
      this.removeElement(this.interactionState.selectedElement);
    } else if (event.key === ' ') { // Spacebar for pan mode
      event.preventDefault();
      if (!this.interactionState.isPanning) {
        this.canvas.style.cursor = 'grab';
      }
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    // Only handle keyboard shortcuts when the canvas has focus or is being interacted with
    if (!this.canvas.matches(':focus') && !this.interactionState.hoveredElement && !this.interactionState.selectedElement) {
      return;
    }
    
    if (event.key === ' ') { // Spacebar released - reset cursor
      if (!this.interactionState.isPanning) {
        this.canvas.style.cursor = 'default';
      }
    }
  }
  
  /**
   * Find element at world position
   */
  private findElementAt(worldPos: Point): OverviewElement | null {
    // Check in reverse order (top to bottom)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const element = this.elements[i];
      if (element?.hitTest(worldPos)) {
        return element;
      }
    }
    return null;
  }
  
  /**
   * Update connection highlights for selected element
   */
  private updateConnectionHighlights(element: OverviewElement): void {
    this.interactionState.highlightedConnections.clear();
    
    for (const connection of this.connections) {
      if (connection.fromElementId === element.id || connection.toElementId === element.id) {
        this.interactionState.highlightedConnections.add(connection.id);
      }
    }
  }
  
  /**
   * Remove element from board
   */
  private removeElement(element: OverviewElement): void {
    const index = this.elements.indexOf(element);
    if (index >= 0) {
      this.elements.splice(index, 1);
      
      // Remove from cloud
      const cloud = this.cloudRegions.find(c => c.id === element.cloudType);
      if (cloud) {
        cloud.elements.delete(element.id);
      }
      
      // Remove connections
      this.connections = this.connections.filter(
        c => c.fromElementId !== element.id && c.toElementId !== element.id
      );
      
      if (this.interactionState.selectedElement === element) {
        this.interactionState.selectedElement = null;
      }
      
      this.needsRedraw = true;
    }
  }
  
     /**
    * Get current board state
    */
   public getState(): OverviewBoardState {
     const eventsCloud = this.cloudRegions.find(c => c.id === 'events');
     const charactersCloud = this.cloudRegions.find(c => c.id === 'characters');
     const placesCloud = this.cloudRegions.find(c => c.id === 'places');
     
     return {
       elements: new Map(this.elements.map(e => [e.id, e])),
       connections: new Map(this.connections.map(c => [c.id, c])),
       cloudRegions: new Map(this.cloudRegions.map(c => [c.id, c])),
       theme: this.theme,
       layout: {
         events: eventsCloud?.center || { x: 0, y: 0 },
         characters: charactersCloud?.center || { x: 0, y: 0 },
         places: placesCloud?.center || { x: 0, y: 0 },
         cloudRadius: eventsCloud?.radius || 120,
         cloudSpacing: 300
       },
      constraints: {
        minElementSize: 40,
        maxElementSize: 120,
        elementSpacing: 20,
        cloudPadding: 40,
        connectionCurveStrength: 50
      },
      interaction: this.interactionState,
      animation: {
        isAnimating: false,
        animationType: 'fadeIn',
        targetElementId: null,
        startTime: 0,
        duration: 300,
        progress: 0
      },
      needsRedraw: this.needsRedraw
    };
  }
  
  /**
   * Destroy the renderer
   */
  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
  
  // Event callbacks (for external integration)
  public onElementDoubleClick?: (element: OverviewElement) => void;
} 