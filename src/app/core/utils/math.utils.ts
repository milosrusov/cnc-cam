import { Vector2, BoundingBox } from '../models/geometry/entity.model';

export function vec2(x: number, y: number): Vector2 {
  return { x, y };
}

export function addVec2(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec2(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec2(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

export function dotVec2(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthVec2(v: Vector2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function distVec2(a: Vector2, b: Vector2): number {
  return lengthVec2(subVec2(a, b));
}

export function normalizeVec2(v: Vector2): Vector2 {
  const len = lengthVec2(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function perpVec2(v: Vector2): Vector2 {
  return { x: -v.y, y: v.x };
}

export function lerpVec2(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpointVec2(a: Vector2, b: Vector2): Vector2 {
  return lerpVec2(a, b, 0.5);
}

export function rotateVec2(v: Vector2, angle: number): Vector2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

export function angleVec2(v: Vector2): number {
  return Math.atan2(v.y, v.x);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeAngle(rad: number): number {
  while (rad < 0) rad += Math.PI * 2;
  while (rad >= Math.PI * 2) rad -= Math.PI * 2;
  return rad;
}

export function expandBBox(bbox: BoundingBox, margin: number): BoundingBox {
  return {
    minX: bbox.minX - margin,
    minY: bbox.minY - margin,
    maxX: bbox.maxX + margin,
    maxY: bbox.maxY + margin,
  };
}

export function bboxContainsPoint(bbox: BoundingBox, p: Vector2): boolean {
  return p.x >= bbox.minX && p.x <= bbox.maxX && p.y >= bbox.minY && p.y <= bbox.maxY;
}

export function bboxIntersects(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Snap a value to grid */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Point-to-segment distance */
export function pointToSegmentDist(p: Vector2, a: Vector2, b: Vector2): number {
  const ab = subVec2(b, a);
  const ap = subVec2(p, a);
  const lenSq = dotVec2(ab, ab);
  if (lenSq === 0) return distVec2(p, a);
  const t = clamp(dotVec2(ap, ab) / lenSq, 0, 1);
  const proj = addVec2(a, scaleVec2(ab, t));
  return distVec2(p, proj);
}

/** Closest point on segment to p */
export function closestPointOnSegment(p: Vector2, a: Vector2, b: Vector2): Vector2 {
  const ab = subVec2(b, a);
  const ap = subVec2(p, a);
  const lenSq = dotVec2(ab, ab);
  if (lenSq === 0) return { ...a };
  const t = clamp(dotVec2(ap, ab) / lenSq, 0, 1);
  return addVec2(a, scaleVec2(ab, t));
}

/** Line-line intersection (returns null if parallel) */
export function lineIntersection(
  p1: Vector2, p2: Vector2,
  p3: Vector2, p4: Vector2
): Vector2 | null {
  const d1 = subVec2(p2, p1);
  const d2 = subVec2(p4, p3);
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-10) return null;
  const d = subVec2(p3, p1);
  const t = (d.x * d2.y - d.y * d2.x) / cross;
  return addVec2(p1, scaleVec2(d1, t));
}

/** Generate polygon vertices */
export function polygonVertices(center: Vector2, radius: number, sides: number, rotation: number): Vector2[] {
  const verts: Vector2[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    verts.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return verts;
}

/** Unique ID generator */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
