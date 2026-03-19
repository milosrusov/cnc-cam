import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Entity } from '../models/geometry/entity.model';
import { Operation, ContourOperation, PocketOperation, DrillingOperation, FacingOperation } from '../models/cam/operation.model';
import { Tool } from '../models/cam/tool.model';
import { Move, Toolpath } from '../models/cam/toolpath.model';
import { entityToPolyline } from '../utils/geometry.utils';
import { distVec2 } from '../utils/math.utils';

@Injectable({ providedIn: 'root' })
export class ToolpathService {

  compute(operation: Operation, tool: Tool, entities: Entity[]): Toolpath {
    switch (operation.type) {
      case 'contour':   return this.contour(operation, tool, entities);
      case 'pocket':    return this.pocket(operation, tool, entities);
      case 'drilling':  return this.drilling(operation, tool, entities);
      case 'facing':    return this.facing(operation, tool, entities);
    }
  }

  // ─── Contour ────────────────────────────────────────────────────────────────

  private contour(op: ContourOperation, tool: Tool, entities: Entity[]): Toolpath {
    const moves: Move[] = [];
    const passes = Math.max(1, Math.ceil(op.cutDepth / op.stepDown));

    for (const entity of entities) {
      const poly = entityToPolyline(entity, 0.01);
      if (poly.length < 2) continue;

      for (let pass = 0; pass < passes; pass++) {
        const z = op.stockTop - Math.min((pass + 1) * op.stepDown, op.cutDepth);

        // Rapid to above first point
        moves.push({ type: 'rapid', x: poly[0].x, y: poly[0].y, z: op.safeZ });
        // Plunge
        moves.push({ type: 'linear', x: poly[0].x, y: poly[0].y, z, feedRate: op.plungeRate });

        // Follow contour
        for (let i = 1; i < poly.length; i++) {
          moves.push({ type: 'linear', x: poly[i].x, y: poly[i].y, z, feedRate: op.feedRate });
        }

        // Retract
        moves.push({ type: 'rapid', x: poly[poly.length - 1].x, y: poly[poly.length - 1].y, z: op.safeZ });
      }
    }

    return this.buildToolpath(op.id, tool.id, moves);
  }

  // ─── Pocket ─────────────────────────────────────────────────────────────────

  private pocket(op: PocketOperation, tool: Tool, entities: Entity[]): Toolpath {
    const moves: Move[] = [];
    const passes = Math.max(1, Math.ceil(op.cutDepth / op.stepDown));
    const stepOver = tool.diameter * op.stepOver;

    for (const entity of entities) {
      const poly = entityToPolyline(entity, 0.01);
      if (poly.length < 3) continue;

      // Compute bounding box of entity
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }

      for (let pass = 0; pass < passes; pass++) {
        const z = op.stockTop - Math.min((pass + 1) * op.stepDown, op.cutDepth);

        // Raster pocket fill
        let row = 0;
        for (let y = minY + stepOver / 2; y <= maxY - stepOver / 2; y += stepOver) {
          const x0 = row % 2 === 0 ? minX + tool.diameter / 2 : maxX - tool.diameter / 2;
          const x1 = row % 2 === 0 ? maxX - tool.diameter / 2 : minX + tool.diameter / 2;

          if (row === 0) {
            moves.push({ type: 'rapid', x: x0, y, z: op.safeZ });
            moves.push({ type: 'linear', x: x0, y, z, feedRate: op.plungeRate });
          } else {
            moves.push({ type: 'linear', x: x0, y, z, feedRate: op.feedRate });
          }
          moves.push({ type: 'linear', x: x1, y, z, feedRate: op.feedRate });
          row++;
        }

        // Retract
        moves.push({ type: 'rapid', x: moves[moves.length - 1]?.x ?? 0, y: moves[moves.length - 1]?.y ?? 0, z: op.safeZ });
      }
    }

