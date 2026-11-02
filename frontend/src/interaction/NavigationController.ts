import type { NodeRecord, Stage } from "../types";
export type NavigationRequest = { id: string; sequence: number; kind: "jump" | "focus" };
/** Optional sink for a future learning trail; no analytics or trail UI in this phase. */
export type LearningTrailSink = (visit: { subjectId: string; nodeId: string; visitedAt: string }) => void;
export function ancestors(id: string, nodes: readonly Pick<NodeRecord, "id" | "parent">[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) { seen.add(current.id); current = current.parent ? byId.get(current.parent) : undefined; }
  return [...seen].reverse();
}
export function focusNeighborhood(id: string | null, nodes: readonly Pick<NodeRecord, "id" | "parent">[], related: readonly { from: string; to: string }[] = []): Set<string> {
  if (!id) return new Set();
  const result = new Set(ancestors(id, nodes));
  const queue = [id];
  for (let i = 0; i < queue.length; i++) for (const node of nodes) if (node.parent === queue[i] && !result.has(node.id)) { result.add(node.id); queue.push(node.id); }
  for (const relation of related) if (relation.from === id || relation.to === id) { result.add(relation.from); result.add(relation.to); }
  return result;
}
export function inheritedStage(id: string | null | undefined, nodes: readonly NodeRecord[]): string | null {
  if (!id) return null;
  const path = ancestors(id, nodes).reverse();
  return path.map((key) => nodes.find((node) => node.id === key)?.stage).find(Boolean) ?? null;
}
export function breadcrumb(id: string, nodes: readonly NodeRecord[], stages: readonly Stage[], subject: { id: string; title: string }) {
  const chain = ancestors(id, nodes).map((key) => nodes.find((node) => node.id === key)!).filter(Boolean);
  const items: Array<{ id: string; title: string; kind: "subject" | "node" | "stage" }> = [{ id: `subject:${subject.id}`, title: subject.title, kind: "subject" }, ...chain.filter((node) => node.title !== subject.title).map((node) => ({ id: node.id, title: node.title, kind: "node" as const }))];
  const stageId = inheritedStage(id, nodes), stage = stages.find((item) => item.id === stageId);
  if (stage && !chain.some((node) => node.id === stage.id || node.title === stage.title)) items.splice(1, 0, { id: `stage:${stage.id}`, title: stage.title, kind: "stage" });
  return items;
}
