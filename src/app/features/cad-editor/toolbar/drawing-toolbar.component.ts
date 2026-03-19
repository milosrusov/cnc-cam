import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { selectActiveTool } from '../../../state/cad/cad.selectors';
import { setActiveTool } from '../../../state/cad/cad.actions';
import { ActiveTool } from '../../../state/app.state';
import { CommandBusService } from '../../../core/services/command-bus.service';

interface ToolDef {
  tool: ActiveTool;
  icon: string;
  label: string;
  shortcut: string;
}

@Component({
  selector: 'app-drawing-toolbar',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './drawing-toolbar.component.html',
  styleUrl: './drawing-toolbar.component.scss',
})
export class DrawingToolbarComponent {
  private store = inject(Store);
  private cmdBus = inject(CommandBusService);

  activeTool$ = this.store.select(selectActiveTool);
  canUndo$ = this.cmdBus.canUndo$;
  canRedo$ = this.cmdBus.canRedo$;

  selectTools: ToolDef[] = [
    { tool: 'select',    icon: '↖',  label: 'Select',    shortcut: 'S' },
    { tool: 'pan',       icon: '✥',  label: 'Pan',       shortcut: 'H' },
    { tool: 'line',      icon: '╱',  label: 'Line',      shortcut: 'L' },
    { tool: 'circle',    icon: '○',  label: 'Circle',    shortcut: 'C' },
    { tool: 'arc',       icon: '◜',  label: 'Arc',       shortcut: 'A' },
    { tool: 'rectangle', icon: '▭',  label: 'Rectangle', shortcut: 'R' },
    { tool: 'polygon',   icon: '⬡',  label: 'Polygon',   shortcut: 'P' },
    { tool: 'spline',    icon: '〜', label: 'Spline',    shortcut: 'B' },
    { tool: 'point',     icon: '·',  label: 'Point',     shortcut: 'D' },
  ];


  setTool(tool: ActiveTool): void {
    this.store.dispatch(setActiveTool({ tool }));
  }

  undo(): void { this.cmdBus.undo(); }
  redo(): void { this.cmdBus.redo(); }
}
