export class SaveCoordinator {
  private editors = new Set<() => Promise<void>>();
  register(flush: () => Promise<void>) { this.editors.add(flush); return () => { this.editors.delete(flush); }; }
  async flush() { for (const save of this.editors) await save(); }
}
