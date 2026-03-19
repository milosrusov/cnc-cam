export type EntityType = 'line' | 'circle' | 'arc' | 'rectangle' | 'polygon' | 'spline' | 'point';

export interface Vector2 {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BaseEntity {
  id: string;
  type: EntityType;
  layerId: string;
  color?: string;
  lineWidth?: number;
  selected: boolean;
  visible: boolean;
}

export interface LineEntity extends BaseEntity {
  type: 'line';
  start: Vector2;
  end: Vector2;
}

export interface CircleEntity extends BaseEntity {
  type: 'circle';
  center: Vector2;
  radius: number;
}

export interface ArcEntity extends BaseEntity {
  type: 'arc';
  center: Vector2;
  radius: number;
  startAngle: number;   // radians
  endAngle: number;     // radians
  counterClockwise: boolean;
}

export interface RectangleEntity extends BaseEntity {
  type: 'rectangle';
  origin: Vector2;      // bottom-left corner (world coords, Y-up)
  width: number;
  height: number;
  rotation: number;     // radians
}

export interface PolygonEntity extends BaseEntity {
  type: 'polygon';
  center: Vector2;
  radius: number;       // circumradius
  sides: number;
  rotation: number;     // radians
}

export interface SplineEntity extends BaseEntity {
  type: 'spline';
  points: Vector2[];    // cubic bezier control points (groups of 4: anchor, cp1, cp2, anchor...)
  closed: boolean;
}

export interface PointEntity extends BaseEntity {
  type: 'point';
  position: Vector2;
}

export type Entity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | RectangleEntity
  | PolygonEntity
  | SplineEntity
  | PointEntity;

export type EntityMap = Record<string, Entity>;
