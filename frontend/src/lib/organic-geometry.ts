import type { LayoutEdge, LayoutNode, Stage, TreeLayout } from "../types";
import { branchLength, DENSITY, LABEL_PRIORITY, semanticRank, trunkWidthAt, type SemanticRank, type TrunkModel } from "./tree-density";

export type Point = Readonly<{ x: number; y: number }>;
export type Vector = Readonly<{ x: number; y: number }>;
export type SceneNodeRole = "root" | "stage" | "branch" | "leaf";
export type LabelKind = "root" | "stage" | "stage-years" | "branch" | "leaf";
export type LabelBox = Readonly<{ left: number; right: number; top: number; bottom: number }>;

export type LabelPlacement = Readonly<{
  nodeId: string;
  kind: LabelKind;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  rank: SemanticRank;
  priority: number;
  suppressed: boolean;
  box: LabelBox;
}>;

/** A resolved branch in world coordinates. Renderer code must not infer these values. */
export type BranchWoodRole = "trunk" | "primary" | "secondary" | "twig" | "relation";

export type BranchGeometry = Readonly<{
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  path: string;
  basePoint: Point;
  tipPoint: Point;
  baseTangent: Vector;
  tipTangent: Vector;
  depth: number;
  widthBase: number;
  widthTip: number;
  role: BranchWoodRole;
  bodyPath: string;
}>;

/** A leaf is attached to the exact tip point and tangent of its parent branch. */
export type LeafPlacement = Readonly<{
  nodeId: string;
  branchId: string;
  anchor: Point;
  direction: Vector;
  stemEnd: Point;
  stemPath: string;
  bodyPath: string;
}>;

const EAST: Vector = Object.freeze({ x: 1, y: 0 });

export function classifySceneRole(node: LayoutNode, childCount: number): SceneNodeRole {
  if (node.depth === 0) return "root";
  if (node.depth === 1 && Boolean(node.stage)) return "stage";
  if (childCount > 0) return "branch";
  return "leaf";
}

/** Deterministic branch centerlines, widths, endpoints and tangents. Camera is not an input. */
export function resolveBranchGeometry(layout: TreeLayout): readonly BranchGeometry[] {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const timeline = layout.edges.filter((edge) => edge.kind === "timeline" && byId.has(edge.from) && byId.has(edge.to));
  const relations = layout.edges.filter((edge) => edge.kind === "relation" && byId.has(edge.from) && byId.has(edge.to));
  const parents = layout.edges.filter((edge) => edge.kind !== "timeline" && edge.kind !== "relation" && byId.has(edge.from) && byId.has(edge.to));
  const incoming = new Map<string, Cubic>();
  const branches: BranchGeometry[] = [];
  const trunk = layout.trunk ?? DEFAULT_TRUNK;
  const orderedTimeline = orderTrunk(timeline);
  orderedTimeline.forEach((edge, index) => {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const cubic = timelineCubic(from, to, trunk);
    incoming.set(to.id, cubic);
    branches.push(cubicBranch(edge, from, cubic, timelineWidths(from, to, index, orderedTimeline.length, trunk), "trunk"));
  });
  for (const edge of relations) {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const cubic = growthCubic(point(from.x, from.y), upwardChord(from, to), point(to.x, to.y));
    branches.push(cubicBranch(edge, from, cubic, ROLE_WIDTH.relation, "relation"));
  }
  const childrenOf = new Map<string, LayoutEdge[]>();
  for (const edge of parents) {
    const list = childrenOf.get(edge.from) ?? [];
    list.push(edge);
    childrenOf.set(edge.from, list);
  }
  for (const list of childrenOf.values()) list.sort((left, right) => compareGrowthNodes(byId.get(left.to)!, byId.get(right.to)!));
  const childIds = new Set(parents.map((edge) => edge.to));
  const seen = new Set<string>();
  const visit = (parentId: string) => {
    if (seen.has(parentId)) return;
    seen.add(parentId);
    const list = childrenOf.get(parentId) ?? [];
    if (list.length === 0) return;
    const parent = byId.get(parentId);
    if (!parent) return;
    const curve = incoming.get(parentId) ?? stubCurve(parent);
    const times = attachmentTs(list.map((edge) => edge.to));
    list.forEach((edge, index) => {
      const child = byId.get(edge.to)!;
      const time = typeof edge.attach === "number" ? edge.attach : times[index];
      const origin = cubicPoint(curve, time);
      const tangent = cubicTangent(curve, time);
      const cubic = growthCubic(origin, tangent, point(child.x, child.y));
      const role = branchWoodRole(edge.kind, parent.depth);
      incoming.set(child.id, cubic);
      branches.push(cubicBranch(edge, parent, cubic, ROLE_WIDTH[role], role));
      visit(child.id);
    });
  };
  const starts = [...childrenOf.keys()].filter((id) => !childIds.has(id)).sort((left, right) => left.localeCompare(right));
  for (const id of starts) visit(id);
  for (const id of [...childrenOf.keys()].sort((left, right) => left.localeCompare(right))) visit(id);
  return Object.freeze(branches);
}

