import { describe, expect, it } from "vitest";
import { panCamera, zoomCameraAt } from "./camera";
import { projectTree, withHover, withSelection, type TreeHighlight } from "./tree-interaction";
import { resolveSceneGraph, sceneResolutionCount } from "./tree-scene";
import type { Stage, TreeLayout } from "../types";

const layout: TreeLayout = {
  width: 700,
  height: 500,
  nodes: [
    { id: "root", title: "Root", type: "concept", x: 40, y: 420, depth: 0 },
    { id: "stage", title: "Stage", type: "concept", stage: "stage", parent: "root", x: 180, y: 360, depth: 1 },
    { id: "branch", title: "Branch", type: "concept", parent: "stage", x: 330, y: 270, depth: 2 },
    { id: "leaf", title: "Leaf", type: "concept", parent: "branch", x: 500, y: 180, depth: 3 },
  ],
  edges: [
    { from: "root", to: "stage", kind: "timeline" },
    { from: "stage", to: "branch", kind: "parent" },
    { from: "branch", to: "leaf", kind: "parent" },
  ],
};

const stages: Stage[] = [
  { type: "stage", id: "foundation", title: "计算基础", description: "", order: 1, start: 1930, end: 1950, created: "", updated: "" },
  { type: "stage", id: "modern", title: "现代 AI", description: "", order: 2, start: 2010, created: "", updated: "" },
];

const staged: TreeLayout = {
  width: 900,
  height: 600,
  nodes: [
    { id: "subject", title: "计算机", type: "concept", x: 0, y: 0, depth: 0 },
    { id: "foundation", title: "计算基础", type: "concept", stage: "foundation", parent: "subject", x: 0, y: 0, depth: 1 },
    { id: "modern", title: "现代 AI", type: "concept", stage: "modern", parent: "subject", x: 0, y: 0, depth: 1 },
    { id: "logic", title: "逻辑门", type: "hardware", stage: "foundation", parent: "foundation", x: 0, y: 0, depth: 2 },
    { id: "gate", title: "与门", type: "hardware", stage: "foundation", parent: "logic", x: 0, y: 0, depth: 3 },
  ],
  edges: [],
};

const viewport = { width: 900, height: 600 };
const camera = { x: 12, y: 18, scale: 1 };
const highlight: TreeHighlight = { selectedId: null, hoveredId: null, stageFilter: null, collapsedIds: new Set() };

function worldSnapshot(scene: NonNullable<ReturnType<typeof resolveSceneGraph>>): string {
  return JSON.stringify({ branches: scene.branches, leaves: scene.leaves, labels: scene.labels, bounds: scene.bounds, revision: scene.revision });
}

describe("scene graph", () => {
  it("same input produces same geometry", () => {
    const first = resolveSceneGraph(layout)!;
    const second = resolveSceneGraph(layout)!;
    const stagedFirst = resolveSceneGraph(staged, stages)!;
    const stagedSecond = resolveSceneGraph(staged, stages)!;
    expect(worldSnapshot(first)).toBe(worldSnapshot(second));
    expect(first.revision).toBe(second.revision);
    expect(worldSnapshot(stagedFirst)).toBe(worldSnapshot(stagedSecond));
    expect(stagedFirst.branches.length).toBeGreaterThan(0);
    expect(stagedFirst.leaves.length).toBeGreaterThan(0);
  });

  it("leaf anchor equals branch tip and leaf direction equals branch tip tangent", () => {
    for (const scene of [resolveSceneGraph(layout)!, resolveSceneGraph(staged, stages)!]) {
      expect(scene.leaves.length).toBeGreaterThan(0);
      for (const leaf of scene.leaves) {
        const branch = scene.branches.find((item) => item.id === leaf.branchId)!;
        expect(branch.kind).toBe("parent");
        expect(leaf.anchor).toBe(branch.tipPoint);
        expect(leaf.direction).toBe(branch.tipTangent);
        expect(leaf.anchor).toEqual({ x: branch.tipPoint.x, y: branch.tipPoint.y });
        expect(leaf.direction).toEqual({ x: branch.tipTangent.x, y: branch.tipTangent.y });
      }
    }
  });

  it("pan does not rebuild SceneGraph", () => {
    const scene = resolveSceneGraph(layout)!;
    const before = sceneResolutionCount();
    const panned = projectTree({ scene, camera: panCamera(camera, 36, -14), highlight, viewport });
    expect(sceneResolutionCount()).toBe(before);
    expect(panned.scene).toBe(scene);
    expect(panned.scene.branches).toBe(scene.branches);
    expect(panned.scene.leaves).toBe(scene.leaves);
    expect(panned.scene.labels).toBe(scene.labels);
    expect(panned.camera).toEqual({ x: 48, y: 4, scale: 1 });
    expect(worldSnapshot(panned.scene)).toBe(worldSnapshot(scene));
  });

  it("zoom does not change world geometry", () => {
    const scene = resolveSceneGraph(layout)!;
    const before = sceneResolutionCount();
    const zoomed = projectTree({ scene, camera: zoomCameraAt(camera, 120, 80, 1.4), highlight, viewport });
    const overview = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.4 }, highlight, viewport });
    const detail = projectTree({ scene, camera: { x: 0, y: 0, scale: 1.2 }, highlight, viewport });
    expect(sceneResolutionCount()).toBe(before);
    expect(zoomed.scene).toBe(scene);
    expect(zoomed.camera.scale).not.toBe(camera.scale);
    expect(worldSnapshot(zoomed.scene)).toBe(worldSnapshot(scene));
    expect(overview.lod).toBe("overview");
    expect(detail.lod).toBe("detail");
    expect(overview.scene).toBe(detail.scene);
    expect(overview.scene.labels).toBe(detail.scene.labels);
    expect(overview.scene.leaves[0].anchor).toBe(detail.scene.leaves[0].anchor);
  });

  it("hover does not rebuild geometry", () => {
    const scene = resolveSceneGraph(layout)!;
    const before = sceneResolutionCount();
    const hovered = projectTree({ scene, camera, highlight: withHover(highlight, "leaf"), viewport });
    const selected = projectTree({ scene, camera, highlight: withSelection(withHover(highlight, "leaf"), "leaf"), viewport });
    expect(sceneResolutionCount()).toBe(before);
    expect(hovered.scene).toBe(scene);
    expect(selected.scene).toBe(scene);
    expect(hovered.highlight.hoveredId).toBe("leaf");
    expect(selected.highlight.selectedId).toBe("leaf");
    expect(hovered.scene.revision).toBe(scene.revision);
    expect(worldSnapshot(hovered.scene)).toBe(worldSnapshot(scene));
    expect(worldSnapshot(selected.scene)).toBe(worldSnapshot(scene));
  });
});
