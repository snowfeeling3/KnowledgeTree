import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { NODE_TYPES, labelOf, type SearchHit } from "../types";
import type { WorkspaceData } from "../workspace/useWorkspaceData";
import { searchIndex } from "./SearchIndexAdapter";
export function GlobalSearch({ data, subject, recent, onJump, onClose }: { data: WorkspaceData; subject: { id: string; title: string }; recent: string[]; onJump: (id: string, open?: boolean) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""), [remote, setRemote] = useState<SearchHit[]>([]), [index, setIndex] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let current = true; setRemote([]); setIndex(0); setError("");
    if (!query.trim()) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => { api.searchNodes(subject.id, query).then((hits) => { if (current) setRemote(hits); }).catch((caught) => { if (current) setError(`正文搜索暂不可用：${caught}`); }).finally(() => { if (current) setBusy(false); }); }, 180);
    return () => { current = false; clearTimeout(timer); };
  }, [query, subject.id]);
  const results = useMemo(() => searchIndex(query, data.nodes, data.stages, data.relations, remote, subject, recent), [query, data.nodes, data.stages, data.relations, remote, subject, recent]);
  useEffect(() => { document.getElementById(`search-${results[index]?.id}`)?.scrollIntoView({ block: "nearest" }); }, [index, results]);
  const jump = (id: string, open = false) => { onJump(id, open); onClose(); };
  return <div className="ux-popover-backdrop" onPointerDown={onClose}><section className="ux-search" role="dialog" aria-modal="true" aria-label="搜索知识" onPointerDown={(event) => event.stopPropagation()}>
    <input autoFocus role="combobox" aria-label="搜索节点、阶段、标签、正文或关系" aria-controls="ux-search-results" aria-expanded="true" aria-activedescendant={results[index] ? `search-${results[index].id}` : undefined} placeholder="搜索知识… ↑↓ 选择，Enter 定位，Ctrl+Enter 打开正文" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(0, Math.min(results.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && results[index]) { event.preventDefault(); jump(results[index].id, event.ctrlKey || event.metaKey); }
    }} />
    <p className="ux-hint">{query ? `${results.length} 个匹配${busy ? " · 正在搜索正文…" : ""}` : "最近访问"}</p>
    <div id="ux-search-results" role="listbox">{results.map((result, i) => <button type="button" role="option" id={`search-${result.id}`} aria-selected={index === i} key={result.id} className={index === i ? "is-active" : ""} onMouseEnter={() => setIndex(i)} onClick={() => jump(result.id)}><strong>{result.title}</strong><small>{({ root: "学科", stage: "阶段", domain: "领域", topic: "主题", technology: "技术", concept: "概念" })[result.semanticRole]} / {labelOf(NODE_TYPES, result.role)} · {result.stage}</small><span>{result.path}</span>{result.reason && <span>{result.reason}</span>}</button>)}</div>
    {!busy && results.length === 0 && <p className="ux-hint">{query ? "没有匹配知识" : "访问过的知识会出现在这里"}</p>}{error && <p role="status" className="form-error">{error}</p>}
  </section></div>;
}

