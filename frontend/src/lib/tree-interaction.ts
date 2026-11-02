import type { CameraState, Viewport } from "./camera";
import type { TreeSceneGraph } from "./tree-scene";
import { lodForScale, resolveEmphasis, resolveVisibleBranchIds, resolveVisibleLabelIds, resolveVisibleNodeIds, type BranchPaint, type Lod, type NodePaint } from "./tree-visibility";
import type { LabelPlacement } from "./organic-geometry";
import { measureLabel } from "./illustrated-tree-projection";
import type { NodeType } from "../types";

export type TreeHighlight = Readonly<{
  selectedId: string | null;
  hoveredId: string | null;
  focusedId?: string | null;
  focusIds?: ReadonlySet<string>;
  stageFilter: string | null;
  collapsedIds: ReadonlySet<string>;
  expandedIds?: ReadonlySet<string>;
}>;

export type TreeProjection = Readonly<{
  titles?: ReadonlyMap<string, string>;
  nodeTypes?: ReadonlyMap<string, NodeType>;
  labelPlacements?: readonly LabelPlacement[];
  scene: TreeSceneGraph;
  camera: CameraState;
  highlight: TreeHighlight;
  lod: Lod;
  visibleNodeIds: ReadonlySet<string>;
  visibleBranchIds: ReadonlySet<string>;
  branchPaint: ReadonlyMap<string, BranchPaint>;
  nodePaint: ReadonlyMap<string, NodePaint>;
  visibleLabelIds: ReadonlySet<string>;
}>;

export function withHover(highlight: TreeHighlight, hoveredId: string | null): TreeHighlight {
  if (highlight.hoveredId === hoveredId) return highlight;
  return { ...highlight, hoveredId };
}

export function withSelection(highlight: TreeHighlight, selectedId: string | null): TreeHighlight {
  if (highlight.selectedId === selectedId) return highlight;
  return { ...highlight, selectedId };
}

export function isDimmed(stage: string | null | undefined, highlight: TreeHighlight): boolean {
  return Boolean(highlight.stageFilter && stage && stage !== highlight.stageFilter);
}

/**
 * Projects an already resolved scene. The returned scene is the same object:
 * pan, zoom, hover and selection cannot rebuild layout or geometry.
 */
export function projectTree(input: {
  scene: TreeSceneGraph;
  camera: CameraState;
  highlight: TreeHighlight;
  viewport: Viewport;
  titles?: ReadonlyMap<string, string>;
  nodeTypes?: ReadonlyMap<string, NodeType>;
}): TreeProjection {
  const lod = lodForScale(input.camera.scale);
  const visibleNodeIds = resolveVisibleNodeIds(input.scene, input.highlight.collapsedIds, input.camera, input.viewport, input.highlight.selectedId, lod, input.highlight);
  const visibleBranchIds = resolveVisibleBranchIds(input.scene, input.highlight.collapsedIds, input.camera, input.viewport, lod, input.highlight.selectedId);
  const byId = new Map(input.scene.nodes.map((node) => [node.id, node]));
  const focusIds = new Set<string>(input.highlight.focusIds);
  for (const id of [input.highlight.hoveredId, input.highlight.selectedId]) {
    let current = id ? byId.get(id) : undefined;
    while (current) {
      focusIds.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
  }
  const emphasis = resolveEmphasis(input.scene, input.camera, input.viewport, visibleNodeIds, visibleBranchIds, lod, focusIds);
  const labelPlacements = input.scene.labels.map((label) => {
    const title = input.titles?.get(label.nodeId);
    if (!title || label.kind === "stage-years" || title === byId.get(label.nodeId)?.title) return label;
    const chars = Array.from(title), text = chars.length > 18 ? chars.slice(0, 17).join("") + "…" : title;
    const width = measureLabel(text, label.kind === "leaf" ? 11 : 12) + 8;
    const left = label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - width : label.x - width / 2;
    return { ...label, text, box: { ...label.box, left, right: left + width } };
  });
  const visibleLabelIds = resolveVisibleLabelIds(input.scene, lod, input.highlight, emphasis.nodePaint, labelPlacements);
  return Object.freeze({
    labelPlacements,
    titles: input.titles,
    nodeTypes: input.nodeTypes,
    scene: input.scene,
    camera: input.camera,
    highlight: input.highlight,
    lod,
    visibleNodeIds,
    visibleBranchIds,
    branchPaint: emphasis.branchPaint,
    nodePaint: emphasis.nodePaint,
    visibleLabelIds,
  });
}

