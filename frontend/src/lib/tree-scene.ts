import type { GrowthCluster, LayoutNode, Stage, TreeLayout } from "../types";
import { resolveTreeLayout as TreeLayoutResolver } from "./stage-tree";
import { semanticRank, type SemanticRank } from "./tree-density";
import type { Illustration } from "./illustrated-tree-layout";
import {
  classifySceneRole,
  parentBranch,
  resolveBranchGeometry as BranchGeometryResolver,
  resolveLabelPlacement as LabelPlacementResolver,
  resolveLeafPlacement as LeafPlacementResolver,
  type BranchGeometry,
  type BranchWoodRole,
  type LabelPlacement,
  type LeafPlacement,
  type Point,
  type SceneNodeRole,
  type Vector,
} from "./organic-geometry";

export type { BranchGeometry, BranchWoodRole, LabelPlacement, LeafPlacement, Point, SceneNodeRole, Vector };
export { BranchGeometryResolver, LabelPlacementResolver, LeafPlacementResolver, TreeLayoutResolver };

export type SceneNode = Readonly<{
  id: string;
  title: string;
  type: LayoutNode["type"];
  stage?: string | null;
  parent?: string | null;
  depth: number;
  point: Point;
  role: SceneNodeRole;
  direction: Vector;
  rank: SemanticRank;
  grouped: boolean;
  glyphPath?: string;
  collapsePoint?: Point;
}>;

export type SceneCluster = Readonly<{ parentId: string; count: number; point: Point }>;

export type SceneBounds = Readonly<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;

/**
 * Immutable render model. Camera, hover and selection are not inputs and cannot
 * change branch, leaf or label coordinates.
 */
export type TreeSceneGraph = Readonly<{
  mode?: "illustrated" | "legacy" | "mindmap";
  illustration?: Illustration;
  revision: string;
  nodes: readonly SceneNode[];
  branches: readonly BranchGeometry[];
  leaves: readonly LeafPlacement[];
  labels: readonly LabelPlacement[];
  clusters: readonly SceneCluster[];
  groupedIds: readonly string[];
  bounds: SceneBounds;
}>;

export type SceneGraph = TreeSceneGraph;

const EAST: Vector = Object.freeze({ x: 1, y: 0 });
let resolutions = 0;

export function sceneResolutionCount(): number {
  return resolutions;
}

export function resolveSceneGraph(layout: TreeLayout | null, stages: readonly Stage[] = []): TreeSceneGraph | null {
  resolutions += 1;
  const resolved = TreeLayoutResolver(layout, stages);
  if (!resolved) return null;
  const branches = BranchGeometryResolver(resolved);
  const leaves = LeafPlacementResolver(resolved, branches);
  const labels = LabelPlacementResolver(resolved, branches, leaves, stages);
  const groupedIds = Object.freeze([...(resolved.groupedIds ?? [])]);
  const grouped = new Set(groupedIds);
  const childCount = new Map<string, number>();
  for (const node of resolved.nodes) if (node.parent && !grouped.has(node.id)) childCount.set(node.parent, (childCount.get(node.parent) ?? 0) + 1);
  const nodes = Object.freeze(resolved.nodes.map((node) => makeSceneNode(node, childCount.get(node.id) ?? 0, parentBranch(branches, node.id), grouped.has(node.id))));
  const clusters = Object.freeze((resolved.clusters ?? []).map((cluster) => freezeCluster(cluster)));
  const bounds = resolveBounds(nodes, branches, leaves, labels, grouped);
  const revision = `scene-${hash(scenePayload(branches, leaves, labels, clusters))}`;
  return Object.freeze({ revision, nodes, branches, leaves, labels, clusters, groupedIds, bounds });
}

