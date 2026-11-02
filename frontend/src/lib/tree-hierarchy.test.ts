import { describe, expect, it } from "vitest";
import { projectTree, type TreeHighlight } from "./tree-interaction";
import { resolveBranchGeometry } from "./organic-geometry";
import { resolveSceneGraph, sceneResolutionCount } from "./tree-scene";
import { adaptedStrokeWidth } from "./tree-visibility";
import type { TreeLayout } from "../types";

const hierarchy: TreeLayout = {
  width: 900,
  height: 700,
  nodes: [
    { id: "root", title: "Root", type: "concept", x: 40, y: 520, depth: 0 },
    { id: "stage", title: "Stage", type: "concept", x: 180, y: 430, depth: 1 },
    { id: "primary", title: "Primary", type: "concept", parent: "stage", x: 340, y: 340, depth: 2 },
    { id: "secondary", title: "Secondary", type: "concept", parent: "primary", x: 500, y: 250, depth: 3 },
    { id: "twig", title: "Twig", type: "concept", parent: "secondary", x: 660, y: 170, depth: 4 },
  ],
  edges: [
    { from: "root", to: "stage", kind: "timeline" },
    { from: "stage", to: "primary", kind: "parent" },
    { from: "primary", to: "secondary", kind: "parent" },
    { from: "secondary", to: "twig", kind: "parent" },
  ],
};

const spread: TreeLayout = {
  width: 5000,
  height: 5000,
  nodes: [
    { id: "root", title: "Root", type: "concept", x: 80, y: 90, depth: 0 },
    { id: "near", title: "Near", type: "concept", x: 180, y: 70, depth: 1 },
    { id: "far-a", title: "Far A", type: "concept", x: 4200, y: 4100, depth: 1 },
    { id: "far-b", title: "Far B", type: "concept", x: 4600, y: 3900, depth: 1 },
  ],
  edges: [
    { from: "root", to: "near", kind: "timeline" },
    { from: "near", to: "far-a", kind: "timeline" },
    { from: "far-a", to: "far-b", kind: "timeline" },
  ],
};

const viewport = { width: 900, height: 600 };
const highlight: TreeHighlight = { selectedId: null, hoveredId: null, stageFilter: null, collapsedIds: new Set() };

describe("tree hierarchy", () => {
  it("keeps trunk wider than primary, secondary, and twig", () => {
    const branches = resolveBranchGeometry(hierarchy);
    const width = (id: string) => branches.find((branch) => branch.toId === id)!;
    const trunk = width("stage");
    const primary = width("primary");
    const secondary = width("secondary");
    const twig = width("twig");
    expect(trunk.role).toBe("trunk");
    expect(primary.role).toBe("primary");
    expect(secondary.role).toBe("secondary");
    expect(twig.role).toBe("twig");
    expect(trunk.widthBase).toBeGreaterThan(primary.widthBase);
    expect(primary.widthBase).toBeGreaterThan(secondary.widthBase);
    expect(secondary.widthBase).toBeGreaterThan(twig.widthBase);
    expect(trunk.widthBase).toBeGreaterThanOrEqual(14);
    expect(trunk.widthBase).toBeLessThanOrEqual(18);
    expect(trunk.widthTip).toBeCloseTo(8, 5);
    expect(trunk.widthBase).toBeCloseTo(16, 5);
    expect(trunk.widthTip).toBeLessThan(trunk.widthBase);
    expect(primary.widthBase).toBeGreaterThanOrEqual(7);
    expect(primary.widthBase).toBeLessThanOrEqual(10);
    expect(secondary.widthBase).toBeGreaterThanOrEqual(3);
    expect(secondary.widthBase).toBeLessThanOrEqual(6);
    expect(twig.widthBase).toBeGreaterThanOrEqual(1.5);
    expect(twig.widthBase).toBeLessThanOrEqual(3);
  });

  it("keeps distant trunk visible and fainter when zoomed in", () => {
    const scene = resolveSceneGraph(spread, [])!;
    const before = sceneResolutionCount();
    const zoomed = projectTree({
      scene,
      camera: { x: -20, y: -10, scale: 2.4 },
      highlight,
      viewport,
    });
    const near = scene.branches.find((branch) => branch.toId === "near")!;
    const far = scene.branches.find((branch) => branch.toId === "far-b")!;
    expect(sceneResolutionCount()).toBe(before);
    expect(zoomed.scene).toBe(scene);
    expect(zoomed.visibleBranchIds.has(near.id)).toBe(true);
    expect(zoomed.visibleBranchIds.has(far.id)).toBe(true);
    const nearOpacity = zoomed.branchPaint.get(near.id)?.opacity ?? 0;
    const farOpacity = zoomed.branchPaint.get(far.id)?.opacity ?? 0;
    expect(nearOpacity).toBeGreaterThan(farOpacity);
    expect(farOpacity).toBeGreaterThan(0);
    expect(farOpacity).toBeLessThanOrEqual(0.3);
    expect(zoomed.scene.branches.find((branch) => branch.id === near.id)?.widthBase).toBe(near.widthBase);
  });

  it("joins consecutive trunk segments at the shared node", () => {
    const branches = resolveBranchGeometry(spread);
    const incoming = branches.find((branch) => branch.toId === "near")!;
    const outgoing = branches.find((branch) => branch.fromId === "near" && branch.role === "trunk")!;
    expect(outgoing.basePoint).toEqual(incoming.tipPoint);
    expect(incoming.tipPoint).toEqual({ x: 180, y: 70 });
  });

  it("adapts stroke width without changing the wood hierarchy", () => {
    const ratio = 13 / 8;
    for (const scale of [0.4, 1, 2.4]) {
      expect(adaptedStrokeWidth(13, scale) / adaptedStrokeWidth(8, scale)).toBeCloseTo(ratio);
      expect(adaptedStrokeWidth(13, scale)).toBeGreaterThan(adaptedStrokeWidth(8, scale));
      expect(adaptedStrokeWidth(8, scale)).toBeGreaterThan(adaptedStrokeWidth(4.2, scale));
      expect(adaptedStrokeWidth(4.2, scale)).toBeGreaterThan(adaptedStrokeWidth(2.1, scale));
    }
  });
});
