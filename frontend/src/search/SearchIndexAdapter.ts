import type { NodeRecord, Relation, SearchHit, Stage } from "../types";
import { ancestors, breadcrumb, inheritedStage } from "../interaction/NavigationController";
import { semanticRank, type SemanticRank } from "../lib/tree-density";
export type SearchResult = { id: string; title: string; role: string; semanticRole: SemanticRank; stage: string; path: string; reason?: string; score: number };
export function fuzzyScore(text: string, query: string): number {
  const source = text.toLocaleLowerCase(), target = query.trim().toLocaleLowerCase();
  if (!target) return 1;
  if (source === target) return 100;
  if (source.startsWith(target)) return 80;
  if (source.includes(target)) return 60;
  let position = 0;
  for (const char of source) if (char === target[position]) position += 1;
  return position === target.length ? 25 - Math.min(source.length - target.length, 20) : 0;
}
export function searchIndex(query: string, nodes: readonly NodeRecord[], stages: readonly Stage[], relations: readonly Relation[], remote: readonly SearchHit[], subject: { id: string; title: string }, recent: readonly string[]): SearchResult[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const stage = stages.find((item) => item.id === inheritedStage(node.id, nodes))?.title ?? "未分阶段";
    const path = breadcrumb(node.id, nodes, stages, subject).map((part) => part.title).join(" › ");
    const related = relations.filter((relation) => relation.from === node.id || relation.to === node.id).map((relation) => `${relation.type} ${relation.note ?? ""} ${byId.get(relation.from)?.title ?? ""} ${byId.get(relation.to)?.title ?? ""}`).join(" ");
    const match = remote.find((hit) => hit.node_id === node.id);
    const score = query.trim() ? Math.max(fuzzyScore(node.title, query), fuzzyScore(`${node.id} ${stage} ${(node.tags ?? []).join(" ")} ${related} ${path}`, query) * 0.65, match ? 45 : 0) : recent.includes(node.id) ? 50 - recent.indexOf(node.id) : 0;
    return { id: node.id, title: node.title, role: node.type, semanticRole: semanticRank(ancestors(node.id, nodes).length - 1, nodes.filter((other) => other.parent === node.id).length), stage, path, reason: match?.snippet, score };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 40);
}
