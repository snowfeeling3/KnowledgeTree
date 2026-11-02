import { useState } from "react";
import type { NodeRecord, Stage, Subject } from "../types";
import { breadcrumb } from "../interaction/NavigationController";
export function Breadcrumb({ subject, nodes, stages, selectedId, onJump, onStage, onFit }: { subject: Subject; nodes: NodeRecord[]; stages: Stage[]; selectedId: string | null; onJump: (id: string) => void; onStage: (id: string) => void; onFit: () => void }) {
  const [full, setFull] = useState(false);
  const chain = selectedId ? breadcrumb(selectedId, nodes, stages, subject) : [{ id: `subject:${subject.id}`, title: subject.title, kind: "subject" as const }];
  const visible = !full && chain.length > 5 ? [chain[0], null, ...chain.slice(-3)] : chain;
  return <nav className="ux-breadcrumb" aria-label="当前位置">{visible.map((part, index) => <span key={part?.id ?? "ellipsis"}>{index > 0 && <span className="ux-crumb-separator">›</span>}{part ? <button type="button" title={part.title} onClick={() => part.kind === "subject" ? onFit() : part.kind === "stage" ? onStage(part.id.slice(6)) : onJump(part.id)}>{part.title}</button> : <button type="button" aria-label="展开完整路径" onClick={() => setFull(true)}>…</button>}</span>)}</nav>;
}
