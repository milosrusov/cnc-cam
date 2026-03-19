import { Component, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { GcodeService, PostProcessorType } from '../../core/services/gcode.service';
import { selectCamState } from '../../state/cam/cam.selectors';

@Component({
  selector: 'app-gcode-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './gcode-editor.component.html',
  styleUrl: './gcode-editor.component.scss',
})
export class GcodeEditorComponent implements OnInit {
  private store = inject(Store);
  private gcodeService = inject(GcodeService);
  private router = inject(Router);

  postProcessor: PostProcessorType = 'uccnc';
  units: 'mm' | 'inch' = 'mm';
  programName = 'CNC_JOB_001';

  gcodeText = '';
  gcodeLines: string[] = [];
  lineCount = 0;
  estimatedTime = '';
  operationCount = 0;
  copied = false;

  private camState: any = null;

  ngOnInit(): void {
    this.store.select(selectCamState).subscribe(state => {
      this.camState = state;
      this.operationCount = Object.values(state.operations ?? {}).filter((o: any) => o.enabled).length;
      const secs = this.gcodeService.estimateTime(Object.values(state.toolpaths ?? {}));
      this.estimatedTime = secs > 0 ? this.gcodeService.formatTime(secs) : '—';
      this.generate();
    });
  }

  generate(): void {
    if (!this.camState) return;
    const toolpaths = Object.values(this.camState.toolpaths ?? {}) as any[];
    if (toolpaths.length === 0) { this.gcodeLines = []; this.lineCount = 0; return; }

    this.gcodeText = this.gcodeService.generate({
      toolpaths,
      tools: this.camState.tools,
      operations: this.camState.operations,
      postProcessor: this.postProcessor,
      programName: this.programName,
      units: this.units,
    });

    this.gcodeLines = this.gcodeText.split('\n');
    this.lineCount = this.gcodeLines.length;
  }

  getLineClass(line: string): string {
    const t = line.trim();
    if (t.startsWith(';') || t.startsWith('(')) return 'line-comment';
    if (t.startsWith('G0 ') || t === 'G0') return 'line-rapid';
    if (t.startsWith('G1 ') || t.startsWith('G2 ') || t.startsWith('G3 ')) return 'line-feed';
    if (t.startsWith('M3') || t.startsWith('M5') || t.startsWith('S')) return 'line-spindle';
    if (t.startsWith('M') || t.startsWith('T') || t.startsWith('G28') || t.startsWith('M30') || t.startsWith('M2')) return 'line-misc';
    return '';
  }

  download(): void {
    const blob = new Blob([this.gcodeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.programName}.nc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.gcodeText).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    });
  }
}
