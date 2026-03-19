import { createReducer, on } from '@ngrx/store';
import { CamState } from '../app.state';
import * as CamActions from './cam.actions';

export const initialCamState: CamState = {
  tools: {
    'tool-default': {
      id: 'tool-default',
      name: '6mm End Mill',
      type: 'end_mill',
      diameter: 6,
      fluteCount: 2,
      maxRPM: 24000,
      material: 'Carbide',
    },
    'tool-drill-3': {
      id: 'tool-drill-3',
      name: '3mm Drill',
      type: 'drill',
      diameter: 3,
      fluteCount: 2,
      maxRPM: 18000,
      material: 'HSS',
    },
  },
  operations: {},
  operationOrder: [],
  toolpaths: {},
  toolpathStatus: {},
  selectedOperationId: null,
  simulationProgress: 0,
  simulationPlaying: false,
};

export const camReducer = createReducer(
  initialCamState,

  // ─── Tools ──────────────────────────────────────────────────────────────────

  on(CamActions.addTool, (state, { tool }) => ({
    ...state,
    tools: { ...state.tools, [tool.id]: tool },
  })),

  on(CamActions.updateTool, (state, { tool }) => ({
    ...state,
    tools: { ...state.tools, [tool.id]: tool },
  })),

  on(CamActions.removeTool, (state, { id }) => {
    const tools = { ...state.tools };
    delete tools[id];
    return { ...state, tools };
  }),

  // ─── Operations ─────────────────────────────────────────────────────────────

  on(CamActions.addOperation, (state, { operation }) => ({
    ...state,
    operations: { ...state.operations, [operation.id]: operation },
    operationOrder: [...state.operationOrder, operation.id],
  })),

  on(CamActions.updateOperation, (state, { operation }) => ({
    ...state,
    operations: { ...state.operations, [operation.id]: operation },
    // Mark toolpath as needing recompute
    toolpathStatus: { ...state.toolpathStatus, [operation.id]: 'idle' },
  })),

  on(CamActions.removeOperation, (state, { id }) => {
    const operations = { ...state.operations };
    delete operations[id];
    const toolpaths = { ...state.toolpaths };
    delete toolpaths[id];
    const toolpathStatus = { ...state.toolpathStatus };
    delete toolpathStatus[id];
    return {
      ...state,
      operations,
      operationOrder: state.operationOrder.filter(oid => oid !== id),
      toolpaths,
      toolpathStatus,
      selectedOperationId: state.selectedOperationId === id ? null : state.selectedOperationId,
    };
  }),

  on(CamActions.reorderOperations, (state, { operationOrder }) => ({
    ...state,
    operationOrder,
  })),

  on(CamActions.selectOperation, (state, { id }) => ({
    ...state,
    selectedOperationId: id,
  })),

  on(CamActions.toggleOperationEnabled, (state, { id }) => ({
    ...state,
    operations: {
      ...state.operations,
      [id]: { ...state.operations[id], enabled: !state.operations[id].enabled },
    },
  })),

  // ─── Toolpaths ──────────────────────────────────────────────────────────────

  on(CamActions.computeToolpath, (state, { operationId }) => ({
    ...state,
    toolpathStatus: { ...state.toolpathStatus, [operationId]: 'computing' },
  })),

  on(CamActions.toolpathComputed, (state, { toolpath }) => ({
    ...state,
    toolpaths: { ...state.toolpaths, [toolpath.operationId]: toolpath },
    toolpathStatus: { ...state.toolpathStatus, [toolpath.operationId]: 'done' },
  })),

  on(CamActions.toolpathError, (state, { operationId }) => ({
    ...state,
    toolpathStatus: { ...state.toolpathStatus, [operationId]: 'error' },
  })),

  on(CamActions.clearToolpath, (state, { operationId }) => {
    const toolpaths = { ...state.toolpaths };
    delete toolpaths[operationId];
    return {
      ...state,
      toolpaths,
      toolpathStatus: { ...state.toolpathStatus, [operationId]: 'idle' },
    };
  }),

  // ─── Simulation ─────────────────────────────────────────────────────────────

  on(CamActions.setSimulationProgress, (state, { progress }) => ({
    ...state,
    simulationProgress: Math.max(0, Math.min(1, progress)),
  })),

  on(CamActions.setSimulationPlaying, (state, { playing }) => ({
    ...state,
    simulationPlaying: playing,
  })),
);
