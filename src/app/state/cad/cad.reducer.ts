import { createReducer, on } from '@ngrx/store';
import { CadState } from '../app.state';
import * as CadActions from './cad.actions';
import { generateId } from '../../core/utils/math.utils';

const DEFAULT_LAYER_ID = 'layer-0';

export const initialCadState: CadState = {
  entities: {},
  layers: {
    [DEFAULT_LAYER_ID]: {
      id: DEFAULT_LAYER_ID,
      name: 'Layer 0',
      color: '#00bfff',
      lineWidth: 0.5,
      visible: true,
      locked: false,
    },
  },
  layerOrder: [DEFAULT_LAYER_ID],
  activeLayerId: DEFAULT_LAYER_ID,
  selectedEntityIds: [],
  viewport: { zoom: 1, panX: 0, panY: 0 },
  activeTool: 'select',
  snapSettings: {
    enabled: true,
    grid: true,
    endpoint: true,
    midpoint: true,
    center: true,
    intersection: true,
    perpendicular: false,
    tangent: false,
    gridSize: 1,
  },
};

export const cadReducer = createReducer(
  initialCadState,

  // ─── Entities ───────────────────────────────────────────────────────────────

  on(CadActions.addEntity, (state, { entity }) => ({
    ...state,
    entities: { ...state.entities, [entity.id]: entity },
  })),

  on(CadActions.addEntities, (state, { entities }) => {
    const newEntities = { ...state.entities };
    entities.forEach(e => (newEntities[e.id] = e));
    return { ...state, entities: newEntities };
  }),

  on(CadActions.updateEntity, (state, { entity }) => ({
    ...state,
    entities: { ...state.entities, [entity.id]: entity },
  })),

  on(CadActions.updateEntities, (state, { entities }) => {
    const updated = { ...state.entities };
    entities.forEach(e => (updated[e.id] = e));
    return { ...state, entities: updated };
  }),

  on(CadActions.removeEntity, (state, { id }) => {
    const entities = { ...state.entities };
    delete entities[id];
    return {
      ...state,
      entities,
      selectedEntityIds: state.selectedEntityIds.filter(sid => sid !== id),
    };
  }),

  on(CadActions.removeEntities, (state, { ids }) => {
    const entities = { ...state.entities };
    ids.forEach(id => delete entities[id]);
    return {
      ...state,
      entities,
      selectedEntityIds: state.selectedEntityIds.filter(sid => !ids.includes(sid)),
    };
  }),

  on(CadActions.clearEntities, (state) => ({
    ...state,
    entities: {},
    selectedEntityIds: [],
  })),

  // ─── Selection ──────────────────────────────────────────────────────────────

  on(CadActions.selectEntity, (state, { id, addToSelection }) => {
    const selectedEntityIds = addToSelection
      ? state.selectedEntityIds.includes(id)
        ? state.selectedEntityIds.filter(sid => sid !== id)
        : [...state.selectedEntityIds, id]
      : [id];

    // Mark selected flag on entities
    const entities = { ...state.entities };
    Object.keys(entities).forEach(eid => {
      if (entities[eid].selected !== selectedEntityIds.includes(eid)) {
        entities[eid] = { ...entities[eid], selected: selectedEntityIds.includes(eid) };
      }
    });

    return { ...state, entities, selectedEntityIds };
  }),

  on(CadActions.selectEntities, (state, { ids }) => {
    const entities = { ...state.entities };
    Object.keys(entities).forEach(eid => {
      const sel = ids.includes(eid);
      if (entities[eid].selected !== sel) {
        entities[eid] = { ...entities[eid], selected: sel };
      }
    });
    return { ...state, entities, selectedEntityIds: ids };
  }),

  on(CadActions.deselectAll, (state) => {
    const entities = { ...state.entities };
    Object.keys(entities).forEach(eid => {
      if (entities[eid].selected) {
        entities[eid] = { ...entities[eid], selected: false };
      }
    });
    return { ...state, entities, selectedEntityIds: [] };
  }),

  // ─── Layers ─────────────────────────────────────────────────────────────────

  on(CadActions.addLayer, (state, { layer }) => ({
    ...state,
    layers: { ...state.layers, [layer.id]: layer },
    layerOrder: [...state.layerOrder, layer.id],
  })),

  on(CadActions.updateLayer, (state, { layer }) => ({
    ...state,
    layers: { ...state.layers, [layer.id]: layer },
  })),

  on(CadActions.removeLayer, (state, { id }) => {
    if (state.layerOrder.length <= 1) return state; // can't remove last layer
    const layers = { ...state.layers };
    delete layers[id];
    const layerOrder = state.layerOrder.filter(lid => lid !== id);
    const activeLayerId = state.activeLayerId === id ? layerOrder[0] : state.activeLayerId;
    // Move entities from deleted layer to active layer
    const entities = { ...state.entities };
    Object.keys(entities).forEach(eid => {
      if (entities[eid].layerId === id) {
        entities[eid] = { ...entities[eid], layerId: activeLayerId };
      }
    });
    return { ...state, layers, layerOrder, activeLayerId, entities };
  }),

  on(CadActions.setActiveLayer, (state, { id }) => ({
    ...state,
    activeLayerId: id,
  })),

  on(CadActions.reorderLayers, (state, { layerOrder }) => ({
    ...state,
    layerOrder,
  })),

  // ─── Viewport ───────────────────────────────────────────────────────────────

  on(CadActions.setViewport, (state, { viewport }) => ({
    ...state,
    viewport,
  })),

  on(CadActions.setZoom, (state, { zoom }) => ({
    ...state,
    viewport: { ...state.viewport, zoom: Math.max(0.01, Math.min(200, zoom)) },
  })),

  on(CadActions.setPan, (state, { panX, panY }) => ({
    ...state,
    viewport: { ...state.viewport, panX, panY },
  })),

  on(CadActions.resetViewport, (state) => ({
    ...state,
    viewport: { zoom: 1, panX: 0, panY: 0 },
  })),

  // ─── Tools & Snap ────────────────────────────────────────────────────────────

  on(CadActions.setActiveTool, (state, { tool }) => ({
    ...state,
    activeTool: tool,
  })),

  on(CadActions.updateSnapSettings, (state, { settings }) => ({
    ...state,
    snapSettings: { ...state.snapSettings, ...settings },
  })),

  // ─── Import ──────────────────────────────────────────────────────────────────

  on(CadActions.loadFromDxf, (state, { entities, layers }) => {
    const newEntities: typeof state.entities = {};
    entities.forEach(e => (newEntities[e.id] = e));
    const newLayers: typeof state.layers = {};
    layers.forEach(l => (newLayers[l.id] = l));
    return {
      ...state,
      entities: newEntities,
      layers: newLayers,
      layerOrder: layers.map(l => l.id),
      selectedEntityIds: [],
    };
  }),
);
