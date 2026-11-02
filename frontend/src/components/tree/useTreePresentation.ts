import { mindmapScene } from "../../lib/mindmap";
import { useEffect, useMemo, useState } from "react";
import type { LayoutNode, NodeRecord, Relation, Stage, TreeLayout } from "../../types";
import { illustratedTreeLayout, type TreeLayoutMode } from "../../lib/illustrated-tree-layout";
import { resolveSceneGraph } from "../../lib/tree-scene";
import { projectTree, type TreeHighlight, type TreeProjection } from "../../lib/tree-interaction";
import { projectIllustratedTree, type IllustratedProjection } from "../../lib/illustrated-tree-projection";
import { focusNeighborhood } from "../../interaction/NavigationController";
import type { CameraState, Viewport } from "../../lib/camera";

export function useTreeScene(layout: TreeLayout | null, stages: readonly Stage[], mode: TreeLayoutMode, title?: string, collapsed?: ReadonlySet<string>) {
  const layoutCollapse = mode === "mindmap" ? collapsed : undefined;
  return useMemo(() => {
    const scene = mode === "mindmap" ? mindmapScene(layout, layoutCollapse) : mode === "illustrated" ? illustratedTreeLayout(layout, stages, title) : resolveSceneGraph(layout, stages);
    if (scene) generations.set(scene, ++generation);
    return scene;
  }, [layout, stages, mode, title, layoutCollapse]);
}
let generation = 0;
const generations = new WeakMap<object, number>();
export function sceneGeneration(scene: object | null) { return scene ? generations.get(scene) : 0; }
export function useTreePresentation(input: {
  scene: ReturnType<typeof useTreeScene>; camera: CameraState; viewport: Viewport;
  selectedId: string | null; focusedId?: string | null; stageFilter: string | null;
  collapsed?: ReadonlySet<string>; expanded?: ReadonlySet<string>; records: readonly NodeRecord[]; relations?: readonly Relation[];
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null), [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => { setPreviewId(null); if (!hoveredId) return; const timer = setTimeout(() => setPreviewId(hoveredId), 400); return () => clearTimeout(timer); }, [hoveredId]);
  const focusIds = useMemo(() => focusNeighborhood(input.focusedId ?? null, input.records.length ? input.records : input.scene?.nodes ?? [], input.relations ?? []), [input.focusedId, input.records, input.relations, input.scene]);
  const highlight = useMemo<TreeHighlight>(() => ({ selectedId: input.selectedId, hoveredId, focusedId: input.focusedId ?? null, focusIds, stageFilter: input.stageFilter, collapsedIds: input.collapsed ?? EMPTY, expandedIds: input.expanded ?? EMPTY }), [input.selectedId, hoveredId, input.focusedId, focusIds, input.stageFilter, input.collapsed, input.expanded]);
  const titles = useMemo(() => new Map(input.records.map((node) => [node.id, node.title])), [input.records]);
  const nodeTypes = useMemo(() => new Map(input.records.map((node) => [node.id, node.type])), [input.records]);
  const projection = useMemo<TreeProjection | IllustratedProjection | null>(() => {
    if (!input.scene) return null;
    const projectInput = { scene: input.scene, camera: input.camera, viewport: input.viewport, highlight, titles, nodeTypes };
    return input.scene.illustration ? projectIllustratedTree(projectInput) : projectTree(projectInput);
  }, [input.scene, input.camera, input.viewport, highlight, titles, nodeTypes]);
  const hovered = input.records.find((node) => node.id === previewId) ?? input.scene?.nodes.find((node) => node.id === previewId);
  return { projection, hovered, hover: setHoveredId, highlight };
}
const EMPTY: ReadonlySet<string> = new Set();
export function bindingNodeId(node: LayoutNode) { return node.id; }
