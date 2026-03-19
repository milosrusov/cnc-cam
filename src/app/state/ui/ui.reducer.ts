import { createReducer, on } from '@ngrx/store';
import { UiState } from '../app.state';
import * as UiActions from './ui.actions';

export const initialUiState: UiState = {
  activeWorkspace: 'cad',
  theme: 'dark',
  leftPanelOpen: true,
  rightPanelOpen: true,
};

export const uiReducer = createReducer(
  initialUiState,
  on(UiActions.setActiveWorkspace, (state, { workspace }) => ({ ...state, activeWorkspace: workspace })),
  on(UiActions.setTheme, (state, { theme }) => ({ ...state, theme })),
  on(UiActions.toggleLeftPanel, (state) => ({ ...state, leftPanelOpen: !state.leftPanelOpen })),
  on(UiActions.toggleRightPanel, (state) => ({ ...state, rightPanelOpen: !state.rightPanelOpen })),
);
