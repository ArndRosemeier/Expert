import { Viewport } from './rendering/Viewport';
import { PostItNote } from './elements/PostItNote';
import { BackgroundRectangle } from './elements/BackgroundRectangle';
import { Connection } from './elements/Connection';
import { InputManager } from './interaction/InputManager';
import { BoardSerializer } from './persistence/BoardSerializer';
import { ToolPanel } from './ui/ToolPanel';
import { NodeSearchModal } from './ui/NodeSearchModal';
import { OpenRouterClient } from '../OpenRouterClient';
import { createPromptExpansionService } from '../services/PromptExpansionService';
import { TransformModal, type TransformResult } from './ui/TransformModal';
import * as state from '../state';
import type { IdeaBoardState, Point, BoardElement } from './types/BoardTypes';
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
  
  // Clipboard for copy/cut/paste operations
  private clipboard: {
    content: string;
    backgroundColor: string;
    size: { width: number; height: number };
  } | null = null;
  private draggedElement: BoardElement | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private resizingElement: PostItNote | null = null;
  private resizeHandle: 'se' | 'nw' | 'ne' | 'sw' | null = null;
  private isPanning: boolean = false;
  private panStart: Point = { x: 0, y: 0 };
  
  // Hierarchical dragging state
  private draggedDescendants: PostItNote[] = [];
  private descendantOffsets: Map<string, Point> = new Map();
  
  // Background rectangle group movement state
  private containedPostIts: PostItNote[] = [];
  private containedPostItOffsets: Map<string, Point> = new Map();
  
  // Connection state
  private isConnecting: boolean = false;
  private connectionStart: { postIt: PostItNote; side: 'top' | 'right' | 'bottom' | 'left' } | null = null;
  private dragConnectionEnd: Point | null = null;
  
  // Mouse position tracking for context-aware operations
  private lastMousePosition: Point | null = null;
  
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
      onAddBackgroundRect: () => {
        this.createBackgroundRectAtCenter();
      },
      onAddNodeContent: () => {
        this.showNodeSearchModal();
      },
      onExportMarkdown: () => {
        this.exportAsMarkdown();
      },
      onExportJson: () => {
        this.exportAsJson();
      },
      onImportJson: () => {
        this.importFromJson();
      },
      onClearAll: () => {
        this.clearAll();
      },
      onSummarize: async () => {
        await this.summarizeSelectedPostIt();
      },
      onExpand: async () => {
        await this.continueSelectedPostIt();
      },
      onGenerateIdeas: async () => {
        await this.generateIdeasForSelectedPostIt();
      },
      onTransform: async () => {
        await this.transformSelectedPostIt();
      },
      onModelChange: (modelPurpose: string) => {
        this.setSelectedModelPurpose(modelPurpose);
      }
    });

    // Attach tool panel to container
    this.toolPanel.attachTo(container);

    // Start render loop
    this.startRenderLoop();

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
        } else if (elementData.type === 'background-rect') {
          const backgroundRect = new BackgroundRectangle({ x: 0, y: 0 });
          backgroundRect.deserialize(elementData);
          this.elements.set(backgroundRect.id, backgroundRect);
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
        // Check for Shift+click on post-it to trigger transform functionality
        if (event.shiftKey && hitElement instanceof PostItNote) {
          this.selectElement(hitElement);
          void this.transformSelectedPostIt();
          return; // Don't proceed with dragging setup
        }
        
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
        
        // Set up group movement for background rectangles
        if (hitElement instanceof BackgroundRectangle) {
          this.setupBackgroundRectGroupMovement(hitElement);
        }
        
        // Bring all moving elements to front (descendants/contained first, then triggering element)
        this.bringGroupToFront(hitElement);
      } else {
        // Click on empty space - just clear selection
        this.selectElement(null);
      }
    });

    // Handle double-clicks for connection cutting, editing, and new post-it creation
    this.inputManager.on('onDoubleClick', (point) => {
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
      
      // Second check if double-click was inside a post-it (but not on connection dot or background rectangle)
      for (const element of this.elements.values()) {
        if (element instanceof PostItNote && !(element instanceof BackgroundRectangle)) {
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

    this.inputManager.on('onMouseMove', (point) => {
      const worldPoint = this.viewport.screenToWorld(point.x, point.y);
      
      // Track mouse position for context-aware operations like paste
      this.lastMousePosition = worldPoint;

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
        // Direct viewport movement for natural "grab and drag" feeling
        // Move viewport in opposite direction of cursor movement (so content follows cursor)
        this.viewport.x -= dx / this.viewport.zoom;
        this.viewport.y -= dy / this.viewport.zoom;
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
        
        // Move contained post-it notes if this is a background rectangle drag
        if (this.draggedElement instanceof BackgroundRectangle && this.containedPostIts.length > 0) {
          this.moveContainedPostItsWithBackground(this.draggedElement);
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

    this.inputManager.on('onMouseUp', (point) => {

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
        // Check for merge opportunity if dropping a post-it on another post-it
        if (this.draggedElement instanceof PostItNote && !(this.draggedElement instanceof BackgroundRectangle)) {
          const worldPoint = this.viewport.screenToWorld(point.x, point.y);
          const targetPostIt = this.findPostItAtPoint(worldPoint, this.draggedElement);
          
          if (targetPostIt) {
            this.handlePostItMerge(this.draggedElement, targetPostIt);
          }
        }
        
        // Clean up hierarchical drag state
        this.cleanupHierarchicalDrag();
        
        // Clean up background rectangle group movement state
        this.cleanupBackgroundRectGroupMovement();
        
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

    this.inputManager.on('onWheel', (delta, point) => {
      // Disable zooming while editing
      if (this.disableZoomingWhileEditing) {
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

    // Track mouse position when entering canvas area
    this.canvas.addEventListener('mouseenter', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      this.lastMousePosition = this.viewport.screenToWorld(screenPoint.x, screenPoint.y);
    });
  }



  /**
   * Handle keyboard shortcuts
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // Only handle keyboard shortcuts when the canvas has focus or is being interacted with
    // Exception: copy/cut/paste should work when an element is selected, even if canvas not focused
    const canvasHasFocus = this.canvas.matches(':focus');
    const hasSelection = !!this.selectedElement;
    
    // Handle copy/cut/paste shortcuts
    if (event.ctrlKey || event.metaKey) { // Support both Ctrl (Windows/Linux) and Cmd (Mac)
      switch (event.key.toLowerCase()) {
        case 'c':
          // Copy requires selection
          if (hasSelection) {
            event.preventDefault();
            this.copySelectedElement();
          }
          break;
        case 'x':
          // Cut requires selection
          if (hasSelection) {
            event.preventDefault();
            this.cutSelectedElement();
          }
          break;
        case 'v':
          // Paste works with selection (even without canvas focus) or without selection (only with canvas focus)
          if (hasSelection || canvasHasFocus) {
            event.preventDefault();
            this.pasteElement();
          }
          break;
      }
      return;
    }

    // For other shortcuts, only handle when canvas has focus or we have a selection
    if (!canvasHasFocus && !hasSelection) {
      return;
    }

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
        // Only prevent default if canvas has focus
        if (canvasHasFocus) {
          event.preventDefault();
          if (!this.isPanning) {
            this.canvas.style.cursor = 'grab';
          }
        }
        break;
    }
  }

  /**
   * Copy the currently selected post-it to clipboard
   */
  private async copySelectedElement(): Promise<void> {
    if (!this.selectedElement || !(this.selectedElement instanceof PostItNote)) {
      console.log('📋 No post-it selected to copy');
      return;
    }

    const postIt = this.selectedElement as PostItNote;
    
    // Store in internal clipboard
    this.clipboard = {
      content: postIt.content,
      backgroundColor: postIt.style.backgroundColor,
      size: { ...postIt.size }
    };

    // Also store in system clipboard
    try {
      const clipboardData = {
        type: 'expert-postit',
        content: postIt.content,
        backgroundColor: postIt.style.backgroundColor,
        size: postIt.size
      };
      
      await navigator.clipboard.writeText(JSON.stringify(clipboardData));
      console.log('📋 Post-it copied to clipboard');
    } catch (error) {
      console.warn('Failed to write to system clipboard:', error);
      console.log('📋 Post-it copied to internal clipboard only');
    }
  }

  /**
   * Cut the currently selected post-it to clipboard
   */
  private async cutSelectedElement(): Promise<void> {
    if (!this.selectedElement || !(this.selectedElement instanceof PostItNote)) {
      console.log('✂️ No post-it selected to cut');
      return;
    }

    // Copy first
    await this.copySelectedElement();
    
    // Then delete
    this.deleteElement(this.selectedElement);
    console.log('✂️ Post-it cut to clipboard');
  }

  /**
   * Paste a post-it from clipboard
   * Supports both Expert post-it data and plain text
   */
  private async pasteElement(): Promise<void> {
    let clipboardData = this.clipboard;
    let isPlainText = false;

    // Try to read from system clipboard first
    try {
      const systemClipboard = await navigator.clipboard.readText();
      
      // First try to parse as Expert post-it JSON
      try {
        const parsedData = JSON.parse(systemClipboard);
        
        if (parsedData.type === 'expert-postit') {
          clipboardData = {
            content: parsedData.content,
            backgroundColor: parsedData.backgroundColor,
            size: parsedData.size
          };
        }
      } catch (parseError) {
        // Not valid JSON or not Expert post-it data
        // Check if we have plain text content that's not empty
        if (systemClipboard && systemClipboard.trim().length > 0) {
                     // Use plain text to create a new post-it
           clipboardData = {
             content: systemClipboard.trim(),
             backgroundColor: '#fff9c4', // Same as default PostItNote color
             size: { width: 225, height: 150 } // Same as default PostItNote size
           };
          isPlainText = true;
          console.log('📋 Using plain text from clipboard for new post-it');
        }
      }
    } catch (error) {
      // System clipboard read failed, use internal clipboard if available
      console.log('📋 System clipboard read failed, using internal clipboard');
    }

    if (!clipboardData) {
      console.log('📋 No valid content in clipboard to paste');
      return;
    }

    // Create new post-it at mouse position if available, otherwise center of viewport
    let basePosition: Point;
    
    if (this.lastMousePosition) {
      // Use current mouse position for intuitive pasting
      basePosition = { ...this.lastMousePosition };
      console.log(`📋 Pasting ${isPlainText ? 'plain text' : 'post-it'} at mouse position`);
    } else {
      // Fallback to viewport center if no mouse position tracked
      basePosition = this.viewport.screenToWorld(this.viewport.width / 2, this.viewport.height / 2);
      console.log(`📋 Pasting ${isPlainText ? 'plain text' : 'post-it'} at viewport center (no mouse position available)`);
    }
    
    const pasteOffset = 20; // Offset each paste by 20 pixels
    
    // Add some randomness to avoid exact overlap when pasting multiple times
    const offsetX = (Math.random() - 0.5) * pasteOffset;
    const offsetY = (Math.random() - 0.5) * pasteOffset;
    
    const pastePosition = {
      x: basePosition.x + offsetX,
      y: basePosition.y + offsetY
    };

    // Create new post-it with clipboard data
    const newPostIt = new PostItNote(pastePosition, clipboardData.content);
    newPostIt.style.backgroundColor = clipboardData.backgroundColor;
    newPostIt.size = { ...clipboardData.size };

    // Add to board
    this.elements.set(newPostIt.id, newPostIt);
    
    // Select the new post-it
    this.selectElement(newPostIt);
    
    // Save state
    this.autoSave();
    this.requestRedraw();
    
    console.log(`📋 ${isPlainText ? 'Plain text pasted as new post-it' : 'Post-it pasted from clipboard'}`);
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
      min-width: 200px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
    `;

    // Helper function to create menu option
    const createMenuOption = (icon: string, text: string, onClick: () => void, hasBorder: boolean = true) => {
      const option = document.createElement('div');
      option.textContent = `${icon} ${text}`;
      option.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        ${hasBorder ? 'border-bottom: 1px solid #eee;' : ''}
      `;
      option.addEventListener('mouseover', () => {
        option.style.backgroundColor = '#f5f5f5';
      });
      option.addEventListener('mouseout', () => {
        option.style.backgroundColor = 'transparent';
      });
      option.addEventListener('click', () => {
        onClick();
        this.removeContextMenu();
      });
      return option;
    };

    // Copy Content option
    const copyContentOption = createMenuOption('📋', 'Copy Content', () => {
      navigator.clipboard.writeText(postIt.content).catch(console.error);
      console.log('📋 Copied post-it content to clipboard');
    });

    // AI Operations section
    const aiSectionHeader = document.createElement('div');
    aiSectionHeader.textContent = 'AI Operations';
    aiSectionHeader.style.cssText = `
      padding: 6px 12px;
      font-size: 12px;
      font-weight: bold;
      color: #666;
      background: #f9f9f9;
      border-bottom: 1px solid #eee;
    `;

    const generateIdeasOption = createMenuOption('💡', 'Generate Ideas', () => {
      this.selectElement(postIt);
      void this.generateIdeasForSelectedPostIt();
    });

    const summarizeOption = createMenuOption('🗜️', 'Summarize', () => {
      this.selectElement(postIt);
      void this.summarizeSelectedPostIt();
    });

    const continueOption = createMenuOption('🔄', 'Continue', () => {
      this.selectElement(postIt);
      void this.continueSelectedPostIt();
    });

    const transformOption = createMenuOption('✨', 'Transform', () => {
      this.selectElement(postIt);
      void this.transformSelectedPostIt();
    });

    // Basic operations section
    const basicSectionHeader = document.createElement('div');
    basicSectionHeader.textContent = 'Basic Operations';
    basicSectionHeader.style.cssText = `
      padding: 6px 12px;
      font-size: 12px;
      font-weight: bold;
      color: #666;
      background: #f9f9f9;
      border-bottom: 1px solid #eee;
    `;

    const editOption = createMenuOption('✏️', 'Edit', () => {
      this.startEditing(postIt);
    });

    const deleteOption = createMenuOption('🗑️', 'Delete', () => {
      this.deleteElement(postIt);
    });

    // Color section
    const colorSectionHeader = document.createElement('div');
    colorSectionHeader.textContent = 'Colors';
    colorSectionHeader.style.cssText = `
      padding: 6px 12px;
      font-size: 12px;
      font-weight: bold;
      color: #666;
      background: #f9f9f9;
      border-bottom: 1px solid #eee;
    `;

    // Available colors (same as ToolPanel)
    const colors = [
      { name: 'Yellow', value: '#fff9c4' },
      { name: 'Blue', value: '#bbdefb' },
      { name: 'Green', value: '#c8e6c9' },
      { name: 'Pink', value: '#f8bbd9' },
      { name: 'Orange', value: '#ffcc80' },
      { name: 'White', value: '#ffffff' },
      { name: 'Purple', value: '#e1bee7' },
      { name: 'Red', value: '#ffcdd2' }
    ];

    // Create color options container
    const colorOptionsContainer = document.createElement('div');
    colorOptionsContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid #eee;
    `;

    colors.forEach(color => {
      const colorOption = document.createElement('div');
      colorOption.title = color.name;
      colorOption.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: ${color.value};
        border: 2px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        ${color.value === postIt.style.backgroundColor ? 'border-color: #333; box-shadow: 0 0 0 2px rgba(51,51,51,0.3);' : ''}
      `;
      
      colorOption.addEventListener('mouseover', () => {
        if (color.value !== postIt.style.backgroundColor) {
          colorOption.style.borderColor = '#999';
          colorOption.style.transform = 'scale(1.1)';
        }
      });
      
      colorOption.addEventListener('mouseout', () => {
        if (color.value !== postIt.style.backgroundColor) {
          colorOption.style.borderColor = '#ddd';
          colorOption.style.transform = 'scale(1)';
        }
      });
      
      colorOption.addEventListener('click', () => {
        // Apply color to the post-it
        postIt.setColor(color.value);
        this.updateElementData(postIt);
        this.requestRedraw();
        this.autoSave();
        console.log(`🎨 Changed post-it color to ${color.name} (${color.value})`);
        this.removeContextMenu();
      });
      
      colorOptionsContainer.appendChild(colorOption);
    });

    const deleteDescendantsOption = createMenuOption('🗑️💥', 'Delete All Descendants', () => {
      const descendants = this.findAllDescendants(postIt.id);
      
      if (descendants.length === 0) {
        alert('This post-it has no descendants to delete.');
        return;
      }
      
      const confirmMessage = 
        `🗑️💥 Delete All Descendants\n\n` +
        `This will delete ${descendants.length} descendant post-it(s) connected downstream from this post-it.\n` +
        `The main post-it will remain.\n\n` +
        `Are you sure you want to delete all ${descendants.length} descendants?`;
      
      if (confirm(confirmMessage)) {
        console.log(`🗑️💥 Deleting ${descendants.length} descendants of post-it`);
        
        // Delete only the descendants, keep the main post-it
        const descendantIds = descendants.map(d => d.id);
        this.startDeletionAnimation(descendantIds, () => {
          this.performActualDeletion(descendants);
        });
      }
    }, false); // No border for last item

    // Add all options to context menu
    contextMenu.appendChild(copyContentOption);
    contextMenu.appendChild(aiSectionHeader);
    contextMenu.appendChild(generateIdeasOption);
    contextMenu.appendChild(summarizeOption);
    contextMenu.appendChild(continueOption);
    contextMenu.appendChild(transformOption);
    contextMenu.appendChild(colorSectionHeader);
    contextMenu.appendChild(colorOptionsContainer);
    contextMenu.appendChild(basicSectionHeader);
    contextMenu.appendChild(editOption);
    contextMenu.appendChild(deleteOption);
    contextMenu.appendChild(deleteDescendantsOption);
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
    
    return postIt;
  }

  /**
   * Create a new background rectangle at the specified position
   */
  createBackgroundRectangle(position: Point): BackgroundRectangle {
    // Get existing background rectangles to choose next color
    const existingRectangles = Array.from(this.elements.values())
      .filter(element => element instanceof BackgroundRectangle) as BackgroundRectangle[];
    
    const rectangle = new BackgroundRectangle(position);
    
    // Set next available color
    const nextColor = BackgroundRectangle.getNextBackgroundColor(existingRectangles);
    rectangle.setBackgroundColor(nextColor);
    
    this.elements.set(rectangle.id, rectangle);
    this.boardState.elements.push(rectangle.serialize());
    this.boardState.metadata.totalElements = this.elements.size;
    
    this.selectElement(rectangle);
    this.requestRedraw();
    this.autoSave();
    
    return rectangle;
  }

  /**
   * Delete an element with optional descendant deletion
   */
  deleteElement(element: BoardElement): void {
    if (element instanceof BackgroundRectangle) {
      // Check for contained post-its using existing logic
      const containedPostIts = this.findPostItsInsideBackgroundRect(element);
      
      if (containedPostIts.length > 0) {
        // Show confirmation dialog for background rectangle deletion with contained stickers
        this.showBackgroundRectDeletionDialog(element, containedPostIts);
        return;
      }
    } else if (element instanceof PostItNote) {
      const descendants = this.findAllDescendants(element.id);
      
      if (descendants.length > 0) {
        // Show confirmation dialog for hierarchical deletion
        this.showDeletionConfirmationDialog(element, descendants);
        return;
      }
    }
    
    // Delete single element (no descendants or contained elements)
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
   * Show deletion confirmation dialog for background rectangle with contained stickers
   */
  private showBackgroundRectDeletionDialog(backgroundRect: BackgroundRectangle, containedPostIts: PostItNote[]): void {
    const confirmMessage = 
      `🗑️ Delete Background Rectangle\n\n` +
      `This background rectangle contains ${containedPostIts.length} sticker(s) inside it.\n\n` +
      `What would you like to do?\n\n` +
      `• OK: Delete background rectangle AND all contained stickers (${containedPostIts.length + 1} total)\n` +
      `• Cancel: Delete only the background rectangle (stickers will remain)`;

    const deleteWithContained = confirm(confirmMessage);
    
    if (deleteWithContained) {
      // Delete background rectangle and all contained stickers
      this.deleteBackgroundRectWithContained(backgroundRect, containedPostIts);
    } else {
      // Delete only the background rectangle
      this.deleteSingleElement(backgroundRect);
    }
  }

  /**
   * Delete a single element without descendants
   */
  private deleteSingleElement(element: BoardElement): void {
    if (element instanceof PostItNote) {
      // Start deletion animation (connections removed immediately, then animation)
      this.startDeletionAnimation([element.id], () => {
        this.performActualDeletion([element]);
      });
    } else {
      // Non-PostIt elements don't get animation, remove connections and delete immediately
      this.removeAllConnectionsForElement(element.id);
      this.performActualDeletion([element]);
    }
  }

  /**
   * Delete an element and all its descendants
   */
  private deleteElementWithDescendants(element: PostItNote, descendants: PostItNote[]): void {
    const allElementsToDelete = [element, ...descendants];
    const allElementIds = allElementsToDelete.map(el => el.id);
    
    // Start deletion animation for all elements
    this.startDeletionAnimation(allElementIds, () => {
      this.performActualDeletion(allElementsToDelete);
    });
  }

  /**
   * Delete a background rectangle and all its contained post-its
   */
  private deleteBackgroundRectWithContained(backgroundRect: BackgroundRectangle, containedPostIts: PostItNote[]): void {
    const allElementsToDelete = [backgroundRect, ...containedPostIts];
    const allElementIds = allElementsToDelete.map(el => el.id);
    
    // Start deletion animation for all elements
    this.startDeletionAnimation(allElementIds, () => {
      this.performActualDeletion(allElementsToDelete);
    });
  }

  /**
   * Perform the actual deletion of elements after animation completes
   */
  private performActualDeletion(elementsToDelete: BoardElement[]): void {

    
    // Note: Connections were already removed when animation started for immediate visual feedback
    
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
      this.cleanupBackgroundRectGroupMovement();
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
   * Select an element or clear selection
   */
  private selectElement(element: BoardElement | null): void {
    // Deselect previously selected element
    if (this.selectedElement) {
      if (this.selectedElement instanceof PostItNote || this.selectedElement instanceof BackgroundRectangle) {
      this.selectedElement.setSelected(false);
      }
    }

    // Select new element
    this.selectedElement = element;
    if (element) {
      if (element instanceof PostItNote || element instanceof BackgroundRectangle) {
      element.setSelected(true);
      }
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
      } else if (elementData.type === 'background-rect') {
        const backgroundRect = new BackgroundRectangle({ x: 0, y: 0 });
        backgroundRect.deserialize(elementData);
        this.elements.set(backgroundRect.id, backgroundRect);
      }
    }

    this.requestRedraw();
    return true;
  }

  /**
   * Load board from a board state object (used for imports)
   */
  private async loadBoardState(boardState: IdeaBoardState): Promise<void> {
    // Convert dates from strings to Date objects if needed
    if (typeof boardState.created === 'string') {
      boardState.created = new Date(boardState.created);
    }
    if (typeof boardState.lastModified === 'string') {
      boardState.lastModified = new Date(boardState.lastModified);
    }

    // Convert element dates if needed
    for (const elementData of boardState.elements) {
      if (typeof elementData.metadata.created === 'string') {
        elementData.metadata.created = new Date(elementData.metadata.created);
      }
      if (typeof elementData.metadata.lastEdited === 'string') {
        elementData.metadata.lastEdited = new Date(elementData.metadata.lastEdited);
      }
    }

    this.boardState = boardState;
    this.viewport.x = boardState.viewport.x;
    this.viewport.y = boardState.viewport.y;
    this.viewport.zoom = boardState.viewport.zoom;

    // Clear existing elements and connections
    this.elements.clear();
    this.connections.clear();

    // Recreate elements
    for (const elementData of boardState.elements) {
      if (elementData.type === 'post-it') {
        const postIt = new PostItNote({ x: 0, y: 0 });
        postIt.deserialize(elementData);
        this.elements.set(postIt.id, postIt);
      } else if (elementData.type === 'background-rect') {
        const backgroundRect = new BackgroundRectangle({ x: 0, y: 0 });
        backgroundRect.deserialize(elementData);
        this.elements.set(backgroundRect.id, backgroundRect);
      }
    }

    // Recreate connections
    for (const connectionData of boardState.connections) {
      const connection = new Connection(connectionData.fromPostItId, connectionData.fromSide, connectionData.toPostItId, connectionData.toSide);
      connection.deserialize(connectionData);
      this.connections.set(connection.id, connection);
    }

    // Clear any selection state
    this.selectedElement = null;
    this.editingElement = null;

    // Auto-save the imported board
    this.autoSave();

    this.requestRedraw();
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

    // Draw all elements with proper layering (background rectangles first, then connections, then post-its)
    const elements = Array.from(this.elements.values());
    const backgroundRectangles = elements.filter(element => element instanceof BackgroundRectangle);
    const postItNotes = elements.filter(element => element instanceof PostItNote && !(element instanceof BackgroundRectangle));
    
    // Draw background rectangles first (bottom layer)
    for (const element of backgroundRectangles) {
      // Skip rendering elements that are being deleted (they will be rendered with scaling in deletion animation)
      if (this.deletionAnimation.isActive && this.deletionAnimation.postItIds.includes(element.id)) {
        continue;
      }
      element.render(this.context, this.viewport);
    }

    // Draw connections on top of background rectangles but below post-its (middle layer)
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

    // Draw post-it notes on top (top layer)
    for (const element of postItNotes) {
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

    // Draw ghost outlines on top of everything (so structures are always visible)
    this.renderGhostBackgroundBorders(backgroundRectangles);
    this.renderGhostConnections();

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
   * Render ghost outlines of background rectangle borders
   */
  private renderGhostBackgroundBorders(backgroundRectangles: BoardElement[]): void {
    if (backgroundRectangles.length === 0) return;

    this.context.save();
    this.context.strokeStyle = 'rgba(100, 100, 100, 0.3)'; // Semi-transparent gray
    this.context.lineWidth = 1;
    this.context.setLineDash([3, 3]); // Small dotted pattern
    this.context.lineCap = 'round';

    for (const backgroundRect of backgroundRectangles) {
      // Get screen coordinates
      const screenPos = this.viewport.worldToScreen(backgroundRect.position.x, backgroundRect.position.y);
      const screenWidth = backgroundRect.size.width * this.viewport.zoom;
      const screenHeight = backgroundRect.size.height * this.viewport.zoom;

      // Only render if visible
      if (this.viewport.isVisible(backgroundRect)) {
        this.context.beginPath();
        this.context.strokeRect(screenPos.x, screenPos.y, screenWidth, screenHeight);
      }
    }

    this.context.restore();
  }

  /**
   * Render ghost outlines of all connections
   */
  private renderGhostConnections(): void {
    if (this.connections.size === 0) return;

    this.context.save();
    this.context.strokeStyle = 'rgba(100, 100, 100, 0.25)'; // Semi-transparent gray
    this.context.lineWidth = 1;
    this.context.setLineDash([2, 4]); // Small dotted pattern
    this.context.lineCap = 'round';

    for (const connection of this.connections.values()) {
      const fromPostIt = this.elements.get(connection.fromPostItId) as PostItNote;
      const toPostIt = this.elements.get(connection.toPostItId) as PostItNote;
      
      if (fromPostIt && toPostIt) {
        // Get screen positions
        const fromScreenPos = this.viewport.worldToScreen(fromPostIt.position.x, fromPostIt.position.y);
        const fromScreenWidth = fromPostIt.size.width * this.viewport.zoom;
        const fromScreenHeight = fromPostIt.size.height * this.viewport.zoom;

        const toScreenPos = this.viewport.worldToScreen(toPostIt.position.x, toPostIt.position.y);
        const toScreenWidth = toPostIt.size.width * this.viewport.zoom;
        const toScreenHeight = toPostIt.size.height * this.viewport.zoom;

        // Get connection dot positions
        const fromDots = fromPostIt.getConnectionDotPositions(fromScreenPos, fromScreenWidth, fromScreenHeight);
        const toDots = toPostIt.getConnectionDotPositions(toScreenPos, toScreenWidth, toScreenHeight);

        const fromDot = fromDots.find(dot => dot.side === connection.fromSide);
        const toDot = toDots.find(dot => dot.side === connection.toSide);

        if (fromDot && toDot) {
          this.context.beginPath();
          this.context.moveTo(fromDot.x, fromDot.y);
          this.context.lineTo(toDot.x, toDot.y);
          this.context.stroke();
        }
      }
    }

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
   * Bring an element to the front by moving it to the end of the elements collection
   * Background rectangles only move to front relative to other background rectangles
   */
  private bringElementToFront(element: BoardElement): void {
    if (element instanceof BackgroundRectangle) {
      // For background rectangles, only bring to front among background rectangles
      const allElements = Array.from(this.elements.entries());
      const backgroundRects = allElements.filter(([_, el]) => el instanceof BackgroundRectangle);
      const postIts = allElements.filter(([_, el]) => el instanceof PostItNote);
      
      // Remove the element and re-add at end of background rectangles
      const elementEntry = allElements.find(([id, _]) => id === element.id);
      if (elementEntry) {
        // Reconstruct elements map with background rectangles first, target element last among them
        this.elements.clear();
        
        // Add other background rectangles first
        for (const [id, el] of backgroundRects) {
          if (id !== element.id) {
            this.elements.set(id, el);
          }
        }
        // Add target background rectangle last among background rectangles  
        this.elements.set(element.id, element);
        
        // Add all post-it notes after background rectangles
        for (const [id, el] of postIts) {
          this.elements.set(id, el);
        }
      }
    } else {
      // For post-it notes, use normal front-bringing (but they stay after background rectangles)
    this.elements.delete(element.id);
    this.elements.set(element.id, element);
    }
    
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
   * Bring all moving elements to front, with the triggering element on top
   */
  private bringGroupToFront(triggeringElement: BoardElement): void {
    // Bring descendants to front first (for hierarchical dragging)
    for (const descendant of this.draggedDescendants) {
      this.bringElementToFront(descendant);
    }
    
    // Bring contained post-its to front first (for background rectangle group movement)
    for (const containedPostIt of this.containedPostIts) {
      this.bringElementToFront(containedPostIt);
    }
    
    // Finally bring the triggering element to front (so it's on top of all others)
    this.bringElementToFront(triggeringElement);
  }

  /**
   * Clear all post-it notes and connections from the board
   */
  private clearAll(): void {
    if (this.elements.size === 0 && this.connections.size === 0) {
      return;
    }

    const userConfirmed = confirm(
      `⚠️ Warning: This will clear all content from the board.\n\n` +
      `This will remove:\n` +
      `• ${this.elements.size} post-it note(s)\n` +
      `• ${this.connections.size} connection(s)\n\n` +
      `This action cannot be undone. Do you want to continue?`
    );

    if (!userConfirmed) {
      return;
    }

    // Stop any editing in progress
    if (this.editingElement) {
      this.stopEditing();
    }

    // Clear selections
    this.selectedElement = null;
    this.draggedElement = null;
    this.resizingElement = null;
    
    // Clear drag state
    this.cleanupHierarchicalDrag();
    this.cleanupBackgroundRectGroupMovement();

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
  }

  /**
   * Set the selected AI model purpose for operations
   */
  private setSelectedModelPurpose(modelPurpose: string): void {
    this.selectedModelPurpose = modelPurpose;
    
  }

  /**
   * Generalized content generation for ideas, continuations, transformations, and future content types
   */
  private async performContentGeneration(
    type: 'ideas' | 'continuations' | 'transformations',
    promptKey: 'idea_generation_system' | 'expand_system' | 'transform_system',
    startMarker: string,
    endMarker: string
  ): Promise<void> {
    if (!this.selectedElement) {
      return;
    }
    
    if (this.selectedElement instanceof BackgroundRectangle) {
      return;
    }
    
    if (!(this.selectedElement instanceof PostItNote)) {
      return;
    }

    const selectedPostIt = this.selectedElement;
    const originalContent = selectedPostIt.content;
    
    if (!originalContent.trim()) {
      return;
    }

    const childPostIts = this.findOutgoingPostIts(selectedPostIt.id);
    
    // Get user input for transformations first (before count logic)
    let userInstruction = '';
    let customCount: number | undefined;
    if (type === 'transformations') {
      // Count outgoing connections for smart count behavior
      const outgoingConnectionCount = childPostIts.length > 0 ? childPostIts.length : undefined;
      
      const transformResult = await new Promise<{ instruction: string; count: number } | null>((resolve) => {
        const modalConfig: any = {
          id: 'transform-content-modal',
          onTransformConfirmed: (result: TransformResult) => {
            resolve(result);
          }
        };
        
        // Only add outgoingConnectionCount if it's defined
        if (outgoingConnectionCount !== undefined) {
          modalConfig.outgoingConnectionCount = outgoingConnectionCount;
        }
        
        const modal = new TransformModal(modalConfig);
        
        modal.open().catch(error => {
          console.error('Failed to open transform modal:', error);
          resolve(null);
        });
      });
      
      if (!transformResult || !transformResult.instruction.trim()) {
        console.log('❌ Transformation cancelled - no instruction provided.');
        return;
      }
      
      userInstruction = transformResult.instruction.trim();
      customCount = transformResult.count;
      console.log(`🔄 Transforming content with instruction: "${userInstruction}" (${customCount} variations)`);
    }

    let count: number;
    let targetPostIts: PostItNote[] = [];
    let isConnectedMode = false;

    if (type === 'transformations' && customCount) {
      // For transformations, use the custom count from the modal
      if (childPostIts.length > 0 && customCount === childPostIts.length) {
        // Custom count matches connections - use connected mode
        isConnectedMode = true;
        count = customCount;
        targetPostIts = childPostIts;
      } else {
        // Custom count different from connections - use free mode
        count = customCount;
        console.log(`🔄 Generating ${customCount} ${type} and creating new post-its below the selected one...`);
        
        // Start animation around bottom dot in free mode
        this.startIdeaGenerationAnimation(selectedPostIt.id);
      }
    } else if (childPostIts.length > 0) {
      // Connected mode: exact number to replace existing post-its
      isConnectedMode = true;
      count = childPostIts.length;
      
      // Check if any child post-its have content that would be overwritten
      const nonEmptyChildPostIts = childPostIts.filter(postIt => postIt.content.trim());
      
      if (nonEmptyChildPostIts.length > 0) {
        // Only show warning if there's content that would be overwritten
        const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(0, -1);
      const userConfirmed = confirm(
          `🔄 Generate ${typeCapitalized}: Connected Mode\n\n` +
          `The selected post-it has ${childPostIts.length} child post-it(s).\n` +
          `${nonEmptyChildPostIts.length} of them contain content that will be replaced.\n` +
          `This will generate exactly ${childPostIts.length} ${type} and replace the content in all child post-its.\n\n` +
        'Do you want to continue and replace the existing content?'
      );
      
      if (!userConfirmed) {
          console.log(`🔄 ${typeCapitalized} generation cancelled by user.`);
        return;
        }
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
      
      // User instruction already obtained above for transformations

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
          [type === 'ideas' ? 'idea_count' : type === 'continuations' ? 'expand_count' : 'transform_count']: 
            (type === 'transformations' && customCount) ? customCount.toString() : 
            (isConnectedMode ? count.toString() : 'some'),
          ...(type === 'transformations' && { user_instruction: userInstruction })
        }
      };
      
      const prompt = expansionService.expandPrompt(prompts[promptKey], promptContext);

      // Use OpenRouterClient to get content
      const client = OpenRouterClient.getInstance();
      client.setSettingsManager(settingsManager);
      const generatedContent = await client.chat(this.selectedModelPurpose, prompt);

      // Parse the content from the response using generic method
      const results = this.parseContentWithMarkers(
        generatedContent, 
        startMarker, 
        endMarker, 
        type, 
        isConnectedMode ? count : 0
      );

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
        this.createPostItsFromContent(selectedPostIt, results, type.slice(0, -1)); // Remove 's' from 'ideas'/'continuations'
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
        this.requestRedraw();
        this.autoSave();
      }
    }
  }

  /**
   * Generate creative ideas for the currently selected post-it note
   */
  private async generateIdeasForSelectedPostIt(): Promise<void> {
    await this.performContentGeneration('ideas', 'idea_generation_system', '=== IDEA START ===', '=== IDEA END ===');
  }

  /**
   * Generic method to parse content using specified markers - NO FALLBACKS, FAIL FAST
   */
  private parseContentWithMarkers(
    content: string, 
    startMarker: string, 
    endMarker: string, 
    contentType: string,
    expectedCount: number = 0
  ): string[] {
    const items: string[] = [];
    
    // Create regex pattern from markers
    const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedStart}([\\s\\S]*?)${escapedEnd}`, 'g');
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const itemContent = match[1]?.trim();
      if (itemContent) {
        items.push(itemContent);
      }
    }
    

    
    // NO FALLBACKS - Fail fast and loud
    if (items.length === 0) {
      throw new Error(`❌ AI failed to generate ${contentType} with proper markers. Expected markers: ${startMarker} ... ${endMarker}. Got response: ${content.substring(0, 200)}...`);
    }
    
    // Free mode (expectedCount = 0) - return all found items
    if (expectedCount === 0) {
      return items;
    }
    
    // Connected mode - strict count validation
    if (items.length !== expectedCount) {
      throw new Error(`❌ AI generated ${items.length} ${contentType} but expected exactly ${expectedCount}. This is a strict requirement in connected mode.`);
    }
    
    return items;
  }



  /**
   * Generic method to create new post-its arranged below the triggering post-it
   */
  private createPostItsFromContent(triggerPostIt: PostItNote, contentItems: string[], contentType: string): void {
    const gap = 20; // Gap between post-its
    const verticalOffset = 200; // Distance below the trigger post-it
    
    // Calculate spacing based on post-it width + gap
    const postItWidth = triggerPostIt.size.width;
    const spacing = postItWidth + gap;
    
    // Calculate starting position centered below the trigger post-it
    const totalWidth = Math.max(1, contentItems.length - 1) * spacing;
    const startX = triggerPostIt.position.x + (triggerPostIt.size.width / 2) - (totalWidth / 2);
    const startY = triggerPostIt.position.y + triggerPostIt.size.height + verticalOffset;

    const parentColor = triggerPostIt.style.backgroundColor;
    const newPostIts: PostItNote[] = [];

    // Create post-its for each content item
    for (let i = 0; i < contentItems.length; i++) {
      const x = startX + (i * spacing);
      const y = startY;
      
      const newPostIt = this.createNewPostIt({ x, y }, contentItems[i]!.trim());
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

    console.log(`📝 Created ${newPostIts.length} new ${contentType} post-its arranged below the trigger post-it`);
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
    // Immediately remove all connections involving these elements for visual feedback
    console.log(`🔗 Immediately removing connections for ${postItIds.length} elements before animation`);
    for (const postItId of postItIds) {
      this.removeAllConnectionsForElement(postItId);
    }
    
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
   * Get the ID of the currently selected element
   */
  getSelectedElementId(): string | null {
    return this.selectedElement ? this.selectedElement.id : null;
  }

  /**
   * Set the color of a specific post-it note by ID
   */
  setPostItColorById(postItId: string, color: string): void {
    if (postItId) {
      const element = this.elements.get(postItId);
      if (element instanceof PostItNote) {
        element.setColor(color);
        this.updateElementData(element);
        this.requestRedraw();
        this.autoSave();
      }
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
   * Create a background rectangle at the center of the viewport
   */
  private createBackgroundRectAtCenter(): void {
    const centerX = this.viewport.x + this.viewport.width / (2 * this.viewport.zoom);
    const centerY = this.viewport.y + this.viewport.height / (2 * this.viewport.zoom);
    const rectangle = this.createBackgroundRectangle({ x: centerX, y: centerY });
    
    this.updateElementData(rectangle);
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
      return;
    }

    const selectedPostIt = this.selectedElement;
    let originalContent = selectedPostIt.content; // Store original content for error recovery
    
    try {
      // Get SettingsManager first - needed for prompts and OpenRouterClient
      const settingsManager = state.getSettingsManager();
      
      if (!settingsManager) {
        return;
      }

          // Find all post-its that have incoming connections to the selected one
    const parentPostIts = this.findIncomingPostIts(selectedPostIt.id);
    
    // Check if we should do self-summarization
    if (parentPostIts.length === 0) {
      if (!originalContent.trim()) {
        return;
      }
      
      // Self-summarization mode
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
          return;
        }
      }

      // Concatenate only the parent post-its (exclude the triggering one)
      let combinedText = '';
      
      for (const postIt of parentPostIts) {
        if (postIt.content.trim()) {
          combinedText += postIt.content.trim() + '\n\n';
        }
      }

      if (!combinedText.trim()) {
        return;
      }

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
  }

  /**
   * Set up group movement for background rectangle - find all post-it notes completely inside it
   */
  private setupBackgroundRectGroupMovement(backgroundRect: BackgroundRectangle): void {
    // Find all post-it notes that are completely inside the background rectangle
    this.containedPostIts = this.findPostItsInsideBackgroundRect(backgroundRect);
    
    // Clear previous offsets
    this.containedPostItOffsets.clear();
    
    // Store relative positions of contained post-it notes
    for (const postIt of this.containedPostIts) {
      const offset = {
        x: postIt.position.x - backgroundRect.position.x,
        y: postIt.position.y - backgroundRect.position.y
      };
      this.containedPostItOffsets.set(postIt.id, offset);
    }
    

  }

  /**
   * Find all post-it notes that are completely inside the background rectangle
   */
  private findPostItsInsideBackgroundRect(backgroundRect: BackgroundRectangle): PostItNote[] {
    const contained: PostItNote[] = [];
    
    for (const element of this.elements.values()) {
      if (element instanceof PostItNote) {
        // Check if the post-it note is completely inside the background rectangle
        const postItLeft = element.position.x;
        const postItTop = element.position.y;
        const postItRight = element.position.x + element.size.width;
        const postItBottom = element.position.y + element.size.height;
        
        const rectLeft = backgroundRect.position.x;
        const rectTop = backgroundRect.position.y;
        const rectRight = backgroundRect.position.x + backgroundRect.size.width;
        const rectBottom = backgroundRect.position.y + backgroundRect.size.height;
        
        // Post-it is completely inside if all its corners are within the background rectangle
        if (postItLeft >= rectLeft && 
            postItTop >= rectTop && 
            postItRight <= rectRight && 
            postItBottom <= rectBottom) {
          contained.push(element);
        }
      }
    }
    
    return contained;
  }

  /**
   * Move all contained post-it notes to maintain their relative positions to the background rectangle
   */
  private moveContainedPostItsWithBackground(backgroundRect: BackgroundRectangle): void {
    for (const postIt of this.containedPostIts) {
      const offset = this.containedPostItOffsets.get(postIt.id);
      if (offset) {
        // Update post-it position based on background rectangle's new position + stored offset
        postIt.position.x = backgroundRect.position.x + offset.x;
        postIt.position.y = backgroundRect.position.y + offset.y;
          this.updateElementData(postIt);
        }
      }
  }

  /**
   * Clean up background rectangle group movement state after drag operation completes
   */
  private cleanupBackgroundRectGroupMovement(): void {
    this.containedPostIts = [];
    this.containedPostItOffsets.clear();
  }

  /**
   * Find a post-it note at the given world point, excluding the specified element and its descendants
   */
  private findPostItAtPoint(worldPoint: Point, excludeElement: PostItNote): PostItNote | null {
    // Get all elements that should be excluded (dragged element + its descendants)
    const excludedIds = new Set<string>();
    excludedIds.add(excludeElement.id);
    
    // Add all descendants to exclusion list
    for (const descendant of this.draggedDescendants) {
      excludedIds.add(descendant.id);
    }

    // Test elements in reverse order (top to bottom) to find the topmost element
    const elementsArray = Array.from(this.elements.values());
    for (let i = elementsArray.length - 1; i >= 0; i--) {
      const element = elementsArray[i];
      
      // Only check PostItNotes (excluding BackgroundRectangles) that aren't in the exclusion list
      if (element instanceof PostItNote && 
          !(element instanceof BackgroundRectangle) && 
          !excludedIds.has(element.id) &&
          element.hitTest(worldPoint)) {
        return element;
      }
    }
    
    return null;
  }

  /**
   * Handle merging a dragged post-it into a target post-it
   */
  private handlePostItMerge(draggedPostIt: PostItNote, targetPostIt: PostItNote): void {
    // Don't merge if either post-it has no content
    if (!draggedPostIt.content.trim() && !targetPostIt.content.trim()) {
      return;
    }

    const draggedContent = draggedPostIt.content.trim();
    const targetContent = targetPostIt.content.trim();
    
    // Create preview of merged content
    let mergedContent = '';
    if (targetContent && draggedContent) {
      mergedContent = `${targetContent}\n\n${draggedContent}`;
    } else if (targetContent) {
      mergedContent = targetContent;
    } else {
      mergedContent = draggedContent;
    }

    // Show confirmation dialog with preview
    const userConfirmed = confirm(
      `🔗 Merge Post-its\n\n` +
      `Do you want to append the dragged post-it content to the target post-it?\n\n` +
      `Target post-it content:\n"${targetContent || '(empty)'}"\n\n` +
      `Dragged post-it content:\n"${draggedContent || '(empty)'}"\n\n` +
      `Result will be:\n"${mergedContent}"\n\n` +
      `The dragged post-it will be removed after merging.`
    );

    if (!userConfirmed) {
      console.log('📝 Post-it merge cancelled by user.');
      return;
    }

    // Perform the merge
    targetPostIt.content = mergedContent;
    this.updateElementData(targetPostIt);

    // Delete the dragged post-it and all its descendants
    const elementsToDelete = [draggedPostIt.id, ...this.draggedDescendants.map(d => d.id)];
    
    for (const elementId of elementsToDelete) {
      // Remove all connections for this element
      this.removeAllConnectionsForElement(elementId);
      
      // Remove the element itself
      this.elements.delete(elementId);
      
      // Remove from board state
      const elementIndex = this.boardState.elements.findIndex(e => e.id === elementId);
      if (elementIndex >= 0) {
        this.boardState.elements.splice(elementIndex, 1);
      }
    }

    // Select the target post-it to show the result
    this.selectElement(targetPostIt);
    this.requestRedraw();
    this.autoSave();

    console.log(`📝 Successfully merged ${elementsToDelete.length} element(s) into target post-it.`);
  }

  /**
   * Continue the content of the currently selected post-it note
   */
  private async continueSelectedPostIt(): Promise<void> {
    await this.performContentGeneration('continuations', 'expand_system', '=== CONTINUATION START ===', '=== CONTINUATION END ===');
  }

  /**
   * Transform the content of the currently selected post-it note based on user input
   */
  private async transformSelectedPostIt(): Promise<void> {
    await this.performContentGeneration('transformations', 'transform_system', '=== TRANSFORMATION START ===', '=== TRANSFORMATION END ===');
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
  }

  /**
   * Export the idea board as JSON and download it
   */
  private async exportAsJson(): Promise<void> {
    try {
      // Update board state with current viewport and elements
      this.boardState.viewport.x = this.viewport.x;
      this.boardState.viewport.y = this.viewport.y;
      this.boardState.viewport.zoom = this.viewport.zoom;
      this.boardState.elements = Array.from(this.elements.values()).map(element => element.serialize());
      this.boardState.connections = Array.from(this.connections.values()).map(connection => connection.serialize());
      this.boardState.metadata.totalElements = this.elements.size;
      this.boardState.lastModified = new Date();

      // Generate JSON content
      const jsonContent = JSON.stringify(this.boardState, null, 2);

      // Create blob and download
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      
      // Use the file save dialog
      if ('showSaveFilePicker' in window) {
        // Modern browsers with File System Access API
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: `${this.boardState.name}.json`,
            types: [{
              description: 'JSON files',
              accept: {'application/json': ['.json']},
            }],
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Error saving file:', error);
            // Fallback to download
            this.downloadJsonFile(blob);
          }
        }
      } else {
        // Fallback for older browsers
        this.downloadJsonFile(blob);
      }
    } catch (error) {
      console.error('❌ Failed to export JSON:', error);
      console.log('❌ Export failed. Please try again.');
    }
  }

  /**
   * Fallback method to download JSON file
   */
  private downloadJsonFile(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.boardState.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('✅ JSON export downloaded');
  }

  /**
   * Import idea board from JSON file
   */
  private async importFromJson(): Promise<void> {
    try {
      // Create file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.style.display = 'none';

      // Handle file selection
      fileInput.addEventListener('change', async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
          return;
        }

        try {
          const text = await file.text();
          const importedBoardState = JSON.parse(text) as IdeaBoardState;
          
          // Validate the imported data
          if (!this.validateImportedBoardState(importedBoardState)) {
            console.error('❌ Invalid board state format');
            alert('❌ The selected file is not a valid Idea Board JSON file.');
            return;
          }

          // Confirm import (this will replace current board)
          const confirmImport = confirm(
            `⚠️ Import Idea Board\n\n` +
            `This will replace the current board with:\n` +
            `• Board: "${importedBoardState.name}"\n` +
            `• Elements: ${importedBoardState.elements.length}\n` +
            `• Connections: ${importedBoardState.connections.length}\n\n` +
            `Current board data will be lost. Continue?`
          );

          if (!confirmImport) {
            return;
          }

          // Import the board state
          await this.loadBoardState(importedBoardState);

        } catch (error) {
          console.error('❌ Failed to import JSON:', error);
          alert('❌ Failed to import board. Please check that the file is a valid JSON format.');
        }
      });

      // Trigger file selection
      document.body.appendChild(fileInput);
      fileInput.click();
      document.body.removeChild(fileInput);

    } catch (error) {
      console.error('❌ Failed to open import dialog:', error);
      console.log('❌ Import failed. Please try again.');
    }
  }

  /**
   * Validate imported board state structure
   */
  private validateImportedBoardState(boardState: any): boardState is IdeaBoardState {
    return (
      typeof boardState === 'object' &&
      typeof boardState.id === 'string' &&
      typeof boardState.name === 'string' &&
      Array.isArray(boardState.elements) &&
      Array.isArray(boardState.connections) &&
      typeof boardState.viewport === 'object' &&
      typeof boardState.viewport.x === 'number' &&
      typeof boardState.viewport.y === 'number' &&
      typeof boardState.viewport.zoom === 'number' &&
      typeof boardState.metadata === 'object'
    );
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