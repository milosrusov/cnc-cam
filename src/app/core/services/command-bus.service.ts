import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Command {
  description: string;
  execute(): void;
  undo(): void;
}

@Injectable({ providedIn: 'root' })
export class CommandBusService {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  readonly canUndo$ = new BehaviorSubject(false);
  readonly canRedo$ = new BehaviorSubject(false);

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    this.updateState();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.updateState();
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
    this.updateState();
  }

  /** Batch multiple commands as a single undo step */
  executeBatch(commands: Command[], description: string): void {
    this.execute({
      description,
      execute: () => commands.forEach(c => c.execute()),
      undo: () => [...commands].reverse().forEach(c => c.undo()),
    });
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateState();
  }

  private updateState(): void {
    this.canUndo$.next(this.undoStack.length > 0);
    this.canRedo$.next(this.redoStack.length > 0);
  }
}
