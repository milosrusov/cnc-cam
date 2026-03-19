import { createAction, props } from '@ngrx/store';
import { Tool } from '../../core/models/cam/tool.model';
import { Operation } from '../../core/models/cam/operation.model';
import { Toolpath } from '../../core/models/cam/toolpath.model';

// ─── Tools ───────────────────────────────────────────────────────────────────

export const addTool = createAction('[CAM] Add Tool', props<{ tool: Tool }>());
export const updateTool = createAction('[CAM] Update Tool', props<{ tool: Tool }>());
export const removeTool = createAction('[CAM] Remove Tool', props<{ id: string }>());

// ─── Operations ──────────────────────────────────────────────────────────────

export const addOperation = createAction('[CAM] Add Operation', props<{ operation: Operation }>());
export const updateOperation = createAction('[CAM] Update Operation', props<{ operation: Operation }>());
export const removeOperation = createAction('[CAM] Remove Operation', props<{ id: string }>());
export const reorderOperations = createAction('[CAM] Reorder Operations', props<{ operationOrder: string[] }>());
export const selectOperation = createAction('[CAM] Select Operation', props<{ id: string | null }>());
export const toggleOperationEnabled = createAction('[CAM] Toggle Operation Enabled', props<{ id: string }>());

// ─── Toolpaths ───────────────────────────────────────────────────────────────

export const computeToolpath = createAction('[CAM] Compute Toolpath', props<{ operationId: string }>());
export const toolpathComputed = createAction('[CAM] Toolpath Computed', props<{ toolpath: Toolpath }>());
export const toolpathError = createAction('[CAM] Toolpath Error', props<{ operationId: string; error: string }>());
export const clearToolpath = createAction('[CAM] Clear Toolpath', props<{ operationId: string }>());

// ─── Simulation ──────────────────────────────────────────────────────────────

export const setSimulationProgress = createAction('[CAM] Set Simulation Progress', props<{ progress: number }>());
export const setSimulationPlaying = createAction('[CAM] Set Simulation Playing', props<{ playing: boolean }>());
