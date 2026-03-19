import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, HostListener, NgZone, ChangeDetectionStrategy
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { Subject, combineLatest, takeUntil } from 'rxjs';

import { Vector2, Entity, EntityMap } from '../../../core/models/geometry/entity.model';
import { Layer, LayerMap } from '../../../core/models/layer.model';
import { SnapService } from '../../../core/services/snap.service';
import { CommandBusService } from '../../../core/services/command-bus.service';
import { ActiveTool, ViewportState, SnapSettings } from '../../../state/app.state';
import {
  selectEntities, selectLayers, selectLayerOrder, selectViewport,
  selectActiveTool, selectSnapSettings, selectActiveLayerId
} from '../../../state/cad/cad.selectors';
import {
  addEntity, addEntities, updateEntities, removeEntities, setPan, setZoom,
  selectEntity, selectEntities as selectEntitiesAction, deselectAll, resetViewport,
  setActiveTool
} from '../../../state/cad/cad.actions';
import {
  generateId, distVec2, subVec2, addVec2, scaleVec2,
  lerpVec2, polygonVertices, normalizeAngle
} from '../../../core/utils/math.utils';
import { hitTestEntity, entityToPolyline, rectCorners, sampleSpline } from '../../../core/utils/geometry.utils';

// ─── Tool shortcut map ────────────────────────────────────────────────────────
const TOOL_SHORTCUTS: Record<string, ActiveTool> = {
  's': 'select', 'h': 'pan', 'l': 'line', 'c': 'circle',
  'a': 'arc', 'r': 'rectangle', 'p': 'polygon', 'b': 'spline', 'd': 'point',
};

