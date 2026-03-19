import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { selectOrderedLayers, selectActiveLayerId } from '../../../state/cad/cad.selectors';
import { addLayer, removeLayer, updateLayer, setActiveLayer } from '../../../state/cad/cad.actions';
import { Layer } from '../../../core/models/layer.model';
import { generateId } from '../../../core/utils/math.utils';

@Component({
  selector: 'app-layers-panel',
  standalone: true,
  imports: [AsyncPipe, FormsModule],
  templateUrl: './layers-panel.component.html',
  styleUrl: './layers-panel.component.scss',
})
export class LayersPanelComponent {
  private store = inject(Store);

  layers$ = this.store.select(selectOrderedLayers);
  activeLayerId$ = this.store.select(selectActiveLayerId);

  setActive(id: string): void {
    this.store.dispatch(setActiveLayer({ id }));
  }

  addLayer(): void {
    const layer: Layer = {
      id: generateId(),
      name: 'Layer',
      color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
      lineWidth: 0.5,
      visible: true,
      locked: false,
    };
    this.store.dispatch(addLayer({ layer }));
  }

  deleteLayer(id: string): void {
    this.store.dispatch(removeLayer({ id }));
  }

  toggleVisible(layer: Layer): void {
    this.store.dispatch(updateLayer({ layer: { ...layer, visible: !layer.visible } }));
  }

  toggleLock(layer: Layer): void {
    this.store.dispatch(updateLayer({ layer: { ...layer, locked: !layer.locked } }));
  }

  changeColor(layer: Layer, color: string): void {
    this.store.dispatch(updateLayer({ layer: { ...layer, color } }));
  }
}