    return this.buildToolpath(op.id, tool.id, moves);
  }

  // ─── Drilling ────────────────────────────────────────────────────────────────

  private drilling(op: DrillingOperation, tool: Tool, entities: Entity[]): Toolpath {
    const moves: Move[] = [];

    for (const entity of entities) {
      // For circles/points — drill at center
      let cx = 0, cy = 0;
      if (entity.type === 'circle') { cx = entity.center.x; cy = entity.center.y; }
      else if (entity.type === 'point') { cx = entity.position.x; cy = entity.position.y; }
      else continue;

      moves.push({ type: 'rapid', x: cx, y: cy, z: op.safeZ });

      if (op.peck && op.peckDepth > 0) {
        let currentZ = op.stockTop;
        while (currentZ > op.stockTop - op.cutDepth) {
          const nextZ = Math.max(op.stockTop - op.cutDepth, currentZ - op.peckDepth);
          moves.push({ type: 'linear', x: cx, y: cy, z: nextZ, feedRate: op.plungeRate });
          moves.push({ type: 'rapid', x: cx, y: cy, z: op.safeZ }); // retract
          currentZ = nextZ;
        }
      } else {
        moves.push({ type: 'linear', x: cx, y: cy, z: op.stockTop - op.cutDepth, feedRate: op.plungeRate });
      }

      moves.push({ type: 'rapid', x: cx, y: cy, z: op.safeZ });
    }

    return this.buildToolpath(op.id, tool.id, moves);
  }

  // ─── Facing ──────────────────────────────────────────────────────────────────

  private facing(op: FacingOperation, tool: Tool, entities: Entity[]): Toolpath {
    const moves: Move[] = [];
    const stepOver = tool.diameter * op.stepOver;

    // Use bounding box of all entities
    let minX = -50, minY = -50, maxX = 50, maxY = 50;
    for (const entity of entities) {
      for (const p of entityToPolyline(entity)) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    const margin = tool.diameter;
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;

    const passes = Math.max(1, Math.ceil(op.cutDepth / op.stepDown));

    for (let pass = 0; pass < passes; pass++) {
      const z = op.stockTop - Math.min((pass + 1) * op.stepDown, op.cutDepth);
      let row = 0;

      if (op.direction === 'x') {
        for (let y = minY; y <= maxY; y += stepOver) {
          const x0 = row % 2 === 0 ? minX : maxX;
          const x1 = row % 2 === 0 ? maxX : minX;
          if (row === 0) {
            moves.push({ type: 'rapid', x: x0, y, z: op.safeZ });
            moves.push({ type: 'linear', x: x0, y, z, feedRate: op.plungeRate });
          } else {
            moves.push({ type: 'linear', x: x0, y, z, feedRate: op.feedRate });
          }
          moves.push({ type: 'linear', x: x1, y, z, feedRate: op.feedRate });
          row++;
        }
      } else {
        for (let x = minX; x <= maxX; x += stepOver) {
          const y0 = row % 2 === 0 ? minY : maxY;
          const y1 = row % 2 === 0 ? maxY : minY;
          if (row === 0) {
            moves.push({ type: 'rapid', x, y: y0, z: op.safeZ });
            moves.push({ type: 'linear', x, y: y0, z, feedRate: op.plungeRate });
          } else {
            moves.push({ type: 'linear', x, y: y0, z, feedRate: op.feedRate });
          }
          moves.push({ type: 'linear', x, y: y1, z, feedRate: op.feedRate });
          row++;
        }
      }
      moves.push({ type: 'rapid', x: minX, y: minY, z: op.safeZ });
    }

    return this.buildToolpath(op.id, tool.id, moves);
  }

  // ─── Helper ──────────────────────────────────────────────────────────────────

  private buildToolpath(operationId: string, toolId: string, moves: Move[]): Toolpath {
    let totalLength = 0;
    let estimatedTime = 0;
    for (let i = 1; i < moves.length; i++) {
      const a = moves[i - 1], b = moves[i];
      const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
      totalLength += d;
      const feed = b.feedRate ?? (b.type === 'rapid' ? 3000 : 1000);
      estimatedTime += (d / feed) * 60;
    }
    return { operationId, toolId, moves, totalLength, estimatedTime };
  }
}
