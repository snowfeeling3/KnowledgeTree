import { describe, expect, it, vi } from "vitest";
import { DocumentSaveQueue } from "./DocumentSaveQueue";
import { UndoManager } from "../history/UndoManager";
import { shortcutCommand } from "../commands/ShortcutManager";
import { focusNeighborhood, inheritedStage } from "../interaction/NavigationController";
import { quickAddInput } from "../node-actions/useNodeActions";
import { searchIndex } from "../search/SearchIndexAdapter";
import type { NodeRecord } from "../types";
import { matchCommands } from "../commands/CommandRegistry";
import { dropIntent } from "../interaction/DragController";
const node = (id: string, parent?: string, stage?: string): NodeRecord => ({ id, title: id.toUpperCase(), parent, stage, type: "hardware", created: "", updated: "", status: "active", tags: [] });
const nodes = [node("root"), node("cpu", "root", "electronics"), node("alu", "cpu"), node("disk", "root")];
const key = (name: string, ctrl = false, shift = false) => ({ key: name, ctrlKey: ctrl, metaKey: false, shiftKey: shift, altKey: false, isComposing: false });
describe("UX foundations", () => {
  it("fuzzy-matches commands in the correct direction and rejects cyclic drop targets", () => {
    const rows = ["Open CPU", "Focus CPU", "Create child under CPU", "Show relations of CPU", "Fit Tree"].map((title) => ({ id: title, title, run: () => {} }));
    expect(matchCommands(rows, "cpu")).toHaveLength(4);
    expect(matchCommands(rows, "fcpu").map((row) => row.title)).toContain("Focus CPU");
    const data = { nodes, stages: [], relations: [] };
    expect(dropIntent({ data }, "cpu", "alu", undefined, false).valid).toBe(false);
    expect(dropIntent({ data }, "cpu", "cpu", undefined, true).valid).toBe(false);
    expect(dropIntent({ data }, "alu", "disk", undefined, false)).toMatchObject({ valid: true, node: "disk" });
    expect(dropIntent({ data }, "alu", "cpu", undefined, true)).toMatchObject({ valid: true, node: "cpu" });
    const stages = [{ type: "stage" as const, id: "electronics", title: "Electronics", description: "", order: 0, created: "", updated: "" }];
    expect(dropIntent({ data: { ...data, stages } }, "root", undefined, "electronics", false).valid).toBe(false);
  });
  it("does not intercept text, IME composition, or editor undo", () => {
    expect(shortcutCommand(key("n"), true)).toBeNull(); expect(shortcutCommand(key("z", true), true)).toBeNull();
    expect(shortcutCommand({ ...key("Enter"), isComposing: true })).toBeNull();
    expect(shortcutCommand(key("N", false, true))).toBe("sibling"); expect(shortcutCommand(key("s", true), true)).toBe("save");
  });
  it("inherits context and keeps ancestors, descendants and related nodes in focus", () => {
    expect(inheritedStage("alu", nodes)).toBe("electronics");
    expect(quickAddInput("FPU", "child", nodes[1], nodes, null)).toMatchObject({ title: "FPU", parent: "cpu", stage: "electronics", type: "concept" });
    expect(quickAddInput("GPU", "sibling", nodes[1], nodes, null)).toMatchObject({ parent: "root", stage: "electronics", type: "hardware" });
    expect([...focusNeighborhood("cpu", nodes, [{ from: "cpu", to: "disk" }])]).toEqual(["root", "cpu", "alu", "disk"]);
  });
  it("merges title, tag, stage, relation and markdown search without touching layout", () => {
    expect(searchIndex("CPU", nodes, [], [], [], { id: "subject", title: "CS" }, [])[0].id).toBe("cpu");
    expect(searchIndex("pipeline", nodes, [], [], [{ node_id: "cpu", title: "CPU", type: "hardware", field: "content", snippet: "pipeline" }], { id: "subject", title: "CS" }, [])[0].id).toBe("cpu");
    expect(searchIndex("", nodes, [], [], [], { id: "subject", title: "CS" }, ["alu", "cpu"]).map((result) => result.id)).toEqual(["alu", "cpu"]);
  });
  it("debounces writes and retains correct node/revision when editing during an in-flight save", async () => {
    vi.useFakeTimers(); let finish!: () => void;
    const calls: [string, string][] = [];
    const queue = new DocumentSaveQueue(async (id, text) => { calls.push([id, text]); if (calls.length === 1) await new Promise<void>((resolve) => { finish = resolve; }); });
    queue.seed("cpu", "old"); queue.seed("alu", "base"); queue.edit("cpu", "v1");
    const first = queue.flush("cpu"); await Promise.resolve(); queue.edit("cpu", "v2"); queue.edit("alu", "v3"); finish(); await first;
    expect(queue.drafts.get("cpu")).toMatchObject({ content: "v2", saved: "v1", state: "pending" });
    await vi.advanceTimersByTimeAsync(750); await queue.flush();
    expect(calls).toEqual([["cpu", "v1"], ["cpu", "v2"], ["alu", "v3"]]); expect(queue.drafts.get("cpu")?.state).toBe("saved"); queue.dispose(); vi.useRealTimers();
  });
  it("keeps a failed draft and retries without falsely reporting saved", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const queue = new DocumentSaveQueue(write); queue.seed("cpu", "before"); queue.edit("cpu", "after");
    await expect(queue.flush()).rejects.toThrow("disk full"); expect(queue.drafts.get("cpu")).toMatchObject({ content: "after", saved: "before", state: "failed" });
    await queue.flush(); expect(queue.drafts.get("cpu")?.state).toBe("saved"); queue.dispose();
  });
  it("flushes other drafts even when one document fails", async () => {
    const queue = new DocumentSaveQueue(async (id) => { if (id === "cpu") throw new Error("locked"); });
    queue.seed("cpu", "old"); queue.seed("alu", "old"); queue.edit("cpu", "new"); queue.edit("alu", "new");
    await expect(queue.flush()).rejects.toThrow("locked");
    expect(queue.drafts.get("cpu")?.state).toBe("failed"); expect(queue.drafts.get("alu")?.state).toBe("saved"); queue.dispose();
  });
  it("retains failed undo entries, and invalidates redo after a new operation", async () => {
    const history = new UndoManager(); const undo = vi.fn().mockRejectedValueOnce(new Error("conflict")).mockResolvedValue(undefined);
    history.record({ label: "rename", undo, redo: async () => {} }); await expect(history.undo()).rejects.toThrow("conflict"); expect(history.canUndo).toBe(true);
    await history.undo(); expect(history.canRedo).toBe(true); history.record({ label: "move", undo: async () => {}, redo: async () => {} }); expect(history.canRedo).toBe(false);
  });
});
