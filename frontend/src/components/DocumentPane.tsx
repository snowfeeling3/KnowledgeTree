import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { factLines } from "../lib/facts";
import { markdownHeadings, wrapMarkdown } from "../lib/document-markdown";
import { MarkdownContent } from "./MarkdownContent";
import { NODE_TYPES, RELATION_TYPES, labelOf, type NodeRecord, type Relation } from "../types";
import type { SaveState } from "../workspace/DocumentSaveQueue";
type Props = {
  node: NodeRecord | null; content: string; saved: string; relations: Relation[]; nodes: NodeRecord[];
  mode: "edit" | "preview"; showFacts: boolean; showRelations: boolean;
  onChange: (value: string) => void; onRequestEdit: () => void; onRequestRead?: () => void;
  onDeleteRelation: (id: string) => void; saveState?: SaveState; saveError?: string;
  onNavigate?: (id: string) => void; onFocus?: () => void; focused?: boolean; properties?: ReactNode;
};
export function DocumentPane({ node, content, saved, relations, nodes, mode, showFacts, showRelations, onChange, onRequestEdit, onRequestRead, onDeleteRelation, saveState, saveError, onNavigate, onFocus, focused, properties }: Props) {
  const [split, setSplit] = useState(true), [toc, setToc] = useState(false), [links, setLinks] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null), body = useRef<HTMLDivElement>(null);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; setLinks(false); }, [node?.id]);
  const headings = useMemo(() => markdownHeadings(content), [content]);
  function insert(before: string, after = "") {
    const field = editor.current; if (!field || field.disabled) return;
    const next = wrapMarkdown(content, field.selectionStart, field.selectionEnd, before, after);
    onChange(next.content); requestAnimationFrame(() => { field.focus(); field.setSelectionRange(next.start, next.end); });
  }
  if (!node) return <section className="document study-document"><div className="document-empty"><strong>从一个知识点开始学习</strong><p>展开大纲或知识树选择内容，或通过搜索找到笔记。正文会在这里打开。</p></div></section>;
  const dirty = content !== saved, related = relations.filter(relation => relation.from === node.id || relation.to === node.id), children = nodes.filter(child => child.parent === node.id), facts = factLines(node);
  const navigate = (id: string) => { if (nodes.some(item => item.id === id)) onNavigate?.(id); };
  const preview = <article className="prose study-prose"><MarkdownContent content={content} onNavigate={navigate} />{!content.trim() && <p className="muted">这篇笔记还是空白。切换到编辑，写下定义、问题和你的理解。</p>}</article>;
  return <section className="document study-document" aria-label="Markdown 正文">
    <header className="study-document-header">
      <div className="document-file"><span className="document-kicker">{labelOf(NODE_TYPES, node.type)}</span><strong title={`documents/${node.id}.md`}>{node.title}</strong><small>{node.id}.md</small></div>
      <div className="document-actions"><div className="reading-tabs" aria-label="正文模式"><button type="button" aria-pressed={mode === "preview"} onClick={onRequestRead}>阅读</button><button type="button" aria-pressed={mode === "edit" && !split} onClick={() => { setSplit(false); onRequestEdit(); }}>源码</button><button type="button" aria-pressed={mode === "edit" && split} onClick={() => { setSplit(true); onRequestEdit(); }}>对照</button></div><button type="button" className="ghost" aria-pressed={toc} onClick={() => setToc(!toc)}>目录</button>{onFocus && <button type="button" className="ghost" aria-label={focused ? "退出专注正文" : "专注正文"} onClick={onFocus}>{focused ? "还原布局" : "专注"}</button>}</div>
    </header>
    <div className="document-status"><span role="status">{saveError ? "保存或读取失败，草稿保留" : saveState === "loading" ? "正在读取…" : saveState === "saving" ? "正在保存…" : dirty ? "有未保存内容" : "已保存"}</span><span>{content.length.toLocaleString()} 字符</span></div>
    {saveError && <p className="form-error" role="alert">{saveError} · 检查后按 Ctrl+S 重试</p>}
    {mode === "edit" && <div className="markdown-tools" aria-label="Markdown 编辑工具"><button type="button" className="ghost" onClick={() => insert("## ")}>标题</button><button type="button" className="ghost" onClick={() => insert("**", "**")}>粗体</button><button type="button" className="ghost" onClick={() => insert("- [ ] ")}>待复习</button><button type="button" className="ghost" onClick={() => insert("\n```\n", "\n```\n")}>代码</button><button type="button" className="ghost" aria-expanded={links} onClick={() => setLinks(!links)}>链接知识点</button></div>}
    {links && mode === "edit" && <div className="knowledge-link-picker"><label>插入关联笔记<select aria-label="插入关联笔记" name="knowledge-link" value="" onChange={event => { const target = nodes.find(item => item.id === event.target.value); if (target) { insert(`[${target.title.replace(/[\[\]]/g, "") }](knowledge:${encodeURIComponent(target.id)})`); setLinks(false); } }}><option value="">选择知识点…</option>{nodes.filter(item => item.id !== node.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>}
    <div className={`document-reading-layout${toc ? " has-toc" : ""}`}>
      <div className="document-scroll" ref={body}>
        {saveState === "loading" ? <p className="document-loading" role="status">正在打开笔记…</p> : <div className={`document-writing${mode === "edit" && split ? " is-split" : ""}`}>
          {mode === "edit" && <textarea ref={editor} className="editor markdown-source" value={content} disabled={Boolean(saveError && saveState !== "failed")} onChange={event => onChange(event.target.value)} spellCheck={false} aria-label="Markdown 源码" name="markdown-source" autoComplete="off" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b" && !event.nativeEvent.isComposing) { event.preventDefault(); insert("**", "**"); } }} />}
          {(mode === "preview" || split) && preview}
        </div>}
        <div className="study-supplements">
          {children.length > 0 && <details><summary>继续学习 · {children.length} 个子知识</summary><div className="knowledge-links">{children.map(child => <button type="button" className="ghost" key={child.id} onClick={() => navigate(child.id)}>{child.title}</button>)}</div></details>}
          {showFacts && <details><summary>知识属性</summary>{properties || <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</details>}
          {showRelations && related.length > 0 && <details><summary>关联知识 · {related.length}</summary>{related.map(relation => <div className="relation-row" key={relation.id}><button type="button" className="ghost" onClick={() => navigate(relation.from === node.id ? relation.to : relation.from)}>{nodes.find(item => item.id === (relation.from === node.id ? relation.to : relation.from))?.title ?? "关联知识"}</button><small>{labelOf(RELATION_TYPES, relation.type)}</small>{mode === "edit" && <button type="button" className="ghost" onClick={() => onDeleteRelation(relation.id)}>移除</button>}</div>)}</details>}
        </div>
      </div>
      {toc && <aside className="document-toc" aria-label="正文目录"><header><strong>本文目录</strong><button type="button" className="ghost" aria-label="收起正文目录" onClick={() => setToc(false)}>×</button></header>{headings.length ? headings.map(heading => <button type="button" key={heading.id} style={{ paddingLeft: 10 + (heading.depth - 1) * 12 }} onClick={() => { if (mode === "edit" && !split && editor.current) { const offset = content.split("\n").slice(0, heading.line - 1).join("\n").length + (heading.line > 1 ? 1 : 0); editor.current.focus(); editor.current.setSelectionRange(offset, offset); } else body.current?.querySelector(`#${heading.id}`)?.scrollIntoView({ block: "start", behavior: "instant" }); }}>{heading.title}</button>) : <p>使用 Markdown 标题组织笔记，目录会自动显示。</p>}</aside>}
    </div>
  </section>;
}
