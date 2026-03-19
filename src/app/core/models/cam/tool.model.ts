export type ToolType = 'end_mill' | 'ball_mill' | 'drill' | 'v_bit' | 'face_mill';

export interface Tool {
  id: string;
  name: string;
  type: ToolType;
  diameter: number;         // mm
  fluteCount: number;
  maxRPM: number;
  material: string;         // e.g. 'HSS', 'Carbide'
  notes?: string;
}

export type ToolMap = Record<string, Tool>;
