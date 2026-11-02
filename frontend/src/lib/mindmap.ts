import { hierarchy, tree } from "d3-hierarchy";
import type { LayoutNode, TreeLayout } from "../types";
import type { SceneNode, TreeSceneGraph } from "./tree-scene";

type Entry = { node: LayoutNode; children: Entry[] };
export const MAP_NODE_WIDTH = 196;
export const MAP_NODE_HEIGHT = 58;

/** D3 tidy tree with horizontal depth; never mutates persisted coordinates. */
export function mindmapScene(layout: TreeLayout | null, collapsed: ReadonlySet<string> = new Set()): TreeSceneGraph | null {
  if (!layout) return null;
  if (!layout.nodes.length) return { mode: "mindmap", revision: "mindmap-empty", nodes: [], branches: [], leaves: [], labels: [], clusters: [], groupedIds: [], bounds: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 } };
  const byId = new Map(layout.nodes.map(node => [node.id, node]));
  const root = layout.nodes.find(node => !node.parent || !byId.has(node.parent)) ?? layout.nodes[0];
  const children = new Map<string, LayoutNode[]>();
  for (const node of layout.nodes) if (node.id !== root.id && node.parent && byId.has(node.parent)) {
    const list = children.get(node.parent) ?? []; list.push(node); children.set(node.parent, list);
  }
  const seen = new Set<string>();
  const visit = (node: LayoutNode): Entry => {
    seen.add(node.id);
    return { node, children: (children.get(node.id) ?? []).filter(child => !seen.has(child.id)).map(visit) };
  };
  const entry = visit(root);
  // Orphans/cyclic components remain discoverable rather than disappearing.
  for (const node of layout.nodes) if (!seen.has(node.id)) entry.children.push(visit(node));
  const h = hierarchy(entry, item => collapsed.has(item.node.id) ? [] : item.children);
  const placed = tree<Entry>().nodeSize([82, 270]).separation((a, b) => a.parent === b.parent ? 1 : 1.3)(h);
  const nodes: SceneNode[] = placed.descendants().map(item => ({
    id: item.data.node.id, title: item.data.node.title, type: item.data.node.type, stage: item.data.node.stage,
    parent: item.parent?.data.node.id ?? null, depth: item.depth, point: { x: item.y, y: item.x },
    role: item.depth === 0 ? "root" : item.children?.length ? "branch" : "leaf",
    rank: item.depth === 0 ? "root" : item.depth === 1 ? "stage" : "topic", direction: { x: 1, y: 0 }, grouped: false,
    collapsePoint: (children.get(item.data.node.id)?.length ?? 0) > 0 ? { x: item.y + 110, y: item.x } : undefined,
  }));
  const left = -130, right = Math.max(...nodes.map(node => node.point.x)) + 150;
  const top = Math.min(...nodes.map(node => node.point.y)) - 70, bottom = Math.max(...nodes.map(node => node.point.y)) + 70;
  return { mode: "mindmap", revision: `mindmap-${JSON.stringify(nodes.map(node => [node.id, node.title, node.point]))}`, nodes, branches: [], leaves: [], labels: [], clusters: [], groupedIds: [], bounds: { left, top, right, bottom, width: right - left, height: bottom - top } };
}
