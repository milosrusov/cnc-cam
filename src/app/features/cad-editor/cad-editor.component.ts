import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { map } from 'rxjs';
import { CadCanvasComponent } from './canvas/cad-canvas.component';
import { DrawingToolbarComponent } from './toolbar/drawing-toolbar.component';
import { LayersPanelComponent } from './panels/layers-panel.component';
import { PropertiesPanelComponent } from './panels/properties-panel.component';
import { AlignService, AlignType } from '../../core/services/align.service';
import { selectEntities } from '../../state/cad/cad.selectors';

@Component({
  selector: 'app-cad-editor',
  standalone: true,
  imports: [CadCanvasComponent, DrawingToolbarComponent, LayersPanelComponent, PropertiesPanelComponent, AsyncPipe],
  templateUrl: './cad-editor.component.html',
  styleUrl: './cad-editor.component.scss',
})
export class CadEditorComponent {
  private store = inject(Store);
  private alignService = inject(AlignService);

  selCount$ = this.store.select(selectEntities).pipe(
    map(entities => Object.values(entities).filter(e => e.selected).length)
  );

  align(type: AlignType): void {
    this.alignService.align(type);
  }
}
