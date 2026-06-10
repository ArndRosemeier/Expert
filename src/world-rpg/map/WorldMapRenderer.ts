/**
 * WorldMapRenderer - a 2D canvas map with a Google-Maps-style camera.
 *
 * - Pan: mouse drag, or one-finger drag (Pointer Events).
 * - Zoom: cursor-anchored mouse wheel, or two-finger pinch.
 * - Fog of war: unknown locations are hidden; known-but-unvisited are dimmed.
 * - Level of detail: labels appear as you zoom in.
 *
 * The camera is stored on the adventure (adventure.ui.camera) so it persists.
 * The renderer only reads the world store; it never mutates game state (it may
 * fill in missing layout positions, which are pure display data).
 */

import { Adventure, CameraState, MapPosition } from '../types/WorldRpgTypes';
import { charactersAt, charactersInTransit } from '../services/worldGraph';
import { ADJACENT } from '../types/WorldRpgTypes';
import { updateLayout } from './layoutEngine';
import { MAX_ZOOM, MIN_ZOOM } from '../constants';

const NODE_RADIUS = 10;
const SHOW_LABELS_ABOVE_ZOOM = 0.45;
const SHOW_EDGE_LABELS_ABOVE_ZOOM = 0.75;
/** Screen movement (px) before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;
const TOOLTIP_MAX_WIDTH = 240;

interface PointerSample {
  x: number;
  y: number;
}

export interface WorldMapRendererOptions {
  /** Called whenever the camera changes (for debounced persistence). */
  onCameraChange?: (camera: CameraState) => void;
  /** Called after the user finishes dragging a node (layout changed). */
  onLayoutChange?: () => void;
  /** Called on right-click of a node, to open a debug inspector for it. */
  onNodeInspect?: (locationId: string) => void;
}

/** Active single-pointer interaction: dragging a node, or panning empty space. */
interface ActivePointerDrag {
  /** Node being dragged, or null when panning. */
  nodeId: string | null;
  downScreen: PointerSample;
  moved: boolean;
}

