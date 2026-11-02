import type { LayoutEdge, LayoutNode, Stage, TreeLayout } from "../types";
import {
  attachmentTs,
  branchAngle,
  branchReach,
  childBranchPosture,
  compareGrowthNodes,
  cubicPoint,
  cubicTangent,
  growthCubic,
  positionOnTrunk,
  stagePosture,
  trunkCubic,
  type BranchPosture,
  type Cubic,
  type Point,
} from "./organic-geometry";
import { DENSITY, spacingForDepth, trunkStations, visibleChildLimit } from "./tree-density";
import type { GrowthCluster } from "../types";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Places a subject on an ascending trunk. Stage order follows history, but the
 * coordinate is a station along that trunk, never x = year.
 */
export function resolveTreeLayout(layout: TreeLayout | null, stages: readonly Stage[]): TreeLayout | null {
  if (!layout || stages.length < 2) return layout;
  const nodes = layout.nodes;
  const root = nodes.find((node) => !node.parent);
  if (!root) return layout;

  const orderedStages = [...stages].sort((left, right) => left.order - right.order || (left.start ?? Infinity) - (right.start ?? Infinity) || left.title.localeCompare(right.title, "zh"));
  const stageRoots = new Map<string, LayoutNode>();
  for (const node of nodes) {
    if (node.parent === root.id && node.stage && orderedStages.some((stage) => stage.id === node.stage)) stageRoots.set(node.stage, node);
  }
  if (stageRoots.size < 2) return layout;
  const stageRootIds = new Set([...stageRoots.values()].map((node) => node.id));
  const presentStages = orderedStages.filter((stage) => stageRoots.has(stage.id));

  const children = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    if (!node.parent) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node);
    children.set(node.parent, list);
  }
  for (const list of children.values()) list.sort(compareGrowthNodes);

  const descendantCount = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    return (children.get(id) ?? []).reduce((sum, child) => sum + 1 + descendantCount(child.id, nextSeen), 0);
  };
  const counts = presentStages.map((stage) => descendantCount(stageRoots.get(stage.id)!.id));
  const extra = presentStages.map(() => 0);

  let placedLayout = layout;
  for (let pass = 0; pass < 6; pass += 1) {
    placedLayout = placeOnTrunk(layout, root, presentStages, stageRoots, stageRootIds, children, descendantCount, counts, extra);
    const growth = stageGrowth(placedLayout, presentStages, stageRoots);
    if (growth.every((value) => value <= 0.5)) break;
    for (let index = 0; index < extra.length; index += 1) extra[index] += growth[index];
  }
  return placedLayout;
}

