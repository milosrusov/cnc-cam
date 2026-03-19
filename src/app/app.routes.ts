import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'cad',
    pathMatch: 'full',
  },
  {
    path: 'cad',
    loadComponent: () =>
      import('./features/cad-editor/cad-editor.component').then(m => m.CadEditorComponent),
  },
  {
    path: 'cam',
    loadComponent: () =>
      import('./features/cam-operations/cam-editor.component').then(m => m.CamEditorComponent),
  },
  {
    path: '3d',
    loadComponent: () =>
      import('./features/viewport-3d/viewport-3d.component').then(m => m.Viewport3dComponent),
  },
  {
    path: 'gcode',
    loadComponent: () =>
      import('./features/gcode/gcode-editor.component').then(m => m.GcodeEditorComponent),
  },
];
