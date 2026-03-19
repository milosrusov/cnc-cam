import { createFeatureSelector, createSelector } from '@ngrx/store';
import { CadState } from '../app.state';

export const selectCadState = createFeatureSelector<CadState>('cad');

export const selectEntities = createSelector(selectCadState, s => s.entities);
export const selectEntityList = createSelector(selectEntities, entities => Object.values(entities));
export const selectEntityById = (id: string) => createSelector(selectEntities, entities => entities[id]);

export const selectLayers = createSelector(selectCadState, s => s.layers);
export const selectLayerOrder = createSelector(selectCadState, s => s.layerOrder);
export const selectOrderedLayers = createSelector(selectLayers, selectLayerOrder, (layers, order) =>
  order.map(id => layers[id]).filter(Boolean)
);
export const selectActiveLayerId = createSelector(selectCadState, s => s.activeLayerId);
export const selectActiveLayer = createSelector(selectLayers, selectActiveLayerId, (layers, id) => layers[id]);

export const selectSelectedEntityIds = createSelector(selectCadState, s => s.selectedEntityIds);
export const selectSelectedEntities = createSelector(selectEntities, selectSelectedEntityIds, (entities, ids) =>
  ids.map(id => entities[id]).filter(Boolean)
);

export const selectViewport = createSelector(selectCadState, s => s.viewport);
export const selectActiveTool = createSelector(selectCadState, s => s.activeTool);
export const selectSnapSettings = createSelector(selectCadState, s => s.snapSettings);
