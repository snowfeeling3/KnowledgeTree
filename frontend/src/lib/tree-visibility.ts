import type { CameraState, Viewport } from "./camera";
import type { BranchWoodRole, LabelPlacement } from "./organic-geometry";
import type { BranchGeometry, SceneNode, TreeSceneGraph } from "./tree-scene";
import { DENSITY, labelBudgetForLod, type SemanticRank } from "./tree-density";
import type { TreeHighlight } from "./tree-interaction";

export type { CameraState, Viewport };
export type Lod = "overview" | "structure" | "technology" | "detail";
export type EmphasisLayer = "focus" | "context" | "background";
export type BranchPaint = Readonly<{ layer: EmphasisLayer; opacity: number }>;
export type NodePaint = Readonly<{ layer: EmphasisLayer; opacity: number }>;

export function lodForScale(scale: number): Lod {
  if (scale < DENSITY.lod.far) return "overview";
  if (scale < DENSITY.lod.medium) return "structure";
  if (scale < DENSITY.lod.near) return "technology";
  return "detail";
}

export function labelKey(label: Pick<LabelPlacement, "nodeId" | "kind">): string {
  return `${label.nodeId}|${label.kind}`;
}

/** Same factor for every role, so zoom can ease stroke size without changing hierarchy. */
export function adaptedStrokeWidth(width: number, scale: number): number {
  const factor = Math.min(1.12, Math.max(0.88, scale ** -0.12));
  return width * factor;
}

/**
 * Visibility is a camera/interaction concern. It never mutates geometry.
 * Trunk and primary limbs stay mounted while zoomed; only collapsed subtrees are removed.
 */
export function resolveVisibleNodeIds(scene: TreeSceneGraph | null, collapsed: ReadonlySet<string>, camera: CameraState, viewport: Viewport, selectedId: string | null, lod: Lod = "detail", highlight?: TreeHighlight): ReadonlySet<string> {
  if (!scene) return new Set();
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const focus = focusNeighborhood(highlight?.hoveredId ?? null, highlight?.selectedId ?? selectedId, byId);
  for (const id of highlight?.focusIds ?? []) focus.add(id);
  const expanded = highlight?.expandedIds ?? new Set<string>();
  const majorTopics = majorTopicIds(scene);
  const pad = contextPad(viewport);
  const visible = scene.nodes.filter((node) => {
    if (hiddenByCollapse(node, byId, collapsed)) return false;
    if (node.grouped && !expanded.has(node.parent ?? "") && !focus.has(node.id)) return false;
    if (lod === "overview" && node.rank === "topic" && !majorTopics.has(node.id) && !focus.has(node.id)) return false;
    if (node.rank === "technology" && lod === "overview" && !focus.has(node.id)) return false;
    if (node.rank === "concept" && lod !== "detail" && !focus.has(node.id)) return false;
    const layer = pointLayer(node.point.x, node.point.y, camera, viewport);
    if (!nodeShown(node, lod, layer, focus.has(node.id))) return false;
    return node.depth <= 1 || focus.has(node.id) || hits(node.point.x, node.point.y, camera, viewport, pad);
  });
  return new Set(visible.map((node) => node.id));
}

export function resolveVisibleLabelIds(scene: TreeSceneGraph, lod: Lod, highlight: TreeHighlight, nodePaint: ReadonlyMap<string, NodePaint>, labels: readonly LabelPlacement[] = scene.labels): ReadonlySet<string> {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const focus = focusNeighborhood(highlight.hoveredId, highlight.selectedId, byId);
  for (const id of highlight.focusIds ?? []) focus.add(id);
  const direct = new Set([highlight.hoveredId, highlight.selectedId].filter((id): id is string => Boolean(id)));
  const majorTopics = majorTopicIds(scene);
  const candidates = labels.filter((label) => {
    const node = byId.get(label.nodeId);
    if (!node) return false;
    const expanded = highlight.expandedIds?.has(node.parent ?? "") ?? false;
    if (node.grouped && !expanded && !direct.has(label.nodeId)) return false;
    const focused = direct.has(label.nodeId);
    const layer = nodePaint.get(label.nodeId)?.layer;
    if (!labelRankVisible(label.rank, lod, focused || focus.has(label.nodeId) && label.rank !== "concept", layer)) return false;
    if (label.rank === "topic" && lod === "overview" && !focused && !majorTopics.has(label.nodeId)) return false;
    if (label.suppressed && !direct.has(label.nodeId)) return false;
    return true;
  }).sort((left, right) => {
    const leftDirect = direct.has(left.nodeId) ? 1 : 0;
    const rightDirect = direct.has(right.nodeId) ? 1 : 0;
    return rightDirect - leftDirect || right.priority - left.priority || left.nodeId.localeCompare(right.nodeId);
  });
  const budget = labelBudgetForLod(lod);
  const kept: LabelPlacement[] = [];
  let counted = 0;
  for (const label of candidates) {
    const directHit = direct.has(label.nodeId);
    if (!directHit && counted >= budget) continue;
    if (kept.some((other) => !boxesClear(label.box, other.box))) continue;
    kept.push(label);
    if (!directHit) counted += 1;
  }
  return new Set(kept.map((label) => labelKey(label)));
}

