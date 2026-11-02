import type { NodeRecord } from "../types";

export type ExplorerItem = {
  id: string;
  title: string;
  type: string;
  children: ExplorerItem[];
};

export function buildForest(nodes: NodeRecord[]): ExplorerItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of nodes) {
    const parentId = node.parent ?? undefined;
    if (!parentId || !byId.has(parentId) || parentId === node.id || createsCycle(node.id, parentId, byId)) {
      roots.push(node.id);
      continue;
    }
    const list = children.get(parentId) ?? [];
    list.push(node.id);
    children.set(parentId, list);
  }

  const byTitle = (left: string, right: string) => byId.get(left)!.title.localeCompare(byId.get(right)!.title, "zh");
  roots.sort(byTitle);
  for (const list of children.values()) list.sort(byTitle);

  const visit = (id: string, stack: Set<string>): ExplorerItem => {
    const node = byId.get(id)!;
    if (stack.has(id)) return { id, title: node.title, type: node.type, children: [] };
    stack.add(id);
    const nested = (children.get(id) ?? []).map((child) => visit(child, stack));
    stack.delete(id);
    return { id, title: node.title, type: node.type, children: nested };
  };

  return roots.map((id) => visit(id, new Set()));
}

function createsCycle(id: string, parentId: string, byId: Map<string, NodeRecord>): boolean {
  const seen = new Set<string>([id]);
  let cursor = parentId;
  for (let guard = 0; guard <= byId.size; guard += 1) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const record = byId.get(cursor);
    const nextId = record?.parent;
    if (!nextId || !byId.has(nextId)) return false;
    cursor = nextId;
  }
  return true;
}

export function parentChoices(nodes: NodeRecord[], nodeId: string): NodeRecord[] {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = node.parent;
    if (!parentId || parentId === node.id) continue;
    const list = children.get(parentId) ?? [];
    list.push(node.id);
    children.set(parentId, list);
  }

  const blocked = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    for (const child of children.get(current) ?? []) {
      if (blocked.has(child)) continue;
      blocked.add(child);
      stack.push(child);
    }
  }

  return nodes
    .filter((node) => !blocked.has(node.id))
    .sort((left, right) => left.title.localeCompare(right.title, "zh"));
}
