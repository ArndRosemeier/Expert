import type { Point, Viewport } from '../types/BoardTypes';
import type { PostItNote } from './PostItNote';

export interface ConnectionData {
  id: string;
  fromPostItId: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toPostItId: string;
  toSide: 'top' | 'right' | 'bottom' | 'left';
  style: {
    color: string;
    thickness: number;
    lineType: 'straight' | 'curved';
  };
}

export class Connection {
  public id: string;
  public fromPostItId: string;
  public fromSide: 'top' | 'right' | 'bottom' | 'left';
  public toPostItId: string;
  public toSide: 'top' | 'right' | 'bottom' | 'left';
  public style: {
    color: string;
    thickness: number;
    lineType: 'straight' | 'curved';
  };
  
  // Animation state
  private isAnimated: boolean = false;
  private animationStartTime: number = 0;
  private animationDuration: number = 2000; // 2 seconds per cycle

  constructor(
    fromPostItId: string,
    fromSide: 'top' | 'right' | 'bottom' | 'left',
    toPostItId: string,
    toSide: 'top' | 'right' | 'bottom' | 'left'
  ) {
    this.id = `connection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.fromPostItId = fromPostItId;
    this.fromSide = fromSide;
    this.toPostItId = toPostItId;
    this.toSide = toSide;
    this.style = {
      color: '#666666',
      thickness: 2,
      lineType: 'straight'
    };
  }

  /**
   * Render the connection line between two post-its with segmented arrows
   */
  render(
    context: CanvasRenderingContext2D, 
    viewport: Viewport, 
    fromPostIt: PostItNote, 
    toPostIt: PostItNote
  ): void {
    const fromScreenPos = viewport.worldToScreen(fromPostIt.position.x, fromPostIt.position.y);
    const fromScreenWidth = fromPostIt.size.width * viewport.zoom;
    const fromScreenHeight = fromPostIt.size.height * viewport.zoom;

    const toScreenPos = viewport.worldToScreen(toPostIt.position.x, toPostIt.position.y);
    const toScreenWidth = toPostIt.size.width * viewport.zoom;
    const toScreenHeight = toPostIt.size.height * viewport.zoom;

    // Get connection point positions
    const fromDots = fromPostIt.getConnectionDotPositions(fromScreenPos, fromScreenWidth, fromScreenHeight);
    const toDots = toPostIt.getConnectionDotPositions(toScreenPos, toScreenWidth, toScreenHeight);

    const fromDot = fromDots.find(dot => dot.side === this.fromSide);
    const toDot = toDots.find(dot => dot.side === this.toSide);

    if (!fromDot || !toDot) return;

    // Calculate distance and number of segments
    const dx = toDot.x - fromDot.x;
    const dy = toDot.y - fromDot.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const numSegments = Math.max(2, Math.floor(distance / 30));

    // Draw the connection line with segmented arrows
    context.save();
    context.strokeStyle = this.style.color;
    context.lineWidth = this.style.thickness * viewport.zoom;
    context.lineCap = 'round';

    if (this.isAnimated) {
      // Render animated flowing arrows
      this.renderAnimatedConnection(context, fromDot, toDot, viewport.zoom);
    } else {
      // Render static segmented arrows
      if (this.style.lineType === 'straight') {
        this.renderSegmentedStraightLine(context, fromDot, toDot, numSegments, viewport.zoom);
      } else {
        this.renderSegmentedCurvedLine(context, fromDot, toDot, numSegments, viewport.zoom);
      }
    }

    context.restore();
  }

  /**
   * Render a segmented straight line connection with multiple arrows
   */
  private renderSegmentedStraightLine(context: CanvasRenderingContext2D, from: Point, to: Point, numSegments: number, zoom: number): void {
    const segmentLength = 1 / numSegments;
    
    for (let i = 0; i < numSegments; i++) {
      const startT = i * segmentLength;
      const endT = (i + 1) * segmentLength;
      
      // Calculate segment start and end points
      const startX = from.x + (to.x - from.x) * startT;
      const startY = from.y + (to.y - from.y) * startT;
      const endX = from.x + (to.x - from.x) * endT;
      const endY = from.y + (to.y - from.y) * endT;
      
      // Draw the line segment
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
      
      // Draw arrow at the end of each segment
      this.renderArrowhead(context, { x: startX, y: startY }, { x: endX, y: endY }, zoom);
    }
  }

  /**
   * Render a segmented curved line connection with multiple arrows
   */
  private renderSegmentedCurvedLine(context: CanvasRenderingContext2D, from: Point, to: Point, numSegments: number, zoom: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Create control points for bezier curve
    const controlOffset = Math.min(distance * 0.4, 50);
    const cp1x = from.x + (this.fromSide === 'right' ? controlOffset : this.fromSide === 'left' ? -controlOffset : 0);
    const cp1y = from.y + (this.fromSide === 'bottom' ? controlOffset : this.fromSide === 'top' ? -controlOffset : 0);
    const cp2x = to.x + (this.toSide === 'right' ? controlOffset : this.toSide === 'left' ? -controlOffset : 0);
    const cp2y = to.y + (this.toSide === 'bottom' ? controlOffset : this.toSide === 'top' ? -controlOffset : 0);

    const segmentLength = 1 / numSegments;
    
    for (let i = 0; i < numSegments; i++) {
      const startT = i * segmentLength;
      const endT = (i + 1) * segmentLength;
      
      // Calculate segment start and end points using bezier curve interpolation
      const startPoint = this.getBezierPoint(from, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, to, startT);
      const endPoint = this.getBezierPoint(from, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, to, endT);
      
      // Draw the curve segment
      context.beginPath();
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(endPoint.x, endPoint.y);
      context.stroke();
      
      // Draw arrow at the end of each segment
      this.renderArrowhead(context, startPoint, endPoint, zoom);
    }
  }

  /**
   * Calculate a point on a cubic bezier curve at parameter t (0 to 1)
   */
  private getBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const oneMinusT = 1 - t;
    const oneMinusTSquared = oneMinusT * oneMinusT;
    const oneMinusTCubed = oneMinusTSquared * oneMinusT;
    const tSquared = t * t;
    const tCubed = tSquared * t;
    
    return {
      x: oneMinusTCubed * p0.x + 3 * oneMinusTSquared * t * p1.x + 3 * oneMinusT * tSquared * p2.x + tCubed * p3.x,
      y: oneMinusTCubed * p0.y + 3 * oneMinusTSquared * t * p1.y + 3 * oneMinusT * tSquared * p2.y + tCubed * p3.y
    };
  }

  /**
   * Render animated flowing arrows along the connection
   */
  private renderAnimatedConnection(context: CanvasRenderingContext2D, from: Point, to: Point, zoom: number): void {
    // Draw the base connection line first
    if (this.style.lineType === 'straight') {
      this.renderStraightLine(context, from, to);
    } else {
      this.renderCurvedLine(context, from, to);
    }

    // Calculate animation progress (0 to 1, repeating)
    const elapsed = Date.now() - this.animationStartTime;
    const progress = (elapsed % this.animationDuration) / this.animationDuration;
    
    // Number of flowing arrows to show along the connection
    const numFlowingArrows = 3;
    const arrowSpacing = 1 / numFlowingArrows;
    
    // Calculate distance and control points for curves
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let controlPoints: { cp1: Point; cp2: Point } | null = null;
    if (this.style.lineType === 'curved') {
      const controlOffset = Math.min(distance * 0.4, 50);
      controlPoints = {
        cp1: {
          x: from.x + (this.fromSide === 'right' ? controlOffset : this.fromSide === 'left' ? -controlOffset : 0),
          y: from.y + (this.fromSide === 'bottom' ? controlOffset : this.fromSide === 'top' ? -controlOffset : 0)
        },
        cp2: {
          x: to.x + (this.toSide === 'right' ? controlOffset : this.toSide === 'left' ? -controlOffset : 0),
          y: to.y + (this.toSide === 'bottom' ? controlOffset : this.toSide === 'top' ? -controlOffset : 0)
        }
      };
    }
    
    // Draw flowing arrows
    for (let i = 0; i < numFlowingArrows; i++) {
      const basePosition = i * arrowSpacing;
      let currentPosition = (basePosition + progress) % 1;
      
      // Only draw arrow if it's in valid range
      if (currentPosition >= 0 && currentPosition <= 1) {
        let currentPoint: Point;
        let nextPoint: Point;
        
        if (this.style.lineType === 'straight') {
          // Linear interpolation for straight lines
          currentPoint = {
            x: from.x + (to.x - from.x) * currentPosition,
            y: from.y + (to.y - from.y) * currentPosition
          };
          
          // Calculate direction for arrow by looking slightly ahead
          const lookAhead = Math.min(currentPosition + 0.05, 1);
          nextPoint = {
            x: from.x + (to.x - from.x) * lookAhead,
            y: from.y + (to.y - from.y) * lookAhead
          };
        } else {
          // Bezier interpolation for curved lines
          currentPoint = this.getBezierPoint(from, controlPoints!.cp1, controlPoints!.cp2, to, currentPosition);
          
          // Calculate direction for arrow by looking slightly ahead
          const lookAhead = Math.min(currentPosition + 0.05, 1);
          nextPoint = this.getBezierPoint(from, controlPoints!.cp1, controlPoints!.cp2, to, lookAhead);
        }
        
        // Draw the flowing arrow
        this.renderFlowingArrowhead(context, currentPoint, nextPoint, zoom);
      }
    }
  }

  /**
   * Render a flowing arrowhead with enhanced visibility
   */
  private renderFlowingArrowhead(context: CanvasRenderingContext2D, from: Point, to: Point, zoom: number): void {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const arrowSize = 12 * zoom; // Slightly larger than normal arrows
    
    // Use a brighter, more visible color for flowing arrows
    context.fillStyle = this.style.color === '#666666' ? '#ff6600' : this.style.color;
    context.strokeStyle = this.style.color === '#666666' ? '#ff6600' : this.style.color;
    context.lineWidth = (this.style.thickness + 1) * zoom;
    
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(
      from.x - arrowSize * Math.cos(angle - Math.PI / 6),
      from.y - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    context.lineTo(
      from.x - arrowSize * Math.cos(angle + Math.PI / 6),
      from.y - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    context.closePath();
    context.fill();
    
    // Add a subtle glow effect
    context.shadowColor = this.style.color === '#666666' ? '#ff6600' : this.style.color;
    context.shadowBlur = 3 * zoom;
    context.fill();
    context.shadowBlur = 0; // Reset shadow
  }

  /**
   * Render a straight line connection (legacy method kept for compatibility)
   */
  private renderStraightLine(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  /**
   * Render a curved line connection (legacy method kept for compatibility)
   */
  private renderCurvedLine(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Create control points for bezier curve
    const controlOffset = Math.min(distance * 0.4, 50);
    const cp1x = from.x + (this.fromSide === 'right' ? controlOffset : this.fromSide === 'left' ? -controlOffset : 0);
    const cp1y = from.y + (this.fromSide === 'bottom' ? controlOffset : this.fromSide === 'top' ? -controlOffset : 0);
    const cp2x = to.x + (this.toSide === 'right' ? controlOffset : this.toSide === 'left' ? -controlOffset : 0);
    const cp2y = to.y + (this.toSide === 'bottom' ? controlOffset : this.toSide === 'top' ? -controlOffset : 0);

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y);
    context.stroke();
  }

  /**
   * Render an arrowhead at the end of the connection
   */
  private renderArrowhead(context: CanvasRenderingContext2D, from: Point, to: Point, zoom: number): void {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const arrowSize = 8 * zoom;

    context.fillStyle = this.style.color;
    context.beginPath();
    context.moveTo(to.x, to.y);
    context.lineTo(
      to.x - arrowSize * Math.cos(angle - Math.PI / 6),
      to.y - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    context.lineTo(
      to.x - arrowSize * Math.cos(angle + Math.PI / 6),
      to.y - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    context.closePath();
    context.fill();
  }

  /**
   * Serialize connection to data format
   */
  serialize(): ConnectionData {
    return {
      id: this.id,
      fromPostItId: this.fromPostItId,
      fromSide: this.fromSide,
      toPostItId: this.toPostItId,
      toSide: this.toSide,
      style: { ...this.style }
    };
  }

  /**
   * Deserialize from data format
   */
  deserialize(data: ConnectionData): void {
    this.id = data.id;
    this.fromPostItId = data.fromPostItId;
    this.fromSide = data.fromSide;
    this.toPostItId = data.toPostItId;
    this.toSide = data.toSide;
    this.style = { ...data.style };
  }

  /**
   * Start the flowing arrow animation
   */
  startAnimation(): void {
    this.isAnimated = true;
    this.animationStartTime = Date.now();
  }

  /**
   * Stop the flowing arrow animation
   */
  stopAnimation(): void {
    this.isAnimated = false;
  }

  /**
   * Check if the connection is currently animated
   */
  isAnimating(): boolean {
    return this.isAnimated;
  }
} 