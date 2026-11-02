import { useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { WorkspaceController } from "../workspace/useWorkspaceController";
import { parentChoices } from "../lib/forest";
import { stageMoveTarget } from "../node-actions/Move";
export type DropIntent = { node?: string; stage?: string; valid: boolean; title: string };
export function dropIntent(c: { data: Pick<WorkspaceController["data"], "nodes" | "stages" | "relations"> }, source: string, targetNode: string | undefined, targetStage: string | undefined, relation: boolean): DropIntent {
  const node = c.data.nodes.find((item) => item.id === targetNode);
  if (relation) {
    const valid = Boolean(node && source !== node.id && !c.data.relations.some((item) => item.from === source && item.to === node.id && item.type === "related_to"));
    return { node: node?.id, valid, title: valid ? `建立关系：${c.data.nodes.find((item) => item.id === source)?.title} → ${node!.title}` : "请选择另一个节点建立关系" };
  }
  if (node) { const valid = parentChoices(c.data.nodes, source).some((item) => item.id === node.id); return { node: node.id, valid, title: valid ? `移动到 ${node.title} 下` : "不能移动到自己或后代下" }; }
  const stage = c.data.stages.find((item) => item.id === targetStage);
  const valid = Boolean(stage && stageMoveTarget(source, stage.id, c.data.nodes).valid);
  return { stage: stage?.id, valid, title: stage ? valid ? `移动到阶段 ${stage.title}` : "不能移动到自己的后代阶段下" : "拖到节点或大纲中的阶段，Esc 取消" };
}
export function useNodeDrag(c: WorkspaceController) {
  const active = useRef<{ id: string; x: number; y: number; pointer: number; relation: boolean; started: boolean; intent?: DropIntent } | null>(null);
  const suppressUntil = useRef(0), [preview, setPreview] = useState<{ x: number; y: number; title: string; valid: boolean } | null>(null);
  const cancel = () => { active.current = null; setPreview(null); };
  const handlers = {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !c.panels.prefs.editing || (event.target as Element).closest("input,textarea,select,[role=dialog],[role=menu],.ux-properties,.ux-breadcrumb")) return;
      const id = (event.target as Element).closest("[data-node-id]")?.getAttribute("data-node-id");
      if (!id || !c.data.nodes.some((node) => node.id === id)) return;
      active.current = { id, x: event.clientX, y: event.clientY, pointer: event.pointerId, relation: event.shiftKey, started: false };
    },
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = active.current; if (!drag || drag.pointer !== event.pointerId) return;
      if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      drag.started = true; event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      drag.intent = dropIntent(c, drag.id, hit?.closest("[data-node-id]")?.getAttribute("data-node-id") ?? undefined, hit?.closest("[data-stage-id]")?.getAttribute("data-stage-id") ?? undefined, drag.relation);
      setPreview({ x: event.clientX, y: event.clientY, title: drag.intent.title, valid: drag.intent.valid });
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = active.current; if (!drag) return;
      if (drag.started) {
        event.stopPropagation(); suppressUntil.current = Date.now() + 400;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (drag.intent?.valid) c.attempt(drag.relation ? c.actions.relation({ from: drag.id, to: drag.intent.node!, type: "related_to", note: "" }) : c.actions.move(drag.id, drag.intent));
        else c.report(drag.intent?.title ?? "已取消移动");
      }
      cancel();
    },
    onPointerCancelCapture: cancel,
    onKeyDownCapture: (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Escape" && active.current) { suppressUntil.current = Date.now() + 400; event.preventDefault(); event.stopPropagation(); cancel(); } },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => { if (Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } },
  };
  return { handlers, overlay: preview && <div className={`ux-drag-preview${preview.valid ? " is-valid" : ""}`} style={{ left: Math.min(preview.x + 15, window.innerWidth - 310), top: preview.y + 16 }} role="status">{preview.title}</div> };
}
