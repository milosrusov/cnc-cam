import { createAction, props } from '@ngrx/store';
import { Entity, EntityType } from '../../core/models/geometry/entity.model';
import { Layer } from '../../core/models/layer.model';
import { ActiveTool, SnapSettings, ViewportState } from '../app.state';

// ─── Entities ────────────────────────────────────────────────────────────────

export const addEntity = createAction('[CAD] Add Entity', props<{ entity: Entity }>());
export const addEntities = createAction('[CAD] Add Entities', props<{ entities: Entity[] }>());
export const updateEntity = createAction('[CAD] Update Entity', props<{ entity: Entity }>());
export const updateEntities = createAction('[CAD] Update Entities', props<{ entities: Entity[] }>());
export const removeEntity = createAction('[CAD] Remove Entity', props<{ id: string }>());
export const removeEntities = createAction('[CAD] Remove Entities', props<{ ids: string[] }>());
export const clearEntities = createAction('[CAD] Clear Entities');

// ─── Selection ───────────────────────────────────────────────────────────────

export const selectEntity = createAction('[CAD] Select Entity', props<{ id: string; addToSelection: boolean }>());
export const selectEntities = createAction('[CAD] Select Entities', props<{ ids: string[] }>());
export const deselectAll = createAction('[CAD] Deselect All');

// ─── Layers ──────────────────────────────────────────────────────────────────

export const addLayer = createAction('[CAD] Add Layer', props<{ layer: Layer }>());
export const updateLayer = createAction('[CAD] Update Layer', props<{ layer: Layer }>());
export const removeLayer = createAction('[CAD] Remove Layer', props<{ id: string }>());
export const setActiveLayer = createAction('[CAD] Set Active Layer', props<{ id: string }>());
export const reorderLayers = createAction('[CAD] Reorder Layers', props<{ layerOrder: string[] }>());

// ─── Viewport ────────────────────────────────────────────────────────────────

export const setViewport = createAction('[CAD] Set Viewport', props<{ viewport: ViewportState }>());
export const setZoom = createAction('[CAD] Set Zoom', props<{ zoom: number; pivotX?: number; pivotY?: number }>());
export const setPan = createAction('[CAD] Set Pan', props<{ panX: number; panY: number }>());
export const resetViewport = createAction('[CAD] Reset Viewport');

// ─── Tools & Snap ────────────────────────────────────────────────────────────

export const setActiveTool = createAction('[CAD] Set Active Tool', props<{ tool: ActiveTool }>());
export const updateSnapSettings = createAction('[CAD] Update Snap Settings', props<{ settings: Partial<SnapSettings> }>());

// ─── Bulk / Import ───────────────────────────────────────────────────────────

export const loadFromDxf = createAction('[CAD] Load From DXF', props<{ entities: Entity[]; layers: Layer[] }>());
