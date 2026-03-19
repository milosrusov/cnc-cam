import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CamCanvasComponent } from './cam-canvas.component';

import { selectOrderedOperations, selectSelectedOperationId, selectToolList, selectToolpaths, selectToolpathStatus } from '../../state/cam/cam.selectors';
import { selectEntityList } from '../../state/cad/cad.selectors';
import { addOperation, updateOperation, removeOperation, selectOperation, computeToolpath, toolpathComputed } from '../../state/cam/cam.actions';
import { Operation, ContourOperation, PocketOperation, DrillingOperation, FacingOperation } from '../../core/models/cam/operation.model';
import { Tool } from '../../core/models/cam/tool.model';
import { ToolpathService } from '../../core/services/toolpath.service';
import { GcodeService } from '../../core/services/gcode.service';
import { generateId } from '../../core/utils/math.utils';

@Component({
  selector: 'app-cam-editor',
  standalone: true,
  imports: [AsyncPipe, FormsModule, DecimalPipe, CamCanvasComponent],
  templateUrl: './cam-editor.component.html',
  styleUrl: './cam-editor.component.scss',
})
export class CamEditorComponent {
  private store = inject(Store);
  private toolpathService = inject(ToolpathService);
  private gcodeService = inject(GcodeService);
  private router = inject(Router);

  operations$ = this.store.select(selectOrderedOperations);
  selectedOpId$ = this.store.select(selectSelectedOperationId);
  tools$ = this.store.select(selectToolList);
  toolpaths$ = this.store.select(selectToolpaths);
  toolpathStatus$ = this.store.select(selectToolpathStatus);
  entities$ = this.store.select(selectEntityList);

  selectedOp: Operation | null = null;
  totalTime = '';

  private toolsCache: Record<string, Tool> = {};
  private operationsCache: Record<string, Operation> = {};
  private toolpathsCache: any = {};
  private entitiesCache: any[] = [];

  constructor() {
    this.store.select(selectToolList).subscribe(tools => {
      this.toolsCache = {};
      tools.forEach(t => this.toolsCache[t.id] = t);
    });
    this.store.select(selectOrderedOperations).subscribe(ops => {
      this.operationsCache = {};
      ops.forEach(o => this.operationsCache[o.id] = o);
    });
    this.store.select(selectToolpaths).subscribe(tp => {
      this.toolpathsCache = tp;
      this.updateTotalTime();
    });
    this.store.select(selectEntityList).subscribe(e => this.entitiesCache = e);
    this.store.select(selectSelectedOperationId).subscribe(id => {
      this.selectedOp = id ? { ...this.operationsCache[id] } : null;
    });
  }

  getToolName(toolId: string): string {
    return this.toolsCache[toolId]?.name ?? '?';
  }

  selectOp(id: string): void {
    this.store.dispatch(selectOperation({ id }));
    this.selectedOp = { ...this.operationsCache[id] };
  }

  addOp(type: 'contour' | 'pocket' | 'drilling' | 'facing'): void {
    const toolId = Object.keys(this.toolsCache)[0] ?? 'tool-default';
    const base = {
      id: generateId(), name: type.charAt(0).toUpperCase() + type.slice(1),
      toolId, entityIds: [], enabled: true,
      spindleRPM: 18000, feedRate: 1200, plungeRate: 300,
      stockTop: 0, cutDepth: 3, stepDown: 1, safeZ: 5,
    };

    let op: Operation;
    if (type === 'contour') op = { ...base, type: 'contour', direction: 'climb', offset: 0, leadIn: 'none', leadInDistance: 2, leaveStock: 0 };
    else if (type === 'pocket') op = { ...base, type: 'pocket', stepOver: 0.5, direction: 'climb', leaveStock: 0, leaveStockFloor: 0 };
    else if (type === 'drilling') op = { ...base, type: 'drilling', peck: true, peckDepth: 1, dwell: 0 };
    else op = { ...base, type: 'facing', stepOver: 0.8, direction: 'x' };

    this.store.dispatch(addOperation({ operation: op }));
    this.store.dispatch(selectOperation({ id: op.id }));
  }

  removeOp(id: string): void {
    this.store.dispatch(removeOperation({ id }));
  }

  saveOp(): void {
    if (!this.selectedOp) return;
    this.store.dispatch(updateOperation({ operation: { ...this.selectedOp } }));
  }

  toggleEntity(entityId: string, checked: boolean): void {
    if (!this.selectedOp) return;
    const ids = checked
      ? [...this.selectedOp.entityIds, entityId]
      : this.selectedOp.entityIds.filter(id => id !== entityId);
    this.selectedOp = { ...this.selectedOp, entityIds: ids };
    this.saveOp();
  }

  computeOne(): void {
    if (!this.selectedOp) return;
    this.computeOperation(this.selectedOp);
  }

  computeAll(): void {
    Object.values(this.operationsCache).filter(o => o.enabled).forEach(op => this.computeOperation(op));
  }

  private computeOperation(op: Operation): void {
    const tool = this.toolsCache[op.toolId];
    if (!tool) return;
    const entities = this.entitiesCache.filter(e => op.entityIds.includes(e.id));
    this.store.dispatch(computeToolpath({ operationId: op.id }));
    try {
      const tp = this.toolpathService.compute(op, tool, entities);
      this.store.dispatch(toolpathComputed({ toolpath: tp }));
    } catch (e) {
      console.error('Toolpath error:', e);
    }
    this.updateTotalTime();
  }

  private updateTotalTime(): void {
    const tps = Object.values(this.toolpathsCache);
    if (tps.length === 0) { this.totalTime = ''; return; }
    const secs = this.gcodeService.estimateTime(tps as any);
    this.totalTime = this.gcodeService.formatTime(secs);
  }

  goToGcode(): void {
    this.router.navigate(['/gcode']);
  }

  // Type helpers for template
  asContour(op: Operation): ContourOperation { return op as ContourOperation; }
  asPocket(op: Operation): PocketOperation { return op as PocketOperation; }
  asDrilling(op: Operation): DrillingOperation { return op as DrillingOperation; }
  asFacing(op: Operation): FacingOperation { return op as FacingOperation; }
}
