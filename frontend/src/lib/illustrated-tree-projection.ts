import type { LabelPlacement, LabelBox } from "./organic-geometry";
import type { KnowledgeBinding } from "./illustrated-tree-layout";
import type { TreeProjection } from "./tree-interaction";
import type { CameraState, Viewport } from "./camera";
import type { TreeHighlight } from "./tree-interaction";
import type { TreeSceneGraph } from "./tree-scene";
import type { Lod } from "./tree-visibility";
import type { NodeType } from "../types";

export type IllustratedProjection = TreeProjection & Readonly<{ illustratedLabels: readonly LabelPlacement[] }>;
export const ILLUSTRATED_BUDGET = Object.freeze({ overview: 16, structure: 28, technology: 50, detail: 50 });

export function illustratedLod(scale: number): Lod {
  return scale < 0.62 ? "overview" : scale < 1.05 ? "structure" : "technology";
}

export function projectIllustratedTree(input: { scene: TreeSceneGraph; camera: CameraState; viewport: Viewport; highlight: TreeHighlight; titles?: ReadonlyMap<string, string>; nodeTypes?: ReadonlyMap<string, NodeType> }): IllustratedProjection {
  const { scene, camera, viewport, highlight } = input;
  const illustration = scene.illustration!;
  const collapsed = new Set([...highlight.collapsedIds].map((id) => illustration.nodeToAnchor.get(id) ?? id));
  const lod = illustratedLod(camera.scale);
  const focusAnchors = new Set([highlight.selectedId, highlight.hoveredId].filter((id): id is string => Boolean(id)).map((id) => illustration.nodeToAnchor.get(id)));
  const hidden = (binding: KnowledgeBinding): boolean => {
    let slot = illustration.skeleton.slots.find((item) => item.id === binding.anchorId);
    while (slot) {
      if (collapsed.has(slot.parentId)) return true;
      slot = illustration.skeleton.slots.find((item) => item.id === slot!.parentId);
    }
    return false;
  };
  const candidates = illustration.bindings.filter((binding) => {
    if (hidden(binding)) return false;
    if (highlight.stageFilter && binding.rank !== "root" && !binding.stageIds.includes(highlight.stageFilter)) return false;
    if (binding.rank === "technology" && lod !== "technology" && !focusAnchors.has(binding.anchorId) && !binding.recordIds.some((id) => highlight.focusIds?.has(id))) return false;
    if (binding.rank === "topic" && lod === "overview") return false;
    const x = binding.point.x * camera.scale + camera.x;
    const y = binding.point.y * camera.scale + camera.y;
    return viewport.width === 0 || x > -40 && y > 35 && x < viewport.width + 40 && y < viewport.height - 35;
  }).sort((a, b) => Number(focusAnchors.has(b.anchorId)) - Number(focusAnchors.has(a.anchorId)) || priority(b.rank) - priority(a.rank)
    // Round-robin across limbs: every part of the crown gets a major topic first.
    || branchOrder(a.id) - branchOrder(b.id) || (a.id < b.id ? -1 : 1));
  const labels: LabelPlacement[] = [];
  const screenBoxes: LabelBox[] = [];
  const labelBudget = lod === "overview" && camera.scale < 0.45 ? 12 : ILLUSTRATED_BUDGET[lod];
  for (const binding of candidates) {
    if (labels.length >= labelBudget) break;
    const font = binding.rank === "root" ? 18 : binding.rank === "stage" ? 14 : 12;
    const title = binding.rank !== "stage" && binding.nodeId && input.titles?.get(binding.nodeId) ? input.titles.get(binding.nodeId)! + (binding.title.match(/ · \+\d+$/)?.[0] ?? "") : binding.title;
    const text = shorten(title, binding.rank === "root" ? 24 : lod === "overview" ? binding.rank === "stage" ? 14 : 10 : 18);
    const width = measureLabel(text, font) + 8;
    const screenX = binding.point.x * camera.scale + camera.x;
    const screenY = binding.point.y * camera.scale + camera.y;
    const anchor = binding.rank === "root" || binding.rank === "stage" ? "middle" : binding.side < 0 ? "end" : "start";
    const shifts = binding.rank === "root" ? [[0, 35]] : binding.rank === "stage" ? [[0, 24], [0, -20], [0, 43]] : [[binding.side * 12, -9], [binding.side * 12, 18], [binding.side * 12, -31]];
    for (const [dx, dy] of shifts) {
      const x = screenX + dx;
      const y = screenY + dy;
      const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
      const box = { left, right: left + width, top: y - font - 3, bottom: y + 4 };
      if (viewport.width && (box.left < 16 || box.right > viewport.width - 16 || box.top < 42 || box.bottom > viewport.height - 48)) continue;
      if (screenBoxes.some((other) => !labelsClear(box, other))) continue;
      // Selected labels get priority, but still obey the same budget and collision rules.
      labels.push(Object.freeze({ nodeId: binding.id, kind: binding.rank === "root" ? "root" : binding.rank === "stage" ? "stage" : "branch",
        rank: binding.rank, priority: priority(binding.rank), text, x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale,
        anchor, suppressed: false, box: Object.freeze(box) }));
      screenBoxes.push(box);
      break;
    }
  }
  const visibleAnchors = new Set(candidates.map((binding) => binding.anchorId));
  const visibleNodeIds = new Set(candidates.map((binding) => binding.nodeId).filter((id): id is string => Boolean(id)));
  const visibleBranchIds = new Set(scene.branches.filter((branch) => {
    if (branch.role === "trunk" || branch.role === "primary") return true;
    const slot = illustration.skeleton.slots.find((item) => item.id === branch.id)!;
    if (collapsed.has(slot.parentId) || collapsed.has(`limb-${slot.sector}`)) return false;
    return branch.role === "secondary" || visibleAnchors.has(branch.id);
  }).map((branch) => branch.id));
  return Object.freeze({ scene, camera, highlight, titles: input.titles, nodeTypes: input.nodeTypes, lod, visibleNodeIds, visibleBranchIds,
    branchPaint: new Map(), nodePaint: new Map(), visibleLabelIds: new Set(labels.map((label) => `${label.nodeId}|${label.kind}`)), illustratedLabels: Object.freeze(labels) });
}

export function labelsClear(a: LabelBox, b: LabelBox): boolean {
  return a.right + 8 <= b.left || b.right + 8 <= a.left || a.bottom + 6 <= b.top || b.bottom + 6 <= a.top;
}
export function measureLabel(text: string, font: number): number {
  // Conservative advance widths: full-width scripts and wide Latin glyphs are included.
  return Array.from(text).reduce((width, char) => width + font * (/[^\u0000-\u00ff]/u.test(char) ? 1.08 : /[MW@#%]/.test(char) ? 1 : 0.68), 0);
}
function shorten(text: string, limit: number): string {
  const chars = Array.from(text);
  const summary = text.match(/ · \+\d+(?: 阶段)?$/)?.[0];
  if (summary && chars.length > limit) return Array.from(text.slice(0, -summary.length)).slice(0, limit - Array.from(summary).length - 1).join("") + "…" + summary;
  return chars.length > limit ? chars.slice(0, limit - 1).join("") + "…" : text;
}
function priority(rank: KnowledgeBinding["rank"]): number {
  return ({ root: 110, stage: 100, domain: 80, topic: 60, technology: 40, concept: 0 })[rank];
}
function branchOrder(id: string): number {
  return Number(id.match(/-b(\d+)/)?.[1] ?? 0);
}
