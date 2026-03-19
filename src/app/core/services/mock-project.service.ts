import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { addEntities, addLayer } from '../../state/cad/cad.actions';
import { addOperation, selectOperation } from '../../state/cam/cam.actions';
import { Entity } from '../models/geometry/entity.model';
import { Layer } from '../models/layer.model';
import { Operation } from '../models/cam/operation.model';

// Simple deterministic id generator for mock data
function mid(n: number): string { return `mock-${n}`; }

@Injectable({ providedIn: 'root' })
export class MockProjectService {
  private store = inject(Store);

  load(): void {
    // ── Extra layers ─────────────────────────────────────────────────────────
    const layers: Layer[] = [
      { id: 'layer-0', name: 'Outline',  color: '#5b8dee', lineWidth: 1, visible: true, locked: false },
      { id: 'layer-1', name: 'Holes',    color: '#f0a84a', lineWidth: 0.5, visible: true, locked: false },
      { id: 'layer-2', name: 'Pockets',  color: '#4caf7d', lineWidth: 0.5, visible: true, locked: false },
    ];
    // layer-0 already in store from initialState; add the rest
    this.store.dispatch(addLayer({ layer: layers[1] }));
    this.store.dispatch(addLayer({ layer: layers[2] }));

    // ── Drawing: aluminium bracket 100×80mm with 4 corner holes + centre pocket ──
    const base = { selected: false, visible: true, lineWidth: 1 };

    const entities: Entity[] = [
      // Outer rectangle 100×80, origin at (-50,-40)
      {
        ...base, id: mid(1), type: 'rectangle', layerId: 'layer-0',
        color: '#5b8dee', origin: { x: -50, y: -40 }, width: 100, height: 80, rotation: 0,
      },

      // 4 corner mounting holes Ø6, inset 10mm
      {
        ...base, id: mid(2), type: 'circle', layerId: 'layer-1',
        color: '#f0a84a', center: { x: -40, y: -30 }, radius: 3,
      },
      {
        ...base, id: mid(3), type: 'circle', layerId: 'layer-1',
        color: '#f0a84a', center: { x:  40, y: -30 }, radius: 3,
      },
      {
        ...base, id: mid(4), type: 'circle', layerId: 'layer-1',
        color: '#f0a84a', center: { x: -40, y:  30 }, radius: 3,
      },
      {
        ...base, id: mid(5), type: 'circle', layerId: 'layer-1',
        color: '#f0a84a', center: { x:  40, y:  30 }, radius: 3,
      },

      // Centre pocket rectangle 40×30
      {
        ...base, id: mid(6), type: 'rectangle', layerId: 'layer-2',
        color: '#4caf7d', origin: { x: -20, y: -15 }, width: 40, height: 30, rotation: 0,
      },

      // Two slots (elongated rectangles) on long sides
      {
        ...base, id: mid(7), type: 'rectangle', layerId: 'layer-2',
        color: '#4caf7d', origin: { x: -30, y: -5 }, width: 60, height: 10, rotation: 0,
      },

      // Diagonal reference lines (for alignment)
      {
        ...base, id: mid(8), type: 'line', layerId: 'layer-0',
        color: '#55556a', start: { x: -50, y: -40 }, end: { x: 50, y: 40 },
      },
      {
        ...base, id: mid(9), type: 'line', layerId: 'layer-0',
        color: '#55556a', start: { x: 50, y: -40 }, end: { x: -50, y: 40 },
      },

      // Centre mark
      { ...base, id: mid(10), type: 'point', layerId: 'layer-0', color: '#e05c5c', position: { x: 0, y: 0 } },
    ];

    this.store.dispatch(addEntities({ entities }));

    // ── CAM operations ────────────────────────────────────────────────────────
    const commonBase = {
      enabled: true, spindleRPM: 18000,
      stockTop: 0, cutDepth: 6, stepDown: 2, safeZ: 5,
      feedRate: 1200, plungeRate: 300,
    };

    const contourOp: Operation = {
      ...commonBase, id: 'op-1', type: 'contour', name: 'Outer Contour',
      toolId: 'tool-1',
      entityIds: [mid(1)],
      direction: 'climb', offset: 0, leadIn: 'none', leadInDistance: 2, leaveStock: 0,
    };

    const drillingOp: Operation = {
      ...commonBase, id: 'op-2', type: 'drilling', name: 'Corner Holes',
      toolId: 'tool-1', cutDepth: 8,
      entityIds: [mid(2), mid(3), mid(4), mid(5)],
      peck: true, peckDepth: 2, dwell: 0,
    };

    const pocketOp: Operation = {
      ...commonBase, id: 'op-3', type: 'pocket', name: 'Centre Pocket',
      toolId: 'tool-1', cutDepth: 4,
      entityIds: [mid(6)],
      stepOver: 0.5, direction: 'climb', leaveStock: 0, leaveStockFloor: 0,
    };

    this.store.dispatch(addOperation({ operation: contourOp }));
    this.store.dispatch(addOperation({ operation: drillingOp }));
    this.store.dispatch(addOperation({ operation: pocketOp }));
    this.store.dispatch(selectOperation({ id: 'op-1' }));
  }
}