function placeOnTrunk(
  layout: TreeLayout,
  root: LayoutNode,
  presentStages: readonly Stage[],
  stageRoots: ReadonlyMap<string, LayoutNode>,
  stageRootIds: ReadonlySet<string>,
  children: ReadonlyMap<string, LayoutNode[]>,
  descendantCount: (id: string) => number,
  counts: readonly number[],
  extra: readonly number[],
): TreeLayout {
  const stations = trunkStations(counts, extra);
  const placed = new Map<string, LayoutNode>();
  const edges: LayoutEdge[] = [];
  const knownEdges = new Set<string>();
  const grouped = new Set<string>();
  const clusters: GrowthCluster[] = [];

  const addEdge = (from: string, to: string, kind: string, attach?: number) => {
    const key = `${from}|${to}|${kind}`;
    if (knownEdges.has(key)) return;
    knownEdges.add(key);
    edges.push({ from, to, kind, attach });
  };

  const subtreeBounds = (id: string): Bounds => {
    const queue = [id];
    const seen = new Set<string>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (seen.has(current) || grouped.has(current)) continue;
      seen.add(current);
      const node = placed.get(current);
      if (!node) continue;
      const labelPad = Math.min(84, Math.max(28, Array.from(node.title).length * 6));
      minX = Math.min(minX, node.x - labelPad);
      minY = Math.min(minY, node.y - 12);
      maxX = Math.max(maxX, node.x + labelPad);
      maxY = Math.max(maxY, node.y + 12);
      for (const child of children.get(current) ?? []) if (placed.has(child.id)) queue.push(child.id);
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  };

  const shiftSubtree = (id: string, dx: number, dy: number) => {
    const queue = [id];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (seen.has(current) || grouped.has(current)) continue;
      seen.add(current);
      const node = placed.get(current);
      if (!node) continue;
      placed.set(current, { ...node, x: node.x + dx, y: node.y + dy });
      for (const child of children.get(current) ?? []) if (placed.has(child.id)) queue.push(child.id);
    }
  };

  const placeChildren = (parent: LayoutNode, curve: Cubic, depth: number, posture: BranchPosture) => {
    const nested = (children.get(parent.id) ?? []).filter((node) => !stageRootIds.has(node.id));
    const limit = visibleChildLimit(nested.length);
    const shown = nested.slice(0, limit);
    const overflow = nested.slice(limit);
    const length = curveLength(curve);
    const zone = depth <= 1 ? Math.min(length * 0.46, Math.max(150, shown.length * 42)) : length;
    const start = depth <= 1 ? Math.max(0.12, 1 - zone / Math.max(length, 1)) : 0.24;
    const end = depth <= 1 ? 0.9 : 0.84;
    const times = attachmentTs(shown.map((node) => node.id), start, end);
    const occupied: Bounds[] = [];
    const pads = separationPads(depth + 1);
    shown.forEach((node, index) => {
      const origin = cubicPoint(curve, times[index] ?? 0.7);
      const tangent = cubicTangent(curve, times[index] ?? 0.7);
      const angle = branchAngle(tangent, index, shown.length, node.id, posture);
      const reach = branchReach(depth + 1, descendantCount(node.id), node.id, posture.crown);
      const boost = depth <= 1 ? 1 + Math.max(0, posture.spread - 0.5) * 0.9 : 1;
      const tip = { x: origin.x + Math.cos(angle) * reach * boost, y: origin.y + Math.sin(angle) * reach };
      placed.set(node.id, { ...node, x: tip.x, y: tip.y, depth: depth + 1 });
      addEdge(parent.id, node.id, "parent", times[index]);
      placeChildren(placed.get(node.id)!, growthCubic(origin, tangent, tip), depth + 1, childBranchPosture(posture, depth + 1));
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const box = subtreeBounds(node.id);
        const hit = occupied.find((other) => boundsHit(box, other, pads.x, pads.y));
        if (!hit) break;
        const shift = separationShift(box, hit, pads.x, pads.y, angle);
        shiftSubtree(node.id, shift.x, shift.y);
      }
      occupied.push(subtreeBounds(node.id));
    });
    if (overflow.length === 0) return;
    const anchorX = parent.x + 56;
    const anchorY = parent.y - 36;
    clusters.push({ parentId: parent.id, count: overflow.length, x: anchorX, y: anchorY });
    let cursor = 0;
    const stack = (node: LayoutNode, nodeDepth: number) => {
      grouped.add(node.id);
      placed.set(node.id, { ...node, x: anchorX + 28, y: anchorY - cursor * DENSITY.spacing.leaf, depth: nodeDepth });
      cursor += 1;
      for (const child of children.get(node.id) ?? []) stack(child, nodeDepth + 1);
    };
    for (const node of overflow) stack(node, depth + 1);
  };

  const rootPoint = positionOnTrunk(0, stations.model);
  placed.set(root.id, { ...root, x: rootPoint.x, y: rootPoint.y, depth: 0 });
  let previousId = root.id;
  let previousProgress = 0;
  presentStages.forEach((stage, index) => {
    const stageRoot = stageRoots.get(stage.id)!;
    const progress = stations.progress[index] ?? 0.5;
    const at = positionOnTrunk(progress, stations.model);
    const placedStage: LayoutNode = { ...stageRoot, x: at.x, y: at.y, depth: 1 };
    placed.set(stageRoot.id, placedStage);
    addEdge(previousId, stageRoot.id, "timeline");
    placeChildren(placedStage, trunkCubic(previousProgress, progress, stations.model), 1, stagePosture(progress, stage.id));
    previousId = stageRoot.id;
    previousProgress = progress;
  });

  for (const node of layout.nodes) if (!placed.has(node.id)) placed.set(node.id, node);
  for (const edge of layout.edges) {
    if (edge.kind === "parent" && stageRootIds.has(edge.to)) continue;
    if (grouped.has(edge.to)) continue;
    if (placed.has(edge.from) && placed.has(edge.to)) addEdge(edge.from, edge.to, edge.kind);
  }

  const output = [...placed.values()];
  const visible = output.filter((node) => !grouped.has(node.id));
  const span = visible.length > 0 ? visible : output;
  const minX = Math.min(...span.map((node) => node.x));
  const maxX = Math.max(...span.map((node) => node.x));
  const minY = Math.min(...span.map((node) => node.y));
  const maxY = Math.max(...span.map((node) => node.y));
  return {
    nodes: output,
    edges,
    width: maxX - minX + 220,
    height: maxY - minY + 220,
    groupedIds: [...grouped],
    clusters,
    trunk: stations.model,
  };
}

