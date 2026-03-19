export type MoveType = 'rapid' | 'linear' | 'arc_cw' | 'arc_ccw';

export interface Move {
  type: MoveType;
  x: number;
  y: number;
  z: number;
  feedRate?: number;    // only for linear/arc moves
  // For arc moves:
  i?: number;           // X offset from current pos to arc center
  j?: number;           // Y offset from current pos to arc center
}

export interface Toolpath {
  operationId: string;
  toolId: string;
  moves: Move[];
  totalLength: number;        // mm (sum of all move lengths)
  estimatedTime: number;      // seconds
}

export type ToolpathMap = Record<string, Toolpath>;  // key = operationId

export type ToolpathStatus = 'idle' | 'computing' | 'done' | 'error';
export type ToolpathStatusMap = Record<string, ToolpathStatus>;
