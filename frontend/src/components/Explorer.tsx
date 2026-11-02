import { useMemo } from "react";
import { buildForest } from "../lib/forest";
import type { ExplorerItem } from "../lib/forest";
import { yearLabel } from "../lib/timeline";
import type { NodeRecord, Stage } from "../types";
import { nodeSurfaceEvents, type NodeInteraction } from "../interaction/NodeSurface";

type Props = {
  stages: Stage[];
  nodes: NodeRecord[];
  selectedId: string | null;
  stageFilter: string | null;
  onFilterStage: (id: string | null) => void;
  onSelect: (id: string) => void;
  interaction?: NodeInteraction;
  collapsed?: ReadonlySet<string>;
  onToggleCollapsed?: (id: string) => void;
};

export function Explorer({ stages, nodes, selectedId, stageFilter, onFilterStage, onSelect, interaction, collapsed, onToggleCollapsed }: Props) {
  const forest = useMemo(() => {
    const roots = buildForest(nodes);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const order = new Map(stages.map(stage => [stage.id, stage.order]));
    function sort(items: ExplorerItem[]) {
      items.sort((a, b) => (order.get(byId.get(a.id)?.stage ?? "") ?? Infinity) - (order.get(byId.get(b.id)?.stage ?? "") ?? Infinity) || a.title.localeCompare(b.title, "zh"));
      for (const item of items) sort(item.children);
    }
    sort(roots); return roots;
  }, [nodes, stages]);
  return (
    <aside className="explorer" {...(interaction ? nodeSurfaceEvents(interaction) : {})}>
      <section>
        <div className="pane-title"><h2>阶段</h2><span>{stages.length}</span></div>
        <p className="pane-note">按阶段定位知识，选择条目打开正文。</p>
        <button type="button" className={stageFilter === null ? "row stage-row is-active" : "row stage-row"} onClick={() => onFilterStage(null)}><span>整棵树</span><small>{nodes.length} 个节点</small></button>
        {stages.map((stage) => (
          <button key={stage.id} data-stage-id={stage.id} type="button" className={stageFilter === stage.id ? "row is-active" : "row"} onClick={() => onFilterStage(stage.id)}>
            <span data-stage-id={stage.id}>{stage.title}</span>
            <small>{yearLabel(stage.start, stage.end) || "时间未定"}</small>
          </button>
        ))}
        {stages.length === 0 && <p className="muted">还没有阶段。</p>}
      </section>
      <section>
        <div className="pane-title"><h2>知识目录</h2><span>{nodes.length}</span></div>
        <p className="pane-note">按学习阶段与层级浏览，展开分支继续学习。</p>
        {forest.length === 0 ? <p className="muted">创建节点后，这里会长出树。</p> : forest.map((item) => <Branch key={item.id} item={item} depth={0} selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />)}
      </section>
    </aside>
  );
}

function Branch({ item, depth, selectedId, onSelect, collapsed, onToggleCollapsed }: { item: ExplorerItem; depth: number; selectedId: string | null; onSelect: (id: string) => void; collapsed?: ReadonlySet<string>; onToggleCollapsed?: (id: string) => void }) {
  return (
    <div>
      <div className="outline-node-group" style={{ paddingLeft: Math.min(depth, 10) * 14 }}>
      {item.children.length > 0 ? <button type="button" className="outline-toggle ghost" aria-expanded={!collapsed?.has(item.id)} aria-label={`${collapsed?.has(item.id) ? "展开" : "收起"}${item.title}`} onClick={() => onToggleCollapsed?.(item.id)}>{collapsed?.has(item.id) ? "›" : "⌄"}</button> : <span className="outline-toggle-space" aria-hidden="true" />}
      <button type="button" data-node-id={item.id} className={selectedId === item.id ? "row node-row is-active" : "row node-row"} onClick={() => onSelect(item.id)}>
        <span className="node-type-dot" data-type={item.type} />
        <span className="node-row-title">{item.title}</span>
        {item.children.length > 0 && <small>{item.children.length}</small>}
      </button>
      </div>
      {!collapsed?.has(item.id) && item.children.map((child) => <Branch key={child.id} item={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />)}
    </div>
  );
}