export function resolveVisibleBranchIds(scene: TreeSceneGraph, collapsed: ReadonlySet<string>, camera: CameraState, viewport: Viewport, lod: Lod, selectedId: string | null): ReadonlySet<string> {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const selectedChain = ancestorChain(selectedId, byId);
  const pad = contextPad(viewport);
  const ids = new Set<string>();
  for (const branch of scene.branches) {
    if (hiddenByCollapse(byId.get(branch.fromId), byId, collapsed) || hiddenByCollapse(byId.get(branch.toId), byId, collapsed)) continue;
    if (branch.role === "trunk" || branch.role === "primary") {
      ids.add(branch.id);
      continue;
    }
    if (selectedChain.has(branch.fromId) || selectedChain.has(branch.toId)) {
      ids.add(branch.id);
      continue;
    }
    if (branch.role === "relation" && lod !== "detail") continue;
    if (branch.role === "secondary" && lod === "overview" && !selectedChain.has(branch.toId) && !selectedChain.has(branch.fromId)) {
      if (branchHits(branch, camera, viewport, pad)) ids.add(branch.id);
      continue;
    }
    if (branch.role === "twig" && lod === "overview" && !selectedChain.has(branch.toId) && !selectedChain.has(branch.fromId)) continue;
    if (branch.role === "twig" && lod === "structure" && !selectedChain.has(branch.toId) && !selectedChain.has(branch.fromId)) {
      if (branchHits(branch, camera, viewport, pad)) ids.add(branch.id);
      continue;
    }
    if (branchHits(branch, camera, viewport, pad)) ids.add(branch.id);
  }
  return ids;
}

export function resolveEmphasis(
  scene: TreeSceneGraph,
  camera: CameraState,
  viewport: Viewport,
  visibleNodeIds: ReadonlySet<string>,
  visibleBranchIds: ReadonlySet<string>,
  lod: Lod = "detail",
  focusIds: ReadonlySet<string> = new Set(),
): { branchPaint: ReadonlyMap<string, BranchPaint>; nodePaint: ReadonlyMap<string, NodePaint> } {
  const branchPaint = new Map<string, BranchPaint>();
  for (const branch of scene.branches) {
    if (!visibleBranchIds.has(branch.id)) continue;
    const layer = focusIds.has(branch.fromId) || focusIds.has(branch.toId) ? "focus" : branchLayer(branch, camera, viewport);
    branchPaint.set(branch.id, Object.freeze({ layer, opacity: overviewOpacity(branch.role, branchOpacity(branch.role, layer), lod) }));
  }
  const nodePaint = new Map<string, NodePaint>();
  for (const node of scene.nodes) {
    if (!visibleNodeIds.has(node.id)) continue;
    const layer = focusIds.has(node.id) ? "focus" : pointLayer(node.point.x, node.point.y, camera, viewport);
    nodePaint.set(node.id, Object.freeze({ layer, opacity: nodeOpacity(node, layer) }));
  }
  return { branchPaint, nodePaint };
}


function nodeShown(node: SceneNode, lod: Lod, layer: EmphasisLayer, focused: boolean): boolean {
  if (focused) return true;
  if (node.rank === "topic") return true;
  return rankShown(node.rank, lod, layer, focused);
}

function overviewOpacity(role: BranchWoodRole, opacity: number, lod: Lod): number {
  if (lod !== "overview") return opacity;
  if (role === "secondary") return Math.min(opacity, 0.32);
  if (role === "twig") return Math.min(opacity, 0.2);
  return opacity;
}

function majorTopicIds(scene: TreeSceneGraph): ReadonlySet<string> {
  const children = new Map<string, SceneNode[]>();
  for (const node of scene.nodes) {
    if (!node.parent || node.grouped) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node);
    children.set(node.parent, list);
  }
  const weights = new Map<string, number>();
  const weight = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    const next = new Set(seen);
    next.add(id);
    if (weights.has(id)) return weights.get(id)!;
    const total = (children.get(id) ?? []).reduce((sum, child) => sum + 1 + weight(child.id, next), 0);
    weights.set(id, total);
    return total;
  };
  const chosen = new Set<string>();
  for (const node of scene.nodes) {
    if (node.rank !== "domain") continue;
    const topics = (children.get(node.id) ?? []).filter((child) => child.rank === "topic");
    if (topics.length === 0) continue;
    const best = [...topics].sort((left, right) => weight(right.id) - weight(left.id) || left.id.localeCompare(right.id))[0];
    chosen.add(best.id);
  }
  return chosen;
}