function stageGrowth(layout: TreeLayout, stages: readonly Stage[], stageRoots: ReadonlyMap<string, LayoutNode>): number[] {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const grouped = new Set(layout.groupedIds ?? []);
  const children = new Map<string, string[]>();
  for (const node of layout.nodes) {
    if (!node.parent || grouped.has(node.id)) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node.id);
    children.set(node.parent, list);
  }
  const boundsOf = (id: string): Bounds => {
    const queue = [id];
    const seen = new Set<string>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const node = byId.get(current);
      if (!node || grouped.has(current)) continue;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
      for (const child of children.get(current) ?? []) queue.push(child);
    }
    return { minX, minY, maxX, maxY };
  };
  const growth = stages.map(() => 0);
  let previous: Bounds | null = null;
  stages.forEach((stage, index) => {
    const id = stageRoots.get(stage.id)?.id;
    if (!id) return;
    const box = boundsOf(id);
    if (previous && boundsHit(previous, box, DENSITY.collision.x, DENSITY.collision.y)) {
      const overlapY = Math.min(previous.maxY, box.maxY) - Math.max(previous.minY, box.minY);
      growth[index] += Math.max(DENSITY.collision.y, overlapY + DENSITY.collision.y + 12);
    }
    previous = box;
  });
  return growth;
}

function separationPads(depth: number): { x: number; y: number } {
  const gap = spacingForDepth(depth);
  return {
    x: Math.max(DENSITY.collision.x, gap),
    y: Math.max(DENSITY.collision.y, gap),
  };
}

function curveLength(curve: Cubic): number {
  let length = 0;
  let previous = cubicPoint(curve, 0);
  for (let step = 1; step <= 10; step += 1) {
    const next = cubicPoint(curve, step / 10);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

function boundsHit(box: Bounds, other: Bounds, padX: number, padY: number): boolean {
  return box.minX < other.maxX + padX && box.maxX + padX > other.minX && box.minY < other.maxY + padY && box.maxY + padY > other.minY;
}

function separationShift(box: Bounds, other: Bounds, padX: number, padY: number, angle: number): Point {
  const overlapX = Math.min(box.maxX, other.maxX + padX) - Math.max(box.minX, other.minX - padX);
  const overlapY = Math.min(box.maxY, other.maxY + padY) - Math.max(box.minY, other.minY - padY);
  const along = Math.max(36, Math.min(padY, Math.max(overlapX, overlapY, padY * 0.5)));
  return {
    x: Math.cos(angle) * along,
    y: Math.sin(angle) * along,
  };
}

export const buildStageTreeLayout = resolveTreeLayout;
export const TreeLayoutResolver = resolveTreeLayout;
