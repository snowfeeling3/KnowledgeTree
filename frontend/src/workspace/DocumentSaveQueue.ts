export type SaveState = "loading" | "saved" | "pending" | "saving" | "failed";
export type DocumentDraft = { content: string; saved: string; state: SaveState; error?: string };
/** Each write captures its own node and revision. Later edits cannot be marked saved early. */
export class DocumentSaveQueue {
  drafts = new Map<string, DocumentDraft>();
  private tail: Promise<unknown> = Promise.resolve();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;
  constructor(private write: (id: string, text: string) => Promise<void>, private changed: () => void = () => {}, private delay = 750) {}
  seed(id: string, content: string) { if (!this.drafts.has(id)) this.drafts.set(id, { content, saved: content, state: "saved" }); this.changed(); }
  edit(id: string, content: string) {
    const draft = this.drafts.get(id); if (!draft) return;
    this.drafts.set(id, { ...draft, content, state: content === draft.saved ? "saved" : "pending", error: undefined }); this.changed();
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.flush(id).catch(() => {}); }, this.delay));
  }
  flush(id?: string): Promise<void> {
    const ids = id ? [id] : [...this.drafts.keys()];
    for (const key of ids) { clearTimeout(this.timers.get(key)); this.timers.delete(key); }
    const task = this.tail.then(async () => {
      const errors: unknown[] = [];
      for (const key of ids) {
        const draft = this.drafts.get(key); if (!draft || draft.content === draft.saved) continue;
        const content = draft.content;
        this.drafts.set(key, { ...draft, state: "saving" }); this.changed();
        try {
          await this.write(key, content);
          const latest = this.drafts.get(key)!;
          this.drafts.set(key, { ...latest, saved: content, state: latest.content === content ? "saved" : "pending", error: undefined });
        } catch (error) { const latest = this.drafts.get(key)!; this.drafts.set(key, { ...latest, state: "failed", error: String(error) }); errors.push(error); }
        this.changed();
      }
      if (errors.length) throw errors[0];
    });
    this.tail = task.catch(() => {});
    return task;
  }
  forget(id: string) { clearTimeout(this.timers.get(id)); this.timers.delete(id); this.drafts.delete(id); this.changed(); }
  dispose() { this.disposed = true; for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); }
  get isDisposed() { return this.disposed; }
}