function makeSceneNode(node: LayoutNode, childCount: number, incoming: BranchGeometry | undefined, grouped: boolean): SceneNode {
  const role = classifySceneRole(node, childCount);
  const point = incoming && !grouped ? incoming.tipPoint : freezePoint(node.x, node.y);
  const direction = incoming?.tipTangent ?? EAST;
  const side = direction.x < 0 ? -1 : 1;
  return Object.freeze({
    id: node.id,
    title: node.title,
    type: node.type,
    stage: node.stage,
    parent: node.parent,
    depth: node.depth,
    point,
    role,
    rank: semanticRank(node.depth, childCount),
    grouped,
    direction,
    glyphPath: role === "stage" ? stageGlyph(point) : role === "branch" ? branchGlyph(point) : undefined,
    collapsePoint: role === "branch" ? freezePoint(point.x + side * 13, point.y + 12) : undefined,
  });
}

function resolveBounds(nodes: readonly SceneNode[], branches: readonly BranchGeometry[], leaves: readonly LeafPlacement[], labels: readonly LabelPlacement[], grouped: ReadonlySet<string>): SceneBounds {
  const points: Point[] = [];
  for (const node of nodes) if (!node.grouped) points.push(node.point);
  for (const branch of branches) if (!grouped.has(branch.toId)) points.push(branch.basePoint, branch.tipPoint);
  for (const leaf of leaves) if (!grouped.has(leaf.nodeId)) points.push(leaf.anchor, leaf.stemEnd);
  for (const item of labels) if (!grouped.has(item.nodeId) && !item.suppressed) points.push({ x: item.x, y: item.y });
  if (points.length === 0) return Object.freeze({ left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 });
  const left = Math.min(...points.map((item) => item.x)) - 28;
  const right = Math.max(...points.map((item) => item.x)) + 190;
  const top = Math.min(...points.map((item) => item.y)) - 50;
  const bottom = Math.max(...points.map((item) => item.y)) + 60;
  return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top });
}

function scenePayload(branches: readonly BranchGeometry[], leaves: readonly LeafPlacement[], labels: readonly LabelPlacement[], clusters: readonly SceneCluster[]): string {
  const branchText = branches.map((branch) => [branch.id, branch.role, branch.path, branch.bodyPath, branch.basePoint.x, branch.basePoint.y, branch.tipPoint.x, branch.tipPoint.y, branch.baseTangent.x, branch.baseTangent.y, branch.tipTangent.x, branch.tipTangent.y, branch.depth, branch.widthBase, branch.widthTip].join(",")).join(";");
  const leafText = leaves.map((leaf) => [leaf.nodeId, leaf.branchId, leaf.anchor.x, leaf.anchor.y, leaf.direction.x, leaf.direction.y, leaf.stemPath, leaf.bodyPath].join(",")).join(";");
  const labelText = labels.map((item) => [item.nodeId, item.kind, item.rank, item.x, item.y, item.anchor, item.text, item.suppressed ? 1 : 0].join(",")).join(";");
  const clusterText = clusters.map((cluster) => [cluster.parentId, cluster.count, cluster.point.x, cluster.point.y].join(",")).join(";");
  return `${branchText}#${leafText}#${labelText}#${clusterText}`;
}

function freezeCluster(cluster: GrowthCluster): SceneCluster {
  return Object.freeze({ parentId: cluster.parentId, count: cluster.count, point: freezePoint(cluster.x, cluster.y) });
}

function stageGlyph(point: Point): string {
  return `M ${point.x - 10} ${point.y + 8} C ${point.x - 7} ${point.y - 11}, ${point.x + 7} ${point.y - 11}, ${point.x + 10} ${point.y + 8} C ${point.x + 3} ${point.y + 4}, ${point.x - 3} ${point.y + 4}, ${point.x - 10} ${point.y + 8} Z`;
}

function branchGlyph(point: Point): string {
  return `M ${point.x - 7} ${point.y + 7} Q ${point.x} ${point.y - 11} ${point.x + 7} ${point.y + 7} Q ${point.x} ${point.y + 3} ${point.x - 7} ${point.y + 7} Z`;
}

function freezePoint(x: number, y: number): Point {
  return Object.freeze({ x, y });
}

function hash(value: string): string {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