@Component({
  selector: 'app-cad-canvas',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './cad-canvas.component.html',
  styleUrl: './cad-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CadCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('wrapper') wrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private destroy$ = new Subject<void>();
  private resizeObserver!: ResizeObserver;
  private animFrameId = 0;

  // State cache
  private entities: EntityMap = {};
  private layers: LayerMap = {};
  private layerOrder: string[] = [];
  viewport: ViewportState = { zoom: 1, panX: 0, panY: 0 };
  activeTool: ActiveTool = 'select';
  private snapSettings!: SnapSettings;
  private activeLayerId = 'layer-0';

  // Interaction
  isPanning = false;
  isDrawing = false;
  private spaceDown = false;
  private panStart: Vector2 = { x: 0, y: 0 };
  private panStartViewport: Vector2 = { x: 0, y: 0 };
  private drawStart: Vector2 = { x: 0, y: 0 };
  private drawCurrent: Vector2 = { x: 0, y: 0 };
  private drawPoints: Vector2[] = [];
  private snapResult: { point: Vector2; type: string; snapped: boolean } | null = null;

  // Ortho mode (Shift or F8)
  orthoMode = false;

  // Rubber-band selection
  private isSelecting = false;
  private selectStart: Vector2 = { x: 0, y: 0 };
  private selectEnd: Vector2 = { x: 0, y: 0 };

  // Move transform state
  private isMoving = false;
  private moveStart: Vector2 = { x: 0, y: 0 };
  private moveEntitiesSnapshot: Entity[] = [];

  // Resize state
  private isResizing = false;
  private resizeEntitySnapshot: Entity | null = null;
  private resizeHandleIndex = -1;

  // Clipboard
  private clipboard: Entity[] = [];

  // Status bar
  cx = '0.000';
  cy = '0.000';
  drawHint = '';

  constructor(
    private store: Store,
    private snapService: SnapService,
    private cmdBus: CommandBusService,
    private zone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.wrapperRef.nativeElement.focus();

    this.zone.runOutsideAngular(() => {
      combineLatest([
        this.store.select(selectEntities),
        this.store.select(selectLayers),
        this.store.select(selectLayerOrder),
        this.store.select(selectViewport),
        this.store.select(selectActiveTool),
        this.store.select(selectSnapSettings),
        this.store.select(selectActiveLayerId),
      ]).pipe(takeUntil(this.destroy$)).subscribe(
        ([entities, layers, layerOrder, viewport, activeTool, snapSettings, activeLayerId]) => {
          this.entities = entities;
          this.layers = layers;
          this.layerOrder = layerOrder;
          this.viewport = viewport;
          this.activeTool = activeTool;
          this.snapSettings = snapSettings;
          this.activeLayerId = activeLayerId;
          this.scheduleRender();
        }
      );

      this.resizeObserver = new ResizeObserver(() => {
        this.resizeCanvas();
        this.scheduleRender();
      });
      this.resizeObserver.observe(this.wrapperRef.nativeElement);
    });

    this.resizeCanvas();
    this.scheduleRender();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.animFrameId);
  }

  // ─── Resize ───────────────────────────────────────────────────────────────

  private resizeCanvas(): void {
    const wrapper = this.wrapperRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private get W(): number { return this.canvasRef.nativeElement.clientWidth; }
  private get H(): number { return this.canvasRef.nativeElement.clientHeight; }

  // ─── Coordinate transforms ────────────────────────────────────────────────

  private w2s(world: Vector2): Vector2 {
    return {
      x: world.x * this.viewport.zoom + this.viewport.panX + this.W / 2,
      y: -world.y * this.viewport.zoom + this.viewport.panY + this.H / 2,
    };
  }

  private s2w(screen: Vector2): Vector2 {
    return {
      x: (screen.x - this.viewport.panX - this.W / 2) / this.viewport.zoom,
      y: -(screen.y - this.viewport.panY - this.H / 2) / this.viewport.zoom,
    };
  }

  private sr(worldRadius: number): number { return worldRadius * this.viewport.zoom; }

  // ─── Ortho constraint ─────────────────────────────────────────────────────

  private applyOrtho(from: Vector2, to: Vector2): Vector2 {
    if (!this.orthoMode) return to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: to.x, y: from.y };
    return { x: from.x, y: to.y };
  }

  // ─── Pointer events ───────────────────────────────────────────────────────

  private getScreenPos(e: MouseEvent): Vector2 {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const sp = this.getScreenPos(e as any);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.005, Math.min(500, this.viewport.zoom * factor));
    const wb = this.s2w(sp);
    const newPanX = sp.x - wb.x * newZoom - this.W / 2;
    const newPanY = sp.y + wb.y * newZoom - this.H / 2;
    this.zone.run(() => {
      this.store.dispatch(setZoom({ zoom: newZoom }));
      this.store.dispatch(setPan({ panX: newPanX, panY: newPanY }));
    });
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: MouseEvent): void {
    this.wrapperRef.nativeElement.focus();
    const sp = this.getScreenPos(e);

    if (e.button === 1 || (e.button === 0 && (this.activeTool === 'pan' || this.spaceDown))) {
      this.isPanning = true;
      this.panStart = sp;
      this.panStartViewport = { x: this.viewport.panX, y: this.viewport.panY };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const worldPos = this.s2w(sp);
    const snapped = this.snapService.resolve(worldPos, 8 / this.viewport.zoom);
    const pos = snapped.point;

    if (this.activeTool === 'select') {
      this.startSelect(pos, sp, e.shiftKey);
      return;
    }

    this.startDraw(pos, e.shiftKey);
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    const sp = this.getScreenPos(e);
    const worldPos = this.s2w(sp);

    // Snap resolve
    this.snapResult = this.snapService.resolve(worldPos, 8 / this.viewport.zoom);
    let cur = this.snapResult.point;

    // Ortho constraint during drawing
    if (this.isDrawing && this.activeTool !== 'polygon' && this.activeTool !== 'spline') {
      cur = this.applyOrtho(this.drawStart, cur);
    }
    this.drawCurrent = cur;

    this.cx = cur.x.toFixed(3);
    this.cy = cur.y.toFixed(3);
    this.updateDrawHint();

    if (this.isPanning) {
      const dx = sp.x - this.panStart.x;
      const dy = sp.y - this.panStart.y;
      this.zone.run(() => {
        this.store.dispatch(setPan({
          panX: this.panStartViewport.x + dx,
          panY: this.panStartViewport.y + dy,
        }));
      });
      return;
    }

    if (this.isResizing) {
      this.updateResize(cur);
      this.scheduleRender();
      return;
    }

    if (this.isMoving) {
      this.updateMove(cur);
      this.scheduleRender();
      return;
    }

    if (this.isSelecting) {
      this.selectEnd = cur;
    }

    this.scheduleRender();
  }

  @HostListener('mouseup', ['$event'])
  onMouseUp(e: MouseEvent): void {
    if (this.isPanning) { this.isPanning = false; return; }
    if (e.button !== 0) return;

    if (this.isResizing) { this.finishResize(); return; }
    if (this.isMoving) { this.finishMove(); return; }
    if (this.isSelecting) { this.finishSelect(e.shiftKey); return; }
    if (this.isDrawing) { this.continueOrFinishDraw(); }
  }

  @HostListener('dblclick', ['$event'])
  onDblClick(e: MouseEvent): void {
    if (this.activeTool === 'polygon' || this.activeTool === 'spline') {
      this.finishMultiDraw();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    // Space = temporary pan
    if (e.code === 'Space' && !e.repeat) {
      this.spaceDown = true;
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape') {
      this.cancelDraw();
      this.cancelMove();
      this.cancelResize();
      this.zone.run(() => this.store.dispatch(deselectAll()));
      return;
    }

    if (e.key === 'Enter') { this.finishMultiDraw(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); return; }
    if (e.key === 'F8') { this.orthoMode = !this.orthoMode; this.scheduleRender(); return; }
    if (e.key === 'F') { this.zoomToFit(); return; }  // Zoom to fit all

    // Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); this.cmdBus.undo(); return; }
      if (e.key === 'y' || e.key === 'Z') { e.preventDefault(); this.cmdBus.redo(); return; }
      if (e.key === 'a') { e.preventDefault(); this.selectAll(); return; }
      if (e.key === 'c') { e.preventDefault(); this.copyToClipboard(); return; }
      if (e.key === 'v') { e.preventDefault(); this.pasteFromClipboard(); return; }
      if (e.key === 'd') { e.preventDefault(); this.duplicateSelected(); return; }
      return;
    }

    // Shift = ortho toggle while held
    if (e.key === 'Shift') {
      this.orthoMode = true;
      this.scheduleRender();
      return;
    }

    // Tool shortcuts (only when not drawing)
    if (!this.isDrawing && !e.ctrlKey) {
      const key = e.key.toLowerCase();

      // M → switch to select/move mode
      if (key === 'm') {
        e.preventDefault();
        this.zone.run(() => this.store.dispatch(setActiveTool({ tool: 'select' })));
        this.drawHint = 'Move mode';
        return;
      }

      // G → zoom to fit (alias for F)
      if (key === 'g') {
        e.preventDefault();
        this.zoomToFit();
        return;
      }

      // + / = → zoom in
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const newZoom = Math.min(500, this.viewport.zoom * 1.3);
        this.zone.run(() => this.store.dispatch(setZoom({ zoom: newZoom })));
        return;
      }

      // - → zoom out
      if (e.key === '-') {
        e.preventDefault();
        const newZoom = Math.max(0.005, this.viewport.zoom / 1.3);
        this.zone.run(() => this.store.dispatch(setZoom({ zoom: newZoom })));
        return;
      }

      const tool = TOOL_SHORTCUTS[key];
      if (tool) {
        e.preventDefault();
        this.zone.run(() => this.store.dispatch(setActiveTool({ tool })));
      }
    }
  }

  @HostListener('keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') this.spaceDown = false;
    if (e.key === 'Shift') {
      this.orthoMode = false;
      this.scheduleRender();
    }
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  private startSelect(worldPos: Vector2, _screenPos: Vector2, additive: boolean): void {
    // Check resize handle first (only when exactly one entity is selected)
    const selectedEnts = Object.values(this.entities).filter(e => e.selected);
    if (selectedEnts.length === 1 && !additive) {
      const ent = selectedEnts[0];
      const handleIdx = this.findHandleHit(ent, worldPos, 8 / this.viewport.zoom);
      if (handleIdx >= 0) {
        this.startResize(ent, handleIdx, worldPos);
        return;
      }
    }

    const hitRadius = 6 / this.viewport.zoom;
    // Check for entity hit
    const hit = Object.values(this.entities).find(e => {
      const layer = this.layers[e.layerId];
      return e.visible && layer?.visible && !layer?.locked && hitTestEntity(e, worldPos, hitRadius);
    });

    if (hit) {
      // If already selected and we have multiple selected, start move
      const selectedIds = Object.values(this.entities).filter(e => e.selected).map(e => e.id);
      if (selectedIds.includes(hit.id) && selectedIds.length > 0) {
        this.startMove(worldPos);
        return;
      }
      this.zone.run(() => {
        this.store.dispatch(selectEntity({ id: hit.id, addToSelection: additive }));
      });
      // Start move immediately after selection
      setTimeout(() => this.startMove(worldPos), 0);
    } else {
      this.isSelecting = true;
      this.selectStart = worldPos;
      this.selectEnd = worldPos;
      if (!additive) this.zone.run(() => this.store.dispatch(deselectAll()));
    }
  }

  private finishSelect(additive: boolean): void {
    this.isSelecting = false;
    const d = distVec2(this.selectStart, this.selectEnd);
    if (d < 1 / this.viewport.zoom) { this.scheduleRender(); return; }

    const minX = Math.min(this.selectStart.x, this.selectEnd.x);
    const maxX = Math.max(this.selectStart.x, this.selectEnd.x);
    const minY = Math.min(this.selectStart.y, this.selectEnd.y);
    const maxY = Math.max(this.selectStart.y, this.selectEnd.y);

    // Window vs crossing: drag right = window (fully inside), drag left = crossing (touches)
    const windowMode = this.selectEnd.x > this.selectStart.x;

    const ids = Object.values(this.entities).filter(e => {
      const layer = this.layers[e.layerId];
      if (!e.visible || !layer?.visible || layer?.locked) return false;
      const pts = entityToPolyline(e);
      if (windowMode) {
        return pts.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
      } else {
        return pts.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
      }
    }).map(e => e.id);

    this.zone.run(() => this.store.dispatch(selectEntitiesAction({ ids })));
    this.scheduleRender();
  }

  private selectAll(): void {
    const ids = Object.values(this.entities).filter(e => {
      const layer = this.layers[e.layerId];
      return e.visible && layer?.visible && !layer?.locked;
    }).map(e => e.id);
    this.zone.run(() => this.store.dispatch(selectEntitiesAction({ ids })));
  }

  private deleteSelected(): void {
    const ids = Object.values(this.entities).filter(e => e.selected).map(e => e.id);
    if (ids.length === 0) return;
    const snapshot = ids.map(id => this.entities[id]);
    this.cmdBus.execute({
      description: `Delete ${ids.length} entity(s)`,
      execute: () => this.zone.run(() => this.store.dispatch(removeEntities({ ids }))),
      undo: () => this.zone.run(() => snapshot.forEach(e =>
        this.store.dispatch(addEntity({ entity: e }))
      )),
    });
  }

  // ─── Move ─────────────────────────────────────────────────────────────────

  private startMove(worldPos: Vector2): void {
    const selected = Object.values(this.entities).filter(e => e.selected);
    if (selected.length === 0) return;
    this.isMoving = true;
    this.moveStart = worldPos;
    this.moveEntitiesSnapshot = selected.map(e => ({ ...e }));
  }

  private updateMove(worldPos: Vector2): void {
    const dx = worldPos.x - this.moveStart.x;
    const dy = worldPos.y - this.moveStart.y;
    const moved = this.moveEntitiesSnapshot.map(e => translateEntity(e, dx, dy));
    // Update store directly (no command — command is created on finish)
    this.zone.run(() => this.store.dispatch(updateEntities({ entities: moved })));
  }

  private finishMove(): void {
    if (!this.isMoving) return;
    const dx = this.drawCurrent.x - this.moveStart.x;
    const dy = this.drawCurrent.y - this.moveStart.y;
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
      this.isMoving = false;
      return;
    }
    const before = this.moveEntitiesSnapshot;
    const after = before.map(e => translateEntity(e, dx, dy));
    this.cmdBus.execute({
      description: `Move ${before.length} entity(s)`,
      execute: () => this.zone.run(() => this.store.dispatch(updateEntities({ entities: after }))),
      undo: () => this.zone.run(() => this.store.dispatch(updateEntities({ entities: before }))),
    });
    this.isMoving = false;
    this.moveEntitiesSnapshot = [];
  }

  private cancelMove(): void {
    if (this.isMoving) {
      // Restore original positions
      this.zone.run(() => this.store.dispatch(updateEntities({ entities: this.moveEntitiesSnapshot })));
      this.isMoving = false;
      this.moveEntitiesSnapshot = [];
    }
  }

  // ─── Resize handle drag ───────────────────────────────────────────────────

  private findHandleHit(entity: Entity, worldPos: Vector2, radius: number): number {
    const pts = getHandlePoints(entity);
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - worldPos.x, dy = pts[i].y - worldPos.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) return i;
    }
    return -1;
  }

  private startResize(entity: Entity, handleIndex: number, _worldPos: Vector2): void {
    this.isResizing = true;
    this.resizeEntitySnapshot = { ...entity } as Entity;
    this.resizeHandleIndex = handleIndex;
  }

  private updateResize(worldPos: Vector2): void {
    if (!this.isResizing || !this.resizeEntitySnapshot) return;
    const updated = applyHandleDrag(this.resizeEntitySnapshot, this.resizeHandleIndex, worldPos);
    if (updated) this.zone.run(() => this.store.dispatch(updateEntities({ entities: [updated] })));
  }

  private finishResize(): void {
    if (!this.isResizing || !this.resizeEntitySnapshot) return;
    const before = this.resizeEntitySnapshot;
    const after = Object.values(this.entities).find(e => e.id === before.id);
    if (after && JSON.stringify(before) !== JSON.stringify(after)) {
      const b = before, a = { ...after };
      this.cmdBus.execute({
        description: `Resize ${b.type}`,
        execute: () => this.zone.run(() => this.store.dispatch(updateEntities({ entities: [a] }))),
        undo: () => this.zone.run(() => this.store.dispatch(updateEntities({ entities: [b] }))),
      });
    }
    this.isResizing = false;
    this.resizeEntitySnapshot = null;
    this.resizeHandleIndex = -1;
  }

  private cancelResize(): void {
    if (this.isResizing && this.resizeEntitySnapshot) {
      this.zone.run(() => this.store.dispatch(updateEntities({ entities: [this.resizeEntitySnapshot!] })));
    }
    this.isResizing = false;
    this.resizeEntitySnapshot = null;
    this.resizeHandleIndex = -1;
  }

  // ─── Clipboard / Duplicate ────────────────────────────────────────────────

  private copyToClipboard(): void {
    this.clipboard = Object.values(this.entities)
      .filter(e => e.selected)
      .map(e => ({ ...e }));
  }

  private pasteFromClipboard(): void {
    if (this.clipboard.length === 0) return;
    const newEntities = this.clipboard.map(e => ({
      ...translateEntity(e, 10, 10),
      id: generateId(),
      selected: true,
    }));
    const cap = newEntities;
    const ids = cap.map(e => e.id);
    this.cmdBus.execute({
      description: `Paste ${cap.length} entity(s)`,
      execute: () => this.zone.run(() => {
        this.store.dispatch(deselectAll());
        this.store.dispatch(addEntities({ entities: cap }));
      }),
      undo: () => this.zone.run(() => this.store.dispatch(removeEntities({ ids }))),
    });
  }

  private duplicateSelected(): void {
    const selected = Object.values(this.entities).filter(e => e.selected);
    if (selected.length === 0) return;
    const newEntities = selected.map(e => ({
      ...translateEntity(e, 10, 10),
      id: generateId(),
      selected: true,
    }));
    const cap = newEntities;
    const ids = cap.map(e => e.id);
    this.cmdBus.execute({
      description: `Duplicate ${cap.length} entity(s)`,
      execute: () => this.zone.run(() => {
        this.store.dispatch(deselectAll());
        this.store.dispatch(addEntities({ entities: cap }));
      }),
      undo: () => this.zone.run(() => this.store.dispatch(removeEntities({ ids }))),
    });
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────

  private startDraw(pos: Vector2, _shift: boolean): void {
    if (this.activeTool === 'polygon' || this.activeTool === 'spline') {
      if (!this.isDrawing) {
        this.isDrawing = true;
        this.drawPoints = [pos];
      } else {
        this.drawPoints.push(pos);
      }
      this.scheduleRender();
      return;
    }
    this.isDrawing = true;
    this.drawStart = pos;
    this.drawCurrent = pos;
  }

  private continueOrFinishDraw(): void {
    if (!this.isDrawing) return;
    if (this.activeTool === 'polygon' || this.activeTool === 'spline') return;

    const id = generateId();
    const layerId = this.activeLayerId;
    let entity: Entity | null = null;
    const cur = this.drawCurrent;

    switch (this.activeTool) {
      case 'line': {
        const d = distVec2(this.drawStart, cur);
        if (d < 0.001) break;
        entity = { id, type: 'line', layerId, selected: false, visible: true, start: { ...this.drawStart }, end: { ...cur } };
        break;
      }
      case 'circle': {
        const r = distVec2(this.drawStart, cur);
        if (r < 0.001) break;
        entity = { id, type: 'circle', layerId, selected: false, visible: true, center: { ...this.drawStart }, radius: r };
        break;
      }
      case 'arc': {
        const r = distVec2(this.drawStart, cur);
        if (r < 0.001) break;
        const startAngle = normalizeAngle(Math.atan2(cur.y - this.drawStart.y, cur.x - this.drawStart.x));
        entity = {
          id, type: 'arc', layerId, selected: false, visible: true,
          center: { ...this.drawStart }, radius: r,
          startAngle, endAngle: normalizeAngle(startAngle + Math.PI * 1.5),
          counterClockwise: false,
        };
        break;
      }
      case 'rectangle': {
        const w = cur.x - this.drawStart.x;
        const h = cur.y - this.drawStart.y;
        if (Math.abs(w) < 0.001 || Math.abs(h) < 0.001) break;
        entity = {
          id, type: 'rectangle', layerId, selected: false, visible: true,
          origin: { x: Math.min(this.drawStart.x, cur.x), y: Math.min(this.drawStart.y, cur.y) },
          width: Math.abs(w), height: Math.abs(h), rotation: 0,
        };
        break;
      }
      case 'point':
        entity = { id, type: 'point', layerId, selected: false, visible: true, position: { ...cur } };
        break;
    }

    if (entity) {
      const cap = entity;
      this.cmdBus.execute({
        description: `Add ${cap.type}`,
        execute: () => this.zone.run(() => this.store.dispatch(addEntity({ entity: cap }))),
        undo: () => this.zone.run(() => this.store.dispatch(removeEntities({ ids: [cap.id] }))),
      });
    }

    this.isDrawing = false;
    this.scheduleRender();
  }

  private finishMultiDraw(): void {
    if (!this.isDrawing || this.drawPoints.length < 2) { this.cancelDraw(); return; }

    const id = generateId();
    const layerId = this.activeLayerId;
    let entity: Entity | null = null;

    if (this.activeTool === 'polygon' && this.drawPoints.length >= 3) {
      const center = this.drawPoints.reduce(
        (acc, p) => ({ x: acc.x + p.x / this.drawPoints.length, y: acc.y + p.y / this.drawPoints.length }),
        { x: 0, y: 0 }
      );
      entity = {
        id, type: 'polygon', layerId, selected: false, visible: true,
        center, radius: distVec2(center, this.drawPoints[0]),
        sides: this.drawPoints.length, rotation: 0,
      };
    }

    if (this.activeTool === 'spline' && this.drawPoints.length >= 2) {
      entity = {
        id, type: 'spline', layerId, selected: false, visible: true,
        points: buildSplineControlPoints(this.drawPoints), closed: false,
      };
    }

    if (entity) {
      const cap = entity;
      this.cmdBus.execute({
        description: `Add ${cap.type}`,
        execute: () => this.zone.run(() => this.store.dispatch(addEntity({ entity: cap }))),
        undo: () => this.zone.run(() => this.store.dispatch(removeEntities({ ids: [cap.id] }))),
      });
    }
    this.cancelDraw();
  }

  private cancelDraw(): void {
    this.isDrawing = false;
    this.drawPoints = [];
    this.scheduleRender();
  }

  private updateDrawHint(): void {
    if (!this.isDrawing) { this.drawHint = ''; return; }
    const dx = this.drawCurrent.x - this.drawStart.x;
    const dy = this.drawCurrent.y - this.drawStart.y;
    switch (this.activeTool) {
      case 'line': {
        const len = distVec2(this.drawStart, this.drawCurrent);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        this.drawHint = `Length: ${len.toFixed(3)} mm  Angle: ${ang.toFixed(1)}°`;
        break;
      }
      case 'circle':
      case 'arc': {
        const r = distVec2(this.drawStart, this.drawCurrent);
        this.drawHint = `Radius: ${r.toFixed(3)} mm  Ø ${(r * 2).toFixed(3)} mm`;
        break;
      }
      case 'rectangle': {
        const w = Math.abs(dx); const h = Math.abs(dy);
        this.drawHint = `W: ${w.toFixed(3)} mm  H: ${h.toFixed(3)} mm  Area: ${(w * h).toFixed(2)} mm²`;
        break;
      }
      case 'polygon':
        this.drawHint = `${this.drawPoints.length} points — Enter or double-click to finish`;
        break;
      case 'spline':
        this.drawHint = `${this.drawPoints.length} points — Enter or double-click to finish`;
        break;
      default:
        this.drawHint = '';
    }
  }

  // ─── Zoom to fit ─────────────────────────────────────────────────────────

  zoomToFit(): void {
    const ents = Object.values(this.entities);
    if (ents.length === 0) {
      this.zone.run(() => this.store.dispatch(resetViewport()));
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of ents) {
      for (const p of entityToPolyline(e)) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    const pad = 40;
    const W = this.W - pad * 2;
    const H = this.H - pad * 2;
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const zoom = Math.min(W / bw, H / bh) * 0.9;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.zone.run(() => {
      this.store.dispatch(setZoom({ zoom }));
      this.store.dispatch(setPan({ panX: -cx * zoom, panY: cy * zoom }));
    });
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  private scheduleRender(): void {
    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(() => this.render());
  }

  private render(): void {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#13131a';
    ctx.fillRect(0, 0, W, H);

    this.renderGrid(ctx, W, H);
    this.renderEntities(ctx);
    this.renderPreview(ctx);
    this.renderSelectionRect(ctx);
    this.renderSnapIndicator(ctx);
    this.renderCrosshair(ctx, W, H);
  }

  private renderGrid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const gs = this.snapSettings?.gridSize ?? 1;
    const z = this.viewport.zoom;
    const sg = gs * z;
    if (sg < 3) return;

    const origin = this.w2s({ x: 0, y: 0 });

    // Minor grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = origin.x % sg; x < W; x += sg) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = origin.y % sg; y < H; y += sg) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Major grid (×10)
    const mg = sg * 10;
    if (mg > 15) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = origin.x % mg; x < W; x += mg) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = origin.y % mg; y < H; y += mg) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }

    // Grid labels at major lines
    if (mg > 60) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      const step = gs * 10;
      const startXw = Math.ceil(-((W / 2 + this.viewport.panX) / z) / step) * step;
      for (let wx = startXw; wx < W / z; wx += step) {
        const sx = this.w2s({ x: wx, y: 0 });
        if (sx.x > 10 && sx.x < W - 10) ctx.fillText(wx.toFixed(0), sx.x, H - 28);
      }
      ctx.textAlign = 'left';
      const startYw = Math.ceil(-((H / 2 - this.viewport.panY) / z) / step) * step;
      for (let wy = startYw; wy < H / z; wy += step) {
        const sy = this.w2s({ x: 0, y: wy });
        if (sy.y > 10 && sy.y < H - 28) ctx.fillText(wy.toFixed(0), 4, sy.y + 4);
      }
    }

    // Origin axes
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(220,60,60,0.5)';
    ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,200,60,0.5)';
    ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(W, origin.y); ctx.stroke();
  }

  private renderEntities(ctx: CanvasRenderingContext2D): void {
    for (const layerId of this.layerOrder) {
      const layer = this.layers[layerId];
      if (!layer?.visible) continue;
      for (const entity of Object.values(this.entities)) {
        if (entity.layerId !== layerId || !entity.visible) continue;
        this.renderEntity(ctx, entity, layer);
      }
    }
  }

  private renderEntity(ctx: CanvasRenderingContext2D, entity: Entity, layer: Layer): void {
    const isSelected = entity.selected;
    ctx.strokeStyle = isSelected ? '#f0a84a' : (entity.color || layer.color);
    ctx.lineWidth = Math.max(1, (entity.lineWidth ?? layer.lineWidth) * this.viewport.zoom);
    ctx.setLineDash([]);

    switch (entity.type) {
      case 'line': {
        const s = this.w2s(entity.start), e = this.w2s(entity.end);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        break;
      }
      case 'circle': {
        const c = this.w2s(entity.center), r = this.sr(entity.radius);
        ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0.5, r), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'arc': {
        const c = this.w2s(entity.center), r = this.sr(entity.radius);
        if (r < 0.5) break;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, -entity.endAngle, -entity.startAngle, entity.counterClockwise);
        ctx.stroke();
        break;
      }
      case 'rectangle': {
        const corners = rectCorners(entity).map(p => this.w2s(p));
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath(); ctx.stroke();
        break;
      }
      case 'polygon': {
        const verts = polygonVertices(entity.center, entity.radius, entity.sides, entity.rotation).map(p => this.w2s(p));
        ctx.beginPath(); ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath(); ctx.stroke();
        break;
      }
      case 'spline': {
        if (entity.points.length < 4) break;
        const pts = entity.points.map(p => this.w2s(p));
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i + 3 < pts.length; i += 3)
          ctx.bezierCurveTo(pts[i+1].x, pts[i+1].y, pts[i+2].x, pts[i+2].y, pts[i+3].x, pts[i+3].y);
        ctx.stroke();
        break;
      }
      case 'point': {
        const p = this.w2s(entity.position);
        ctx.fillStyle = entity.color || layer.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }

    if (isSelected) this.renderHandles(ctx, entity);
  }

  private renderHandles(ctx: CanvasRenderingContext2D, entity: Entity): void {
    ctx.fillStyle = '#f0a84a';
    ctx.strokeStyle = '#1a1a1e';
    ctx.lineWidth = 1;
    const h = (w: Vector2) => {
      const s = this.w2s(w);
      ctx.beginPath(); ctx.rect(s.x - 4, s.y - 4, 8, 8); ctx.fill(); ctx.stroke();
    };
    switch (entity.type) {
      case 'line': h(entity.start); h(entity.end); h({ x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }); break;
      case 'circle': h(entity.center); h({ x: entity.center.x + entity.radius, y: entity.center.y }); h({ x: entity.center.x, y: entity.center.y + entity.radius }); break;
      case 'arc':
        h(entity.center);
        h({ x: entity.center.x + entity.radius * Math.cos(entity.startAngle), y: entity.center.y + entity.radius * Math.sin(entity.startAngle) });
        h({ x: entity.center.x + entity.radius * Math.cos(entity.endAngle), y: entity.center.y + entity.radius * Math.sin(entity.endAngle) });
        break;
      case 'rectangle': rectCorners(entity).forEach(c => h(c)); break;
      case 'polygon': polygonVertices(entity.center, entity.radius, entity.sides, entity.rotation).forEach(v => h(v)); h(entity.center); break;
      case 'point': h(entity.position); break;
    }
  }

  private renderPreview(ctx: CanvasRenderingContext2D): void {
    if (!this.isDrawing) return;
    const cur = this.drawCurrent;
    ctx.strokeStyle = '#5b8dee';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);

    switch (this.activeTool) {
      case 'line': {
        const s = this.w2s(this.drawStart), e = this.w2s(cur);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        // Length annotation
        this.renderDimension(ctx, this.drawStart, cur, distVec2(this.drawStart, cur).toFixed(3) + ' mm');
        break;
      }
      case 'circle': {
        const c = this.w2s(this.drawStart), r = this.sr(distVec2(this.drawStart, cur));
        if (r > 0.5) { ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke(); }
        // Center mark
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(91,141,238,0.4)';
        this.renderCenterMark(ctx, this.w2s(this.drawStart));
        break;
      }
      case 'arc': {
        const c = this.w2s(this.drawStart), r = this.sr(distVec2(this.drawStart, cur));
        if (r > 0.5) { ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 1.5); ctx.stroke(); }
        break;
      }
      case 'rectangle': {
        const s = this.w2s(this.drawStart), e = this.w2s(cur);
        ctx.beginPath();
        ctx.rect(Math.min(s.x, e.x), Math.min(s.y, e.y), Math.abs(e.x - s.x), Math.abs(e.y - s.y));
        ctx.stroke();
        break;
      }
      case 'polygon':
      case 'spline': {
        if (this.drawPoints.length === 0) break;
        ctx.beginPath();
        const f = this.w2s(this.drawPoints[0]); ctx.moveTo(f.x, f.y);
        for (let i = 1; i < this.drawPoints.length; i++) {
          const p = this.w2s(this.drawPoints[i]); ctx.lineTo(p.x, p.y);
        }
        const c2 = this.w2s(cur); ctx.lineTo(c2.x, c2.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#5b8dee';
        for (const dp of this.drawPoints) {
          const p = this.w2s(dp); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
    ctx.setLineDash([]);
  }

  private renderDimension(ctx: CanvasRenderingContext2D, from: Vector2, to: Vector2, text: string): void {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const smid = this.w2s(mid);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '11px monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillRect(smid.x - tw / 2 - 3, smid.y - 14, tw + 6, 16);
    ctx.fillStyle = '#5b8dee';
    ctx.textAlign = 'center';
    ctx.fillText(text, smid.x, smid.y - 1);
    ctx.textAlign = 'left';
  }

  private renderCenterMark(ctx: CanvasRenderingContext2D, s: Vector2): void {
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y);
    ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r);
    ctx.stroke();
  }

  private renderSelectionRect(ctx: CanvasRenderingContext2D): void {
    if (!this.isSelecting) return;
    const s = this.w2s(this.selectStart), e = this.w2s(this.selectEnd);
    const x = Math.min(s.x, e.x), y = Math.min(s.y, e.y);
    const w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);
    const crossing = e.x < s.x; // drag left = crossing selection

    ctx.lineWidth = 1;
    if (crossing) {
      ctx.strokeStyle = '#4caf7d';
      ctx.fillStyle = 'rgba(76,175,125,0.06)';
      ctx.setLineDash([4, 3]);
    } else {
      ctx.strokeStyle = '#5b8dee';
      ctx.fillStyle = 'rgba(91,141,238,0.06)';
      ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderSnapIndicator(ctx: CanvasRenderingContext2D): void {
    if (!this.snapResult?.snapped) return;
    const s = this.w2s(this.snapResult.point);
    ctx.lineWidth = 1.5;

    switch (this.snapResult.type) {
      case 'endpoint':
        ctx.strokeStyle = '#f0a84a';
        ctx.beginPath(); ctx.rect(s.x - 5, s.y - 5, 10, 10); ctx.stroke();
        break;
      case 'midpoint':
        ctx.strokeStyle = '#f0a84a';
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x + 6, s.y + 4); ctx.lineTo(s.x - 6, s.y + 4); ctx.closePath(); ctx.stroke();
        break;
      case 'center':
        ctx.strokeStyle = '#4caf7d';
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x + 7, s.y); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y + 7); ctx.stroke();
        break;
      case 'quadrant':
        ctx.strokeStyle = '#4caf7d';
        ctx.beginPath(); ctx.moveTo(s.x - 5, s.y); ctx.lineTo(s.x, s.y - 5); ctx.lineTo(s.x + 5, s.y); ctx.lineTo(s.x, s.y + 5); ctx.closePath(); ctx.stroke();
        break;
      case 'grid':
        ctx.strokeStyle = 'rgba(91,141,238,0.6)';
        ctx.beginPath(); ctx.moveTo(s.x - 5, s.y); ctx.lineTo(s.x + 5, s.y); ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x, s.y + 5); ctx.stroke();
        break;
    }
  }

  private renderCrosshair(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.snapResult) return;
    const s = this.w2s(this.drawCurrent);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(s.x, 0); ctx.lineTo(s.x, H);
    ctx.moveTo(0, s.y); ctx.lineTo(W, s.y);
    ctx.stroke();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSplineControlPoints(pts: Vector2[]): Vector2[] {
  if (pts.length === 2) {
    return [pts[0], lerpVec2(pts[0], pts[1], 0.333), lerpVec2(pts[0], pts[1], 0.667), pts[1]];
  }
  const result: Vector2[] = [pts[0]];
  const tension = 0.3;
  for (let i = 0; i < pts.length - 1; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const curr = pts[i];
    const next = pts[i + 1];
    const next2 = pts[Math.min(pts.length - 1, i + 2)];
    result.push(
      addVec2(curr, scaleVec2(subVec2(next, prev), tension)),
      subVec2(next, scaleVec2(subVec2(next2, curr), tension)),
      next,
    );
  }
  return result;
}

