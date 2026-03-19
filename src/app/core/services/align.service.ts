import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { take } from 'rxjs';
import { selectEntities } from '../../state/cad/cad.selectors';
import { updateEntities } from '../../state/cad/cad.actions';
import { Entity } from '../models/geometry/entity.model';
import { entityBBox } from '../utils/geometry.utils';

export type AlignType =
  | 'left' | 'center-h' | 'right'
  | 'top'  | 'center-v' | 'bottom'
  | 'distribute-h' | 'distribute-v';

@Injectable({ providedIn: 'root' })
export class AlignService {
  private store = inject(Store);

  align(type: AlignType): void {
    this.store.select(selectEntities).pipe(take(1)).subscribe(entityMap => {
      const selected = Object.values(entityMap).filter(e => e.selected);
      if (selected.length < 2) return;

      const bboxes = selected.map(e => ({ e, bb: entityBBox(e) }));

      let updated: Entity[];

      switch (type) {
        case 'left': {
          const minX = Math.min(...bboxes.map(b => b.bb.minX));
          updated = bboxes.map(({ e, bb }) => translateEntity(e, minX - bb.minX, 0));
          break;
        }
        case 'right': {
          const maxX = Math.max(...bboxes.map(b => b.bb.maxX));
          updated = bboxes.map(({ e, bb }) => translateEntity(e, maxX - bb.maxX, 0));
          break;
        }
        case 'center-h': {
          const minX = Math.min(...bboxes.map(b => b.bb.minX));
          const maxX = Math.max(...bboxes.map(b => b.bb.maxX));
          const cx = (minX + maxX) / 2;
          updated = bboxes.map(({ e, bb }) => translateEntity(e, cx - (bb.minX + bb.maxX) / 2, 0));
          break;
        }
        case 'top': {
          const maxY = Math.max(...bboxes.map(b => b.bb.maxY));
          updated = bboxes.map(({ e, bb }) => translateEntity(e, 0, maxY - bb.maxY));
          break;
        }
        case 'bottom': {
          const minY = Math.min(...bboxes.map(b => b.bb.minY));
          updated = bboxes.map(({ e, bb }) => translateEntity(e, 0, minY - bb.minY));
          break;
        }
        case 'center-v': {
          const minY = Math.min(...bboxes.map(b => b.bb.minY));
          const maxY = Math.max(...bboxes.map(b => b.bb.maxY));
          const cy = (minY + maxY) / 2;
          updated = bboxes.map(({ e, bb }) => translateEntity(e, 0, cy - (bb.minY + bb.maxY) / 2));
          break;
        }
        case 'distribute-h': {
          const sorted = [...bboxes].sort((a, b) => a.bb.minX - b.bb.minX);
          const totalWidth = sorted.reduce((s, b) => s + (b.bb.maxX - b.bb.minX), 0);
          const span = sorted[sorted.length - 1].bb.maxX - sorted[0].bb.minX;
          const gap = (span - totalWidth) / (sorted.length - 1);
          let cursor = sorted[0].bb.minX;
          updated = sorted.map(({ e, bb }) => {
            const w = bb.maxX - bb.minX;
            const dx = cursor - bb.minX;
            cursor += w + gap;
            return translateEntity(e, dx, 0);
          });
          break;
        }
        case 'distribute-v': {
          const sorted = [...bboxes].sort((a, b) => a.bb.minY - b.bb.minY);
          const totalHeight = sorted.reduce((s, b) => s + (b.bb.maxY - b.bb.minY), 0);
          const span = sorted[sorted.length - 1].bb.maxY - sorted[0].bb.minY;
          const gap = (span - totalHeight) / (sorted.length - 1);
          let cursor = sorted[0].bb.minY;
          updated = sorted.map(({ e, bb }) => {
            const h = bb.maxY - bb.minY;
            const dy = cursor - bb.minY;
            cursor += h + gap;
            return translateEntity(e, 0, dy);
          });
          break;
        }
        default:
          return;
      }

      this.store.dispatch(updateEntities({ entities: updated }));
    });
  }
}

function translateEntity(e: Entity, dx: number, dy: number): Entity {
  const t = (v: { x: number; y: number }) => ({ x: v.x + dx, y: v.y + dy });
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
