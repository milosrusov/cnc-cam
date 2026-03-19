import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { selectSelectedEntities, selectOrderedLayers } from '../../../state/cad/cad.selectors';
import { updateEntity } from '../../../state/cad/cad.actions';
import { Entity } from '../../../core/models/geometry/entity.model';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [AsyncPipe, FormsModule, DecimalPipe],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
})
export class PropertiesPanelComponent {
  private store = inject(Store);

  selected$ = this.store.select(selectSelectedEntities);
  layers$ = this.store.select(selectOrderedLayers);

  changeLayer(entity: Entity, layerId: string): void {
    this.store.dispatch(updateEntity({ entity: { ...entity, layerId } }));
  }

  changeColor(entity: Entity, color: string): void {
    this.store.dispatch(updateEntity({ entity: { ...entity, color } }));
  }
}
