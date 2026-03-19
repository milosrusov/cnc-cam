export interface ProjectMeta {
  name: string;
  description: string;
  createdAt: string;    // ISO date
  updatedAt: string;    // ISO date
  units: 'mm' | 'inch';
  // Stock dimensions (material block)
  stockWidth: number;   // X, mm
  stockHeight: number;  // Y, mm
  stockDepth: number;   // Z, mm
}