export const BranchGeometryResolver = resolveBranchGeometry;

/**
 * Leaf anchor and direction are the parent branch tip, not a second angle estimate.
 * Nodes without a resolved parent branch do not grow an independent stem.
 */
export function resolveLeafPlacement(layout: TreeLayout, branches: readonly BranchGeometry[]): readonly LeafPlacement[] {
  const childCount = countChildren(layout.nodes);
  const leaves: LeafPlacement[] = [];
  for (const node of layout.nodes) {
    if (classifySceneRole(node, childCount.get(node.id) ?? 0) !== "leaf") continue;
    const branch = parentBranch(branches, node.id);
    if (!branch) continue;
    const anchor = branch.tipPoint;
    const direction = branch.tipTangent;
    const stemLength = DENSITY.leaf.stemLength;
    const stemEnd = point(anchor.x + direction.x * stemLength, anchor.y + direction.y * stemLength);
    leaves.push(Object.freeze({
      nodeId: node.id,
      branchId: branch.id,
      anchor,
      direction,
      stemEnd,
      stemPath: `M ${anchor.x} ${anchor.y} L ${stemEnd.x} ${stemEnd.y}`,
      bodyPath: leafPath(stemEnd, direction),
    }));
  }
  return Object.freeze(leaves);
}

export const LeafPlacementResolver = resolveLeafPlacement;

/** Label coordinates are resolved once from world geometry. Zoom only changes visibility later. */
export function resolveLabelPlacement(
  layout: TreeLayout,
  branches: readonly BranchGeometry[],
  leaves: readonly LeafPlacement[],
  stages: readonly Stage[] = [],
): readonly LabelPlacement[] {
  const grouped = new Set(layout.groupedIds ?? []);
  const childCount = countChildren(layout.nodes);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const leafById = new Map(leaves.map((leaf) => [leaf.nodeId, leaf]));
  const candidates: LabelCandidate[] = [];
  for (const node of layout.nodes) {
    const children = childCount.get(node.id) ?? 0;
    const role = classifySceneRole(node, children);
    const rank = semanticRank(node.depth, children);
    if (role === "root") {
      candidates.push(candidate(node.id, "root", "root", shortTitle(node.title), node.x, node.y + 46, "middle", 0, 1));
    } else if (role === "stage") {
      const trunk = branches.find((branch) => branch.kind === "timeline" && branch.toId === node.id);
      const tangentX = trunk?.tipTangent.x ?? 0.25;
      const tangentY = trunk?.tipTangent.y ?? -1;
      const normalX = -tangentY;
      const normalY = tangentX;
      const anchor = normalX < 0 ? "end" : "start";
      candidates.push(candidate(node.id, "stage", "stage", shortTitle(node.title), node.x + normalX * 28, node.y + normalY * 28 - 6, anchor, normalX, normalY));
      candidates.push(candidate(node.id, "stage-years", "stage", yearRange(node.stage ? stageById.get(node.stage) : undefined), node.x + normalX * 28, node.y + normalY * 28 + 11, anchor, normalX, normalY));
    } else if (role === "leaf" && rank !== "concept") {
      const incoming = parentBranch(branches, node.id);
      const side = (incoming?.tipTangent.x ?? EAST.x) < 0 ? -1 : 1;
      candidates.push(candidate(node.id, "branch", rank, shortTitle(node.title), node.x + side * 13, node.y - 9, side < 0 ? "end" : "start", side, 0));
    } else if (role === "branch") {
      const incoming = parentBranch(branches, node.id);
      const side = (incoming?.tipTangent.x ?? EAST.x) < 0 ? -1 : 1;
      candidates.push(candidate(node.id, "branch", rank, shortTitle(node.title), node.x + side * 13, node.y - 9, side < 0 ? "end" : "start", side, 0));
    } else if (role === "leaf") {
      const leaf = leafById.get(node.id);
      if (leaf) {
        const normalX = -leaf.direction.y;
        const normalY = leaf.direction.x;
        const anchor: LabelPlacement["anchor"] = leaf.direction.x < -0.22 ? "end" : leaf.direction.x > 0.22 ? "start" : "middle";
        candidates.push(candidate(node.id, "leaf", "concept", shortTitle(node.title), leaf.stemEnd.x + leaf.direction.x * 22, leaf.stemEnd.y + leaf.direction.y * 22 + 4, anchor, normalX, normalY));
      } else if (grouped.has(node.id)) {
        candidates.push(candidate(node.id, "leaf", "concept", shortTitle(node.title), node.x + 16, node.y - 12, "start", 1, 0));
      }
    }
  }
  const visibleLabels = candidates.filter((item) => !grouped.has(item.nodeId));
  const groupedLabels = candidates.filter((item) => grouped.has(item.nodeId));
  visibleLabels.sort((left, right) => right.priority - left.priority || left.nodeId.localeCompare(right.nodeId) || left.kind.localeCompare(right.kind));
  groupedLabels.sort((left, right) => right.priority - left.priority || left.nodeId.localeCompare(right.nodeId) || left.kind.localeCompare(right.kind));
  const placed: LabelPlacement[] = [];
  const occupied: LabelBox[] = [];
  for (const item of [...visibleLabels, ...groupedLabels]) {
    let stored: LabelPlacement | null = null;
    const alongSteps = [0, 36, -36, 78, -78, 124, -124, 176, -176];
    const acrossSteps = [0, -28, 28, -56, 56];
    for (const along of alongSteps) {
      if (stored) break;
      for (const across of acrossSteps) {
        const x = item.x + item.normalX * along - item.normalY * across;
        const y = item.y + item.normalY * along + item.normalX * across;
        const box = labelBox(item, x, y);
        if (occupied.every((other) => separated(box, other, DENSITY.labelGap))) {
          stored = freezeLabel(item, x, y, box, false);
          occupied.push(box);
          break;
        }
      }
    }
    if (!stored) stored = freezeLabel(item, item.x, item.y, labelBox(item, item.x, item.y), true);
    placed.push(stored);
  }
  return Object.freeze(placed);
}
export const LabelPlacementResolver = resolveLabelPlacement;

