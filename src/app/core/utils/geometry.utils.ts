import {
  Entity, LineEntity, CircleEntity, ArcEntity, RectangleEntity,
  PolygonEntity, SplineEntity, Vector2, BoundingBox
} from '../models/geometry/entity.model';
import {
  distVec2, lengthVec2, subVec2, addVec2, scaleVec2, normalizeVec2,
  perpVec2, dotVec2, pointToSegmentDist, polygonVertices, normalizeAngle
} from './math.utils';

// ─── Bounding Box ────────────────────────────────────────────────────────────

export function entityBBox(entity: Entity): BoundingBox {
  switch (entity.type) {
    case 'line':
      return lineBBox(entity);
    case 'circle':
      return {
        minX: entity.center.x - entity.radius,
        minY: entity.center.y - entity.radius,
        maxX: entity.center.x + entity.radius,
        maxY: entity.center.y + entity.radius,
      };
    case 'arc':
      return arcBBox(entity);
    case 'rectangle':
      return rectangleBBox(entity);
    case 'polygon':
      return polygonBBox(entity);
    case 'spline':
      return splineBBox(entity);
    case 'point':
      return { minX: entity.position.x, minY: entity.position.y, maxX: entity.position.x, maxY: entity.position.y };
  }
}

function lineBBox(e: LineEntity): BoundingBox {
  return {
    minX: Math.min(e.start.x, e.end.x),
    minY: Math.min(e.start.y, e.end.y),
    maxX: Math.max(e.start.x, e.end.x),
    maxY: Math.max(e.start.y, e.end.y),
  };
}

function arcBBox(e: ArcEntity): BoundingBox {
  const pts: Vector2[] = [
    { x: e.center.x + e.radius * Math.cos(e.startAngle), y: e.center.y + e.radius * Math.sin(e.startAngle) },
    { x: e.center.x + e.radius * Math.cos(e.endAngle), y: e.center.y + e.radius * Math.sin(e.endAngle) },
  ];
  // Include axis-aligned extremes if they fall within the arc
  const axes = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  for (const a of axes) {
    if (angleInArc(a, e.startAngle, e.endAngle, e.counterClockwise)) {
      pts.push({ x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) });
    }
  }
  return pointsBBox(pts);
}

function rectangleBBox(e: RectangleEntity): BoundingBox {
  const corners = rectCorners(e);
  return pointsBBox(corners);
}

function polygonBBox(e: PolygonEntity): BoundingBox {
  return pointsBBox(polygonVertices(e.center, e.radius, e.sides, e.rotation));
}

function splineBBox(e: SplineEntity): BoundingBox {
  // Conservative: use control point hull
  return pointsBBox(e.points);
}

function pointsBBox(pts: Vector2[]): BoundingBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ─── Hit Testing ─────────────────────────────────────────────────────────────

/** Returns true if world-space point p is within hitRadius of the entity */
export function hitTestEntity(entity: Entity, p: Vector2, hitRadius: number): boolean {
  switch (entity.type) {
    case 'line':
      return pointToSegmentDist(p, entity.start, entity.end) <= hitRadius;
    case 'circle': {
      const d = Math.abs(distVec2(p, entity.center) - entity.radius);
      return d <= hitRadius;
    }
    case 'arc': {
      const d = Math.abs(distVec2(p, entity.center) - entity.radius);
      if (d > hitRadius) return false;
      const angle = normalizeAngle(Math.atan2(p.y - entity.center.y, p.x - entity.center.x));
      return angleInArc(angle, entity.startAngle, entity.endAngle, entity.counterClockwise);
    }
    case 'rectangle': {
      const corners = rectCorners(entity);
      for (let i = 0; i < 4; i++) {
        if (pointToSegmentDist(p, corners[i], corners[(i + 1) % 4]) <= hitRadius) return true;
      }
      return false;
    }
    case 'polygon': {
      const verts = polygonVertices(entity.center, entity.radius, entity.sides, entity.rotation);
      for (let i = 0; i < verts.length; i++) {
        if (pointToSegmentDist(p, verts[i], verts[(i + 1) % verts.length]) <= hitRadius) return true;
      }
      return false;
    }
    case 'spline': {
      if (entity.points.length < 4) return false;
      const pts = sampleSpline(entity, 100);
      for (let i = 0; i < pts.length - 1; i++) {
        if (pointToSegmentDist(p, pts[i], pts[i + 1]) <= hitRadius) return true;
      }
      return false;
    }
    case 'point':
      return distVec2(p, entity.position) <= hitRadius;
  }
}

// ─── Snap Helpers ─────────────────────────────────────────────────────────────

export interface SnapPoint {
  point: Vector2;
  type: 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'perpendicular' | 'tangent' | 'quadrant';
}

