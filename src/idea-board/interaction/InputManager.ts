import type { Point } from '../types/BoardTypes';

interface InputManagerEvents {
  onMouseDown: (point: Point, event: MouseEvent) => void;
  onMouseMove: (point: Point, event: MouseEvent) => void;
  onMouseUp: (point: Point, event: MouseEvent) => void;
  onDoubleClick: (point: Point, event: MouseEvent) => void;
  onWheel: (delta: number, point: Point, event: WheelEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private callbacks: Partial<InputManagerEvents> = {};
  private isMouseDown: boolean = false;
  private isDragging: boolean = false;
  private dragStartPos: Point | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  /**
   * Register event callbacks
   */
  on<K extends keyof InputManagerEvents>(event: K, callback: InputManagerEvents[K]): void {
    this.callbacks[event] = callback;
  }

  /**
   * Get mouse position relative to canvas
   */
  private getMousePos(event: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  /**
   * Setup all event listeners
   */
  private setupEventListeners(): void {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

    // Keyboard events
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));

    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

    // Focus canvas for keyboard events
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.style.outline = 'none';
  }

  /**
   * Handle mouse down events
   */
  private handleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isMouseDown = true;
    this.isDragging = false;
    
    const mousePos = this.getMousePos(event);
    this.dragStartPos = mousePos;
    
    this.canvas.focus(); // Ensure canvas has focus for keyboard events
    this.callbacks.onMouseDown?.(mousePos, event);
  }

  /**
   * Handle mouse move events
   */
  private handleMouseMove(event: MouseEvent): void {
    const mousePos = this.getMousePos(event);
    
    // Detect dragging
    if (this.isMouseDown && this.dragStartPos && !this.isDragging) {
      const dragDistance = Math.sqrt(
        Math.pow(mousePos.x - this.dragStartPos.x, 2) + 
        Math.pow(mousePos.y - this.dragStartPos.y, 2)
      );
      
      if (dragDistance > 3) { // Minimum drag distance threshold
        this.isDragging = true;
      }
    }
    
    this.callbacks.onMouseMove?.(mousePos, event);
  }

  /**
   * Handle mouse up events
   */
  private handleMouseUp(event: MouseEvent): void {
    this.isMouseDown = false;
    
    const mousePos = this.getMousePos(event);
    this.callbacks.onMouseUp?.(mousePos, event);
    
    this.isDragging = false;
    this.dragStartPos = null;
  }

  /**
   * Handle double click events
   */
  private handleDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    const mousePos = this.getMousePos(event);
    this.callbacks.onDoubleClick?.(mousePos, event);
  }

  /**
   * Handle wheel events for zooming
   */
  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const mousePos = this.getMousePos(event);
    const delta = -event.deltaY; // Invert for natural zoom direction
    this.callbacks.onWheel?.(delta, mousePos, event);
  }

  /**
   * Handle key down events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // Only handle if canvas has focus or no other input is focused
    if (document.activeElement === this.canvas || 
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)) {
      this.callbacks.onKeyDown?.(event);
    }
  }

  /**
   * Handle key up events
   */
  private handleKeyUp(event: KeyboardEvent): void {
    if (document.activeElement === this.canvas || 
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)) {
      this.callbacks.onKeyUp?.(event);
    }
  }

  /**
   * Check if currently dragging
   */
  isDragMode(): boolean {
    return this.isDragging;
  }

  /**
   * Check if mouse is down
   */
  isMousePressed(): boolean {
    return this.isMouseDown;
  }

  /**
   * Cleanup event listeners
   */
  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
    this.canvas.removeEventListener('wheel', this.handleWheel.bind(this));
    
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
  }
} 