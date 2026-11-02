import { describe, expect, it } from "vitest";
import { mindmapScene } from "./mindmap";
import { illustratedFixture } from "./illustrated-tree.fixture";
describe("tidy knowledge map", () => {
  it("preserves every node and source coordinates, with separated cards", () => {
    const { layout } = illustratedFixture(3, 2); const original = JSON.stringify(layout);
    const scene = mindmapScene(layout)!;
    expect(scene.nodes.length).toBe(layout.nodes.length);
    expect(JSON.stringify(layout)).toBe(original);
    for (const a of scene.nodes) for (const b of scene.nodes) if (a.id !== b.id) expect(Math.abs(a.point.x - b.point.x) >= 196 || Math.abs(a.point.y - b.point.y) >= 58).toBe(true);
  });
  it("hides descendants on collapse and restores them on expansion", () => {
    const { layout } = illustratedFixture(); const all = mindmapScene(layout)!;
    const root = all.nodes.find(node => !node.parent)!;
    const collapsed = mindmapScene(layout, new Set([root.id]))!;
    expect(collapsed.nodes.map(node => node.id)).toEqual([root.id]);
    expect(mindmapScene(layout)!.nodes.length).toBe(all.nodes.length);
  });
  it("handles disconnected and cyclic components without losing nodes", () => {
    const { layout } = illustratedFixture();
    const nodes = layout.nodes.slice(0, 3).map((node, i, items) => ({ ...node, parent: items[(i + 1) % items.length].id }));
    const scene = mindmapScene({ ...layout, nodes })!;
    expect(new Set(scene.nodes.map(node => node.id)).size).toBe(3);
    expect(scene.nodes.length).toBe(3);
  });
});