export function edgeKey(edge: Pick<LayoutEdge, "from" | "to" | "kind">): string {
  return `${edge.from}|${edge.to}|${edge.kind}`;
}

export function parentBranch(branches: readonly BranchGeometry[], nodeId: string): BranchGeometry | undefined {
  return branches.find((branch) => branch.kind === "parent" && branch.toId === nodeId);
}

const DEFAULT_TRUNK: TrunkModel = Object.freeze({
  baseX: 380,
  baseY: 1080,
  rise: 820,
  run: 220,
  bow: 36,
});

export function trunkLength(model: TrunkModel = DEFAULT_TRUNK): number {
  return model.rise;
}

const ROLE_WIDTH: Record<BranchWoodRole, { base: number; tip: number }> = {
  trunk: { base: DENSITY.width.trunkBase, tip: DENSITY.width.trunkTip },
  primary: { base: DENSITY.width.primary, tip: DENSITY.width.primary },
  secondary: { base: DENSITY.width.secondary, tip: DENSITY.width.secondary },
  twig: { base: DENSITY.width.twig, tip: DENSITY.width.twig },
  relation: { base: DENSITY.width.relation, tip: DENSITY.width.relation },
};

export type Cubic = Readonly<{ p0: Point; p1: Point; p2: Point; p3: Point }>;

/** Historical progress in [0, 1] becomes a point on the ascending trunk, never an x = year mapping. */
export function positionOnTrunk(progress: number, model: TrunkModel = DEFAULT_TRUNK): Point {
  return trunkPose(progress, model).point;
}

export function trunkPose(progress: number, model: TrunkModel = DEFAULT_TRUNK): { point: Point; tangent: Vector } {
  const time = Math.min(1, Math.max(0, progress));
  const pointOnCurve = point(
    model.baseX + time * model.run + Math.sin(time * Math.PI) * model.bow,
    model.baseY - time * model.rise,
  );
  const slopeX = model.run + Math.cos(time * Math.PI) * model.bow * Math.PI;
  return { point: pointOnCurve, tangent: normalize(slopeX, -model.rise) };
}

