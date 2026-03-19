import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, NgZone, ChangeDetectionStrategy, inject
} from '@angular/core';
import { Store } from '@ngrx/store';
import { Subject, combineLatest, takeUntil } from 'rxjs';

import { selectEntityList, selectLayers, selectLayerOrder } from '../../state/cad/cad.selectors';
import { selectToolpaths, selectSelectedOperationId, selectOrderedOperations } from '../../state/cam/cam.selectors';
import { entityToPolyline } from '../../core/utils/geometry.utils';
import { Entity } from '../../core/models/geometry/entity.model';
import { Toolpath } from '../../core/models/cam/toolpath.model';

@Component({
  selector: 'app-cam-canvas',
  standalone: true,
  templateUrl: './cam-canvas.component.html',
  styleUrl: './cam-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CamCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('wrapper') wrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas')  canvasRef!: ElementRef<HTMLCanvasElement>;

  private store = inject(Store);
  private zone = inject(NgZone);
  private destroy$ = new Subject<void>();
  private resizeObserver!: ResizeObserver;

  private entities: Entity[] = [];
  private toolpaths: Record<string, Toolpath> = {};
  private selectedOpId: string | null = null;
  private selectedEntityIds: string[] = [];

  // Viewport
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panStartPan = { x: 0, y: 0 };

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const wrapper = this.wrapperRef.nativeElement;

    this.resizeObserver = new ResizeObserver(() => {
      canvas.width  = wrapper.clientWidth;
      canvas.height = wrapper.clientHeight;
      this.fitAll();
      this.draw();
    });
    this.resizeObserver.observe(wrapper);

    // Mouse pan — any button
    wrapper.addEventListener('mousedown', (e) => {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panStartPan = { x: this.panX, y: this.panY };
      e.preventDefault();
    });
    wrapper.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = this.panStartPan.x + (e.clientX - this.panStart.x);
        this.panY = this.panStartPan.y + (e.clientY - this.panStart.y);
        this.draw();
      }
    });
    wrapper.addEventListener('mouseup', () => { this.isPanning = false; });
    wrapper.addEventListener('mouseleave', () => { this.isPanning = false; });
    wrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = wrapper.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.panX = mx - (mx - this.panX) * factor;
      this.panY = my - (my - this.panY) * factor;
      this.zoom *= factor;
      this.draw();
    }, { passive: false });

    combineLatest([
      this.store.select(selectEntityList),
      this.store.select(selectToolpaths),
      this.store.select(selectSelectedOperationId),
      this.store.select(selectOrderedOperations),
    ]).pipe(takeUntil(this.destroy$)).subscribe(([entities, toolpaths, selId, ops]) => {
      this.entities = entities;
      this.toolpaths = toolpaths;
      this.selectedOpId = selId;
      const selOp = selId ? ops.find(o => o.id === selId) : null;
      this.selectedEntityIds = selOp?.entityIds ?? [];
      this.zone.runOutsideAngular(() => this.draw());
    });
  }

  private fitAll(): void {
    if (this.entities.length === 0) {
      const w = this.canvasRef.nativeElement.width;
      const h = this.canvasRef.nativeElement.height;
      this.zoom = 2; this.panX = w / 2; this.panY = h / 2;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of this.entities) {
      for (const p of entityToPolyline(e, 0.1)) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    if (!isFinite(minX)) { minX = -50; maxX = 50; minY = -50; maxY = 50; }
    const w = this.canvasRef.nativeElement.width;
    const h = this.canvasRef.nativeElement.height;
    const pad = 40;
    const scaleX = (w - pad * 2) / Math.max(maxX - minX, 1);
    const scaleY = (h - pad * 2) / Math.max(maxY - minY, 1);
    this.zoom = Math.min(scaleX, scaleY);
    this.panX = w / 2 - ((minX + maxX) / 2) * this.zoom;
    this.panY = h / 2 + ((minY + maxY) / 2) * this.zoom; // Y-up
  }

  private toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.zoom + this.panX, y: -wy * this.zoom + this.panY };
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Grid
    this.drawGrid(ctx, w, h);

    // CAD entities
    for (const entity of this.entities) {
      const isSelected = this.selectedEntityIds.includes(entity.id);
      const poly = entityToPolyline(entity, 0.5);
      if (poly.length < 2) continue;
      ctx.beginPath();
      const p0 = this.toScreen(poly[0].x, poly[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < poly.length; i++) {
        const p = this.toScreen(poly[i].x, poly[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = isSelected ? '#f0a84a' : (entity.color ?? '#5b8dee');
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();
    }

    // Toolpaths
    const tps = Object.values(this.toolpaths);
    for (const tp of tps) {
      const isActive = tp.operationId === this.selectedOpId;
      const alpha = isActive ? 1 : 0.35;

      for (let i = 1; i < tp.moves.length; i++) {
        const a = tp.moves[i - 1], b = tp.moves[i];
        const pa = this.toScreen(a.x, a.y);
        const pb = this.toScreen(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);

        if (b.type === 'rapid') {
          ctx.strokeStyle = `rgba(224,92,92,${alpha})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
        } else {
          ctx.strokeStyle = `rgba(91,141,238,${alpha})`;
          ctx.lineWidth = isActive ? 1.5 : 1;
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const step = this.zoom >= 4 ? 1 : this.zoom >= 1 ? 5 : this.zoom >= 0.2 ? 10 : 50;
    const screenStep = step * this.zoom;
    if (screenStep < 6) return;

    const startX = Math.floor(-this.panX / screenStep) * screenStep + this.panX;
    const startY = Math.floor(-this.panY / screenStep) * screenStep + this.panY;

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < w; x += screenStep) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = startY; y < h; y += screenStep) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // Axes
    const ox = this.panX, oy = this.panY;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, 0); ctx.lineTo(ox, h);
    ctx.moveTo(0, oy); ctx.lineTo(w, oy);
    ctx.stroke();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
  }
}
