import { useLayoutEffect, useRef, useState } from "react";
import type { NodeRecord } from "../types";
export function InlineRename({ node, onSave, onClose }: { node: NodeRecord; onSave: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(node.title), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ x: 80, y: 130, width: 260 });
  const canceled = useRef(false), saving = useRef(false), input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const elements = [...document.querySelectorAll<HTMLElement>("[data-node-id]")].filter((element) => element.dataset.nodeId === node.id);
    const element = elements.find((item) => item.querySelector("text")) ?? elements.find((item) => item.classList.contains("node-row"));
    const box = (element?.querySelector("text") ?? element)?.getBoundingClientRect();
    if (box) setPosition({ x: Math.max(12, Math.min(window.innerWidth - 300, box.left)), y: Math.max(45, Math.min(window.innerHeight - 80, box.top - 4)), width: Math.min(380, Math.max(230, box.width + 80)) });
    input.current?.select();
  }, [node.id]);
  const commit = async () => {
    if (saving.current || canceled.current) return;
    if (!title.trim()) { setError("标题不能为空"); input.current?.focus(); return; }
    if (title.trim() === node.title) { onClose(); return; }
    saving.current = true; setBusy(true);
    try { await onSave(title.trim()); onClose(); } catch (caught) { setError(String(caught)); input.current?.focus(); } finally { saving.current = false; setBusy(false); }
  };
  return <div className="ux-inline-rename" style={{ left: position.x, top: position.y, width: position.width }}><input ref={input} autoFocus aria-label="重命名节点" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} onBlur={() => { void commit(); }} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void commit(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); canceled.current = true; onClose(); } }} />{busy && <small>Saving…</small>}{error && <small role="alert">{error}</small>}</div>;
}
