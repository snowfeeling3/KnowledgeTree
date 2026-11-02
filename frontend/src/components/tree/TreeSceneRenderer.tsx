import { useMemo } from "react";
import { isDimmed, type TreeProjection } from "../../lib/tree-interaction";
import type { BranchGeometry, BranchWoodRole, LabelPlacement } from "../../lib/tree-scene";
import { adaptedStrokeWidth, labelKey } from "../../lib/tree-visibility";
import { DENSITY } from "../../lib/tree-density";

type Props = {
  projection: TreeProjection;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onToggleCollapsed: (id: string) => void;
  onToggleExpanded: (id: string) => void;
};

const PAINT_ORDER: Record<BranchWoodRole, number> = { relation: 0, twig: 1, secondary: 2, primary: 3, trunk: 4 };

export function TreeSceneRenderer({ projection, onSelect, onHover, onToggleCollapsed, onToggleExpanded }: Props) {
  const { scene, camera, highlight, visibleNodeIds, visibleBranchIds, branchPaint, nodePaint, visibleLabelIds } = projection;
  const byId = useMemo(() => new Map(scene.nodes.map((node) => [node.id, node])), [scene]);
  const leafByNode = useMemo(() => new Map(scene.leaves.map((leaf) => [leaf.nodeId, leaf])), [scene]);
  const labelsByNode = useMemo(() => {
    const labels = new Map<string, LabelPlacement[]>();
    for (const item of projection.labelPlacements ?? scene.labels) {
      const list = labels.get(item.nodeId) ?? [];
      list.push(item);
      labels.set(item.nodeId, list);
    }
    return labels;
  }, [scene, projection.labelPlacements]);
  const orderedBranches = useMemo(() => scene.branches.filter((branch) => visibleBranchIds.has(branch.id)).sort((left, right) => PAINT_ORDER[left.role] - PAINT_ORDER[right.role] || left.id.localeCompare(right.id)), [scene, visibleBranchIds]);

  return (
    <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
      {orderedBranches.map((branch) => {
        const from = byId.get(branch.fromId);
        const to = byId.get(branch.toId);
        const paint = branchPaint.get(branch.id);
        const faded = Boolean(from && to && isDimmed(from.stage, highlight) && isDimmed(to.stage, highlight) || highlight.focusedId && !highlight.focusIds?.has(branch.fromId) && !highlight.focusIds?.has(branch.toId));
        const tapered = branch.role !== "relation" && branch.bodyPath.length > 0;
        const opacity = (paint?.opacity ?? 1) * (faded ? 0.28 : 1);
        return (
          <path
            key={branch.id}
            className={branchClass(branch, paint?.layer)}
            d={tapered ? branch.bodyPath : branch.path}
            vectorEffect={tapered ? undefined : "non-scaling-stroke"}
            style={tapered ? { opacity } : { strokeWidth: adaptedStrokeWidth(branch.widthBase, camera.scale), strokeLinecap: "round", opacity }}
          />
        );
      })}
      {scene.nodes.map((node) => {
        if (!visibleNodeIds.has(node.id)) return null;
        const selected = highlight.selectedId === node.id;
        const hovered = highlight.hoveredId === node.id;
        const paint = nodePaint.get(node.id);
        const opacity = (paint?.opacity ?? 1) * (isDimmed(node.stage, highlight) || highlight.focusedId && !highlight.focusIds?.has(node.id) ? 0.22 : 1);
        const labels = (labelsByNode.get(node.id) ?? []).filter((item) => visibleLabelIds.has(labelKey(item)));
        const showLeafBody = node.rank !== "concept" || highlight.selectedId === node.id || highlight.hoveredId === node.id || projection.lod === "detail";
        if (node.role === "stage") {
          return (
            <g key={node.id} data-node-id={node.id} className={nodeClass("tree-stage", selected, hovered)} opacity={opacity} onClick={() => onSelect(node.id)} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
              <title>{projection.titles?.get(node.id) ?? node.title}</title>
              {node.glyphPath && <path className="tree-stage-sprout" d={node.glyphPath} />}
              {labels.map((item) => <text key={item.kind} className={item.kind === "stage-years" ? "tree-stage-years" : "tree-stage-title"} x={item.x} y={item.y} textAnchor={item.anchor}>{item.kind === "stage-years" ? item.text : item.text}</text>)}
            </g>
          );
        }
        if (node.role === "root") {
          const title = labels.find((item) => item.kind === "root");
          return (
            <g key={node.id} data-node-id={node.id} className={nodeClass("tree-root", selected, hovered)} opacity={opacity} onClick={() => onSelect(node.id)} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
              <title>{projection.titles?.get(node.id) ?? node.title}</title>
              <circle className="tree-root-orb" cx={node.point.x} cy={node.point.y} r="24" />
              {title && <text className="tree-root-label" x={title.x} y={title.y} textAnchor={title.anchor}>{title.text}</text>}
            </g>
          );
        }
        if (node.role === "branch" || node.rank !== "concept") {
          const title = labels.find((item) => item.kind === "branch");
          return (
            <g key={node.id} data-node-id={node.id} className={nodeClass("tree-branch", selected, hovered)} opacity={opacity} onClick={() => onSelect(node.id)} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
              <title>{projection.titles?.get(node.id) ?? node.title}</title>
              {node.glyphPath && <path className="tree-branch-bud" d={node.glyphPath} />}
              {title && <text className="tree-branch-label" x={title.x} y={title.y} textAnchor={title.anchor}>{title.text}</text>}
              {node.collapsePoint && (
                <g className="tree-collapse" transform={`translate(${node.collapsePoint.x} ${node.collapsePoint.y})`} onClick={(event) => { event.stopPropagation(); onToggleCollapsed(node.id); }}>
                  <circle r="8" />
                  <text textAnchor="middle" y="4">{highlight.collapsedIds.has(node.id) ? "+" : "−"}</text>
                </g>
              )}
            </g>
          );
        }
        const leaf = leafByNode.get(node.id);
        const title = labels.find((item) => item.kind === "leaf");
        return (
          <g key={node.id} data-node-id={node.id} className={nodeClass("tree-leaf", selected, hovered)} opacity={opacity} onClick={() => onSelect(node.id)} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
            <title>{projection.titles?.get(node.id) ?? node.title}</title>
            <circle className="tree-halo" cx={node.point.x} cy={node.point.y} r={18} />
            {showLeafBody && leaf && <path className="tree-leaf-stem" d={leaf.stemPath} vectorEffect="non-scaling-stroke" style={{ strokeWidth: DENSITY.width.leafStem }} />}
            {showLeafBody && leaf && <path className="tree-leaf-shape" data-type={projection.nodeTypes?.get(node.id) ?? node.type} d={leaf.bodyPath} />}
            {title && <text className="tree-leaf-label" x={title.x} y={title.y} textAnchor={title.anchor}>{title.text}</text>}
          </g>
        );
      })}
      {scene.clusters.map((cluster) => {
        if (!visibleNodeIds.has(cluster.parentId) || highlight.expandedIds?.has(cluster.parentId)) return null;
        const label = `+${cluster.count}`;
        return (
          <g key={`cluster-${cluster.parentId}`} className="tree-cluster" transform={`translate(${cluster.point.x} ${cluster.point.y})`} onClick={(event) => { event.stopPropagation(); onToggleExpanded(cluster.parentId); }}>
            <title>{label}</title>
            <rect x={-18} y={-11} width={36} height={20} rx={10} />
            <text textAnchor="middle" y={4}>{label}</text>
          </g>
        );
      })}
    </g>
  );
}

function nodeClass(role: string, selected: boolean, hovered: boolean): string {
  return ["tree-node", role, selected ? "is-selected" : "", hovered ? "is-hovered" : ""].filter(Boolean).join(" ");
}

function branchClass(branch: BranchGeometry, layer?: "focus" | "context" | "background"): string {
  const emphasis = layer && layer !== "focus" ? `is-${layer}` : "";
  return ["tree-edge", `is-${branch.role}`, emphasis].filter(Boolean).join(" ");
}

