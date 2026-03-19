import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UiState } from '../app.state';

export const selectUiState = createFeatureSelector<UiState>('ui');

export const selectActiveWorkspace = createSelector(selectUiState, s => s.activeWorkspace);
export const selectTheme = createSelector(selectUiState, s => s.theme);
export const selectLeftPanelOpen = createSelector(selectUiState, s => s.leftPanelOpen);
export const selectRightPanelOpen = createSelector(selectUiState, s => s.rightPanelOpen);