function translateEntity(e: Entity, dx: number, dy: number): Entity {
  const t = (v: Vector2): Vector2 => ({ x: v.x + dx, y: v.y + dy });
  switch (e.type) {
    case 'line':      return { ...e, start: t(e.start), end: t(e.end) };
    case 'circle':    return { ...e, center: t(e.center) };
    case 'arc':       return { ...e, center: t(e.center) };
    case 'rectangle': return { ...e, origin: t(e.origin) };
    case 'polygon':   return { ...e, center: t(e.center) };
    case 'spline':    return { ...e, points: e.points.map(t) };
    case 'point':     return { ...e, position: t(e.position) };
  }
}

function getHandlePoints(entity: Entity): Vector2[] {
  switch (entity.type) {
    case 'line':
      return [
        entity.start,
        entity.end,
        { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 },
      ];
    case 'circle':
      return [
        entity.center,
        { x: entity.center.x + entity.radius, y: entity.center.y },
        { x: entity.center.x, y: entity.center.y + entity.radius },
      ];
    case 'arc':
      return [
        entity.center,
        { x: entity.center.x + entity.radius * Math.cos(entity.startAngle), y: entity.center.y + entity.radius * Math.sin(entity.startAngle) },
        { x: entity.center.x + entity.radius * Math.cos(entity.endAngle), y: entity.center.y + entity.radius * Math.sin(entity.endAngle) },
      ];
    case 'rectangle': {
      const { origin: o, width: w, height: h } = entity;
      return [
        { x: o.x, y: o.y },
        { x: o.x + w, y: o.y },
        { x: o.x + w, y: o.y + h },
        { x: o.x, y: o.y + h },
      ];
    }
    case 'polygon': {
      const verts: Vector2[] = [];
      for (let i = 0; i < entity.sides; i++) {
        const a = entity.rotation + (i * 2 * Math.PI / entity.sides);
        verts.push({ x: entity.center.x + entity.radius * Math.cos(a), y: entity.center.y + entity.radius * Math.sin(a) });
      }
      return [entity.center, ...verts];
    }
    case 'spline':
      return entity.points;
    case 'point':
      return [entity.position];
    default:
      return [];
  }
}

