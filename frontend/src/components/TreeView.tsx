import { MindmapRenderer } from "./tree/MindmapRenderer";
import { useEffect, useState } from "react";
import { type KnowledgeBinding, type TreeLayoutMode } from "../lib/illustrated-tree-layout";
import { IllustratedTreeRenderer } from "./tree/IllustratedTreeRenderer";
import { TreeKnowledgePanel } from "./tree/TreeKnowledgePanel";
import { type NodeRecord, type Relation, type Stage, type TreeLayout } from "../types";
import { TreeMinimap } from "./tree/TreeMinimap";
import { TreeSceneRenderer } from "./tree/TreeSceneRenderer";
import { useTreeCamera } from "./tree/useTreeCamera";
import { useTreeScene, useTreePresentation, sceneGeneration } from "./tree/useTreePresentation";
import { TreeFocusDetails } from "./tree/TreeFocusDetails";
import { TreeHoverPreview } from "./tree/TreeHoverPreview";
import { nodeSurfaceEvents, type NodeInteraction } from "../interaction/NodeSurface";
import type { NavigationRequest } from "../interaction/NavigationController";

type Props = {
  layout: TreeLayout | null;
  stages: Stage[];
  selectedId: string | null;
  stageFilter: string | null;
  resetSignal: number;
  onSelect: (id: string) => void;
  layoutMode?: TreeLayoutMode;
  subjectTitle?: string;
  records?: readonly NodeRecord[];
  relations?: readonly Relation[];
  focusedId?: string | null;
  collapsed?: ReadonlySet<string>;
  expanded?: ReadonlySet<string>;
  onToggleCollapsed?: (id: string) => void;
  onToggleExpanded?: (id: string) => void;
  interaction?: NodeInteraction;
  navigation?: NavigationRequest | null;
  persistenceKey?: string;
};

export function TreeView({ layout, stages, selectedId, stageFilter, resetSignal, onSelect, layoutMode = "mindmap", subjectTitle, records = EMPTY_RECORDS, relations = EMPTY_RELATIONS, focusedId, collapsed, expanded, onToggleCollapsed, onToggleExpanded, interaction, navigation, persistenceKey }: Props) {
  const scene = useTreeScene(layout, stages, layoutMode, subjectTitle, collapsed);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = scene?.illustration?.bindings.find((binding) => binding.id === inspectedId) ?? null;
  const inspect = (binding: KnowledgeBinding) => setInspectedId(binding.id);
  useEffect(() => {
    setInspectedId(null);
  }, [scene?.revision, layoutMode]);
  const camera = useTreeCamera(scene, resetSignal, persistenceKey, navigation);
  const presentation = useTreePresentation({ scene, camera: camera.camera, viewport: camera.viewport, selectedId, focusedId, stageFilter, collapsed, expanded, records, relations });
  const { projection, hovered } = presentation;
  const lod = projection?.lod ?? "detail";
  const visibleCount = projection?.visibleNodeIds.size ?? 0;

  return (
    <div
      className={`tree-host${layoutMode === "illustrated" ? " is-illustrated" : ""}`}
      ref={camera.hostRef}
      onPointerDown={camera.onPointerDown}
      onPointerMove={camera.onPointerMove}
      onPointerUp={camera.endDrag}
      onPointerCancel={camera.endDrag}
      onLostPointerCapture={camera.endDrag}
      {...(interaction ? nodeSurfaceEvents(interaction) : {})}
    >
      <div className="canvas-toolbar" aria-label="画布控制">
        <button type="button" className="canvas-control" title="缩小" aria-label="缩小" onClick={camera.zoomOut}>−</button>
        <button type="button" className="canvas-scale" title="适应视野" aria-label="适应视野" onClick={camera.fit}>{Math.round(camera.camera.scale * 100)}%</button>
        <button type="button" className="canvas-control" title="放大" aria-label="放大" onClick={camera.zoomIn}>+</button>
      </div>
      <div className="canvas-caption">
        <span className="canvas-live" aria-hidden="true" />{layoutMode === "illustrated" ? "插画知识树" : layoutMode === "mindmap" ? "脉络知识树" : "上升主干 · 分层树冠"}
        <span>{layoutMode === "mindmap" ? `${scene?.nodes.length ?? 0} 个展开节点` : lod === "overview" ? "远景：阶段与主要主题" : lod === "structure" ? "中景：领域与主题" : lod === "technology" ? "近景：技术" : `${visibleCount} 个可见知识点`}</span>
        {(collapsed?.size ?? 0) > 0 && <span>{collapsed?.size} 枝已收起</span>}
        {focusedId && <span>聚焦分枝 · Esc 返回</span>}
        {stageFilter && <span>已筛选阶段</span>}
      </div>
      {(scene?.nodes.length ?? 0) === 0 && (
        <div className="tree-empty">
          <strong>这棵树还没有长出来</strong>
          <p>从上方「知识」菜单新建阶段和节点。例如：计算机组成，CPU，ALU。</p>
        </div>
      )}
      <svg className="tree-svg" role="img" aria-label={`知识树（${lod === "overview" ? "结构概览" : "详细视图"}）`} data-scene-revision={scene?.revision ?? ""} data-scene-generation={sceneGeneration(scene)}>
        {projection && (
          scene?.mode === "mindmap" ? <MindmapRenderer scene={scene} camera={camera.camera} highlight={presentation.highlight} relations={relations} onSelect={onSelect} onHover={presentation.hover} onToggleCollapsed={onToggleCollapsed ?? (() => {})} /> : "illustratedLabels" in projection ? <IllustratedTreeRenderer projection={projection} onSelect={onSelect} onHover={presentation.hover} onInspect={inspect} /> : <TreeSceneRenderer
            projection={projection}
            onSelect={onSelect}
            onHover={presentation.hover}
            onToggleCollapsed={onToggleCollapsed ?? (() => {})}
            onToggleExpanded={onToggleExpanded ?? (() => {})}
          />
        )}
      </svg>
      {scene && inspected && layoutMode === "illustrated" && <TreeKnowledgePanel key={`${scene.nodes.find((node) => node.rank === "root")?.id}-${inspected.id}`} records={records} interaction={interaction} scene={scene} binding={inspected} selectedId={selectedId} onSelect={(id) => { onSelect(id); setInspectedId(null); }} onClose={() => setInspectedId(null)} />}
      {(focusedId || camera.camera.scale > 1.8) && <TreeFocusDetails nodes={records} focusedId={focusedId || selectedId} onSelect={onSelect} />}
      {hovered && <TreeHoverPreview node={hovered} nodes={records} stages={stages} relations={relations} />}
      {scene && scene.nodes.length > 0 && <TreeMinimap scene={scene} selectedId={selectedId} onCenter={camera.centerOn} />}
    </div>
  );
}
const EMPTY_RECORDS: readonly NodeRecord[] = [];
const EMPTY_RELATIONS: readonly Relation[] = [];

