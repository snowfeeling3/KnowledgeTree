import { removeStored } from "../lifecycle/preferences";
import { useEffect, useRef, useState } from "react";
import { NODE_TYPES, NODE_STATUSES, type NodeRecord } from "../types";
import type { UpdateNodeFactsInput, UpdateNodeInput } from "../api-inputs";
import type { SaveCoordinator } from "../workspace/SaveCoordinator";
import { readPreference, writePreference } from "./PanelState";
const fields = [["origin", "来源"], ["inventor", "发明者"], ["organization", "组织"], ["purpose", "目的"], ["problem", "问题"], ["solution", "方案"]] as const;
export function PropertiesEditor({ node, subjectId, onSave, onMetadataSave, saves }: { node: NodeRecord; subjectId: string; onSave: (facts: UpdateNodeFactsInput) => Promise<void>; onMetadataSave: (patch: Pick<UpdateNodeInput, "type" | "status" | "tags">) => Promise<void>; saves: SaveCoordinator }) {
  const initial = { type: node.type, status: node.status, tags: node.tags.join(", "), origin: node.origin ?? "", inventor: node.inventor ?? "", organization: node.organization ?? "", purpose: node.purpose ?? "", problem: node.problem ?? "", solution: node.solution ?? "", year: node.year == null ? "" : String(node.year), references: (node.references ?? []).join("\n") };
  const key = `kt-properties-draft:${subjectId}:${node.id}`;
  const recovered = useRef(readPreference<{ draft?: typeof initial; saved?: string } & Partial<typeof initial> | null>(key, null)).current;
  const [conflict, setConflict] = useState(Boolean(recovered && (recovered.saved === undefined || recovered.saved !== JSON.stringify(initial))));
  const conflictRef = useRef(conflict); conflictRef.current = conflict;
  const [draft, setDraft] = useState(() => ({ ...initial, ...(recovered?.draft ?? recovered ?? {}) })), [state, setState] = useState("Saved"), [error, setError] = useState("");
  const latest = useRef(draft), saved = useRef(JSON.stringify(initial)), save = useRef(onSave), tail = useRef<Promise<void>>(Promise.resolve());
  latest.current = draft; save.current = onSave;
  const metadataSave = useRef(onMetadataSave), metadataSaved = useRef(JSON.stringify({ type: initial.type, status: initial.status, tags: initial.tags })); metadataSave.current = onMetadataSave;
  useEffect(() => {
    if (JSON.stringify(latest.current) !== saved.current || JSON.stringify(initial) === saved.current) return;
    latest.current = initial; saved.current = JSON.stringify(initial); metadataSaved.current = JSON.stringify({ type: initial.type, status: initial.status, tags: initial.tags }); setDraft(initial); setState("Saved"); setError("");
  }, [node]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    if (conflictRef.current) return Promise.reject(new Error("属性草稿与磁盘内容可能冲突，请先在属性面板确认恢复或丢弃"));
    const task = tail.current.then(async () => {
      const value = latest.current, fingerprint = JSON.stringify(value); if (saved.current === fingerprint) return;
      if (value.year && !/^-?\d+$/.test(value.year)) { setState("Save failed"); setError("年份必须是整数"); throw new Error("年份必须是整数"); }
      setState("Saving…");
      try {
        const { type, status, tags, ...facts } = value;
        await save.current({ ...facts, year: value.year ? Number(value.year) : null, references: value.references.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) });
        const metadata = JSON.stringify({ type, status, tags });
        if (metadata !== metadataSaved.current) { await metadataSave.current({ type, status, tags: tags.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean) }); metadataSaved.current = metadata; }
        saved.current = fingerprint; if (JSON.stringify(latest.current) === fingerprint) { try { removeStored(key); } catch { /* in-memory fallback */ } } setError(""); setState(JSON.stringify(latest.current) === fingerprint ? "Saved" : "等待保存…");
      }
      catch (caught) { setState("Save failed"); setError(String(caught)); throw caught; }
    }); tail.current = task.catch(() => {}); return task;
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => saves.register(() => flushRef.current()), [saves]);
  useEffect(() => { if (JSON.stringify(draft) === saved.current) return; writePreference(key, { draft, saved: recovered?.saved ?? saved.current }); if (conflict) { setState("草稿待确认"); return; } setState("等待保存…"); timer.current = setTimeout(() => { void flushRef.current().catch(() => {}); }, 750); return () => clearTimeout(timer.current); }, [draft, conflict]);
  useEffect(() => () => { void flushRef.current().catch(() => {}); }, []);
  return <section className="ux-properties" aria-label="自动保存属性"><h3>属性 <small role="status">{state}</small></h3>{conflict && <div role="alert"><p>已恢复属性草稿，磁盘内容可能已变化。请确认后再保存。</p><button onClick={() => { conflictRef.current = false; setConflict(false); }}>使用恢复草稿</button><button onClick={() => { conflictRef.current = false; setConflict(false); setDraft(initial); latest.current = initial; saved.current = JSON.stringify(initial); removeStored(key); }}>保留磁盘内容</button></div>}<label>类型<select aria-label="节点类型" value={draft.type} onChange={(event) => setDraft((old) => ({ ...old, type: event.target.value as NodeRecord["type"] }))}>{NODE_TYPES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><label>状态<select aria-label="节点状态" value={draft.status} onChange={(event) => setDraft((old) => ({ ...old, status: event.target.value as NodeRecord["status"] }))}>{NODE_STATUSES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><label>标签<input aria-label="标签" value={draft.tags} placeholder="用逗号分隔" onChange={(event) => setDraft((old) => ({ ...old, tags: event.target.value }))} /></label>{fields.map(([key, title]) => <label key={key}>{title}<input aria-label={title} value={draft[key]} onChange={(event) => setDraft((old) => ({ ...old, [key]: event.target.value }))} /></label>)}<label>年份<input aria-label="年份" inputMode="numeric" value={draft.year} onChange={(event) => setDraft((old) => ({ ...old, year: event.target.value }))} /></label><label>引用<textarea aria-label="引用" value={draft.references} onChange={(event) => setDraft((old) => ({ ...old, references: event.target.value }))} rows={3} /></label>{error && <p className="form-error" role="alert">{error} · 草稿保留</p>}</section>;
}