function applyHandleDrag(e: Entity, idx: number, p: Vector2): Entity | null {
  switch (e.type) {
    case 'line':
      if (idx === 0) return { ...e, start: p };
      if (idx === 1) return { ...e, end: p };
      return null; // midpoint handle = move, handled elsewhere
    case 'circle':
      if (idx === 0) return { ...e, center: p };
      if (idx === 1 || idx === 2) return { ...e, radius: Math.max(0.001, Math.sqrt((p.x - e.center.x) ** 2 + (p.y - e.center.y) ** 2)) };
      return null;
    case 'arc':
      if (idx === 0) return { ...e, center: p };
      if (idx === 1) {
        const angle = Math.atan2(p.y - e.center.y, p.x - e.center.x);
        const r = Math.sqrt((p.x - e.center.x) ** 2 + (p.y - e.center.y) ** 2);
        return { ...e, startAngle: angle, radius: Math.max(0.001, r) };
      }
      if (idx === 2) {
        const angle = Math.atan2(p.y - e.center.y, p.x - e.center.x);
        return { ...e, endAngle: angle };
      }
      return null;
    case 'rectangle': {
      // corners order: [BL(0), BR(1), TR(2), TL(3)]
      const corners: Vector2[] = [
        { x: e.origin.x, y: e.origin.y },
        { x: e.origin.x + e.width, y: e.origin.y },
        { x: e.origin.x + e.width, y: e.origin.y + e.height },
        { x: e.origin.x, y: e.origin.y + e.height },
      ];
      // Drag one corner; opposite corner stays fixed
      const opp = corners[(idx + 2) % 4];
      const newOriginX = Math.min(p.x, opp.x);
      const newOriginY = Math.min(p.y, opp.y);
      const newWidth = Math.abs(p.x - opp.x);
      const newHeight = Math.abs(p.y - opp.y);
      if (newWidth < 0.001 || newHeight < 0.001) return null;
      return { ...e, origin: { x: newOriginX, y: newOriginY }, width: newWidth, height: newHeight };
    }
    case 'polygon':
      if (idx === 0) return { ...e, center: p };
      return { ...e, radius: Math.max(0.001, Math.sqrt((p.x - e.center.x) ** 2 + (p.y - e.center.y) ** 2)) };
    case 'point':
      return { ...e, position: p };
    case 'spline': {
      const pts = [...e.points];
      pts[idx] = p;
      return { ...e, points: pts };
    }
    default:
      return null;
  }
}
