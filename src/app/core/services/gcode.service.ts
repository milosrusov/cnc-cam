import { Injectable } from '@angular/core';
import { Toolpath, Move } from '../models/cam/toolpath.model';
import { Tool } from '../models/cam/tool.model';
import { Operation } from '../models/cam/operation.model';

export type PostProcessorType = 'uccnc' | 'mach3' | 'grbl' | 'fanuc';

export interface GcodeJob {
  toolpaths: Toolpath[];
  tools: Record<string, Tool>;
  operations: Record<string, Operation>;
  postProcessor: PostProcessorType;
  programName: string;
  units: 'mm' | 'inch';
}

@Injectable({ providedIn: 'root' })
export class GcodeService {

  generate(job: GcodeJob): string {
    const lines: string[] = [];
    const fmt = (n: number) => n.toFixed(3);
    const pp = job.postProcessor;
    const isFanuc = pp === 'fanuc';
    const isGrbl = pp === 'grbl';

    // ─── Header ───────────────────────────────────────────────────────────────
    if (isFanuc) {
      lines.push(`O${job.programName.replace(/\D/g, '').padStart(4, '0')} (${job.programName})`);
    } else {
      lines.push(`; === ${job.programName} ===`);
      lines.push(`; Post-processor: ${pp.toUpperCase()}`);
      lines.push(`; Generated: ${new Date().toISOString()}`);
      lines.push(`; Toolpaths: ${job.toolpaths.length}`);
      lines.push('');
    }

    // Units
    lines.push(job.units === 'mm' ? 'G21 ; mm' : 'G20 ; inch');
    // Absolute mode
    lines.push('G90 ; Absolute positioning');
    // Cancel tool radius compensation
    lines.push('G40');

    if (pp === 'mach3' || pp === 'uccnc') {
      lines.push('G49 ; Cancel tool length offset');
      lines.push('G80 ; Cancel canned cycles');
    }
    lines.push('');

    let currentTool: Tool | null = null;
    let currentFeed = -1;

    for (const tp of job.toolpaths) {
      const tool = job.tools[tp.toolId];
      const op = job.operations[tp.operationId];
      if (!tool || !op) continue;

      // ─── Tool change ────────────────────────────────────────────────────────
      if (!currentTool || currentTool.id !== tool.id) {
        lines.push(`; --- Tool: T${this.toolNumber(tool)} ${tool.name} (Ø${tool.diameter}mm) ---`);

        if (pp === 'mach3' || pp === 'uccnc') {
          lines.push(`T${this.toolNumber(tool)} M6`);
          lines.push(`G43 H${this.toolNumber(tool)} ; Tool length offset`);
        } else if (isFanuc) {
          lines.push(`T${String(this.toolNumber(tool)).padStart(2, '0')} M6`);
          lines.push(`G43 H${String(this.toolNumber(tool)).padStart(2, '0')}`);
        } else {
          // GRBL: no tool change support, just comment
          lines.push(`; Tool change: ${tool.name}`);
        }

        // Spindle on
        lines.push(`S${op.spindleRPM} M3 ; Spindle CW`);
        if (pp !== 'grbl') lines.push('G4 P1 ; Wait 1s for spindle');
        lines.push('');
        currentTool = tool;
      }

      // ─── Operation header ───────────────────────────────────────────────────
      lines.push(`; Operation: ${op.name} (${op.type})`);

      // ─── Moves ──────────────────────────────────────────────────────────────
      for (const move of tp.moves) {
        const x = `X${fmt(move.x)}`;
        const y = `Y${fmt(move.y)}`;
        const z = `Z${fmt(move.z)}`;

        if (move.type === 'rapid') {
          lines.push(`G0 ${x} ${y} ${z}`);
          currentFeed = -1;
        } else if (move.type === 'linear') {
          const f = move.feedRate ?? op.feedRate;
          const feedStr = f !== currentFeed ? ` F${f}` : '';
          lines.push(`G1 ${x} ${y} ${z}${feedStr}`);
          currentFeed = f;
        } else if (move.type === 'arc_cw' || move.type === 'arc_ccw') {
          const g = move.type === 'arc_cw' ? 'G2' : 'G3';
          const f = move.feedRate ?? op.feedRate;
          const feedStr = f !== currentFeed ? ` F${f}` : '';
          const i = move.i !== undefined ? ` I${fmt(move.i)}` : '';
          const j = move.j !== undefined ? ` J${fmt(move.j)}` : '';
          lines.push(`${g} ${x} ${y} ${z}${i}${j}${feedStr}`);
          currentFeed = f;
        }
      }

      lines.push('');
    }

    // ─── Footer ───────────────────────────────────────────────────────────────
    lines.push('; === End of program ===');
    lines.push('M5 ; Spindle off');

    if (pp === 'mach3' || pp === 'uccnc') {
      lines.push('G28 G91 Z0 ; Return Z home');
      lines.push('G90');
      lines.push('G28 G91 X0 Y0');
      lines.push('G90');
      lines.push('M30 ; Program end');
    } else if (isFanuc) {
      lines.push('G28 G91 Z0.');
      lines.push('G28 G91 X0. Y0.');
      lines.push('G90');
      lines.push('M30');
      lines.push('%');
    } else {
      // GRBL
      lines.push('G28 ; Go to home');
      lines.push('M2 ; End program');
    }

    return lines.join('\n');
  }

  private toolNumber(tool: Tool): number {
    // Extract number from id or use hash
    const match = tool.id.match(/\d+/);
    return match ? parseInt(match[0]) : 1;
  }

  estimateTime(toolpaths: Toolpath[]): number {
    return toolpaths.reduce((acc, tp) => acc + tp.estimatedTime, 0);
  }

  formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
