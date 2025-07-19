import { Viewport } from './rendering/Viewport';
import { PostItNote } from './elements/PostItNote';
import { Connection, type ConnectionData } from './elements/Connection';
import { InputManager } from './interaction/InputManager';
import { BoardSerializer } from './persistence/BoardSerializer';
import { ToolPanel, type ToolPanelConfig } from './ui/ToolPanel';
import { NodeSearchModal } from './ui/NodeSearchModal';
import { OpenRouterClient } from '../OpenRouterClient';
import { createPromptExpansionService } from '../services/PromptExpansionService';
import * as state from '../state';
import type { IdeaBoardState, ElementData, Point, BoardElement } from './types/BoardTypes';
import type { DocumentNode } from '../DocumentNode';

export class IdeaBoard {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private viewport: Viewport;
  private elements: Map<string, BoardElement> = new Map();
  private connections: Map<string, Connection> = new Map();
  private inputManager: InputManager;
  private boardState: IdeaBoardState;
  private toolPanel: ToolPanel;
  
  // Interaction state
  private selectedElement: BoardElement | null = null;
  private editingElement: PostItNote | null = null;
  private draggedElement: BoardElement | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private resizingElement: PostItNote | null = null;
  private resizeHandle: 'se' | 'nw' | 'ne' | 'sw' | null = null;
  private isPanning: boolean = false;
  private panStart: Point = { x: 0, y: 0 };
  
  // Hierarchical dragging state
  private draggedDescendants: PostItNote[] = [];
  private descendantOffsets: Map<string, Point> = new Map();
  private dragStartPosition: Point = { x: 0, y: 0 };
  
  // Connection state
  private isConnecting: boolean = false;
  private connectionStart: { postIt: PostItNote; side: 'top' | 'right' | 'bottom' | 'left' } | null = null;
  private dragConnectionEnd: Point | null = null;
  
  // Rendering
  private animationFrameId: number | null = null;
  private needsRedraw: boolean = true;
  private disableZoomingWhileEditing: boolean = false;
  
  // Animation state for idea generation
  private ideaGenerationAnimation: {
    isActive: boolean;
    postItId: string | null;
    startTime: number;
  } = {
    isActive: false,
    postItId: null,
    startTime: 0
  };

  // Animation state for self-summarization
  private selfSummarizeAnimation: {
    isActive: boolean;
    postItId: string | null;
    startTime: number;
  } = {
    isActive: false,
    postItId: null,
    startTime: 0
  };

  // Animation state for deletion
  private deletionAnimation: {
    isActive: boolean;
    postItIds: string[];
    startTime: number;
    duration: number;
    onComplete: () => void;
  } = {
    isActive: false,
    postItIds: [],
    startTime: 0,
    duration: 500, // 500ms animation
    onComplete: () => {}
  };
  
  // Selected AI model purpose for operations
  private selectedModelPurpose: string = 'editor';

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

    // Create tool panel
    this.toolPanel = new ToolPanel(this, {
      onColorChange: (color: string) => {
        this.setSelectedPostItColor(color);
      },
      onSearchToggle: () => {
        // Search is handled within the ToolPanel
      },
      onAddPostIt: () => {
        this.createPostItAtCenter();
      },
      onAddNodeContent: () => {
        this.showNodeSearchModal();
      },
      onExportMarkdown: () => {
        this.exportAsMarkdown();
      },
      onClearAll: () => {
        this.clearAll();
      },
      onSummarize: () => {
        this.summarizeSelectedPostIt();
      },
      onExpand: () => {
        this.continueSelectedPostIt();
      },
      onGenerateIdeas: () => {
        this.generateIdeasForSelectedPostIt();
      },
      onModelChange: (modelPurpose: string) => {
        this.setSelectedModelPurpose(modelPurpose);
      }
    });

    // Attach tool panel to container
    this.toolPanel.attachTo(container);

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

      // Recreate connections from saved data
      this.connections.clear();
      if (this.boardState.connections) {
        for (const connectionData of this.boardState.connections) {
          const connection = new Connection(
            connectionData.fromPostItId,
            connectionData.fromSide,
            connectionData.toPostItId,
            connectionData.toSide
          );
          connection.deserialize(connectionData);
          this.connections.set(connection.id, connection);
        }
      }

      this.requestRedraw();
      console.log(`📂 Board initialized with ${this.elements.size} elements and ${this.connections.size} connections`);
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
    // Handle single clicks for selection, dragging, and connections
    this.inputManager.on('onMouseDown', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);
      
      if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
        // Middle click or Ctrl+click to pan
        this.isPanning = true;
        this.panStart = point;
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      // Check for connection dot clicks
      for (const element of this.elements.values()) {
        if (element instanceof PostItNote) {
          const connectionHit = element.hitTestConnectionDot(point, this.viewport);
          if (connectionHit) {
            // Start connection drag
            this.isConnecting = true;
            this.connectionStart = { postIt: element, side: connectionHit.side };
            this.dragConnectionEnd = point;
            this.canvas.style.cursor = 'crosshair';
            this.requestRedraw();
            return;
          }
        }
      }

      // Check for resize handles on selected elements FIRST (handles extend outside post-it bounds)
      for (const element of this.elements.values()) {
        if (element instanceof PostItNote && element.getSelected()) {
          const resizeHit = element.hitTestResize(point, this.viewport);
          if (resizeHit) {
            this.resizingElement = element;
            this.resizeHandle = resizeHit;
            this.canvas.style.cursor = this.getResizeCursor(resizeHit);
            return; // Important: return early to avoid setting up dragging
          }
        }
      }

      // Regular element hit testing
      let hitElement: BoardElement | null = null;
      
      // Test elements in reverse order (top to bottom)
      const elementsArray = Array.from(this.elements.values());
      for (let i = elementsArray.length - 1; i >= 0; i--) {
        const element = elementsArray[i];
        if (element && element.hitTest(worldPoint)) {
          hitElement = element;
          break;
        }
      }

