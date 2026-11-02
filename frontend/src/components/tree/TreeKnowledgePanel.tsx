import { useState } from "react";
import type { KnowledgeBinding } from "../../lib/illustrated-tree-layout";
import type { TreeSceneGraph } from "../../lib/tree-scene";
import { NODE_TYPES, labelOf, type NodeRecord } from "../../types";
import { nodeSurfaceEvents, type NodeInteraction } from "../../interaction/NodeSurface";

export function TreeKnowledgePanel({ scene, records, interaction, binding, selectedId, onSelect, onClose }: {
  scene: TreeSceneGraph; records?: readonly NodeRecord[]; interaction?: NodeInteraction; binding: KnowledgeBinding; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const recordIds = new Set(binding.recordIds);
  const items = (records?.length ? records : scene.nodes).filter((node) => recordIds.has(node.id) && node.title.toLowerCase().includes(query.toLowerCase()));
  return <aside className="tree-knowledge-panel" {...(interaction ? nodeSurfaceEvents({ ...interaction, onSelect: (id) => { interaction.onSelect(id); onClose(); }, onOpen: (id) => { interaction.onOpen(id); onClose(); } }) : {})} aria-label="分枝知识详情" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="tree-knowledge-heading"><div><small>逐层探索</small><strong>{binding.title}</strong></div><button type="button" onClick={onClose} aria-label="关闭知识列表">×</button></div>
    <p>{binding.recordIds.length} 项知识 · 选择条目查看完整正文与属性</p>
    <input aria-label="搜索分枝知识" placeholder="搜索这根分枝…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="tree-knowledge-list">{items.map((node) => <button type="button" data-node-id={node.id} key={node.id} title={`${node.title} · ${labelOf(NODE_TYPES, node.type)}`} className={selectedId === node.id ? "is-selected" : undefined} onClick={() => onSelect(node.id)}>
      <span data-node-title="true">{node.title}</span><small>{labelOf(NODE_TYPES, node.type)}</small>
    </button>)}{items.length === 0 && <p>暂无匹配知识</p>}</div>
  </aside>;
}