export function trunkCubic(start: number, end: number, model: TrunkModel = DEFAULT_TRUNK): Cubic {
  const from = trunkPose(start, model);
  const to = trunkPose(end, model);
  const distance = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y) || 1;
  const handle = Math.max(20, distance * 0.34);
  return {
    p0: from.point,
    p1: point(from.point.x + from.tangent.x * handle, from.point.y + from.tangent.y * handle),
    p2: point(to.point.x - to.tangent.x * handle, to.point.y - to.tangent.y * handle),
    p3: to.point,
  };
}

export function compareGrowthNodes(left: LayoutNode, right: LayoutNode): number {
  return left.title.localeCompare(right.title, "zh") || left.id.localeCompare(right.id);
}

export type BranchPosture = Readonly<{
  spread: number;
  lift: number;
  crown: number;
  lean: number;
}>;

/** Upper-middle stages open the crown; the leader stays shorter and more upright. */
/** Middle of the trunk opens the crown; the base and leader stay narrower and more upright. */
export function stagePosture(progress: number, stageId: string): BranchPosture {
  const high = Math.min(1, Math.max(0, progress));
  const bell = Math.sin(Math.PI * high);
  return {
    spread: 0.28 + bell * 0.72,
    lift: 0.55 + high * 0.12,
    crown: 1,
    lean: (hashUnit(`${stageId}:canopy`) - 0.5) * 0.22,
  };
}

export function childBranchPosture(parent: BranchPosture, nextDepth: number): BranchPosture {
  const tighten = nextDepth <= 2 ? 0.9 : nextDepth === 3 ? 0.74 : 0.62;
  return {
    spread: parent.spread * tighten,
    lift: Math.min(0.78, parent.lift + 0.06),
    crown: 1,
    lean: parent.lean * 0.4,
  };
}

/** Sibling origins stay apart along the parent curve, inside an optional window. */
export function attachmentTs(ids: readonly string[], start = 0.22, end = 0.86): number[] {
  const count = ids.length;
  if (count === 0) return [];
  const span = Math.max(0.04, end - start);
  const step = count <= 1 ? 0 : span / (count - 1);
  const times = ids.map((id, index) => {
    const jitter = (hashUnit(id + ":attach") - 0.5) * Math.min(0.012, step * 0.25);
    return Math.min(end, Math.max(start, start + step * index + jitter));
  });
  const minDelta = Math.min(0.04, span / Math.max(count, 1));
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1] + minDelta) times[index] = Math.min(end, times[index - 1] + minDelta);
  }
  return times;
}

/** Leave along the parent, then open sideways and upward. Siblings do not share one angle. */
export function branchAngle(parentTangent: Vector, index: number, count: number, id: string, posture?: BranchPosture): number {
  const envelope = Math.min(1, Math.max(0, posture?.spread ?? 0.6));
  const lift = posture?.lift ?? 0.55;
  const lean = posture?.lean ?? 0;
  const parent = Math.atan2(parentTangent.y, parentTangent.x);
  const upward = -Math.PI / 2;
  const slot = index - (count - 1) / 2;
  const gap = count <= 1 ? 0 : 0.46 + envelope * 0.22;
  const jitter = (hashUnit(id + ":lean") - 0.5) * 0.04;
  const center = parent * (1 - lift) + upward * lift + lean;
  return clampUpward(center + slot * gap + jitter);
}

export function clampUpward(angle: number): number {
  const limit = 0.3;
  if (angle > -limit) return -limit;
  if (angle < -Math.PI + limit) return -Math.PI + limit;
  return angle;
}

export function branchReach(depth: number, descendantCount: number, _id = "", _crown = 1): number {
  return branchLength(depth, descendantCount, 1, 0);
}

export function growthCubic(origin: Point, originTangent: Vector, tip: Point): Cubic {
  const distance = Math.hypot(tip.x - origin.x, tip.y - origin.y) || 1;
  const chord = normalize(tip.x - origin.x, tip.y - origin.y);
  const leave = normalize(originTangent.x * 0.55 + chord.x * 0.45, originTangent.y * 0.55 + chord.y * 0.45);
  const arrive = normalize(chord.x * 0.75, Math.min(-0.12, chord.y * 0.8 - 0.08));
  const handle = Math.min(distance * 0.34, Math.max(16, distance * 0.28));
  return {
    p0: origin,
    p1: point(origin.x + leave.x * handle, origin.y + leave.y * handle),
    p2: point(tip.x - arrive.x * handle * 0.84, tip.y - arrive.y * handle * 0.84),
    p3: tip,
  };
}
export function cubicPoint(curve: Cubic, time: number): Point {
  const inverse = 1 - time;
  return point(
    inverse * inverse * inverse * curve.p0.x + 3 * inverse * inverse * time * curve.p1.x + 3 * inverse * time * time * curve.p2.x + time * time * time * curve.p3.x,
    inverse * inverse * inverse * curve.p0.y + 3 * inverse * inverse * time * curve.p1.y + 3 * inverse * time * time * curve.p2.y + time * time * time * curve.p3.y,
  );
}