function labelRankVisible(rank: SemanticRank, lod: Lod, focused: boolean, layer?: EmphasisLayer): boolean {
  if (focused) return true;
  if (rank === "topic" && lod === "overview") return true;
  return rankShown(rank, lod, layer ?? "background", focused);
}

function rankShown(rank: SemanticRank, lod: Lod, _layer: EmphasisLayer, focused: boolean): boolean {
  if (focused) return true;
  if (rank === "root" || rank === "stage" || rank === "domain") return true;
  if (rank === "topic" || rank === "technology") return lod !== "overview";
  return lod === "detail";
}

function boxesClear(box: LabelPlacement["box"], other: LabelPlacement["box"]): boolean {
  const gap = DENSITY.spacing.label;
  return box.right + gap < other.left || box.left - gap > other.right || box.bottom + gap < other.top || box.top - gap > other.bottom;
}

function focusNeighborhood(hoveredId: string | null, selectedId: string | null, byId: ReadonlyMap<string, SceneNode>): Set<string> {
  const focus = new Set<string>();
  for (const id of [hoveredId, selectedId]) {
    if (!id) continue;
    const node = byId.get(id);
    if (!node) continue;
    focus.add(node.id);
    if (node.parent) {
      focus.add(node.parent);
      for (const other of byId.values()) if (other.parent === node.parent) focus.add(other.id);
    }
    for (const other of byId.values()) if (other.parent === node.id) focus.add(other.id);
  }
  return focus;
}

function branchLayer(branch: BranchGeometry, camera: CameraState, viewport: Viewport): EmphasisLayer {
  const midX = (branch.basePoint.x + branch.tipPoint.x) / 2;
  const midY = (branch.basePoint.y + branch.tipPoint.y) / 2;
  const layers = [
    pointLayer(branch.basePoint.x, branch.basePoint.y, camera, viewport),
    pointLayer(branch.tipPoint.x, branch.tipPoint.y, camera, viewport),
    pointLayer(midX, midY, camera, viewport),
  ];
  if (layers.includes("focus")) return "focus";
  if (layers.includes("context")) return "context";
  return "background";
}

function pointLayer(x: number, y: number, camera: CameraState, viewport: Viewport): EmphasisLayer {
  if (viewport.width === 0 || viewport.height === 0) return "focus";
  if (hits(x, y, camera, viewport, 64)) return "focus";
  if (hits(x, y, camera, viewport, Math.max(240, Math.min(viewport.width, viewport.height) * 0.55))) return "context";
  return "background";
}

function branchOpacity(role: BranchWoodRole, layer: EmphasisLayer): number {
  if (layer === "focus") return 1;
  if (layer === "context") {
    if (role === "trunk" || role === "primary") return 0.72;
    if (role === "secondary") return 0.62;
    return 0.55;
  }
  if (role === "trunk") return 0.28;
  if (role === "primary") return 0.24;
  if (role === "secondary") return 0.2;
  return 0.16;
}

function nodeOpacity(node: SceneNode, layer: EmphasisLayer): number {
  if (layer === "focus") return 1;
  if (layer === "context") return node.role === "root" || node.role === "stage" ? 0.7 : 0.58;
  return node.role === "root" || node.role === "stage" ? 0.3 : 0.18;
}

function contextPad(viewport: Viewport): number {
  if (viewport.width === 0 || viewport.height === 0) return Number.POSITIVE_INFINITY;
  return Math.max(320, Math.min(viewport.width, viewport.height) * 0.95);
}

function hits(x: number, y: number, camera: CameraState, viewport: Viewport, pad: number): boolean {
  if (!Number.isFinite(pad)) return true;
  const sx = x * camera.scale + camera.x;
  const sy = y * camera.scale + camera.y;
  return sx >= -pad && sx <= viewport.width + pad && sy >= -pad && sy <= viewport.height + pad;
}

function branchHits(branch: BranchGeometry, camera: CameraState, viewport: Viewport, pad: number): boolean {
  const midX = (branch.basePoint.x + branch.tipPoint.x) / 2;
  const midY = (branch.basePoint.y + branch.tipPoint.y) / 2;
  return hits(branch.basePoint.x, branch.basePoint.y, camera, viewport, pad)
    || hits(branch.tipPoint.x, branch.tipPoint.y, camera, viewport, pad)
    || hits(midX, midY, camera, viewport, pad);
}

function hiddenByCollapse(node: SceneNode | undefined, byId: ReadonlyMap<string, SceneNode>, collapsed: ReadonlySet<string>): boolean {
  if (!node) return true;
  let parent = node.parent ? byId.get(node.parent) : undefined;
  while (parent) {
    if (collapsed.has(parent.id)) return true;
    parent = parent.parent ? byId.get(parent.parent) : undefined;
  }
  return false;
}

function ancestorChain(id: string | null, byId: ReadonlyMap<string, SceneNode>): Set<string> {
  const chain = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current) {
    chain.add(current.id);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return chain;
}
