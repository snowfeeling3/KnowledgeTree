import { useState } from "react";
export function QuickAdd({ parentTitle, kind, onCreate, onClose }: { parentTitle: string; kind: "child" | "sibling"; onCreate: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="ux-quick-add" aria-label="快速创建知识" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || busy) return; setBusy(true); void onCreate(title.trim()).then(onClose).catch((caught) => { setError(String(caught)); setBusy(false); }); }}>
    <small>{kind === "child" ? "添加子节点" : "添加同级节点"} · {parentTitle}</small><input aria-label="新节点标题" autoFocus placeholder="输入标题，Enter 创建" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }} /><button type="submit" disabled={busy || !title.trim()}>{busy ? "创建中…" : "创建"}</button><button type="button" onClick={onClose}>取消</button>{error && <span role="alert">{error}</span>}
  </form>;
}
