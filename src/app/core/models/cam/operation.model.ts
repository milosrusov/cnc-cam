export type OperationType = 'contour' | 'pocket' | 'drilling' | 'facing';
export type CutDirection = 'climb' | 'conventional';
export type LeadInType = 'none' | 'tangent' | 'perpendicular' | 'ramp' | 'helix';

export interface BaseOperation {
  id: string;
  name: string;
  type: OperationType;
  toolId: string;
  entityIds: string[];    // which geometry entities this operation applies to
  enabled: boolean;

  // Feeds & speeds
  spindleRPM: number;
  feedRate: number;       // mm/min
  plungeRate: number;     // mm/min

  // Depths
  stockTop: number;       // Z of top of stock, mm
  cutDepth: number;       // total depth to cut, mm (positive = cutting down)
  stepDown: number;       // depth per pass, mm

  // Safe travel
  safeZ: number;          // Z height for rapid moves, mm
}

export interface ContourOperation extends BaseOperation {
  type: 'contour';
  direction: CutDirection;
  offset: number;               // additional offset from geometry (positive = outward)
  leadIn: LeadInType;
  leadInDistance: number;       // mm
  leaveStock: number;           // finish allowance, mm
}

export interface PocketOperation extends BaseOperation {
  type: 'pocket';
  stepOver: number;             // fraction of tool diameter, e.g. 0.5 = 50%
  direction: CutDirection;
  leaveStock: number;           // finish allowance on walls, mm
  leaveStockFloor: number;      // finish allowance on floor, mm
}

export interface DrillingOperation extends BaseOperation {
  type: 'drilling';
  peck: boolean;
  peckDepth: number;            // mm per peck
  dwell: number;                // seconds at bottom
}

export interface FacingOperation extends BaseOperation {
  type: 'facing';
  stepOver: number;             // fraction of tool diameter
  direction: 'x' | 'y';        // raster direction
}

export type Operation = ContourOperation | PocketOperation | DrillingOperation | FacingOperation;

export type OperationMap = Record<string, Operation>;
