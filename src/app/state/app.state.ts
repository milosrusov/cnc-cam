import { EntityMap } from '../core/models/geometry/entity.model';
import { LayerMap } from '../core/models/layer.model';
import { ToolMap } from '../core/models/cam/tool.model';
import { OperationMap } from '../core/models/cam/operation.model';
import { ToolpathMap, ToolpathStatusMap } from '../core/models/cam/toolpath.model';
import { ProjectMeta } from '../core/models/project.model';

export type ActiveTool =
  | 'select' | 'pan'
  | 'line' | 'circle' | 'arc' | 'rectangle' | 'polygon' | 'spline' | 'point';

export type ActiveWorkspace = 'cad' | 'cam' | '3d' | 'gcode';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface SnapSettings {
  enabled: boolean;
  grid: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  intersection: boolean;
  perpendicular: boolean;
  tangent: boolean;
  gridSize: number;    // mm
}

export interface CadState {
  entities: EntityMap;
  layers: LayerMap;
  layerOrder: string[];
  activeLayerId: string;
  selectedEntityIds: string[];
  viewport: ViewportState;
  activeTool: ActiveTool;
  snapSettings: SnapSettings;
}

export interface CamState {
  tools: ToolMap;
  operations: OperationMap;
  operationOrder: string[];
  toolpaths: ToolpathMap;
  toolpathStatus: ToolpathStatusMap;
  selectedOperationId: string | null;
  simulationProgress: number;   // 0-1, position along toolpath
  simulationPlaying: boolean;
}

export interface UiState {
  activeWorkspace: ActiveWorkspace;
  theme: 'dark' | 'light';
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
}

export interface ProjectState {
  meta: ProjectMeta;
  dirty: boolean;
  filePath: string | null;
}

export interface AppState {
  project: ProjectState;
  cad: CadState;
  cam: CamState;
  ui: UiState;
}