export class WorldMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private adventure: Adventure | null = null;
  private options: WorldMapRendererOptions;

  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  private resizeObserver: ResizeObserver;
  private pointers = new Map<number, PointerSample>();
  private pinchPrevDistance = 0;
  private pinchPrevMid: PointerSample = { x: 0, y: 0 };
  private renderScheduled = false;
  private activeDrag: ActivePointerDrag | null = null;
  /** Location whose description tooltip is currently shown (null = none). */
  private selectedNodeId: string | null = null;

  constructor(canvas: HTMLCanvasElement, options: WorldMapRendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context for the world map.');
    }
    this.ctx = ctx;
    this.options = options;

    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);

    this.resizeObserver = new ResizeObserver(() => { this.handleResize(); });
    this.resizeObserver.observe(this.canvas);
    this.handleResize();
  }

  setAdventure(adventure: Adventure): void {
    this.adventure = adventure;
    this.ensureLayout();
    this.scheduleRender();
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.resizeObserver.disconnect();
  }

  // ---- Camera helpers ----

  private get camera(): CameraState {
    if (!this.adventure) {
      throw new Error('Map renderer has no adventure set.');
    }
    return this.adventure.ui.camera;
  }

  private worldToScreen(p: MapPosition): PointerSample {
    const cam = this.camera;
    return {
      x: (p.x - cam.panX) * cam.zoom + this.cssWidth / 2,
      y: (p.y - cam.panY) * cam.zoom + this.cssHeight / 2
    };
  }

  private screenToWorld(p: PointerSample): MapPosition {
    const cam = this.camera;
    return {
      x: (p.x - this.cssWidth / 2) / cam.zoom + cam.panX,
      y: (p.y - this.cssHeight / 2) / cam.zoom + cam.panY
    };
  }

  private localPoint(e: PointerEvent | WheelEvent): PointerSample {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private emitCameraChange(): void {
    this.options.onCameraChange?.(this.camera);
  }

  // ---- Public camera actions ----

  recenterToPlayer(): void {
    if (!this.adventure) {
      return;
    }
    const pos = this.adventure.graph.layout[this.adventure.currentLocationId];
    if (!pos) {
      return;
    }
    this.camera.panX = pos.x;
    this.camera.panY = pos.y;
    this.scheduleRender();
    this.emitCameraChange();
  }

  zoomToFit(): void {
    if (!this.adventure) {
      return;
    }
    const graph = this.adventure.graph;
    const layout = graph.layout;
    const positions: MapPosition[] = [];
    for (const id of Object.keys(graph.locations)) {
      const location = graph.locations[id];
      const p = layout[id];
      if (!location || !location.known || !p) {
        continue;
      }
      positions.push(p);
    }
    if (positions.length === 0) {
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const padding = 80;
    const zoomX = (this.cssWidth - padding * 2) / spanX;
    const zoomY = (this.cssHeight - padding * 2) / spanY;
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY)));
    this.camera.panX = (minX + maxX) / 2;
    this.camera.panY = (minY + maxY) / 2;
    this.scheduleRender();
    this.emitCameraChange();
  }

  // ---- Pointer / wheel handlers ----

  private handlePointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const local = this.localPoint(e);
    this.pointers.set(e.pointerId, local);
    if (this.pointers.size === 2) {
      this.activeDrag = null; // cancel single-pointer interaction during pinch
      this.initPinch();
      return;
    }
    if (this.pointers.size === 1 && this.adventure) {
      this.activeDrag = { nodeId: this.hitTestNode(local), downScreen: local, moved: false };
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId) || !this.adventure) {
      return;
    }
    const previous = this.pointers.get(e.pointerId)!;
    const current = this.localPoint(e);
    this.pointers.set(e.pointerId, current);

    if (this.pointers.size === 2) {
      this.updatePinch();
      return;
    }
    if (this.pointers.size !== 1 || !this.activeDrag) {
      return;
    }

    if (!this.activeDrag.moved) {
      const travelled = Math.hypot(
        current.x - this.activeDrag.downScreen.x,
        current.y - this.activeDrag.downScreen.y
      );
      if (travelled > DRAG_THRESHOLD) {
        this.activeDrag.moved = true;
      }
    }
    if (!this.activeDrag.moved) {
      return;
    }

    if (this.activeDrag.nodeId) {
      // Move only the node, not the connections; edges follow automatically.
      this.adventure.graph.layout[this.activeDrag.nodeId] = this.screenToWorld(current);
      this.scheduleRender();
    } else {
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      this.camera.panX -= dx / this.camera.zoom;
      this.camera.panY -= dy / this.camera.zoom;
      this.scheduleRender();
      this.emitCameraChange();
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }

    if (this.activeDrag) {
      if (this.activeDrag.nodeId) {
        if (this.activeDrag.moved) {
          this.options.onLayoutChange?.();
        } else {
          // A click (no drag) on a node toggles its description tooltip.
          this.selectedNodeId = this.selectedNodeId === this.activeDrag.nodeId ? null : this.activeDrag.nodeId;
        }
        this.scheduleRender();
      } else if (!this.activeDrag.moved && this.selectedNodeId !== null) {
        // A click on empty space dismisses the tooltip.
        this.selectedNodeId = null;
        this.scheduleRender();
      }
      this.activeDrag = null;
    }

    if (this.pointers.size === 2) {
      this.initPinch();
    }
  };

  private handleContextMenu = (e: MouseEvent): void => {
    if (!this.adventure) {
      return;
    }
    const local: PointerSample = (() => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    })();
    const nodeId = this.hitTestNode(local);
    if (nodeId) {
      e.preventDefault();
      this.options.onNodeInspect?.(nodeId);
    }
  };

  /** Nearest known node under a screen point, within hit radius, else null. */
  private hitTestNode(screen: PointerSample): string | null {
    if (!this.adventure) {
      return null;
    }
    const graph = this.adventure.graph;
    let best: string | null = null;
    let bestDistance = NODE_RADIUS + 4;
    for (const location of Object.values(graph.locations)) {
      const lp = graph.layout[location.id];
      if (!location.known || !lp) {
        continue;
      }
      const p = this.worldToScreen(lp);
      const distance = Math.hypot(p.x - screen.x, p.y - screen.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = location.id;
      }
    }
    return best;
  }

  private handleWheel = (e: WheelEvent): void => {
    if (!this.adventure) {
      return;
    }
    e.preventDefault();
    const cursor = this.localPoint(e);
    const worldBefore = this.screenToWorld(cursor);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.applyZoom(this.camera.zoom * factor, worldBefore, cursor);
  };

  private initPinch(): void {
    const samples = [...this.pointers.values()];
    const [a, b] = samples;
    if (!a || !b) {
      return;
    }
    this.pinchPrevDistance = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchPrevMid = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    };
  }

  private updatePinch(): void {
    const samples = [...this.pointers.values()];
    const [a, b] = samples;
    if (!a || !b) {
      return;
    }
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const mid: PointerSample = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    };

    // Pan by midpoint movement.
    const dx = mid.x - this.pinchPrevMid.x;
    const dy = mid.y - this.pinchPrevMid.y;
    this.camera.panX -= dx / this.camera.zoom;
    this.camera.panY -= dy / this.camera.zoom;

    // Zoom anchored at the pinch midpoint.
    if (this.pinchPrevDistance > 0) {
      const worldAtMid = this.screenToWorld(mid);
      const factor = distance / this.pinchPrevDistance;
      this.applyZoom(this.camera.zoom * factor, worldAtMid, mid, false);
    }

    this.pinchPrevDistance = distance;
    this.pinchPrevMid = mid;
    this.scheduleRender();
    this.emitCameraChange();
  }

  private applyZoom(targetZoom: number, anchorWorld: MapPosition, anchorScreen: PointerSample, render = true): void {
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    const worldAfter = this.screenToWorld(anchorScreen);
    this.camera.panX += anchorWorld.x - worldAfter.x;
    this.camera.panY += anchorWorld.y - worldAfter.y;
    if (render) {
      this.scheduleRender();
      this.emitCameraChange();
    }
  }

  // ---- Sizing ----

  private handleResize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.cssWidth = this.canvas.clientWidth;
    this.cssHeight = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * this.dpr));
    this.scheduleRender();
  }

  private ensureLayout(): void {
    if (!this.adventure) {
      return;
    }
    const graph = this.adventure.graph;
    const missing = Object.keys(graph.locations).some(id => !graph.layout[id]);
    if (missing) {
      graph.layout = updateLayout(graph);
    }
  }

  // ---- Rendering ----

  scheduleRender(): void {
    if (this.renderScheduled) {
      return;
    }
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  private isOnScreen(p: PointerSample, margin: number): boolean {
    return p.x >= -margin && p.x <= this.cssWidth + margin && p.y >= -margin && p.y <= this.cssHeight + margin;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = '#11151c';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    if (!this.adventure) {
      return;
    }
    this.ensureLayout();

    const graph = this.adventure.graph;
    const layout = graph.layout;
    const zoom = this.camera.zoom;
    const showLabels = zoom >= SHOW_LABELS_ABOVE_ZOOM;
    const showEdgeLabels = zoom >= SHOW_EDGE_LABELS_ABOVE_ZOOM;
    const cullMargin = 120;

    // Edges (only between known endpoints).
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3a4658';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const edge of Object.values(graph.edges)) {
      const a = graph.locations[edge.aId];
      const b = graph.locations[edge.bId];
      const la = layout[edge.aId];
      const lb = layout[edge.bId];
      if (!a || !b || !a.known || !b.known || !la || !lb) {
        continue;
      }
      const pa = this.worldToScreen(la);
      const pb = this.worldToScreen(lb);
      // Cull edges whose bounding box does not intersect the viewport.
      if (Math.max(pa.x, pb.x) < -cullMargin || Math.min(pa.x, pb.x) > this.cssWidth + cullMargin ||
          Math.max(pa.y, pb.y) < -cullMargin || Math.min(pa.y, pb.y) > this.cssHeight + cullMargin) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      if (showEdgeLabels) {
        const label = edge.distance === ADJACENT
          ? 'adjacent'
          : `${edge.distance} m`;
        ctx.fillStyle = '#7c8aa0';
        ctx.fillText(label, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 8);
      }
    }

    // Nodes.
    for (const location of Object.values(graph.locations)) {
      const lp = layout[location.id];
      if (!location.known || !lp) {
        continue;
      }
      const pos = this.worldToScreen(lp);
      if (!this.isOnScreen(pos, cullMargin)) {
        continue;
      }
      const isCurrent = location.id === this.adventure.currentLocationId;
      const occupants = charactersAt(graph, location.id).filter(c => !c.isPlayer).length;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI * 2);
      if (isCurrent) {
        ctx.fillStyle = '#f0b429';
      } else if (location.visited) {
        ctx.fillStyle = '#4a90d9';
      } else {
        ctx.fillStyle = '#2c3a4d'; // known but unvisited (dimmed)
      }
      ctx.fill();
      ctx.lineWidth = isCurrent ? 3 : 1.5;
      ctx.strokeStyle = isCurrent ? '#fff3d6' : '#5a6b82';
      ctx.stroke();

      if (occupants > 0) {
        ctx.beginPath();
        ctx.arc(pos.x + NODE_RADIUS, pos.y - NODE_RADIUS, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e05c5c';
        ctx.fill();
      }

      if (showLabels) {
        ctx.fillStyle = location.visited || isCurrent ? '#e8edf4' : '#8a98ac';
        ctx.fillText(location.name, pos.x, pos.y + NODE_RADIUS + 12);
      }
    }

    // In-transit characters: a marker interpolated along their route by clock.
    for (const character of charactersInTransit(graph)) {
      const transit = character.transit;
      if (!transit) {
        continue;
      }
      const lf = layout[transit.fromId];
      const lt = layout[transit.toId];
      const from = graph.locations[transit.fromId];
      const to = graph.locations[transit.toId];
      if (!lf || !lt || !from || !to || (!from.known && !to.known)) {
        continue;
      }
      const total = transit.arrivalClock - transit.departedClock;
      const elapsed = this.adventure.clockMinutes - transit.departedClock;
      const progress = total <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / total));
      const marker = this.worldToScreen({
        x: lf.x + (lt.x - lf.x) * progress,
        y: lf.y + (lt.y - lf.y) * progress
      });
      if (!this.isOnScreen(marker, cullMargin)) {
        continue;
      }
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#5ad27a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0c0f14';
      ctx.stroke();
      if (showLabels) {
        ctx.fillStyle = '#bfe9cc';
        ctx.fillText(character.name, marker.x, marker.y - 9);
      }
    }

    // Player token over the current location.
    const playerPos = layout[this.adventure.currentLocationId];
    if (playerPos) {
      const screen = this.worldToScreen(playerPos);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // Description tooltip for the clicked node (drawn last, on top).
    if (this.selectedNodeId) {
      const loc = graph.locations[this.selectedNodeId];
      const lp = layout[this.selectedNodeId];
      if (loc && loc.known && lp) {
        this.drawTooltip(loc.name, loc.description, this.worldToScreen(lp));
      }
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && this.ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawTooltip(title: string, body: string, anchor: PointerSample): void {
    const ctx = this.ctx;
    const padding = 8;
    const lineHeight = 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = 'bold 13px sans-serif';
    const titleLines = this.wrapText(title, TOOLTIP_MAX_WIDTH);
    const titleWidth = Math.max(0, ...titleLines.map(l => ctx.measureText(l).width));

    ctx.font = '12px sans-serif';
    const bodyLines = body.trim().length > 0 ? this.wrapText(body, TOOLTIP_MAX_WIDTH) : [];
    const bodyWidth = Math.max(0, ...bodyLines.map(l => ctx.measureText(l).width));

    const contentWidth = Math.max(40, titleWidth, bodyWidth);
    const boxW = contentWidth + padding * 2;
    const boxH = (titleLines.length + bodyLines.length) * lineHeight + padding * 2;

    let boxX = anchor.x - boxW / 2;
    boxX = Math.max(4, Math.min(this.cssWidth - boxW - 4, boxX));
    let boxY = anchor.y - NODE_RADIUS - 10 - boxH;
    if (boxY < 4) {
      boxY = anchor.y + NODE_RADIUS + 10; // flip below the node if no room above
    }
    boxY = Math.max(4, Math.min(this.cssHeight - boxH - 4, boxY));

    ctx.fillStyle = 'rgba(12, 15, 20, 0.95)';
    ctx.strokeStyle = '#3a85d1';
    ctx.lineWidth = 1;
    this.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    let textY = boxY + padding;
    ctx.fillStyle = '#fff3d6';
    ctx.font = 'bold 13px sans-serif';
    for (const line of titleLines) {
      ctx.fillText(line, boxX + padding, textY);
      textY += lineHeight;
    }
    ctx.fillStyle = '#cdd6e2';
    ctx.font = '12px sans-serif';
    for (const line of bodyLines) {
      ctx.fillText(line, boxX + padding, textY);
      textY += lineHeight;
    }
  }
}