export function cubicTangent(curve: Cubic, time: number): Vector {
  const inverse = 1 - time;
  return normalize(
    3 * inverse * inverse * (curve.p1.x - curve.p0.x) + 6 * inverse * time * (curve.p2.x - curve.p1.x) + 3 * time * time * (curve.p3.x - curve.p2.x),
    3 * inverse * inverse * (curve.p1.y - curve.p0.y) + 6 * inverse * time * (curve.p2.y - curve.p1.y) + 3 * time * time * (curve.p3.y - curve.p2.y),
  );
}

export function branchWoodRole(kind: string, fromDepth: number): BranchWoodRole {
  if (kind === "timeline") return "trunk";
  if (kind === "relation") return "relation";
  if (fromDepth <= 1) return "primary";
  if (fromDepth === 2) return "secondary";
  return "twig";
}

function trunkProgressAt(at: Point, model: TrunkModel): number | null {
  const progress = (model.baseY - at.y) / model.rise;
  if (progress < -0.02 || progress > 1.02) return null;
  const pose = trunkPose(Math.min(1, Math.max(0, progress)), model);
  if (Math.hypot(pose.point.x - at.x, pose.point.y - at.y) > 2.5) return null;
  return Math.min(1, Math.max(0, progress));
}

function timelineCubic(from: LayoutNode, to: LayoutNode, model: TrunkModel): Cubic {
  const start = trunkProgressAt(point(from.x, from.y), model);
  const end = trunkProgressAt(point(to.x, to.y), model);
  if (start != null && end != null && end > start + 0.001) return trunkCubic(start, end, model);
  return growthCubic(point(from.x, from.y), upwardChord(from, to), point(to.x, to.y));
}

function timelineWidths(from: LayoutNode, to: LayoutNode, index: number, count: number, model: TrunkModel): { base: number; tip: number } {
  const start = trunkProgressAt(point(from.x, from.y), model);
  const end = trunkProgressAt(point(to.x, to.y), model);
  const fromProgress = start ?? index / Math.max(count, 1);
  const toProgress = end ?? (index + 1) / Math.max(count, 1);
  return { base: trunkWidthAt(fromProgress), tip: trunkWidthAt(toProgress) };
}

function upwardChord(from: LayoutNode, to: LayoutNode): Vector {
  return normalize((to.x - from.x) * 0.45, (to.y - from.y) * 0.55 - Math.abs(to.x - from.x) * 0.35);
}

function stubCurve(node: LayoutNode): Cubic {
  return growthCubic(point(node.x, node.y + 48), normalize(0, -1), point(node.x, node.y));
}

function orderTrunk(edges: readonly LayoutEdge[]): LayoutEdge[] {
  const byFrom = new Map(edges.map((edge) => [edge.from, edge]));
  const targets = new Set(edges.map((edge) => edge.to));
  const ordered: LayoutEdge[] = [];
  const used = new Set<string>();
  const starts = [...new Set(edges.filter((edge) => !targets.has(edge.from)).map((edge) => edge.from))].sort((left, right) => left.localeCompare(right));
  for (const start of starts) {
    let cursor = byFrom.get(start);
    while (cursor && !used.has(`${cursor.from}|${cursor.to}`)) {
      used.add(`${cursor.from}|${cursor.to}`);
      ordered.push(cursor);
      cursor = byFrom.get(cursor.to);
    }
  }
  for (const edge of edges) if (!ordered.includes(edge)) ordered.push(edge);
  return ordered;
}

function cubicBranch(edge: LayoutEdge, from: LayoutNode, curve: Cubic, widths: { base: number; tip: number }, role: BranchWoodRole): BranchGeometry {
  return Object.freeze({
    id: edgeKey(edge),
    fromId: from.id,
    toId: edge.to,
    kind: edge.kind,
    role,
    path: `M ${curve.p0.x} ${curve.p0.y} C ${curve.p1.x} ${curve.p1.y}, ${curve.p2.x} ${curve.p2.y}, ${curve.p3.x} ${curve.p3.y}`,
    bodyPath: role === "relation" ? "" : taperedBody(curve, widths.base, widths.tip),
    basePoint: curve.p0,
    tipPoint: curve.p3,
    baseTangent: cubicTangent(curve, 0),
    tipTangent: cubicTangent(curve, 1),
    depth: from.depth,
    widthBase: widths.base,
    widthTip: widths.tip,
  });
}

