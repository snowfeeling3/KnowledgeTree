export type Undoable = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };
/** Serialized operations; failed undo/redo stays on its original stack. */
export class UndoManager {
  private past: Undoable[] = [];
  private future: Undoable[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  busy = false;
  async idle() { await this.tail; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  constructor(private changed: () => void = () => {}) {}
  run<T>(action: () => Promise<T>): Promise<T> {
    const task = this.tail.then(async () => { this.busy = true; this.changed(); try { return await action(); } finally { this.busy = false; this.changed(); } });
    this.tail = task.catch(() => {});
    return task;
  }
  record(entry: Undoable) { this.past.push(entry); this.past = this.past.slice(-50); this.future = []; this.changed(); }
  undo() { return this.run(async () => { const entry = this.past.at(-1); if (!entry) return; await entry.undo(); this.past.pop(); this.future.push(entry); }); }
  redo() { return this.run(async () => { const entry = this.future.at(-1); if (!entry) return; await entry.redo(); this.future.pop(); this.past.push(entry); }); }
}
