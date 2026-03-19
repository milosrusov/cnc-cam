import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Vector2 } from '../models/geometry/entity.model';
import { SnapSettings } from '../../state/app.state';
import { getSnapPoints } from '../utils/geometry.utils';
import { distVec2, snapToGrid } from '../utils/math.utils';
import { selectEntityList, selectSnapSettings } from '../../state/cad/cad.selectors';
import { Entity } from '../models/geometry/entity.model';

export interface SnapResult {
  point: Vector2;
  type: 'grid' | 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'perpendicular' | 'tangent' | 'quadrant';
  snapped: boolean;
}

@Injectable({ providedIn: 'root' })
export class SnapService {
  private settings: SnapSettings | null = null;
  private entities: Entity[] = [];
  private initialized = false;

  constructor(private store: Store) {}

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.store.select(selectSnapSettings).subscribe(s => (this.settings = s));
    this.store.select(selectEntityList).subscribe(e => (this.entities = e));
  }

  resolve(worldPos: Vector2, snapRadiusWorld: number): SnapResult {
    this.init();

    const s = this.settings;
    if (!s || !s.enabled) {
      return { point: worldPos, type: 'grid', snapped: false };
    }

    const candidates: Array<{ point: Vector2; type: SnapResult['type']; dist: number }> = [];

    for (const entity of this.entities) {
      if (!entity.visible) continue;
      const snapPoints = getSnapPoints(entity);
      for (const sp of snapPoints) {
        if (!this.typeEnabled(sp.type, s)) continue;
        const d = distVec2(worldPos, sp.point);
        if (d <= snapRadiusWorld) {
          candidates.push({ point: sp.point, type: sp.type as SnapResult['type'], dist: d });
        }
      }
    }

    const priority: Record<string, number> = {
      endpoint: 0, center: 1, midpoint: 2, quadrant: 3, intersection: 4, perpendicular: 5, tangent: 6,
    };
    candidates.sort((a, b) => {
      const pa = priority[a.type] ?? 99;
      const pb = priority[b.type] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.dist - b.dist;
    });

    if (candidates.length > 0) {
      return { point: candidates[0].point, type: candidates[0].type, snapped: true };
    }

    if (s.grid && s.gridSize > 0) {
      return {
        point: { x: snapToGrid(worldPos.x, s.gridSize), y: snapToGrid(worldPos.y, s.gridSize) },
        type: 'grid',
        snapped: true,
      };
    }

    return { point: worldPos, type: 'grid', snapped: false };
  }

  private typeEnabled(type: string, s: SnapSettings): boolean {
    switch (type) {
      case 'endpoint': return s.endpoint;
      case 'midpoint': return s.midpoint;
      case 'center': return s.center;
      case 'quadrant': return s.center;
      case 'intersection': return s.intersection;
      case 'perpendicular': return s.perpendicular;
      case 'tangent': return s.tangent;
      default: return true;
    }
  }
}