export function getSnapPoints(entity: Entity): SnapPoint[] {
  const pts: SnapPoint[] = [];
  switch (entity.type) {
    case 'line':
      pts.push({ point: entity.start, type: 'endpoint' });
      pts.push({ point: entity.end, type: 'endpoint' });
      pts.push({ point: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }, type: 'midpoint' });
      break;
    case 'circle':
      pts.push({ point: entity.center, type: 'center' });
      pts.push({ point: { x: entity.center.x + entity.radius, y: entity.center.y }, type: 'quadrant' });
      pts.push({ point: { x: entity.center.x - entity.radius, y: entity.center.y }, type: 'quadrant' });
      pts.push({ point: { x: entity.center.x, y: entity.center.y + entity.radius }, type: 'quadrant' });
      pts.push({ point: { x: entity.center.x, y: entity.center.y - entity.radius }, type: 'quadrant' });
      break;
    case 'arc':
      pts.push({ point: entity.center, type: 'center' });
      pts.push({ point: { x: entity.center.x + entity.radius * Math.cos(entity.startAngle), y: entity.center.y + entity.radius * Math.sin(entity.startAngle) }, type: 'endpoint' });
      pts.push({ point: { x: entity.center.x + entity.radius * Math.cos(entity.endAngle), y: entity.center.y + entity.radius * Math.sin(entity.endAngle) }, type: 'endpoint' });
      break;
    case 'rectangle': {
      const corners = rectCorners(entity);
      corners.forEach(c => pts.push({ point: c, type: 'endpoint' }));
      for (let i = 0; i < 4; i++) {
        pts.push({ point: { x: (corners[i].x + corners[(i + 1) % 4].x) / 2, y: (corners[i].y + corners[(i + 1) % 4].y) / 2 }, type: 'midpoint' });
      }
      break;
    }
    case 'polygon': {
      const verts = polygonVertices(entity.center, entity.radius, entity.sides, entity.rotation);
      verts.forEach(v => pts.push({ point: v, type: 'endpoint' }));
      pts.push({ point: entity.center, type: 'center' });
      break;
    }
    case 'point':
      pts.push({ point: entity.position, type: 'endpoint' });
      break;
    case 'spline':
      if (entity.points.length > 0) {
        pts.push({ point: entity.points[0], type: 'endpoint' });
        pts.push({ point: entity.points[entity.points.length - 1], type: 'endpoint' });
      }
      break;
  }
  return pts;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function rectCorners(e: RectangleEntity): Vector2[] {
  const { origin, width, height, rotation } = e;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rot = (dx: number, dy: number): Vector2 => ({
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  });
  return [rot(0, 0), rot(width, 0), rot(width, height), rot(0, height)];
}

export function angleInArc(angle: number, start: number, end: number, ccw: boolean): boolean {
  angle = normalizeAngle(angle);
  start = normalizeAngle(start);
  end = normalizeAngle(end);
  if (ccw) {
    if (start <= end) return angle >= start && angle <= end;
    return angle >= start || angle <= end;
  } else {
    if (start >= end) return angle >= end && angle <= start;
    return angle <= start || angle >= end;
  }
}

/** Sample a cubic bezier spline to a list of points */
export function sampleSpline(entity: SplineEntity, segments: number): Vector2[] {
  const pts = entity.points;
  const result: Vector2[] = [];
  const curveCount = Math.floor((pts.length - 1) / 3);
  for (let c = 0; c < curveCount; c++) {
    const p0 = pts[c * 3];
    const p1 = pts[c * 3 + 1];
    const p2 = pts[c * 3 + 2];
    const p3 = pts[c * 3 + 3];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      result.push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }
  return result;
}

/** Convert entity to flat array of polyline points (for CAM) */
export function entityToPolyline(entity: Entity, arcTolerance = 0.01): Vector2[] {
  switch (entity.type) {
    case 'line':
      return [entity.start, entity.end];
    case 'circle': {
      const pts: Vector2[] = [];
      const segs = Math.max(32, Math.ceil((2 * Math.PI * entity.radius) / arcTolerance));
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push({ x: entity.center.x + entity.radius * Math.cos(a), y: entity.center.y + entity.radius * Math.sin(a) });
      }
      return pts;
    }
    case 'arc': {
      const pts: Vector2[] = [];
      let start = normalizeAngle(entity.startAngle);
      let end = normalizeAngle(entity.endAngle);
      let span = entity.counterClockwise ? end - start : start - end;
      if (span <= 0) span += Math.PI * 2;
      const segs = Math.max(8, Math.ceil((span * entity.radius) / arcTolerance));
      for (let i = 0; i <= segs; i++) {
        const a = entity.counterClockwise
          ? start + (i / segs) * span
          : start - (i / segs) * span;
        pts.push({ x: entity.center.x + entity.radius * Math.cos(a), y: entity.center.y + entity.radius * Math.sin(a) });
      }
      return pts;
    }
    case 'rectangle':
      return [...rectCorners(entity), rectCorners(entity)[0]]; // closed
    case 'polygon': {
      const verts = polygonVertices(entity.center, entity.radius, entity.sides, entity.rotation);
      return [...verts, verts[0]]; // closed
    }
    case 'spline':
      return sampleSpline(entity, 50);
    case 'point':
      return [entity.position];
  }
}
