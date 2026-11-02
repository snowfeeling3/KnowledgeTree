import type { Relation } from "../../types";
import type { CameraState } from "../../lib/camera";
import type { TreeHighlight } from "../../lib/tree-interaction";
import type { TreeSceneGraph } from "../../lib/tree-scene";
import { MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from "../../lib/mindmap";

type Props = { scene: TreeSceneGraph; relations: readonly Relation[]; camera: CameraState; highlight: TreeHighlight; onSelect: (id: string) => void; onHover: (id: string | null) => void; onToggleCollapsed: (id: string) => void };
export function MindmapRenderer({ scene, relations, camera, highlight, onSelect, onHover, onToggleCollapsed }: Props) {
  const byId = new Map(scene.nodes.map(node => [node.id, node]));
  return <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
    {relations.filter(relation => relation.from === highlight.selectedId || relation.to === highlight.selectedId).map(relation => {
      const from = byId.get(relation.from), to = byId.get(relation.to);
      if (!from || !to) return null;
      return <path key={`relation-${relation.id}`} className="mindmap-relation" d={`M${from.point.x},${from.point.y - 29} Q${(from.point.x + to.point.x) / 2},${Math.min(from.point.y, to.point.y) - 90} ${to.point.x},${to.point.y - 29}`}><title>{relation.type}{relation.note ? `：${relation.note}` : ""}</title></path>;
    })}
    {scene.nodes.map(node => {
      const parent = byId.get(node.parent ?? "");
      if (!parent) return null;
      const x1 = parent.point.x + MAP_NODE_WIDTH / 2, x2 = node.point.x - MAP_NODE_WIDTH / 2, mid = (x1 + x2) / 2;
      return <path key={`edge-${node.id}`} className={`mindmap-edge${highlight.selectedId === node.id ? " is-selected" : ""}`} d={`M${x1},${parent.point.y} C${mid},${parent.point.y} ${mid},${node.point.y} ${x2},${node.point.y}`} />;
    })}
    {scene.nodes.map(node => {
      const dimmed = highlight.stageFilter && node.stage && node.stage !== highlight.stageFilter || highlight.focusedId && !highlight.focusIds?.has(node.id);
      const title = Array.from(node.title); const short = title.length > 12 ? `${title.slice(0, 11).join("")}…` : node.title;
      return <g key={node.id} data-node-id={node.id} className={`tree-node mindmap-node${node.depth === 0 ? " is-root" : ""}${highlight.selectedId === node.id ? " is-selected" : ""}`} transform={`translate(${node.point.x} ${node.point.y})`} opacity={dimmed ? .3 : 1}>
        <g role="button" tabIndex={0} aria-label={node.title} className="mindmap-node" onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
          <title>{node.title}</title><rect x={-MAP_NODE_WIDTH / 2} y={-MAP_NODE_HEIGHT / 2} width={MAP_NODE_WIDTH} height={MAP_NODE_HEIGHT} rx={10} />
          <text x={-80} y={node.depth === 0 ? 5 : -3}>{short}</text>
          {node.depth > 0 && <text className="mindmap-meta" x={-80} y={17}>{node.depth === 1 ? "知识分支" : "知识节点"}</text>}
        </g>
        {node.collapsePoint && <g role="button" tabIndex={0} aria-label={`${highlight.collapsedIds.has(node.id) ? "展开" : "收起"}${node.title}`} className="mindmap-collapse" transform="translate(112 0)" onClick={event => { event.stopPropagation(); onToggleCollapsed(node.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onToggleCollapsed(node.id); } }}><circle r={12} /><text textAnchor="middle" y={5}>{highlight.collapsedIds.has(node.id) ? "+" : "−"}</text></g>}
      </g>;
    })}
  </g>;
}
