import { describe, expect, it } from "vitest";
import { projectTree, type TreeHighlight } from "./tree-interaction";
import { resolveLabelPlacement, resolveBranchGeometry, resolveLeafPlacement, branchReach } from "./organic-geometry";
import { resolveSceneGraph, sceneResolutionCount } from "./tree-scene";
import { buildStageTreeLayout } from "./stage-tree";
import { fitCameraToPoints } from "./camera";
import { DENSITY, branchLength, openingScaleCap, stageSpacing, trunkStations, trunkWidthAt, visibleChildLimit } from "./tree-density";
import type { Stage, TreeLayout } from "../types";

const highlight: TreeHighlight = { selectedId: null, hoveredId: null, stageFilter: null, collapsedIds: new Set() };
const viewport = { width: 900, height: 600 };

const stages: Stage[] = [
  { type: "stage", id: "foundation", title: "Foundation", description: "", order: 1, start: 1930, created: "", updated: "" },
  { type: "stage", id: "modern", title: "Modern", description: "", order: 2, start: 2010, created: "", updated: "" },
];

function node(id: string, title: string, parent: string | null, stage: string | null, depth: number) {
  return { id, title, type: "concept" as const, stage, parent, x: 0, y: 0, depth };
}

describe("density management", () => {
  it("grows long branches for large subtrees", () => {
    const small = branchLength(2, 2, 1, 0);
    const large = branchLength(2, 20, 1, 0);
    expect(large).toBeCloseTo(110 + 22 * Math.sqrt(20), 5);
    expect(small).toBeCloseTo(110 + 22 * Math.sqrt(2), 5);
    expect(large).toBeGreaterThan(small + 20);
    expect(branchReach(2, 20, "same", 1)).toBeGreaterThan(branchReach(2, 2, "same", 1) + 20);
    expect(branchReach(2, 20, "same", 1)).toBe(branchReach(2, 20, "same", 1));
  });

  it("keeps non-suppressed labels from overlapping and prefers stages", () => {
    const layout: TreeLayout = {
      width: 400,
      height: 400,
      nodes: [
        node("root", "Root", null, null, 0),
        { ...node("stage", "Stage Title", "root", "foundation", 1), x: 100, y: 100 },
        { ...node("leaf-a", "Overlapping Leaf A", "stage", "foundation", 4), x: 100, y: 80 },
        { ...node("leaf-b", "Overlapping Leaf B", "stage", "foundation", 4), x: 100, y: 80 },
      ],
      edges: [
        { from: "root", to: "stage", kind: "timeline" },
        { from: "stage", to: "leaf-a", kind: "parent" },
        { from: "stage", to: "leaf-b", kind: "parent" },
      ],
    };
    const branches = resolveBranchGeometry(layout);
    const leaves = resolveLeafPlacement(layout, branches);
    const labels = resolveLabelPlacement(layout, branches, leaves, stages);
    expect(labels.some((label) => label.kind === "leaf")).toBe(true);
    const visible = labels.filter((label) => !label.suppressed);
    for (let index = 0; index < visible.length; index += 1) {
      for (const other of visible.slice(index + 1)) {
        const box = visible[index].box;
        const hit = box.right + DENSITY.labelGap > other.box.left && box.left - DENSITY.labelGap < other.box.right && box.bottom + DENSITY.labelGap > other.box.top && box.top - DENSITY.labelGap < other.box.bottom;
        expect(hit).toBe(false);
      }
    }
    const stageLabel = labels.find((label) => label.nodeId === "stage" && label.kind === "stage");
    expect(stageLabel?.suppressed).toBe(false);
    expect(stageLabel?.priority).toBeGreaterThan(labels.find((label) => label.kind === "leaf")?.priority ?? 0);
  });

  it("hides concept labels when far away and reveals them on hover without rebuilding geometry", () => {
    const layout: TreeLayout = {
      width: 400,
      height: 400,
      nodes: [
        node("subject", "Subject", null, null, 0),
        node("foundation", "Foundation", "subject", "foundation", 1),
        node("modern", "Modern", "subject", "modern", 1),
        node("logic", "Logic", "foundation", "foundation", 2),
        node("topic", "Topic", "logic", "foundation", 3),
        node("gate", "Gate", "topic", "foundation", 4),
      ],
      edges: [],
    };
    const scene = resolveSceneGraph(layout, stages)!;
    const before = sceneResolutionCount();
    const far = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.4 }, highlight, viewport });
    const medium = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.72 }, highlight, viewport });
    const near = projectTree({ scene, camera: { x: 0, y: 0, scale: 1.2 }, highlight, viewport });
    const hovered = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.4 }, highlight: { ...highlight, hoveredId: "gate" }, viewport });
    expect(sceneResolutionCount()).toBe(before);
    expect(far.scene).toBe(scene);
    expect(hovered.scene.labels).toBe(scene.labels);
    const shown = (projection: typeof far, id: string) => [...projection.visibleLabelIds].some((key) => key.startsWith(`${id}|`));
    expect(shown(far, "foundation")).toBe(true);
    expect(shown(far, "logic")).toBe(true);
    expect(shown(far, "gate")).toBe(false);
    expect(far.visibleNodeIds.has("gate")).toBe(false);
    expect(shown(medium, "topic")).toBe(true);
    expect(shown(medium, "gate")).toBe(false);
    expect(shown(near, "gate") || near.visibleNodeIds.has("gate")).toBe(true);
    expect(shown(hovered, "gate")).toBe(true);
  });

  it("caps direct children and separates sibling subtrees", () => {
    const nodes = [
      node("subject", "Subject", null, null, 0),
      node("foundation", "Foundation", "subject", "foundation", 1),
      node("modern", "Modern", "subject", "modern", 1),
    ];
    for (let index = 0; index < 8; index += 1) {
      const id = `child-${index}`;
      nodes.push(node(id, `Child ${index}`, "foundation", "foundation", 2));
      nodes.push(node(`${id}-a`, `Leaf ${index}a`, id, "foundation", 3));
      nodes.push(node(`${id}-b`, `Leaf ${index}b`, id, "foundation", 3));
    }
    const result = buildStageTreeLayout({ width: 1, height: 1, nodes, edges: [] }, stages)!;
    const parentEdges = result.edges.filter((edge) => edge.kind === "parent" && edge.from === "foundation");
    expect(parentEdges.length).toBe(DENSITY.visibleChildCap);
    expect(result.clusters?.[0]?.count).toBe(3);
    expect(result.groupedIds?.length).toBeGreaterThanOrEqual(3);
    const scene = resolveSceneGraph({ width: 1, height: 1, nodes, edges: [] }, stages)!;
    const shown = parentEdges.map((edge) => scene.nodes.find((item) => item.id === edge.to)!);
    for (let index = 0; index < shown.length; index += 1) {
      for (const other of shown.slice(index + 1)) {
        const gap = Math.hypot(shown[index].point.x - other.point.x, shown[index].point.y - other.point.y);
        expect(gap).toBeGreaterThanOrEqual(DENSITY.spacing.leaf);
      }
    }
    const descendants = (id: string): string[] => result.nodes.filter((item) => item.parent === id && !result.groupedIds?.includes(item.id)).map((item) => item.id);
    const boxOf = (id: string) => {
      const ids = [id, ...descendants(id).flatMap((child) => [child, ...descendants(child)])];
      const points = ids.map((item) => result.nodes.find((node) => node.id === item)!);
      return {
        minX: Math.min(...points.map((item) => item.x)),
        minY: Math.min(...points.map((item) => item.y)),
        maxX: Math.max(...points.map((item) => item.x)),
        maxY: Math.max(...points.map((item) => item.y)),
      };
    };
    const boxes = shown.map((item) => boxOf(item.id));
    for (let index = 0; index < boxes.length; index += 1) {
      for (const other of boxes.slice(index + 1)) {
        const separated = boxes[index].maxX + DENSITY.spacing.primary <= other.minX || other.maxX + DENSITY.spacing.primary <= boxes[index].minX || boxes[index].maxY + DENSITY.spacing.primary <= other.minY || other.maxY + DENSITY.spacing.primary <= boxes[index].minY;
        expect(separated).toBe(true);
      }
    }
    const hidden = projectTree({ scene, camera: { x: 0, y: 0, scale: 1.2 }, highlight, viewport });
    expect(hidden.visibleNodeIds.has("child-7")).toBe(false);
    const expanded = projectTree({ scene, camera: { x: 0, y: 0, scale: 1.2 }, highlight: { ...highlight, expandedIds: new Set(["foundation"]) }, viewport });
    expect(expanded.scene).toBe(scene);
    expect(expanded.visibleNodeIds.has("child-7")).toBe(true);
  });

  it("keeps the opening view on stage and domain labels, then one major topic", () => {
    const layout: TreeLayout = {
      width: 400,
      height: 400,
      nodes: [
        node("subject", "Subject", null, null, 0),
        node("foundation", "Foundation", "subject", "foundation", 1),
        node("modern", "Modern", "subject", "modern", 1),
        node("logic", "Logic", "foundation", "foundation", 2),
        node("small", "Small Topic", "logic", "foundation", 3),
        node("major", "Major Topic", "logic", "foundation", 3),
        node("detail-a", "Detail A", "major", "foundation", 4),
        node("detail-b", "Detail B", "major", "foundation", 4),
      ],
      edges: [],
    };
    const scene = resolveSceneGraph(layout, stages)!;
    const shown = (projection: ReturnType<typeof projectTree>, id: string) => [...projection.visibleLabelIds].some((key) => key.startsWith(`${id}|`));
    const far = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.4 }, highlight, viewport });
    const medium = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.72 }, highlight, viewport });
    const near = projectTree({ scene, camera: { x: 0, y: 0, scale: 1.2 }, highlight, viewport });
    const hovered = projectTree({ scene, camera: { x: 0, y: 0, scale: 0.72 }, highlight: { ...highlight, hoveredId: "small" }, viewport });
    expect(far.lod).toBe("overview");
    expect(shown(far, "logic")).toBe(true);
    expect(shown(far, "major")).toBe(true);
    expect(shown(far, "small")).toBe(false);
    expect(far.visibleNodeIds.has("major")).toBe(true);
    expect(far.visibleNodeIds.has("small")).toBe(false);
    expect(medium.lod).toBe("structure");
    expect(shown(medium, "major")).toBe(true);
    expect(shown(medium, "small")).toBe(true);
    expect(shown(near, "small")).toBe(true);
    expect(shown(hovered, "small")).toBe(true);
    expect(hovered.scene).toBe(scene);
  });

  it("fits a crowded tree below the topic threshold", () => {
    const points = Array.from({ length: 60 }, (_, index) => ({ x: (index % 10) * 180, y: Math.floor(index / 10) * 140 }));
    const camera = fitCameraToPoints(points, viewport, { minScale: DENSITY.opening.fitMinScale, maxScale: openingScaleCap(points.length) });
    expect(camera.scale).toBeLessThan(DENSITY.lod.far);
  });

  it("locks spacing, width and child-cap rules", () => {
    expect(stageSpacing(0)).toBe(120);
    expect(stageSpacing(25)).toBeCloseTo(90 + 16 * 5, 5);
    expect(branchLength(2, 9)).toBeCloseTo(110 + 22 * 3, 5);
    expect(branchLength(3, 4)).toBeCloseTo(60 + 14 * 2, 5);
    expect(branchLength(5, 1)).toBeCloseTo(28 + 8, 5);
    expect(trunkWidthAt(0)).toBe(16);
    expect(trunkWidthAt(0.5)).toBe(12);
    expect(trunkWidthAt(1)).toBe(8);
    expect(visibleChildLimit(7)).toBe(7);
    expect(visibleChildLimit(8)).toBe(DENSITY.visibleChildCap);
    const roomy = trunkStations([4, 25, 1]);
    const plain = trunkStations([1, 1, 1]);
    expect(roomy.model.rise).toBeGreaterThan(plain.model.rise);
    expect(roomy.model.rise).toBeGreaterThan(roomy.model.run * 2);
  });

});