export function taperedBody(curve: Cubic, widthBase: number, widthTip: number): string {
  const left: Point[] = [];
  const right: Point[] = [];
  const steps = 10;
  for (let step = 0; step <= steps; step += 1) {
    const time = step / steps;
    const at = cubicPoint(curve, time);
    const tangent = cubicTangent(curve, time);
    const width = (widthBase + (widthTip - widthBase) * time) / 2;
    left.push(point(at.x - tangent.y * width, at.y + tangent.x * width));
    right.push(point(at.x + tangent.y * width, at.y - tangent.x * width));
  }
  const commands = [`M ${left[0].x} ${left[0].y}`];
  for (const at of left.slice(1)) commands.push(`L ${at.x} ${at.y}`);
  for (const at of right.reverse()) commands.push(`L ${at.x} ${at.y}`);
  commands.push("Z");
  return commands.join(" ");
}

type LabelCandidate = Readonly<{
  nodeId: string;
  kind: LabelKind;
  rank: SemanticRank;
  priority: number;
  text: string;
  x: number;
  y: number;
  anchor: LabelPlacement["anchor"];
  normalX: number;
  normalY: number;
  width: number;
}>;

function candidate(nodeId: string, kind: LabelKind, rank: SemanticRank, text: string, x: number, y: number, anchor: LabelPlacement["anchor"], normalX: number, normalY: number): LabelCandidate {
  const priority = kind === "stage-years" ? LABEL_PRIORITY.stage - 4 : LABEL_PRIORITY[rank];
  return { nodeId, kind, rank, priority, text, x, y, anchor, normalX, normalY, width: Math.max(42, Array.from(text).length * 11) };
}

function labelBox(item: LabelCandidate, x: number, y: number): LabelBox {
  const left = item.anchor === "start" ? x : item.anchor === "end" ? x - item.width : x - item.width / 2;
  return { left, right: left + item.width, top: y - 14, bottom: y + 6 };
}

function separated(box: LabelBox, other: LabelBox, gap: number): boolean {
  return box.right + gap < other.left || box.left - gap > other.right || box.bottom + gap < other.top || box.top - gap > other.bottom;
}

function freezeLabel(item: LabelCandidate, x: number, y: number, box: LabelBox, suppressed: boolean): LabelPlacement {
  return Object.freeze({
    nodeId: item.nodeId,
    kind: item.kind,
    text: item.text,
    x,
    y,
    anchor: item.anchor,
    rank: item.rank,
    priority: item.priority,
    suppressed,
    box: Object.freeze(box),
  });
}

function countChildren(nodes: readonly LayoutNode[]): Map<string, number> {
  const childCount = new Map<string, number>();
  for (const node of nodes) if (node.parent) childCount.set(node.parent, (childCount.get(node.parent) ?? 0) + 1);
  return childCount;
}

function point(x: number, y: number): Point {
  return Object.freeze({ x, y });
}

function normalize(x: number, y: number): Vector {
  const length = Math.hypot(x, y) || 1;
  return Object.freeze({ x: x / length, y: y / length });
}

function leafPath(anchor: Point, direction: Vector): string {
  const normal = { x: -direction.y, y: direction.x };
  const at = (forward: number, sideways = 0) => point(
    anchor.x + direction.x * forward + normal.x * sideways,
    anchor.y + direction.y * forward + normal.y * sideways,
  );
  const leftControl = at(12, -12);
  const tip = at(35, 0);
  const rightControl = at(13, 11);
  return `M ${anchor.x} ${anchor.y} C ${leftControl.x} ${leftControl.y}, ${tip.x} ${tip.y}, ${tip.x} ${tip.y} C ${tip.x} ${tip.y}, ${rightControl.x} ${rightControl.y}, ${anchor.x} ${anchor.y} Z`;
}

function hashUnit(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function shortTitle(title: string): string {
  const chars = Array.from(title);
  return chars.length > 18 ? `${chars.slice(0, 17).join("")}…` : title;
}

function yearRange(stage: Stage | undefined): string {
  if (!stage?.start) return "年代待补充";
  return stage.end ? `${stage.start}–${stage.end}` : `${stage.start}–至今`;
}
