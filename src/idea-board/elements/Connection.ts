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
   * Render the connection line between two post-its
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

    // Draw the connection line
    context.save();
    context.strokeStyle = this.style.color;
    context.lineWidth = this.style.thickness * viewport.zoom;
    context.lineCap = 'round';

    if (this.style.lineType === 'straight') {
      this.renderStraightLine(context, fromDot, toDot);
    } else {
      this.renderCurvedLine(context, fromDot, toDot);
    }

    // Draw arrowhead at the end
    this.renderArrowhead(context, fromDot, toDot, viewport.zoom);

    context.restore();
  }

  /**
   * Render a straight line connection
   */
  private renderStraightLine(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  /**
   * Render a curved line connection
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
} 