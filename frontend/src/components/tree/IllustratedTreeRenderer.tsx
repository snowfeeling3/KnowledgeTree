import type { KnowledgeBinding } from "../../lib/illustrated-tree-layout";
import type { IllustratedProjection } from "../../lib/illustrated-tree-projection";

type Props = {
  projection: IllustratedProjection;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onInspect: (binding: KnowledgeBinding) => void;
};

export function IllustratedTreeRenderer({ projection, onSelect, onHover, onInspect }: Props) {
  const { scene, camera, highlight, visibleBranchIds, illustratedLabels } = projection;
  const { skeleton, bindings, nodeToAnchor } = scene.illustration!;
  const bindingById = new Map(bindings.map((binding) => [binding.id, binding]));
  const selectedAnchor = highlight.selectedId ? nodeToAnchor.get(highlight.selectedId) : null;
  const hoveredAnchor = highlight.hoveredId ? nodeToAnchor.get(highlight.hoveredId) : null;
  const focusAnchors = new Set([...(highlight.focusIds ?? [])].map((id) => nodeToAnchor.get(id)));
  if (selectedAnchor) focusAnchors.add(selectedAnchor);
  const activate = (binding: KnowledgeBinding) => {
    onInspect(binding);
    if (binding.nodeId && binding.recordIds.length <= 1) onSelect(binding.nodeId);
  };
  return (
    <g className="illustrated-tree" transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
      <path className="botanical-ground" d="M 485 1020 Q 560 1007 635 1020" />
      {scene.branches.filter((branch) => visibleBranchIds.has(branch.id)).map((branch) => {
        const binding = bindingById.get(branch.id);
        const dimmed = (highlight.focusedId && branch.role !== "trunk" && !focusAnchors.has(branch.id)) || (highlight.stageFilter && branch.role !== "trunk" && !bindings.find((item) => item.id === `limb-${skeleton.slots.find((slot) => slot.id === branch.id)?.sector}`)?.stageIds.includes(highlight.stageFilter));
        return <path key={branch.id} className={`botanical-wood is-${branch.role}${selectedAnchor === branch.id || hoveredAnchor === branch.id ? " is-focused" : ""}`}
          data-node-id={binding?.nodeId ?? undefined} d={branch.bodyPath} opacity={dimmed ? 0.18 : undefined} onClick={binding ? () => activate(binding) : undefined} />;
      })}
      {skeleton.leaves.filter((leaf) => visibleBranchIds.has(leaf.anchorId)).map((leaf) => {
        const sector = skeleton.slots.find((slot) => slot.id === leaf.anchorId)!.sector;
        const dimmed = (highlight.focusedId && !focusAnchors.has(leaf.anchorId)) || (highlight.stageFilter && !bindingById.get(`limb-${sector}`)?.stageIds.includes(highlight.stageFilter));
        return <path key={leaf.anchorId} className={`botanical-leaf tone-${sector % 3}`} d={leaf.path} opacity={dimmed ? 0.12 : undefined} />;
      })}
      {bindings.filter((binding) => binding.rank === "root" || visibleBranchIds.has(binding.anchorId)).map((binding) => {
        const selected = selectedAnchor === binding.anchorId;
        // Hidden technology has no hit target until its twig is revealed.
        if (binding.rank === "technology" && !visibleBranchIds.has(binding.id)) return null;
        return <g key={`hit-${binding.id}`} data-node-id={binding.nodeId ?? undefined} className={`tree-node botanical-hit${selected ? " is-selected ux-pulse" : ""}`}
          role="button" tabIndex={0} aria-label={`${binding.title}，${binding.recordIds.length} 项知识`}
          transform={`translate(${binding.point.x} ${binding.point.y}) scale(${1 / camera.scale})`}
          onClick={() => activate(binding)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(binding); } }}
          onPointerEnter={() => onHover(binding.nodeId)} onPointerLeave={() => onHover(null)}>
          <title>{binding.nodeId ? projection.titles?.get(binding.nodeId) ?? binding.title : binding.title} · {binding.recordIds.length} 项知识，点击查看</title>
          <circle className="botanical-hit-area" r={12} />
          {binding.rank !== "root" && <circle className="botanical-bud" r={binding.rank === "stage" ? 3.5 : 2.5} />}
          {selected && <circle className="botanical-selection" r={9} />}
        </g>;
      })}
      {illustratedLabels.map((label) => {
        const binding = bindingById.get(label.nodeId)!;
        const summary = label.text.match(/ · \+\d+(?: 阶段)?$/)?.[0];
        return <g key={label.nodeId} data-node-id={binding.nodeId ?? undefined} className="tree-node" opacity={highlight.focusedId && !focusAnchors.has(binding.anchorId) ? 0.28 : 1} transform={`translate(${label.x} ${label.y}) scale(${1 / camera.scale})`} onClick={() => activate(binding)}
          onPointerEnter={() => onHover(binding.nodeId)} onPointerLeave={() => onHover(null)}>
          <title>{binding.nodeId ? projection.titles?.get(binding.nodeId) ?? binding.title : binding.title}</title>
          <text className={`botanical-label rank-${binding.rank}`} textAnchor={label.anchor}>{summary ? <>{label.text.slice(0, -summary.length)}<tspan data-collection="true" className="ux-collection-summary" onClick={(event) => { event.stopPropagation(); onInspect(binding); }}>{summary}</tspan></> : label.text}</text>
        </g>;
      })}
    </g>
  );
}