      if (hitElement) {
        // Only set up dragging if we're not resizing
        this.selectElement(hitElement);
        this.draggedElement = hitElement;
        this.dragOffset = {
          x: worldPoint.x - hitElement.position.x,
          y: worldPoint.y - hitElement.position.y
        };
        this.canvas.style.cursor = 'grabbing';
        
        // Set up hierarchical dragging for post-its
        if (hitElement instanceof PostItNote) {
          this.setupHierarchicalDrag(hitElement);
        }
        
        // Bring the dragged element to front
        this.bringElementToFront(hitElement);
      } else {
        // Click on empty space - just clear selection
        this.selectElement(null);
      }
    });

    // Handle double-clicks for connection cutting, editing, and new post-it creation
    this.inputManager.on('onDoubleClick', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);
      
      // First check if double-click was on a connection dot
      for (const element of this.elements.values()) {
        if (element instanceof PostItNote) {
          const connectionHit = element.hitTestConnectionDot(point, this.viewport);
          if (connectionHit) {
            // Cut all connections from this dot
            this.removeConnectionsFromDot(element.id, connectionHit.side);
            return;
          }
        }
      }
      
      // Second check if double-click was inside a post-it (but not on connection dot)
      for (const element of this.elements.values()) {
        if (element instanceof PostItNote) {
          const hitResult = element.hitTest(worldPoint);
          if (hitResult) {
            // Start editing this post-it
            this.startEditing(element);
            return;
          }
        }
      }
      
      // If not on connection dot or inside post-it, create new post-it
      this.createNewPostIt(worldPoint);
    });

    this.inputManager.on('onMouseMove', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);

      // Handle connection dragging
      if (this.isConnecting) {
        this.dragConnectionEnd = point;
        this.requestRedraw();
        return;
      }

      // Handle panning
      if (this.isPanning) {
        const dx = point.x - this.panStart.x;
        const dy = point.y - this.panStart.y;
        this.viewport.pan(-dx / this.viewport.zoom, -dy / this.viewport.zoom);
        this.panStart = point;
        this.requestRedraw();
        return;
      }

      // Handle dragging
      if (this.draggedElement) {
        this.draggedElement.position.x = worldPoint.x - this.dragOffset.x;
        this.draggedElement.position.y = worldPoint.y - this.dragOffset.y;
        this.updateElementData(this.draggedElement);
        
        // Move descendants if this is a hierarchical drag
        if (this.draggedElement instanceof PostItNote && this.draggedDescendants.length > 0) {
          this.moveDescendantsWithParent(this.draggedElement);
        }
        
        this.requestRedraw();
        return;
      }

      // Handle resizing
      if (this.resizingElement && this.resizeHandle) {
        this.handleResize(worldPoint);
        return;
      }

      // Update cursor based on hover
      this.updateCursor(point, worldPoint);
    });

    this.inputManager.on('onMouseUp', (point, event) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);

      // Handle connection completion
      if (this.isConnecting && this.connectionStart) {
        // Check if we're dropping on a connection dot
        for (const element of this.elements.values()) {
          if (element instanceof PostItNote && element !== this.connectionStart.postIt) {
            const connectionHit = element.hitTestConnectionDot(point, this.viewport);
            if (connectionHit) {
              // Create connection
              this.createConnection(
                this.connectionStart.postIt.id,
                this.connectionStart.side,
                element.id,
                connectionHit.side
              );
              break;
            }
          }
        }
        
        // End connection mode
        this.isConnecting = false;
        this.connectionStart = null;
        this.dragConnectionEnd = null;
        this.canvas.style.cursor = 'default';
        this.requestRedraw();
        return;
      }

      // Handle panning end
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = 'default';
        return;
      }

      // Handle drag end
      if (this.draggedElement) {
        // Clean up hierarchical drag state
        this.cleanupHierarchicalDrag();
        
        this.draggedElement = null;
        this.canvas.style.cursor = 'default';
        this.autoSave();
        return;
      }

      // Handle resize end
      if (this.resizingElement) {
        this.resizingElement = null;
        this.resizeHandle = null;
        this.canvas.style.cursor = 'default';
        this.autoSave();
        return;
      }
    });

    this.inputManager.on('onWheel', (delta, point, event) => {
      // Disable zooming while editing
      if (this.disableZoomingWhileEditing) {
        console.log('🔒 Zooming disabled during edit mode');
        return;
      }
      
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      this.viewport.zoomAt(zoomFactor, point.x, point.y);
      this.requestRedraw();
    });

    this.inputManager.on('onKeyDown', (event) => {
      this.handleKeyDown(event);
    });

    // Handle right-click context menu
    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.handleContextMenu(event);
    });
  }

  /**
   * Handle left mouse click
   */
  private handleLeftClick(worldPoint: Point, event: MouseEvent): void {
    const hitElement = this.findElementAt(worldPoint);
    
    if (hitElement instanceof PostItNote) {
      // Check if clicking on a resize handle
      const resizeHandle = hitElement.hitTestResize(worldPoint, this.viewport);
      
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
   * Handle right-click context menu
   */
  private handleContextMenu(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const worldPoint = this.viewport.screenToWorld(screenPoint.x, screenPoint.y);
    
    // Find element at cursor position
    let hitElement: BoardElement | null = null;
    const elementsArray = Array.from(this.elements.values());
    for (let i = elementsArray.length - 1; i >= 0; i--) {
      const element = elementsArray[i];
      if (element && element.hitTest(worldPoint)) {
        hitElement = element;
        break;
      }
    }

    if (hitElement instanceof PostItNote) {
      this.selectElement(hitElement);
      this.showContextMenu(event, hitElement);
    }
  }

  /**
   * Show context menu for a post-it note
   */
  private showContextMenu(event: MouseEvent, postIt: PostItNote): void {
    const contextMenu = document.createElement('div');
    contextMenu.className = 'idea-board-context-menu';
    contextMenu.style.cssText = `
      position: fixed;
      left: ${event.clientX}px;
      top: ${event.clientY}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 10000;
      min-width: 120px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
    `;

    // Delete option
    const deleteOption = document.createElement('div');
    deleteOption.textContent = '🗑️ Delete';
    deleteOption.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
    `;
    deleteOption.addEventListener('mouseover', () => {
      deleteOption.style.backgroundColor = '#f5f5f5';
    });
    deleteOption.addEventListener('mouseout', () => {
      deleteOption.style.backgroundColor = 'transparent';
    });
    deleteOption.addEventListener('click', () => {
      this.deleteElement(postIt);
      this.removeContextMenu();
    });

    // Edit option
    const editOption = document.createElement('div');
    editOption.textContent = '✏️ Edit';
    editOption.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
    `;
    editOption.addEventListener('mouseover', () => {
      editOption.style.backgroundColor = '#f5f5f5';
    });
    editOption.addEventListener('mouseout', () => {
      editOption.style.backgroundColor = 'transparent';
    });
    editOption.addEventListener('click', () => {
      this.startEditing(postIt);
      this.removeContextMenu();
    });

    contextMenu.appendChild(deleteOption);
    contextMenu.appendChild(editOption);
    document.body.appendChild(contextMenu);

    // Remove context menu when clicking elsewhere
    const removeOnClick = (e: MouseEvent) => {
      if (!contextMenu.contains(e.target as Node)) {
        this.removeContextMenu();
        document.removeEventListener('click', removeOnClick);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', removeOnClick);
    }, 0);
  }

  /**
   * Remove context menu from DOM
   */
  private removeContextMenu(): void {
    const existingMenu = document.querySelector('.idea-board-context-menu');
    if (existingMenu) {
      existingMenu.remove();
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
   * Delete an element with optional descendant deletion
   */
  deleteElement(element: BoardElement): void {
    if (element instanceof PostItNote) {
      const descendants = this.findAllDescendants(element.id);
      
      if (descendants.length > 0) {
        // Show confirmation dialog for hierarchical deletion
        this.showDeletionConfirmationDialog(element, descendants);
        return;
      }
    }
    
    // Delete single element (no descendants)
    this.deleteSingleElement(element);
  }

  /**
   * Show deletion confirmation dialog with descendant options
   */
  private showDeletionConfirmationDialog(element: PostItNote, descendants: PostItNote[]): void {
    const confirmMessage = 
      `🗑️ Delete Post-it Note\n\n` +
      `This post-it has ${descendants.length} descendant(s) connected to it.\n\n` +
      `What would you like to do?\n\n` +
      `• OK: Delete this post-it AND all descendants (${descendants.length + 1} total)\n` +
      `• Cancel: Delete only this post-it (descendants will remain)`;

    const deleteWithDescendants = confirm(confirmMessage);
    
    if (deleteWithDescendants) {
      // Delete element and all descendants
      this.deleteElementWithDescendants(element, descendants);
    } else {
      // Delete only the selected element
      this.deleteSingleElement(element);
    }
  }

  /**
   * Delete a single element without descendants
   */
  private deleteSingleElement(element: BoardElement): void {
    if (element instanceof PostItNote) {
      // Start deletion animation
      this.startDeletionAnimation([element.id], () => {
        this.performActualDeletion([element]);
      });
    } else {
      // Non-PostIt elements don't get animation
      this.performActualDeletion([element]);
    }
  }

  /**
   * Delete an element and all its descendants
   */
  private deleteElementWithDescendants(element: PostItNote, descendants: PostItNote[]): void {
    const allElementsToDelete = [element, ...descendants];
    const allElementIds = allElementsToDelete.map(el => el.id);
    
    console.log(`🗑️ Deleting ${allElementsToDelete.length} elements (parent + descendants)`);
    
    // Start deletion animation for all elements
    this.startDeletionAnimation(allElementIds, () => {
      this.performActualDeletion(allElementsToDelete);
    });
  }

  /**
   * Perform the actual deletion of elements after animation completes
   */
  private performActualDeletion(elementsToDelete: BoardElement[]): void {
    console.log(`🗑️ Performing actual deletion of ${elementsToDelete.length} elements`);
    
    // Remove all connections involving any of these elements
    for (const elementToDelete of elementsToDelete) {
      this.removeAllConnectionsForElement(elementToDelete.id);
    }
    
    // Remove all elements from collections
    for (const elementToDelete of elementsToDelete) {
      this.elements.delete(elementToDelete.id);
      this.boardState.elements = this.boardState.elements.filter(e => e.id !== elementToDelete.id);
      
      // Clear selection/editing state for each element
      this.clearElementFromState(elementToDelete);
    }
    
    this.boardState.metadata.totalElements = this.elements.size;
    
    this.requestRedraw();
    this.autoSave();
    
    console.log(`🗑️ Successfully deleted ${elementsToDelete.length} elements`);
  }

  /**
   * Remove all connections involving a specific element
   */
  private removeAllConnectionsForElement(elementId: string): void {
    const connectionsToRemove: string[] = [];
    
    for (const connection of this.connections.values()) {
      if (connection.fromPostItId === elementId || connection.toPostItId === elementId) {
        connectionsToRemove.push(connection.id);
      }
    }
    
    for (const connectionId of connectionsToRemove) {
      this.connections.delete(connectionId);
    }
    
    if (connectionsToRemove.length > 0) {
      console.log(`🔗 Removed ${connectionsToRemove.length} connections for element: ${elementId}`);
    }
  }

  /**
   * Clear an element from selection and editing state
   */
  private clearElementFromState(element: BoardElement): void {
    if (this.selectedElement === element) {
      this.selectedElement = null;
    }
    if (this.editingElement === element) {
      this.editingElement = null;
      this.removeEditingInput();
    }
    if (this.draggedElement === element) {
      this.draggedElement = null;
      this.cleanupHierarchicalDrag();
    }
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
      this.disableZoomingWhileEditing = false; // Re-enable zooming
      console.log('🔓 Zooming re-enabled after edit mode');
    }
  }

  /**
   * Create temporary input for editing post-it content
   */
  private createEditingInput(postIt: PostItNote): void {
    // Remove any existing editing input first
    this.removeEditingInput();
    
    // Get the canvas container to position relative to it
    const canvasRect = this.canvas.getBoundingClientRect();
    const screenPos = this.viewport.worldToScreen(postIt.position.x, postIt.position.y);
    const screenWidth = postIt.size.width * this.viewport.zoom;
    const screenHeight = postIt.size.height * this.viewport.zoom;
    
    // Create textarea that covers the post-it exactly
    const textarea = document.createElement('textarea');
    textarea.id = 'postit-editor';
    textarea.value = postIt.content;
    
    // Position and size to match post-it exactly
    textarea.style.position = 'fixed'; // Use fixed positioning relative to viewport
    textarea.style.left = `${canvasRect.left + screenPos.x}px`;
    textarea.style.top = `${canvasRect.top + screenPos.y}px`;
    textarea.style.width = `${screenWidth}px`;
    textarea.style.height = `${screenHeight}px`;
    
    // Styling to match post-it appearance
    textarea.style.background = postIt.style.backgroundColor;
    textarea.style.color = postIt.style.textColor;
    textarea.style.border = '3px solid #4caf50'; // Prominent green border to show edit mode
    textarea.style.borderRadius = '8px';
    textarea.style.padding = '10px';
    textarea.style.margin = '0';
    textarea.style.boxSizing = 'border-box';
    
    // Font styling that matches zoom level
    const baseFontSize = postIt.style.fontSize;
    const zoomedFontSize = baseFontSize * this.viewport.zoom;
    textarea.style.fontSize = `${Math.max(12, zoomedFontSize)}px`; // Minimum 12px for readability
    textarea.style.fontFamily = 'Arial, sans-serif';
    textarea.style.lineHeight = '1.2';
    
    // Behavior settings
    textarea.style.resize = 'none'; // Prevent manual resizing
    textarea.style.overflowX = 'hidden'; // Hide horizontal scrollbar
    textarea.style.overflowY = 'auto'; // Show vertical scrollbar when needed
    textarea.style.outline = 'none'; // Remove focus outline (we have our own border)
    textarea.style.zIndex = '10001'; // Above everything else
    
    // Add smooth transition
    textarea.style.transition = 'none'; // No transitions to avoid visual glitches
    
    // Custom scrollbar styling for better integration
    textarea.style.scrollbarWidth = 'thin'; // Firefox
    textarea.style.scrollbarColor = '#ccc #f0f0f0'; // Firefox: thumb track
    
    // Add webkit scrollbar styling for Chrome/Safari
    const style = document.createElement('style');
    style.setAttribute('data-postit-scrollbar', 'true');
    style.textContent = `
      #postit-editor::-webkit-scrollbar {
        width: 8px;
      }
      #postit-editor::-webkit-scrollbar-track {
        background: #f0f0f0;
        border-radius: 4px;
      }
      #postit-editor::-webkit-scrollbar-thumb {
        background: #ccc;
        border-radius: 4px;
      }
      #postit-editor::-webkit-scrollbar-thumb:hover {
        background: #999;
      }
    `;
    document.head.appendChild(style);
    
    // Add to DOM and focus
    document.body.appendChild(textarea);
    
    // Focus and position cursor at end after a brief delay to ensure proper positioning
    setTimeout(() => {
      textarea.focus();
      // Position cursor at the end of the text instead of selecting all
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 10);
    
    // Disable zooming while editing
    this.disableZoomingWhileEditing = true;
    console.log('🔒 Zooming disabled during edit mode');
    
    // Event handlers
    const handleInput = () => {
      postIt.setContent(textarea.value);
      this.updateElementData(postIt);
      this.requestRedraw();
    };
    
    const handleBlur = () => {
      this.stopEditing();
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.stopEditing();
        return;
      }
      
      // Allow normal text editing keys
      if (e.key === 'Tab') {
        e.preventDefault(); // Prevent tab from moving focus
        // Insert tab character
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '\t' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        handleInput(); // Trigger update
      }
      
      // Stop propagation to prevent board shortcuts
      e.stopPropagation();
    };
    
    // Attach event listeners
    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('blur', handleBlur);
    textarea.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Remove the editing input
   */
  private removeEditingInput(): void {
    const input = document.getElementById('postit-editor');
    if (input) {
      input.remove();
    }
    
    // Also remove the custom scrollbar styles
    const existingStyle = document.querySelector('style[data-postit-scrollbar]');
    if (existingStyle) {
      existingStyle.remove();
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
      if (element && element.hitTest(worldPoint)) {
        return element;
      }
    }
    
    return null;
  }

  /**
   * Select an element or clear selection
   */
  private selectElement(element: BoardElement | null): void {
    // Deselect previously selected element
    if (this.selectedElement && this.selectedElement instanceof PostItNote) {
      this.selectedElement.setSelected(false);
    }

    // Select new element
    this.selectedElement = element;
    if (element && element instanceof PostItNote) {
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
    
    // Update elements
    this.boardState.elements = Array.from(this.elements.values()).map(element => element.serialize());
    
    // Update connections
    this.boardState.connections = Array.from(this.connections.values()).map(connection => connection.serialize());
    
    this.boardState.metadata.totalElements = this.elements.size;
    
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
        // Don't automatically set needsRedraw to false - let render() method handle it
        // This allows animations to keep the loop running
      }
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Create a connection between two post-it notes
   */
  private createConnection(
    fromPostItId: string,
    fromSide: 'top' | 'right' | 'bottom' | 'left',
    toPostItId: string,
    toSide: 'top' | 'right' | 'bottom' | 'left'
  ): void {
    // Prevent self-connections
    if (fromPostItId === toPostItId) {
      console.log('🚫 Cannot connect a post-it to itself');
      return;
    }

    // Check if any connection already exists between these two post-its (regardless of dots or direction)
    for (const connection of this.connections.values()) {
      const isAnyConnectionBetweenPostIts = 
        (connection.fromPostItId === fromPostItId && connection.toPostItId === toPostItId) ||
        (connection.fromPostItId === toPostItId && connection.toPostItId === fromPostItId);
        
      if (isAnyConnectionBetweenPostIts) {
        console.log('🚫 Connection already exists between these post-its');
        return;
      }
    }

    const connection = new Connection(fromPostItId, fromSide, toPostItId, toSide);
    this.connections.set(connection.id, connection);
    
    console.log(`🔗 Created connection from ${fromPostItId}:${fromSide} to ${toPostItId}:${toSide}`);
    this.autoSave();
  }

  /**
   * Render the board
   */
  private render(): void {
    if (!this.needsRedraw) {
      return;
    }

    // Clear the entire canvas completely
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0); // Reset any transforms
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.restore();

    // Draw background
    this.context.fillStyle = '#f5f5f5';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw connections first (behind post-its)
    for (const connection of this.connections.values()) {
      const fromPostIt = this.elements.get(connection.fromPostItId) as PostItNote;
      const toPostIt = this.elements.get(connection.toPostItId) as PostItNote;
      
      if (fromPostIt && toPostIt) {
        connection.render(this.context, this.viewport, fromPostIt, toPostIt);
      }
    }

    // Draw connection preview while dragging
    if (this.isConnecting && this.connectionStart && this.dragConnectionEnd) {
      this.renderConnectionPreview();
    }

    // Draw all elements (skip those being deleted)
    for (const element of this.elements.values()) {
      // Skip rendering elements that are being deleted (they will be rendered with scaling in deletion animation)
      if (this.deletionAnimation.isActive && this.deletionAnimation.postItIds.includes(element.id)) {
        continue;
      }
      element.render(this.context, this.viewport);
    }

    // Draw idea generation animation if active
    this.renderIdeaGenerationAnimation();
    
    // Draw self-summarization animation if active
    this.renderSelfSummarizeAnimation();

    // Draw deletion animation if active (render on top of everything)
    this.renderDeletionAnimation();

    // Keep redrawing if any animation is active
    const hasActiveAnimations = this.ideaGenerationAnimation.isActive || 
                               this.selfSummarizeAnimation.isActive ||
                               this.deletionAnimation.isActive ||
                               Array.from(this.connections.values()).some(conn => conn.isAnimating());
    
    if (hasActiveAnimations) {
      this.needsRedraw = true;
    } else {
      this.needsRedraw = false;
    }
  }

  /**
   * Render connection preview while dragging
   */
  private renderConnectionPreview(): void {
    if (!this.connectionStart || !this.dragConnectionEnd) return;

    const fromPostIt = this.connectionStart.postIt;
    const fromScreenPos = this.viewport.worldToScreen(fromPostIt.position.x, fromPostIt.position.y);
    const fromScreenWidth = fromPostIt.size.width * this.viewport.zoom;
    const fromScreenHeight = fromPostIt.size.height * this.viewport.zoom;

    const fromDots = fromPostIt.getConnectionDotPositions(fromScreenPos, fromScreenWidth, fromScreenHeight);
    const fromDot = fromDots.find(dot => dot.side === this.connectionStart!.side);

    if (!fromDot) return;

    this.context.save();
    this.context.strokeStyle = '#666666';
    this.context.lineWidth = 2;
    this.context.setLineDash([5, 5]); // Dashed line for preview
    this.context.lineCap = 'round';

    this.context.beginPath();
    this.context.moveTo(fromDot.x, fromDot.y);
    this.context.lineTo(this.dragConnectionEnd.x, this.dragConnectionEnd.y);
    this.context.stroke();

    this.context.restore();
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
   * Get cursor style for resize handle
   */
  private getResizeCursor(handle: 'se' | 'nw' | 'ne' | 'sw'): string {
    switch (handle) {
      case 'se':
      case 'nw':
        return 'nw-resize';
      case 'ne':
      case 'sw':
        return 'ne-resize';
      default:
        return 'default';
    }
  }

  /**
   * Handle resize dragging
   */
  private handleResize(worldPoint: Point): void {
    if (!this.resizingElement || !this.resizeHandle) {
      return;
    }

    const element = this.resizingElement;
    const handle = this.resizeHandle;

    // Calculate new size based on handle
    let newX = element.position.x;
    let newY = element.position.y;
    let newWidth = element.size.width;
    let newHeight = element.size.height;

    switch (handle) {
      case 'se': // Bottom-right
        newWidth = worldPoint.x - element.position.x;
        newHeight = worldPoint.y - element.position.y;
        break;
      case 'nw': // Top-left
        newWidth = element.position.x + element.size.width - worldPoint.x;
        newHeight = element.position.y + element.size.height - worldPoint.y;
        newX = worldPoint.x;
        newY = worldPoint.y;
        break;
      case 'ne': // Top-right
        newWidth = worldPoint.x - element.position.x;
        newHeight = element.position.y + element.size.height - worldPoint.y;
        newY = worldPoint.y;
        break;
      case 'sw': // Bottom-left
        newWidth = element.position.x + element.size.width - worldPoint.x;
        newHeight = worldPoint.y - element.position.y;
        newX = worldPoint.x;
        break;
    }

    // Apply minimum size constraints
    const minSize = 50;
    if (newWidth < minSize) {
      if (handle === 'nw' || handle === 'sw') {
        newX = element.position.x + element.size.width - minSize;
      }
      newWidth = minSize;
    }
    if (newHeight < minSize) {
      if (handle === 'nw' || handle === 'ne') {
        newY = element.position.y + element.size.height - minSize;
      }
      newHeight = minSize;
    }

    // Update element
    element.position.x = newX;
    element.position.y = newY;
    element.size.width = newWidth;
    element.size.height = newHeight;

    this.updateElementData(element);
    this.requestRedraw();
  }

  /**
   * Update cursor based on hover state
   */
  private updateCursor(screenPoint: Point, worldPoint: Point): void {
    let cursor = 'default';

    // Check for connection dots first
    for (const element of this.elements.values()) {
      if (element instanceof PostItNote) {
        const connectionHit = element.hitTestConnectionDot(screenPoint, this.viewport);
        if (connectionHit) {
          cursor = 'crosshair';
          break;
        }
      }
    }

    // Check for resize handles if no connection dot
    if (cursor === 'default') {
      for (const element of this.elements.values()) {
        if (element instanceof PostItNote && element.getSelected()) {
          const resizeHit = element.hitTestResize(screenPoint, this.viewport);
          if (resizeHit) {
            cursor = this.getResizeCursor(resizeHit);
            break;
          }
        }
      }
    }

    // Check for hover over elements
    if (cursor === 'default') {
      for (const element of this.elements.values()) {
        if (element.hitTest(worldPoint)) {
          cursor = 'pointer';
          break;
        }
      }
    }

    this.canvas.style.cursor = cursor;
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
      if (elementData) {
        this.boardState.elements.push(elementData);
      }
    }
    
    this.requestRedraw();
  }

  /**
   * Clear all post-it notes and connections from the board
   */
  private clearAll(): void {
    if (this.elements.size === 0 && this.connections.size === 0) {
      console.log('📝 Board is already empty.');
      return;
    }

    const totalItems = this.elements.size + this.connections.size;
    const userConfirmed = confirm(
      `⚠️ Warning: This will clear all content from the board.\n\n` +
      `This will remove:\n` +
      `• ${this.elements.size} post-it note(s)\n` +
      `• ${this.connections.size} connection(s)\n\n` +
      `This action cannot be undone. Do you want to continue?`
    );

    if (!userConfirmed) {
      console.log('📝 Clear all cancelled by user.');
      return;
    }

    console.log(`🗑️ Clearing ${totalItems} items from the board...`);

    // Stop any editing in progress
    if (this.editingElement) {
      this.stopEditing();
    }

    // Clear selections
    this.selectedElement = null;
    this.draggedElement = null;
    this.resizingElement = null;

    // Clear all elements and connections
    this.elements.clear();
    this.connections.clear();

    // Update board state
    this.boardState.elements = [];
    this.boardState.connections = [];
    this.boardState.metadata.totalElements = 0;
    this.boardState.lastModified = new Date();

    // Redraw the empty board
    this.requestRedraw();

    // Save the cleared state
    this.autoSave();

    console.log('✅ Board cleared successfully.');
  }

  /**
   * Set the selected AI model purpose for operations
   */
  private setSelectedModelPurpose(modelPurpose: string): void {
    this.selectedModelPurpose = modelPurpose;
    console.log(`🤖 IdeaBoard AI model purpose set to: ${modelPurpose}`);
  }

  /**
   * Generalized content generation for ideas and continuations
   */
  private async performContentGeneration(
    type: 'ideas' | 'continuations',
    promptKey: 'idea_generation_system' | 'expand_system',
    parseMethod: 'parseGeneratedIdeas' | 'parseContinuations',
    createMethod: 'createPostItsForIdeas' | 'createPostItsForContinuations'
  ): Promise<void> {
    if (!this.selectedElement || !(this.selectedElement instanceof PostItNote)) {
      console.log(`❌ No post-it note selected. Please select a post-it to generate ${type} for.`);
      return;
    }

    const selectedPostIt = this.selectedElement;
    const originalContent = selectedPostIt.content;
    
    if (!originalContent.trim()) {
      console.log(`❌ The selected post-it has no content to generate ${type} from.`);
      return;
    }

    const childPostIts = this.findOutgoingPostIts(selectedPostIt.id);
    let count: number;
    let targetPostIts: PostItNote[] = [];
    let isConnectedMode = false;

    if (childPostIts.length > 0) {
      // Connected mode: exact number to replace existing post-its
      isConnectedMode = true;
      count = childPostIts.length;
      
      const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(0, -1);
      const userConfirmed = confirm(
        `🔄 Generate ${typeCapitalized}: Connected Mode\n\n` +
        `The selected post-it has ${childPostIts.length} child post-it(s).\n` +
        `This will generate exactly ${childPostIts.length} ${type} and replace the content in all child post-its.\n\n` +
        'Do you want to continue and replace the existing content?'
      );
      
      if (!userConfirmed) {
        console.log(`🔄 ${typeCapitalized} generation cancelled by user.`);
        return;
      }
      
      targetPostIts = childPostIts;
      console.log(`🔄 Generating exactly ${count} ${type} for child post-its...`);
    } else {
      // Free mode: LLM decides number, create new post-its
      count = 0; // Will be determined by LLM response
      console.log(`🔄 Generating ${type} and creating new post-its below the selected one...`);
      
      // Start animation around bottom dot in free mode
      this.startIdeaGenerationAnimation(selectedPostIt.id);
    }

    // Store original content for error recovery
    const originalContents = new Map<string, string>();
    if (isConnectedMode) {
      for (const postIt of targetPostIts) {
        originalContents.set(postIt.id, postIt.content);
      }
    }

    try {
      // Get SettingsManager first - needed for prompts and OpenRouterClient
      const settingsManager = state.getSettingsManager();
      
      if (!settingsManager) {
        console.log('❌ Settings not available. Please configure your settings first.');
        return;
      }

      // Show working indicators if in connected mode
      if (isConnectedMode) {
        // Start connection animations to show data flow
        this.startOutgoingConnectionAnimations(selectedPostIt.id);
        
        const workingMessage = type === 'ideas' ? 
          `💡 Generating ideas...\n\nReceiving creative ideas from main post-it.` :
          `🔄 Continuing content...\n\nReceiving continuation from main post-it.`;
        
        for (const postIt of targetPostIts) {
          postIt.content = workingMessage;
          this.updateElementData(postIt);
        }
        this.requestRedraw();
      }

      // Get the configured prompt and use proper placeholder expansion
      const prompts = settingsManager.getPrompts();
      const expansionService = createPromptExpansionService(settingsManager);
      
      // Create context that matches the expected structure
      const promptContext = {
        node: {
          content: originalContent.trim(),
          title: `Post-it Content for ${type.charAt(0).toUpperCase() + type.slice(0, -1)}`,
          isLeaf: true
        },
        project: {
          language: settingsManager.getLanguage(),
          criteria: [] // Not needed for generation
        },
        custom: {
          [type === 'ideas' ? 'idea_count' : 'expand_count']: isConnectedMode ? count.toString() : 'some'
        }
      };
      
      const prompt = expansionService.expandPrompt(prompts[promptKey], promptContext);

      // Use OpenRouterClient to get content
      const client = OpenRouterClient.getInstance();
      client.setSettingsManager(settingsManager);
      const generatedContent = await client.chat(this.selectedModelPurpose, prompt);

      // Parse the content from the response
      const results = parseMethod === 'parseGeneratedIdeas' ? 
        this.parseGeneratedIdeas(generatedContent) : 
        this.parseContinuations(generatedContent, 0); // 0 means parse all found

      if (results.length === 0) {
        throw new Error(`No ${type} were generated by the AI`);
      }

      console.log(`🔄 Generated ${results.length} ${type} from AI response`);

      if (isConnectedMode) {
        // Connected mode: distribute content to existing post-its
        if (results.length !== count) {
          console.warn(`⚠️ Expected ${count} ${type} but got ${results.length}. Adjusting distribution.`);
        }

        for (let i = 0; i < targetPostIts.length; i++) {
          const postIt = targetPostIts[i];
          if (!postIt) continue;
          
          const result = results[i] || `${type.charAt(0).toUpperCase() + type.slice(0, -1)} ${i + 1}: (Content generation incomplete)`;
          postIt.content = result.trim();
          this.updateElementData(postIt);
        }
      } else {
        // Free mode: create new post-its arranged below the selected one
        if (createMethod === 'createPostItsForIdeas') {
          this.createPostItsForIdeas(selectedPostIt, results);
        } else {
          this.createPostItsForContinuations(selectedPostIt, results);
        }
      }

      // Stop animation if it was running
      this.stopIdeaGenerationAnimation();
      
      // Stop connection animations if in connected mode
      if (isConnectedMode) {
        this.stopConnectionAnimations(selectedPostIt.id);
      }
      
      this.requestRedraw();
      this.autoSave();

      console.log(`✅ Successfully generated ${results.length} ${type} ${isConnectedMode ? 'for child post-its' : 'as new post-its'}.`);
      
    } catch (error) {
      console.error(`❌ Failed to generate ${type}:`, error);
      console.log(`❌ ${type.charAt(0).toUpperCase() + type.slice(0, -1)} generation failed. Please check your API key and try again.`);
      
      // Stop animations on error
      this.stopIdeaGenerationAnimation();
      if (isConnectedMode) {
        this.stopConnectionAnimations(selectedPostIt.id);
      }
      
      // Restore original content on error (only in connected mode)
      if (isConnectedMode) {
        for (const postIt of targetPostIts) {
          const originalContentForPostIt = originalContents.get(postIt.id);
          if (originalContentForPostIt !== undefined) {
            postIt.content = originalContentForPostIt;
            this.updateElementData(postIt);
          }
        }
      }
      this.requestRedraw();
      this.autoSave();
    }
  }

  /**
   * Generate creative ideas for the currently selected post-it note
   */
  private async generateIdeasForSelectedPostIt(): Promise<void> {
    await this.performContentGeneration('ideas', 'idea_generation_system', 'parseGeneratedIdeas', 'createPostItsForIdeas');
  }

  /**
   * Parse generated ideas using precise idea markers
   */
  private parseGeneratedIdeas(content: string): string[] {
    const ideas: string[] = [];
    
    // Use regex to find content between idea markers
    const ideaRegex = /=== IDEA START ===([\s\S]*?)=== IDEA END ===/g;
    let match;
    
    while ((match = ideaRegex.exec(content)) !== null) {
      const ideaContent = match[1]?.trim();
      if (ideaContent) {
        ideas.push(ideaContent);
      }
    }
    
    console.log(`📝 Parsed ${ideas.length} ideas from AI response`);
    
    // If no ideas found with markers, try fallback parsing
    if (ideas.length === 0) {
      console.warn('⚠️ No ideas found with expected markers. Using fallback parsing.');
      // Fallback: split by double newlines and take non-empty parts
      const fallbackIdeas = content
        .split(/\n\s*\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 5); // Limit to max 5 ideas in fallback mode
      
      return fallbackIdeas.length > 0 ? fallbackIdeas : ['Generated idea content unavailable'];
    }
    
    return ideas;
  }

  /**
   * Create new post-its for ideas arranged below the triggering post-it
   */
  private createPostItsForIdeas(triggerPostIt: PostItNote, ideas: string[]): void {
    const gap = 20; // Gap between post-its
    const verticalOffset = 200; // Distance below the trigger post-it
    
    // Calculate spacing based on post-it width + gap
    const postItWidth = triggerPostIt.size.width;
    const spacing = postItWidth + gap;
    
    // Calculate starting position centered below the trigger post-it
    const totalWidth = Math.max(1, ideas.length - 1) * spacing;
    const startX = triggerPostIt.position.x + (triggerPostIt.size.width / 2) - (totalWidth / 2);
    const startY = triggerPostIt.position.y + triggerPostIt.size.height + verticalOffset;

    const parentColor = triggerPostIt.style.backgroundColor;
    const newPostIts: PostItNote[] = [];

    // Create post-its for each idea
    for (let i = 0; i < ideas.length; i++) {
      const x = startX + (i * spacing);
      const y = startY;
      
      const newPostIt = this.createNewPostIt({ x, y }, ideas[i]!.trim());
      newPostIt.setColor(parentColor);
      
      // Set the same size as the trigger post-it
      newPostIt.size = { ...triggerPostIt.size };
      
      this.updateElementData(newPostIt);
      newPostIts.push(newPostIt);
    }

    // Connect all new post-its to the trigger post-it
    // New post-its connect their top dot to trigger post-it's bottom dot
    for (const newPostIt of newPostIts) {
      this.createConnection(
        triggerPostIt.id,
        'bottom',
        newPostIt.id,
        'top'
      );
    }

    console.log(`📝 Created ${newPostIts.length} new post-its arranged below the trigger post-it`);
  }

  /**
   * Create new post-its for continuations arranged below the triggering post-it
   */
  private createPostItsForContinuations(triggerPostIt: PostItNote, continuations: string[]): void {
    const gap = 20; // Gap between post-its
    const verticalOffset = 200; // Distance below the trigger post-it
    
    // Calculate spacing based on post-it width + gap
    const postItWidth = triggerPostIt.size.width;
    const spacing = postItWidth + gap;
    
    // Calculate starting position centered below the trigger post-it
    const totalWidth = Math.max(1, continuations.length - 1) * spacing;
    const startX = triggerPostIt.position.x + (triggerPostIt.size.width / 2) - (totalWidth / 2);
    const startY = triggerPostIt.position.y + triggerPostIt.size.height + verticalOffset;

    const parentColor = triggerPostIt.style.backgroundColor;
    const newPostIts: PostItNote[] = [];

    // Create post-its for each continuation
    for (let i = 0; i < continuations.length; i++) {
      const x = startX + (i * spacing);
      const y = startY;
      
      const newPostIt = this.createNewPostIt({ x, y }, continuations[i]!.trim());
      newPostIt.setColor(parentColor);
      
      // Set the same size as the trigger post-it
      newPostIt.size = { ...triggerPostIt.size };
      
      this.updateElementData(newPostIt);
      newPostIts.push(newPostIt);
    }

    // Connect all new post-its to the trigger post-it
    // New post-its connect their top dot to trigger post-it's bottom dot
    for (const newPostIt of newPostIts) {
      this.createConnection(
        triggerPostIt.id,
        'bottom',
        newPostIt.id,
        'top'
      );
    }

    console.log(`📝 Created ${newPostIts.length} new continuation post-its arranged below the trigger post-it`);
  }

  /**
   * Start the idea generation animation for a specific post-it
   */
  private startIdeaGenerationAnimation(postItId: string): void {
    this.ideaGenerationAnimation = {
      isActive: true,
      postItId: postItId,
      startTime: Date.now()
    };
    this.requestRedraw();
  }

  /**
   * Stop the idea generation animation
   */
  private stopIdeaGenerationAnimation(): void {
    this.ideaGenerationAnimation = {
      isActive: false,
      postItId: null,
      startTime: 0
    };
    this.requestRedraw();
  }

  /**
   * Start the self-summarization animation
   */
  private startSelfSummarizeAnimation(postItId: string): void {
    this.selfSummarizeAnimation = {
      isActive: true,
      postItId: postItId,
      startTime: Date.now()
    };
    this.requestRedraw();
  }

  /**
   * Stop the self-summarization animation
   */
  private stopSelfSummarizeAnimation(): void {
    this.selfSummarizeAnimation = {
      isActive: false,
      postItId: null,
      startTime: 0
    };
    this.requestRedraw();
  }

  /**
   * Start deletion animation for one or more post-its
   */
  private startDeletionAnimation(postItIds: string[], onComplete: () => void): void {
    this.deletionAnimation = {
      isActive: true,
      postItIds: [...postItIds],
      startTime: Date.now(),
      duration: 500,
      onComplete: onComplete
    };
    this.requestRedraw();
  }

  /**
   * Stop the deletion animation
   */
  private stopDeletionAnimation(): void {
    this.deletionAnimation = {
      isActive: false,
      postItIds: [],
      startTime: 0,
      duration: 500,
      onComplete: () => {}
    };
    this.requestRedraw();
  }

  /**
   * Render the idea generation animation around the bottom dot of the active post-it
   */
  private renderIdeaGenerationAnimation(): void {
    if (!this.ideaGenerationAnimation.isActive || !this.ideaGenerationAnimation.postItId) {
      return;
    }

    const postIt = this.elements.get(this.ideaGenerationAnimation.postItId) as PostItNote;
    if (!postIt) {
      this.stopIdeaGenerationAnimation();
      return;
    }

    const screenPos = this.viewport.worldToScreen(postIt.position.x, postIt.position.y);
    const screenWidth = postIt.size.width * this.viewport.zoom;
    const screenHeight = postIt.size.height * this.viewport.zoom;

    // Calculate bottom dot position
    const bottomDotX = screenPos.x + screenWidth / 2;
    const bottomDotY = screenPos.y + screenHeight;

    // Animation timing
    const elapsed = Date.now() - this.ideaGenerationAnimation.startTime;
    const animationSpeed = 0.003; // Rotation speed
    const pulseSpeed = 0.006; // Pulsing speed
    
    // Calculate animation values
    const rotation = elapsed * animationSpeed;
    const pulse = Math.sin(elapsed * pulseSpeed) * 0.3 + 0.7; // 0.4 to 1.0
    
    this.context.save();
    
    // Draw rotating ring around bottom dot
    this.context.translate(bottomDotX, bottomDotY);
    this.context.rotate(rotation);
    
    // Outer pulsing ring
    this.context.strokeStyle = '#4CAF50';
    this.context.lineWidth = 3 * pulse;
    this.context.globalAlpha = 0.6 * pulse;
    this.context.beginPath();
    this.context.arc(0, 0, 25 * this.viewport.zoom * pulse, 0, Math.PI * 2);
    this.context.stroke();
    
    // Inner spinning dots
    this.context.globalAlpha = 0.8;
    const dotCount = 6;
    const dotRadius = 18 * this.viewport.zoom;
    
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const dotX = Math.cos(angle) * dotRadius;
      const dotY = Math.sin(angle) * dotRadius;
      
      this.context.fillStyle = '#4CAF50';
      this.context.globalAlpha = 0.8 - (i / dotCount) * 0.3; // Fade effect
      this.context.beginPath();
      this.context.arc(dotX, dotY, 3 * this.viewport.zoom, 0, Math.PI * 2);
      this.context.fill();
    }
    
    // Central bright dot
    this.context.fillStyle = '#4CAF50';
    this.context.globalAlpha = pulse;
    this.context.beginPath();
    this.context.arc(0, 0, 4 * this.viewport.zoom, 0, Math.PI * 2);
    this.context.fill();
    
    this.context.restore();
  }

  /**
   * Render the self-summarization animation in the center of the active post-it
   */
  private renderSelfSummarizeAnimation(): void {
    if (!this.selfSummarizeAnimation.isActive || !this.selfSummarizeAnimation.postItId) {
      return;
    }

    const postIt = this.elements.get(this.selfSummarizeAnimation.postItId) as PostItNote;
    if (!postIt) {
      this.stopSelfSummarizeAnimation();
      return;
    }

    const screenPos = this.viewport.worldToScreen(postIt.position.x, postIt.position.y);
    const screenWidth = postIt.size.width * this.viewport.zoom;
    const screenHeight = postIt.size.height * this.viewport.zoom;

    // Calculate center position
    const centerX = screenPos.x + screenWidth / 2;
    const centerY = screenPos.y + screenHeight / 2;

    const elapsed = Date.now() - this.selfSummarizeAnimation.startTime;
    const rotationSpeed = 0.003; // radians per millisecond
    const rotation = elapsed * rotationSpeed;
    const pulseSpeed = 0.005; // Pulsing speed
    const pulse = Math.sin(elapsed * pulseSpeed) * 0.3 + 0.7; // 0.4 to 1.0

    this.context.save();
    this.context.translate(centerX, centerY);
    this.context.rotate(rotation);

    // Draw spinning brain/processing animation
    this.context.fillStyle = 'rgba(128, 90, 213, 0.8)'; // Purple color for brain processing
    this.context.strokeStyle = 'rgba(128, 90, 213, 1)';
    this.context.lineWidth = 2;

    // Draw central pulsing circle
    this.context.globalAlpha = pulse;
    this.context.beginPath();
    this.context.arc(0, 0, 12 * this.viewport.zoom * pulse, 0, Math.PI * 2);
    this.context.fill();

    // Draw rotating spokes (brain activity)
    this.context.globalAlpha = 0.8;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.context.beginPath();
      this.context.moveTo(Math.cos(angle) * 8 * this.viewport.zoom, Math.sin(angle) * 8 * this.viewport.zoom);
      this.context.lineTo(Math.cos(angle) * 18 * this.viewport.zoom, Math.sin(angle) * 18 * this.viewport.zoom);
      this.context.stroke();
    }

    // Draw outer pulsing ring
    this.context.globalAlpha = 0.5 * pulse;
    this.context.strokeStyle = 'rgba(128, 90, 213, 0.8)';
    this.context.lineWidth = 2 * pulse;
    this.context.beginPath();
    this.context.arc(0, 0, 22 * this.viewport.zoom * pulse, 0, Math.PI * 2);
    this.context.stroke();

    this.context.restore();
  }

  /**
   * Render the deletion animation with shrinking effect
   */
  private renderDeletionAnimation(): void {
    if (!this.deletionAnimation.isActive) {
      return;
    }

    const elapsed = Date.now() - this.deletionAnimation.startTime;
    const progress = Math.min(elapsed / this.deletionAnimation.duration, 1);
    
    // Check if animation is complete
    if (progress >= 1) {
      // Complete the deletion
      this.deletionAnimation.onComplete();
      this.stopDeletionAnimation();
      return;
    }

    // Calculate scale factor (1 to 0)
    const scale = 1 - progress;
    
    this.context.save();
    
    for (const postItId of this.deletionAnimation.postItIds) {
      const postIt = this.elements.get(postItId) as PostItNote;
      if (!postIt) continue;

      const screenPos = this.viewport.worldToScreen(postIt.position.x, postIt.position.y);
      const screenWidth = postIt.size.width * this.viewport.zoom;
      const screenHeight = postIt.size.height * this.viewport.zoom;

      // Calculate center position
      const centerX = screenPos.x + screenWidth / 2;
      const centerY = screenPos.y + screenHeight / 2;

      this.context.save();
      this.context.translate(centerX, centerY);
      this.context.scale(scale, scale);
      this.context.translate(-centerX, -centerY);

      // Render the post-it with scaling
      postIt.render(this.context, this.viewport);

      this.context.restore();
    }
    
    this.context.restore();
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

  /**
   * Get all post-it notes
   */
  getAllPostIts(): PostItNote[] {
    return Array.from(this.elements.values()).filter(
      (element): element is PostItNote => element instanceof PostItNote
    );
  }

  /**
   * Focus the viewport on a specific post-it note
   */
  focusOnPostIt(postItId: string): void {
    const postIt = this.elements.get(postItId);
    if (postIt instanceof PostItNote) {
      // Center the viewport on the post-it
      const centerX = postIt.position.x + postIt.size.width / 2;
      const centerY = postIt.position.y + postIt.size.height / 2;
      
      // Pan the viewport to center the post-it
      this.viewport.x = centerX - this.viewport.width / 2;
      this.viewport.y = centerY - this.viewport.height / 2;
      
      // Select the post-it
      this.selectElement(postIt);
      this.requestRedraw();
    }
  }

  /**
   * Set the color of the selected post-it note
   */
  private setSelectedPostItColor(color: string): void {
    if (this.selectedElement instanceof PostItNote) {
      this.selectedElement.setColor(color);
      this.updateElementData(this.selectedElement);
      this.requestRedraw();
      this.autoSave();
    }
  }

  /**
   * Create a new post-it note at the center of the viewport
   */
  private createPostItAtCenter(): void {
    const centerX = this.viewport.x + this.viewport.width / (2 * this.viewport.zoom);
    const centerY = this.viewport.y + this.viewport.height / (2 * this.viewport.zoom);
    const postIt = this.createNewPostIt({ x: centerX, y: centerY });
    
    // Apply the currently selected color from the tool panel
    const currentColor = this.toolPanel.getCurrentColor();
    postIt.setColor(currentColor);
    this.updateElementData(postIt);
    this.autoSave();
  }

  /**
   * Remove all connections from a specific dot
   */
  private removeConnectionsFromDot(dotId: string, side: 'top' | 'right' | 'bottom' | 'left'): void {
    const connectionsToRemove: string[] = [];
    for (const connection of this.connections.values()) {
      if (connection.fromPostItId === dotId && connection.fromSide === side) {
        connectionsToRemove.push(connection.id);
      }
      if (connection.toPostItId === dotId && connection.toSide === side) {
        connectionsToRemove.push(connection.id);
      }
    }

    for (const connectionId of connectionsToRemove) {
      this.connections.delete(connectionId);
    }
    this.requestRedraw();
    this.autoSave();
    console.log(`🔗 Removed all connections from dot: ${dotId} on side: ${side}`);
  }

  /**
   * Summarize the content of the currently selected post-it note using all parent post-its (incoming connections)
   */
  private async summarizeSelectedPostIt(): Promise<void> {
    if (!this.selectedElement || !(this.selectedElement instanceof PostItNote)) {
      console.log('❌ No post-it note selected. Please select a post-it to summarize.');
      return;
    }

    const selectedPostIt = this.selectedElement;
    let originalContent = selectedPostIt.content; // Store original content for error recovery
    
    try {
      // Get SettingsManager first - needed for prompts and OpenRouterClient
      const settingsManager = state.getSettingsManager();
      
      if (!settingsManager) {
        console.log('❌ Settings not available. Please configure your settings first.');
        return;
      }

          // Find all post-its that have incoming connections to the selected one
    const parentPostIts = this.findIncomingPostIts(selectedPostIt.id);
    
    // Check if we should do self-summarization
    if (parentPostIts.length === 0) {
      if (!originalContent.trim()) {
        console.log('❌ No parent post-its found and no content to self-summarize. Please add content or connect parent post-its.');
        return;
      }
      
      // Self-summarization mode
      console.log('🧠 Self-summarizing post-it content...');
      await this.performSelfSummarization(selectedPostIt, originalContent, settingsManager);
      return;
    }

      // Check if the triggering post-it already has content that will be overwritten
      if (selectedPostIt.content.trim()) {
        const userConfirmed = confirm(
          '⚠️ Warning: This post-it already contains content.\n\n' +
          'Summarizing will replace the existing content with a summary of the connected post-its.\n\n' +
          'Do you want to continue and replace the existing content?'
        );
        
        if (!userConfirmed) {
          console.log('📝 Summarization cancelled by user to preserve existing content.');
          return;
        }
        
        console.log('✅ User confirmed to proceed with summarization, replacing existing content.');
      }

      // Concatenate only the parent post-its (exclude the triggering one)
      let combinedText = '';
      
      for (const postIt of parentPostIts) {
        if (postIt.content.trim()) {
          combinedText += postIt.content.trim() + '\n\n';
        }
      }

      if (!combinedText.trim()) {
        console.log('❌ No content found in the parent post-its to summarize. The parent post-its appear to be empty.');
        return;
      }

      console.log(`🧠 Summarizing content from ${parentPostIts.length} parent post-its...`);

      // Start connection animations to show data flow
      this.startIncomingConnectionAnimations(selectedPostIt.id);

      // Show working indicator in the selected post-it
      selectedPostIt.content = `🧠 Summarizing ${parentPostIts.length} parent post-its...\n\nPlease wait while AI processes the content.`;
      this.updateElementData(selectedPostIt);
      this.requestRedraw();

      // Get the configured summarize prompt and use proper placeholder expansion
      const prompts = settingsManager.getPrompts();
      const expansionService = createPromptExpansionService(settingsManager);
      
      // Create context that matches the expected structure for summarize_system prompt
      // The prompt expects {{content}} and {{language}} placeholders
      const promptContext = {
        node: {
          content: combinedText.trim(),
          title: 'Combined Post-it Content',
          isLeaf: true
        },
        project: {
          language: settingsManager.getLanguage(),
          criteria: [] // Not needed for summarization
        }
      };
      
      const summarizePrompt = expansionService.expandPrompt(prompts.summarize_system, promptContext);

      // Use OpenRouterClient to get summary
      const client = OpenRouterClient.getInstance();
      client.setSettingsManager(settingsManager);
      const summary = await client.chat(this.selectedModelPurpose, summarizePrompt);

      // Update the selected post-it with the summary
      selectedPostIt.content = summary.trim();
      this.updateElementData(selectedPostIt);
      this.requestRedraw();
      this.autoSave();

      // Stop connection animations
      this.stopConnectionAnimations(selectedPostIt.id);

      console.log(`✅ Successfully summarized content from ${parentPostIts.length} parent post-its into the selected post-it.`);
      
    } catch (error) {
      console.error('❌ Failed to summarize post-it content:', error);
      console.log('❌ Summarization failed. Please check your API key and try again.');
      
      // Stop connection animations on error
      this.stopConnectionAnimations(selectedPostIt.id);
      
      // Restore original content on error
      selectedPostIt.content = originalContent;
      this.updateElementData(selectedPostIt);
      this.requestRedraw();
      this.autoSave();
    }
  }

  /**
   * Find all post-it notes connected to the given post-it ID (bidirectional)
   * Used for markdown export and visualization where all connections are relevant
   */
  private findConnectedPostIts(postItId: string): PostItNote[] {
    const connectedPostItIds = new Set<string>();
    
    // Find all connections involving this post-it
    for (const connection of this.connections.values()) {
      if (connection.fromPostItId === postItId) {
        connectedPostItIds.add(connection.toPostItId);
      } else if (connection.toPostItId === postItId) {
        connectedPostItIds.add(connection.fromPostItId);
      }
    }

    // Get the actual PostItNote objects
    const connectedPostIts: PostItNote[] = [];
    for (const id of connectedPostItIds) {
      const element = this.elements.get(id);
      if (element instanceof PostItNote) {
        connectedPostIts.push(element);
      }
    }

    return connectedPostIts;
  }

  /**
   * Perform self-summarization on a post-it's own content
   */
  private async performSelfSummarization(postIt: PostItNote, originalContent: string, settingsManager: any): Promise<void> {
    try {
      // Start center animation to show processing
      this.startSelfSummarizeAnimation(postIt.id);

      // Show working indicator
      postIt.content = `🧠 Self-summarizing...\n\nProcessing and condensing the content.`;
      this.updateElementData(postIt);
      this.requestRedraw();

      // Get the configured summarize prompt and use proper placeholder expansion
      const prompts = settingsManager.getPrompts();
      const expansionService = createPromptExpansionService(settingsManager);
      
      // Create context that matches the expected structure for summarize_system prompt
      const promptContext = {
        node: {
          content: originalContent.trim(),
          title: 'Self-summarization Content',
          isLeaf: true
        },
        project: {
          language: settingsManager.getLanguage(),
          criteria: [] // Not needed for summarization
        }
      };
      
      const summarizePrompt = expansionService.expandPrompt(prompts.summarize_system, promptContext);

      // Use OpenRouterClient to get summary
      const client = OpenRouterClient.getInstance();
      client.setSettingsManager(settingsManager);
      const summary = await client.chat(this.selectedModelPurpose, summarizePrompt);

      // Update the post-it with the summary
      postIt.content = summary.trim();
      this.updateElementData(postIt);
      this.requestRedraw();
      this.autoSave();

      // Stop center animation
      this.stopSelfSummarizeAnimation();

      console.log('✅ Successfully self-summarized post-it content.');
    } catch (error) {
      console.error('❌ Failed to self-summarize post-it content:', error);
      console.log('❌ Self-summarization failed. Please check your API key and try again.');
      
      // Stop center animation on error
      this.stopSelfSummarizeAnimation();
      
      // Restore original content on error
      postIt.content = originalContent;
      this.updateElementData(postIt);
      this.requestRedraw();
      this.autoSave();
    }
  }

  /**
   * Find post-it notes that are children of the given post-it (outgoing connections)
   * Used for expand and idea generation functionality
   */
  private findOutgoingPostIts(postItId: string): PostItNote[] {
    const outgoingPostItIds = new Set<string>();
    
    // Find connections where this post-it is the source (fromPostItId)
    for (const connection of this.connections.values()) {
      if (connection.fromPostItId === postItId) {
        outgoingPostItIds.add(connection.toPostItId);
      }
    }

    // Get the actual PostItNote objects
    const outgoingPostIts: PostItNote[] = [];
    for (const id of outgoingPostItIds) {
      const element = this.elements.get(id);
      if (element instanceof PostItNote) {
        outgoingPostIts.push(element);
      }
    }

    return outgoingPostIts;
  }

  /**
   * Find post-it notes that are parents of the given post-it (incoming connections)
   * Used for summarize functionality
   */
  private findIncomingPostIts(postItId: string): PostItNote[] {
    const incomingPostItIds = new Set<string>();
    
    // Find connections where this post-it is the target (toPostItId)
    for (const connection of this.connections.values()) {
      if (connection.toPostItId === postItId) {
        incomingPostItIds.add(connection.fromPostItId);
      }
    }

    // Get the actual PostItNote objects
    const incomingPostIts: PostItNote[] = [];
    for (const id of incomingPostItIds) {
      const element = this.elements.get(id);
      if (element instanceof PostItNote) {
        incomingPostIts.push(element);
      }
    }

    return incomingPostIts;
  }

  /**
   * Start connection animations for outgoing connections from a post-it
   */
  private startOutgoingConnectionAnimations(postItId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.fromPostItId === postItId) {
        connection.startAnimation();
      }
    }
    this.requestRedraw();
  }

  /**
   * Start connection animations for incoming connections to a post-it
   */
  private startIncomingConnectionAnimations(postItId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.toPostItId === postItId) {
        connection.startAnimation();
      }
    }
    this.requestRedraw();
  }

  /**
   * Stop all connection animations for a specific post-it
   */
  private stopConnectionAnimations(postItId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.fromPostItId === postItId || connection.toPostItId === postItId) {
        connection.stopAnimation();
      }
    }
    this.requestRedraw();
  }

  /**
   * Stop all connection animations
   */
  private stopAllConnectionAnimations(): void {
    for (const connection of this.connections.values()) {
      connection.stopAnimation();
    }
    this.requestRedraw();
  }

  /**
   * Find all descendant post-its recursively (following outgoing connections)
   */
  private findAllDescendants(postItId: string, visited: Set<string> = new Set()): PostItNote[] {
    // Prevent infinite loops in case of circular connections
    if (visited.has(postItId)) {
      return [];
    }
    visited.add(postItId);

    const descendants: PostItNote[] = [];
    const directChildren = this.findOutgoingPostIts(postItId);
    
    for (const child of directChildren) {
      descendants.push(child);
      // Recursively find descendants of this child
      const childDescendants = this.findAllDescendants(child.id, visited);
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  /**
   * Set up hierarchical dragging for a post-it and its descendants
   */
  private setupHierarchicalDrag(postIt: PostItNote): void {
    // Store the starting position of the parent
    this.dragStartPosition = { x: postIt.position.x, y: postIt.position.y };
    
    // Find all descendants
    this.draggedDescendants = this.findAllDescendants(postIt.id);
    
    // Clear previous offsets
    this.descendantOffsets.clear();
    
    // Store relative positions of descendants
    for (const descendant of this.draggedDescendants) {
      const offset = {
        x: descendant.position.x - postIt.position.x,
        y: descendant.position.y - postIt.position.y
      };
      this.descendantOffsets.set(descendant.id, offset);
    }
    
    console.log(`🔗 Hierarchical drag: Moving ${this.draggedDescendants.length} descendants with parent`);
  }

  /**
   * Move all descendant post-its to maintain their relative positions to the parent
   */
  private moveDescendantsWithParent(parentPostIt: PostItNote): void {
    for (const descendant of this.draggedDescendants) {
      const offset = this.descendantOffsets.get(descendant.id);
      if (offset) {
        // Update descendant position based on parent's new position + stored offset
        descendant.position.x = parentPostIt.position.x + offset.x;
        descendant.position.y = parentPostIt.position.y + offset.y;
        this.updateElementData(descendant);
      }
    }
  }

  /**
   * Clean up hierarchical drag state after drag operation completes
   */
  private cleanupHierarchicalDrag(): void {
    this.draggedDescendants = [];
    this.descendantOffsets.clear();
    this.dragStartPosition = { x: 0, y: 0 };
  }

  /**
   * Continue the content of the currently selected post-it note
   */
  private async continueSelectedPostIt(): Promise<void> {
    await this.performContentGeneration('continuations', 'expand_system', 'parseContinuations', 'createPostItsForContinuations');
  }

  /**
   * Parse continued content into continuations using precise continuation markers
   */
  private parseContinuations(content: string, expectedCount: number): string[] {
    const continuations: string[] = [];
    
    // Use regex to find content between continuation markers
    const continuationRegex = /=== CONTINUATION START ===([\s\S]*?)=== CONTINUATION END ===/g;
    let match;
    
    while ((match = continuationRegex.exec(content)) !== null) {
      const continuationContent = match[1]?.trim();
      if (continuationContent) {
        continuations.push(continuationContent);
      }
    }
    
    console.log(`📝 Parsed ${continuations.length} continuations from AI response (expected ${expectedCount === 0 ? 'any number' : expectedCount})`);
    
    // If expectedCount is 0, it means "free mode" - return all found continuations
    if (expectedCount === 0) {
      if (continuations.length === 0) {
        console.warn('⚠️ No continuations found with expected markers. Using fallback parsing.');
        // Fallback: split by double newlines and take non-empty parts
        const fallbackContinuations = content
          .split(/\n\s*\n/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        return fallbackContinuations.length > 0 ? fallbackContinuations : ['Generated continuation content unavailable'];
      }
      return continuations;
    }
    
    // If we don't have the expected number of continuations, handle the mismatch
    if (continuations.length === 0) {
      console.warn('⚠️ No continuations found with expected markers. Using fallback parsing.');
      // Fallback: split by double newlines and take first N non-empty parts
      const fallbackContinuations = content
        .split(/\n\s*\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, expectedCount);
      
      // Pad if not enough continuations
      while (fallbackContinuations.length < expectedCount) {
        fallbackContinuations.push(`Continuation ${fallbackContinuations.length + 1}: Content parsing failed`);
      }
      
      return fallbackContinuations;
    }
    
    // If we have fewer continuations than expected, pad with error messages
    if (continuations.length < expectedCount) {
      console.warn(`⚠️ Got ${continuations.length} continuations but expected ${expectedCount}. Padding with error messages.`);
      while (continuations.length < expectedCount) {
        continuations.push(`Continuation ${continuations.length + 1}: Content generation incomplete`);
      }
    }
    
    // If we have more continuations than expected, truncate
    if (continuations.length > expectedCount) {
      console.warn(`⚠️ Got ${continuations.length} continuations but expected ${expectedCount}. Truncating excess continuations.`);
      continuations.splice(expectedCount);
    }
    
    return continuations;
  }

  /**
   * Show the node search modal to create a post-it from node content
   */
  private async showNodeSearchModal(): Promise<void> {
    const modal = new NodeSearchModal({
      id: 'idea-board-node-search',
      searchScope: 'all-projects', // Global idea board searches across all projects
      onNodeSelected: (node: DocumentNode) => {
        this.createPostItFromNode(node);
      }
    });

    await modal.open();
  }

  /**
   * Create a post-it note from a DocumentNode
   */
  private createPostItFromNode(node: DocumentNode): void {
    // Create the post-it at the center of the viewport
    const centerX = this.viewport.x + this.viewport.width / (2 * this.viewport.zoom);
    const centerY = this.viewport.y + this.viewport.height / (2 * this.viewport.zoom);
    
    // Create post-it with node content
    const postIt = this.createNewPostIt({ x: centerX, y: centerY }, node.content);
    
    // Apply the currently selected color from the tool panel
    const currentColor = this.toolPanel.getCurrentColor();
    postIt.setColor(currentColor);
    this.updateElementData(postIt);
    this.autoSave();
    
    console.log(`📄 Created post-it from node: "${node.title}"`);
  }

  /**
   * Export the idea board as markdown and download it
   */
  private async exportAsMarkdown(): Promise<void> {
    try {
      console.log('📁 Generating markdown export...');

      // Generate markdown content
      const markdownContent = this.generateMarkdownContent();

      // Create blob and download
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      
      // Use the file save dialog
      if ('showSaveFilePicker' in window) {
        // Modern browsers with File System Access API
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: `${this.boardState.name}.md`,
            types: [{
              description: 'Markdown files',
              accept: {'text/markdown': ['.md']},
            }],
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          
          console.log('✅ Markdown export saved successfully');
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Error saving file:', error);
            // Fallback to download
            this.downloadMarkdownFile(blob);
          }
        }
      } else {
        // Fallback for older browsers
        this.downloadMarkdownFile(blob);
      }
    } catch (error) {
      console.error('❌ Failed to export markdown:', error);
      console.log('❌ Export failed. Please try again.');
    }
  }

  /**
   * Fallback method to download markdown file
   */
  private downloadMarkdownFile(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.boardState.name}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('✅ Markdown export downloaded');
  }

  /**
   * Generate markdown content from the board state
   */
  private generateMarkdownContent(): string {
    const boardName = this.boardState.name || 'Idea Board';
    const createdDate = new Date(this.boardState.created).toLocaleDateString();
    const modifiedDate = new Date(this.boardState.lastModified).toLocaleDateString();
    
    let markdown = `# ${boardName}\n\n`;
    markdown += `- **Created:** ${createdDate}\n`;
    markdown += `- **Last Modified:** ${modifiedDate}\n`;
    markdown += `- **Total Elements:** ${this.elements.size}\n`;
    markdown += `- **Total Connections:** ${this.connections.size}\n\n`;

    // Get all post-its with their connection information
    const postIts = Array.from(this.elements.values()).filter(
      (element): element is PostItNote => element instanceof PostItNote
    );

    if (postIts.length === 0) {
      markdown += `*No post-it notes found.*\n\n`;
      return markdown;
    }

    // Sort post-its by position (top to bottom, left to right)
    postIts.sort((a, b) => {
      const yDiff = a.position.y - b.position.y;
      if (Math.abs(yDiff) < 50) { // Consider same row if within 50 pixels
        return a.position.x - b.position.x;
      }
      return yDiff;
    });

    markdown += `## Post-it Notes\n\n`;

    // Group connected post-its together
    const processedPostIts = new Set<string>();
    let groupIndex = 1;

    for (const postIt of postIts) {
      if (processedPostIts.has(postIt.id)) {
        continue;
      }

      const connectedPostIts = this.findConnectedPostIts(postIt.id);
      
      if (connectedPostIts.length > 0) {
        // This is a connected group
        markdown += `### Group ${groupIndex}: Connected Ideas\n\n`;
        
        // Add the main post-it
        markdown += `#### Main Post-it\n\n`;
        markdown += this.formatPostItAsMarkdown(postIt);
        processedPostIts.add(postIt.id);
        
        // Add connected post-its
        markdown += `#### Connected Post-its\n\n`;
        for (const connectedPostIt of connectedPostIts) {
          markdown += this.formatPostItAsMarkdown(connectedPostIt);
          processedPostIts.add(connectedPostIt.id);
        }
        
        groupIndex++;
      } else {
        // Standalone post-it
        markdown += `### Standalone Post-it\n\n`;
        markdown += this.formatPostItAsMarkdown(postIt);
        processedPostIts.add(postIt.id);
      }
      
      markdown += `\n`;
    }

    // Add connection information
    if (this.connections.size > 0) {
      markdown += `## Connections\n\n`;
      markdown += `This board contains ${this.connections.size} connection(s) between post-its:\n\n`;
      
      for (const connection of this.connections.values()) {
        const fromPostIt = this.elements.get(connection.fromPostItId) as PostItNote;
        const toPostIt = this.elements.get(connection.toPostItId) as PostItNote;
        
        if (fromPostIt && toPostIt) {
          const fromTitle = this.getPostItTitle(fromPostIt);
          const toTitle = this.getPostItTitle(toPostIt);
          markdown += `- **${fromTitle}** → **${toTitle}**\n`;
        }
      }
      markdown += `\n`;
    }

    markdown += `---\n\n`;
    markdown += `*Exported from Expert Idea Board on ${new Date().toLocaleString()}*\n`;

    return markdown;
  }

  /**
   * Format a single post-it as markdown
   */
  private formatPostItAsMarkdown(postIt: PostItNote): string {
    const title = this.getPostItTitle(postIt);
    const content = postIt.content.trim();
    const colorName = this.getColorName(postIt.style.backgroundColor);
    
    let markdown = `**${title}** _(${colorName})_\n\n`;
    
    if (content) {
      // Indent content to make it clear it belongs to this post-it
      const indentedContent = content
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n');
      markdown += `${indentedContent}\n\n`;
    } else {
      markdown += `> *(Empty post-it)*\n\n`;
    }
    
    return markdown;
  }

  /**
   * Get a meaningful title for a post-it (first line or ID)
   */
  private getPostItTitle(postIt: PostItNote): string {
    const content = postIt.content.trim();
    if (!content) {
      return `Post-it ${postIt.id.slice(-8)}`;
    }
    
    const firstLine = content.split('\n')[0]!.trim();
    if (firstLine.length > 50) {
      return firstLine.substring(0, 47) + '...';
    }
    
    return firstLine || `Post-it ${postIt.id.slice(-8)}`;
  }

  /**
   * Get a readable color name from hex value
   */
  private getColorName(hexColor: string): string {
    const colorMap: Record<string, string> = {
      '#fff9c4': 'Yellow',
      '#bbdefb': 'Blue',
      '#c8e6c9': 'Green',
      '#f8bbd9': 'Pink',
      '#ffcc80': 'Orange',
      '#ffffff': 'White',
      '#e1bee7': 'Purple',
      '#ffcdd2': 'Red'
    };
    
    return colorMap[hexColor.toLowerCase()] || 'Custom';
  }
} 