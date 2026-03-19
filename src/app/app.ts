import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { setActiveWorkspace } from './state/ui/ui.actions';
import { ActiveWorkspace } from './state/app.state';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  tabs = [
    { path: '/cad', workspace: 'cad' as ActiveWorkspace, icon: '✏', label: 'CAD' },
    { path: '/cam', workspace: 'cam' as ActiveWorkspace, icon: '⚙', label: 'CAM' },
    { path: '/3d', workspace: '3d' as ActiveWorkspace, icon: '⬡', label: '3D' },
    { path: '/gcode', workspace: 'gcode' as ActiveWorkspace, icon: '<>', label: 'G-Code' },
  ];

  constructor(private store: Store) {}

  setWorkspace(workspace: ActiveWorkspace): void {
    this.store.dispatch(setActiveWorkspace({ workspace }));
  }
}
