import { describe, expect, it } from "vitest";
import { botanicalSkeletonLayout } from "./botanical-skeleton";
import { cubicPoint } from "./organic-geometry";
import { illustratedTreeLayout } from "./illustrated-tree-layout";
import { illustratedFixture } from "./illustrated-tree.fixture";
import { ILLUSTRATED_BUDGET, labelsClear, projectIllustratedTree } from "./illustrated-tree-projection";
import type { TreeHighlight } from "./tree-interaction";

const fixture = illustratedFixture();
const highlight: TreeHighlight = { selectedId: null, hoveredId: null, stageFilter: null, collapsedIds: new Set() };

describe("illustrated tree", () => {
  it("has one trunk, five staggered limbs, at most four secondary slots and three twigs per slot", () => {
    const skeleton = botanicalSkeletonLayout();
    expect(skeleton.branches.filter((branch) => branch.role === "trunk")).toHaveLength(1);
    expect(skeleton.slots.filter((slot) => slot.level === 1)).toHaveLength(5);
    for (const slot of skeleton.slots) {
      const children = skeleton.slots.filter((child) => child.parentId === slot.id);
      expect(children.length).toBeLessThanOrEqual(slot.level === 1 ? 4 : 3);
      const attachments = children.map((child) => `${child.curve.p0.x},${child.curve.p0.y}`);
      expect(new Set(attachments).size).toBe(attachments.length);
      expect(slot.curve.p3.y).toBeLessThan(slot.curve.p0.y);
    }
    for (const branch of skeleton.branches) expect(branch.widthBase).toBeGreaterThan(branch.widthTip);
  });

  it("reserves disjoint chambers and keeps secondary subtrees inside them", () => {
    for (const weights of [[], [1, 1000, 20, 600, 1], [200, 3, 900, 1, 7]]) {
      const skeleton = botanicalSkeletonLayout(weights);
      const boxes = skeleton.sectors;
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i], b = boxes[j];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
      for (const slot of skeleton.slots.filter((slot) => slot.level > 1)) {
        const box = boxes[slot.sector];
        for (let t = 0; t <= 1; t += 0.1) {
          const point = cubicPoint(slot.curve, t);
          expect(point.x, slot.id).toBeGreaterThanOrEqual(box.left);
          expect(point.x, slot.id).toBeLessThanOrEqual(box.right);
          expect(point.y, slot.id).toBeGreaterThanOrEqual(box.top);
          expect(point.y, slot.id).toBeLessThanOrEqual(box.bottom);
        }
      }
    }
  });

  it("ignores old coordinates and input ordering, keeps data intact and every record reachable", () => {
    const before = JSON.stringify(fixture);
    const scene = illustratedTreeLayout(fixture.layout, fixture.stages)!;
    const reversed = illustratedTreeLayout({ ...fixture.layout, nodes: [...fixture.layout.nodes].reverse().map((node) => ({ ...node, x: -900, y: 9999 })), edges: [...fixture.layout.edges].reverse() }, [...fixture.stages].reverse())!;
    expect(reversed.revision).toBe(scene.revision);
    expect(reversed.branches).toEqual(scene.branches);
    expect(reversed.illustration!.bindings).toEqual(scene.illustration!.bindings);
    expect(JSON.stringify(fixture)).toBe(before);
    expect(scene.nodes).toHaveLength(fixture.layout.nodes.length);
    for (const node of fixture.layout.nodes) {
      const anchor = scene.illustration!.nodeToAnchor.get(node.id);
      expect(anchor).toBeTruthy();
      expect(scene.illustration!.bindings.some((binding) => binding.anchorId === anchor && binding.recordIds.includes(node.id))).toBe(true);
    }
    expect(scene.illustration!.bindings.filter((binding) => binding.rank === "stage")).toHaveLength(5);
    expect(scene.illustration!.bindings.some((binding) => binding.title.includes("+"))).toBe(true);
  });

  it("caps all LOD labels, prevents screen collisions at varied viewports, and never expands concepts", () => {
    const scene = illustratedTreeLayout(fixture.layout, fixture.stages)!;
    for (const viewport of [{ width: 1300, height: 900 }, { width: 650, height: 600 }, { width: 360, height: 400 }]) {
      for (const scale of [0.25, 0.5, 0.8, 1.2, 2.4]) {
        const camera = { scale, x: viewport.width / 2 - 560 * scale, y: viewport.height / 2 - 520 * scale };
        const projection = projectIllustratedTree({ scene, camera, viewport, highlight });
        expect(projection.scene).toBe(scene);
        expect(projection.illustratedLabels.length).toBeLessThanOrEqual(ILLUSTRATED_BUDGET[projection.lod]);
        expect(projection.illustratedLabels.some((label) => label.rank === "concept")).toBe(false);
        if (projection.lod === "overview") expect(projection.illustratedLabels.some((label) => label.rank === "technology" || label.rank === "topic")).toBe(false);
        if (projection.lod === "structure") expect(projection.illustratedLabels.some((label) => label.rank === "technology")).toBe(false);
        for (let i = 0; i < projection.illustratedLabels.length; i += 1) for (let j = i + 1; j < projection.illustratedLabels.length; j += 1)
          expect(labelsClear(projection.illustratedLabels[i].box, projection.illustratedLabels[j].box)).toBe(true);
      }
    }
    const project = (scale: number) => projectIllustratedTree({ scene, camera: { x: 100, y: 100, scale }, viewport: { width: 4000, height: 4000 }, highlight });
    expect(project(0.5).visibleBranchIds.size).toBe(26);
    expect(project(1.2).visibleBranchIds.size).toBeGreaterThan(26);
  });

  it("filters grouped stages and shows selected hidden knowledge through its representative anchor", () => {
    const scene = illustratedTreeLayout(fixture.layout, fixture.stages)!;
    const selectedId = "stage-7-d6-tech5-c2";
    const projection = projectIllustratedTree({ scene, camera: { scale: 0.5, x: 100, y: 100 }, viewport: { width: 1300, height: 900 }, highlight: { ...highlight, selectedId, stageFilter: "stage-7" } });
    expect(projection.illustratedLabels.length).toBeLessThanOrEqual(16);
    for (const label of projection.illustratedLabels) {
      const binding = scene.illustration!.bindings.find((item) => item.id === label.nodeId)!;
      expect(binding.rank === "root" || binding.stageIds.includes("stage-7")).toBe(true);
      if (binding.rank !== "root" && binding.rank !== "stage") {
        expect(binding.recordIds.some((id) => scene.nodes.find((node) => node.id === id)?.stage === "stage-7")).toBe(true);
      }
    }
    const anchor = scene.illustration!.nodeToAnchor.get(selectedId);
    expect(scene.illustration!.bindings.find((binding) => binding.anchorId === anchor)?.recordIds).toContain(selectedId);
  });

  it("supports empty data, one stage, no stages and cyclic records without recursive rendering", () => {
    expect(illustratedTreeLayout(null, [])).toBeNull();
    expect(illustratedTreeLayout({ nodes: [], edges: [], width: 0, height: 0 }, [])).toBeNull();
    const one = illustratedFixture(1, 2);
    expect(illustratedTreeLayout(one.layout, one.stages)!.branches.filter((branch) => branch.role === "primary")).toHaveLength(5);
    const bare = { ...one.layout, nodes: one.layout.nodes.map((node) => ({ ...node, stage: null })) };
    expect(illustratedTreeLayout(bare, [])!.nodes).toHaveLength(bare.nodes.length);
    const cyclic = { ...bare, nodes: bare.nodes.map((node) => node.id === "subject" ? { ...node, parent: "stage-0" } : node) };
    expect(illustratedTreeLayout(cyclic, [])!.nodes).toHaveLength(cyclic.nodes.length);
  });

  it("inherits missing stage metadata and allocates larger chambers to larger subtrees", () => {
    const sample = illustratedFixture(5, 4);
    // Different subtree sizes; child stage metadata may be omitted in the data model.
    const nodes = sample.layout.nodes.filter((node) => node.depth < 4 || Number(node.stage?.slice(-1)) <= Number(node.id.match(/tech(\d+)/)?.[1] ?? 0))
      .map((node) => node.depth > 1 ? { ...node, stage: null } : node);
    const scene = illustratedTreeLayout({ ...sample.layout, nodes }, sample.stages)!;
    const groups = scene.illustration!.bindings.filter((binding) => binding.rank === "stage");
    expect(groups.every((binding) => binding.recordIds.length > 1)).toBe(true);
    const area = (id: string) => {
      const slot = scene.illustration!.skeleton.slots.find((slot) => slot.id === id)!;
      const chamber = scene.illustration!.skeleton.sectors[slot.sector];
      return chamber.width * chamber.height;
    };
    const ordered = [...groups].sort((a, b) => b.recordIds.length - a.recordIds.length);
    for (let i = 1; i < ordered.length; i += 1) expect(area(ordered[i - 1].id)).toBeGreaterThanOrEqual(area(ordered[i].id));
  });
});
