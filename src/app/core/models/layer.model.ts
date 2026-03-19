export interface Layer {
  id: string;
  name: string;
  color: string;       // hex color, e.g. '#00bfff'
  lineWidth: number;   // mm
  visible: boolean;
  locked: boolean;
}

export type LayerMap = Record<string, Layer>;
