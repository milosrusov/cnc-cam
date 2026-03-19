import { createFeatureSelector, createSelector } from '@ngrx/store';
import { CamState } from '../app.state';

export const selectCamState = createFeatureSelector<CamState>('cam');

export const selectTools = createSelector(selectCamState, s => s.tools);
export const selectToolList = createSelector(selectTools, tools => Object.values(tools));

export const selectOperations = createSelector(selectCamState, s => s.operations);
export const selectOperationOrder = createSelector(selectCamState, s => s.operationOrder);
export const selectOrderedOperations = createSelector(selectOperations, selectOperationOrder, (ops, order) =>
  order.map(id => ops[id]).filter(Boolean)
);
export const selectSelectedOperationId = createSelector(selectCamState, s => s.selectedOperationId);
export const selectSelectedOperation = createSelector(selectOperations, selectSelectedOperationId, (ops, id) =>
  id ? ops[id] : null
);

export const selectToolpaths = createSelector(selectCamState, s => s.toolpaths);
export const selectToolpathStatus = createSelector(selectCamState, s => s.toolpathStatus);
export const selectToolpathForOperation = (id: string) => createSelector(selectToolpaths, tp => tp[id]);

export const selectSimulationProgress = createSelector(selectCamState, s => s.simulationProgress);
export const selectSimulationPlaying = createSelector(selectCamState, s => s.simulationPlaying);
