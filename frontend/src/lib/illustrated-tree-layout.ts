import type { LayoutNode, Stage, TreeLayout } from "../types";
import { botanicalSkeletonLayout, type BotanicalSkeleton } from "./botanical-skeleton";
import { cubicPoint, type Point } from "./organic-geometry";
import type { SemanticRank } from "./tree-density";
import type { SceneNode, TreeSceneGraph } from "./tree-scene";

export type TreeLayoutMode = "illustrated" | "legacy" | "mindmap";
export type KnowledgeBinding = Readonly<{
  id: string;
  anchorId: string;
  nodeId: string | null;
  title: string;
  rank: SemanticRank;
  point: Point;
  side: number;
  stageIds: readonly string[];
  recordIds: readonly string[];
}>;
export type Illustration = Readonly<{
  skeleton: BotanicalSkeleton;
  bindings: readonly KnowledgeBinding[];
  nodeToAnchor: ReadonlyMap<string, string>;
}>;

const TECH_TYPES = new Set(["technology", "software", "hardware", "algorithm", "protocol", "standard"]);
const compareId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Mapping changes occupancy of bounded art slots, never creates recursive branches. */
export function illustratedTreeLayout(layout: TreeLayout | null, stages: readonly Stage[], subjectTitle?: string): TreeSceneGraph | null {
  if (!layout || !layout.nodes.length) return null;
  const records = [...layout.nodes].sort(compareId);
  const byId = new Map(records.map((node) => [node.id, node]));
  const root = records.filter((node) => !node.parent || !byId.has(node.parent)).sort((a, b) => a.depth - b.depth || compareId(a, b))[0] ?? records[0];
  const children = new Map<string, LayoutNode[]>();
  for (const node of records) {
    if (!node.parent) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node);
    children.set(node.parent, list);
  }
  const descendants = (id: string): LayoutNode[] => {
    const result: LayoutNode[] = [];
    const seen = new Set([id]);
    const queue = [...(children.get(id) ?? [])];
    for (let i = 0; i < queue.length; i += 1) {
      const node = queue[i];
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      result.push(node);
      queue.push(...(children.get(node.id) ?? []));
    }
    return result;
  };
  const descendantCache = new Map<string, LayoutNode[]>();
  const subtree = (id: string): LayoutNode[] => {
    if (!descendantCache.has(id)) descendantCache.set(id, descendants(id));
    return descendantCache.get(id)!;
  };
  const orderedStages = [...stages].sort((a, b) => a.order - b.order || compareId(a, b));
  const effectiveStage = new Map<string, string | null>();
  for (const node of records) {
    const seen = new Set<string>();
    let current: LayoutNode | undefined = node;
    while (current && !current.stage && !seen.has(current.id)) {
      seen.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    effectiveStage.set(node.id, current?.stage ?? null);
  }
  type StageGroup = { title: string; stageIds: string[]; roots: LayoutNode[]; members: LayoutNode[] };
  const groups: StageGroup[] = orderedStages.map((stage) => {
    const members = records.filter((node) => node.id !== root.id && effectiveStage.get(node.id) === stage.id);
    const roots = members.filter((node) => node.parent === root.id || !node.parent || effectiveStage.get(node.parent) !== stage.id);
    return { title: stage.title, stageIds: [stage.id], roots, members };
  });
  const assigned = new Set(groups.flatMap((group) => group.members.map((node) => node.id)));
  const unassigned = records.filter((node) => node.id !== root.id && !assigned.has(node.id));
  if (unassigned.length) groups.push({ title: stages.length ? "其他知识" : "知识领域", stageIds: [],
    roots: unassigned.filter((node) => !node.parent || node.parent === root.id || assigned.has(node.parent)), members: unassigned });
  // Consecutive stages keep their order in grouped limbs, never become timeline coordinates.
  const groupedStages = partition(groups, 5).map((part) => ({
    title: part.length === 1 ? part[0].title : `${part[0].title} · +${part.length - 1} 阶段`,
    stageIds: part.flatMap((group) => group.stageIds), roots: part.flatMap((group) => group.roots), members: part.flatMap((group) => group.members),
  }));
  // Reserve the largest chamber for the largest subtree. Stage chronology lives
  // in the lists/timeline rather than imposing a vertical time axis on the tree.
  const chamberOrder = [2, 1, 3, 0, 4];
  const limbGroups: Array<(typeof groupedStages)[number] | undefined> = Array(5).fill(undefined);
  [...groupedStages].sort((a, b) => b.members.length - a.members.length || groups.findIndex((group) => group.stageIds[0] === a.stageIds[0]) - groups.findIndex((group) => group.stageIds[0] === b.stageIds[0]))
    .forEach((group, index) => { limbGroups[chamberOrder[index]] = group; });
  const skeleton = botanicalSkeletonLayout(limbGroups.map((group) => group?.members.length ?? 0));
  const slots = new Map(skeleton.slots.map((slot) => [slot.id, slot]));
  const bindings: KnowledgeBinding[] = [];
  const stageIdsFor = (members: readonly LayoutNode[]) => [...new Set(members.map((node) => effectiveStage.get(node.id)).filter((id): id is string => Boolean(id)))];
  const nodeToAnchor = new Map<string, string>(records.map((node) => [node.id, "subject"]));
  const add = (id: string, anchorId: string, title: string, rank: SemanticRank, members: LayoutNode[], nodeId: string | null, stageIds: readonly string[], point?: Point) => {
    const slot = slots.get(anchorId);
    const binding = Object.freeze({ id, anchorId, title, rank, nodeId, stageIds: Object.freeze([...stageIds]),
      point: point ?? slot?.point ?? skeleton.root, side: slot?.side ?? 0, recordIds: Object.freeze([...new Set(members.map((node) => node.id))]) });
    bindings.push(binding);
    members.forEach((node) => nodeToAnchor.set(node.id, anchorId));
    if (nodeId) nodeToAnchor.set(nodeId, anchorId);
  };
  add("subject", "subject", subjectTitle || root.title, "root", records, root.id, []);
  limbGroups.forEach((group, index) => {
    if (!group) return;
    const limbId = `limb-${index}`;
    const stageRoots = new Set(group.roots.filter((node) => node.depth === 1 && node.stage).map((node) => node.id));
    add(limbId, limbId, group.title, "stage", group.members, group.roots.find((node) => stageRoots.has(node.id))?.id ?? null, group.stageIds);
    const domains = group.roots.flatMap((node) => stageRoots.has(node.id) ? children.get(node.id) ?? [] : [node]);
    const uniqueDomains = [...new Map(domains.filter((node) => group.members.some((member) => member.id === node.id)).map((node) => [node.id, node])).values()];
    const weight = (node: LayoutNode) => subtree(node.id).length;
    uniqueDomains.sort((a, b) => weight(b) - weight(a) || compareId(a, b));
    // Four representative domains; overflow belongs to the last collection.
    const domainGroups = cappedGroups(uniqueDomains, 4);
    domainGroups.forEach((domainGroup, branchIndex) => {
      const branchId = `${limbId}-b${branchIndex}`;
      const domain = domainGroup[0];
      const members = [...new Map(domainGroup.flatMap((node) => [node, ...subtree(node.id)]).map((node) => [node.id, node])).values()];
      add(branchId, branchId, domain.title + (domainGroup.length > 1 ? ` · +${domainGroup.length - 1}` : ""), "domain", members, domain.id, stageIdsFor(members));
      const topic = (children.get(domain.id) ?? []).find((node) => !TECH_TYPES.has(node.type) && (children.get(node.id)?.length ?? 0) > 0);
      if (topic) add(`${branchId}-topic`, branchId, topic.title, "topic", [topic, ...subtree(topic.id)], topic.id, stageIdsFor([topic, ...subtree(topic.id)]), cubicPoint(slots.get(branchId)!.curve, 0.42));
      const technologies = members.filter((node) => node.id !== domain.id && (TECH_TYPES.has(node.type) || node.depth >= 4 && (children.get(node.id)?.length ?? 0) > 0));
      technologies.sort((a, b) => weight(b) - weight(a) || compareId(a, b));
      cappedGroups(technologies, 3).forEach((part, twigIndex) => {
        const twigId = `${branchId}-t${twigIndex}`;
        const technologyMembers = [...new Map(part.flatMap((node) => [node, ...subtree(node.id)]).map((node) => [node.id, node])).values()];
        add(twigId, twigId, part[0].title + (part.length > 1 ? ` · +${part.length - 1}` : ""), "technology",
          technologyMembers, part[0].id, stageIdsFor(technologyMembers));
      });
    });
  });
  const visibleIds = new Set(bindings.map((binding) => binding.nodeId).filter(Boolean));
  const nodes: SceneNode[] = records.map((record) => {
    const anchorId = nodeToAnchor.get(record.id)!;
    const binding = bindings.find((item) => item.nodeId === record.id);
    const point = binding?.point ?? slots.get(anchorId)?.point ?? skeleton.root;
    return Object.freeze({ ...record, stage: effectiveStage.get(record.id), point, direction: Object.freeze({ x: slots.get(anchorId)?.side ?? 0, y: -1 }),
      role: record.id === root.id ? "root" : binding?.rank === "stage" ? "stage" : "branch",
      rank: binding?.rank ?? "concept", grouped: !visibleIds.has(record.id) });
  });
  const revision = `illustrated-${hash(JSON.stringify({ nodes: records.map(({ id, title, type, stage, parent, depth }) => ({ id, title, type, stage, parent, depth })), stages: orderedStages, subjectTitle }))}`;
  return Object.freeze({ revision, mode: "illustrated", nodes: Object.freeze(nodes), branches: skeleton.branches, leaves: [], labels: [], clusters: [],
    groupedIds: Object.freeze(nodes.filter((node) => node.grouped).map((node) => node.id)), bounds: skeleton.bounds,
    illustration: Object.freeze({ skeleton, bindings: Object.freeze(bindings), nodeToAnchor }) });
}

function partition<T>(items: readonly T[], cap: number): T[][] {
  const count = Math.min(cap, items.length);
  return Array.from({ length: count }, (_, index) => items.slice(Math.floor(index * items.length / count), Math.floor((index + 1) * items.length / count)));
}
function cappedGroups<T>(items: readonly T[], cap: number): T[][] {
  if (items.length <= cap) return items.map((item) => [item]);
  return [...items.slice(0, cap - 1).map((item) => [item]), items.slice(cap - 1)];
}
function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
}
