import { createAction, props } from '@ngrx/store';
import { ActiveWorkspace } from '../app.state';

export const setActiveWorkspace = createAction('[UI] Set Active Workspace', props<{ workspace: ActiveWorkspace }>());
export const setTheme = createAction('[UI] Set Theme', props<{ theme: 'dark' | 'light' }>());
export const toggleLeftPanel = createAction('[UI] Toggle Left Panel');
export const toggleRightPanel = createAction('[UI] Toggle Right Panel');
