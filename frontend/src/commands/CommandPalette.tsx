import { useEffect, useState } from "react";
import { matchCommands, type Command } from "./CommandRegistry";
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState(""), [index, setIndex] = useState(0);
  const rows = matchCommands(commands, query);
  useEffect(() => { document.getElementById(`command-${index}`)?.scrollIntoView({ block: "nearest" }); }, [index]);
  const run = (command: Command) => { onClose(); command.run(); };
  return <div className="ux-popover-backdrop" onPointerDown={onClose}><section className="ux-search" role="dialog" aria-modal="true" aria-label="命令面板" onPointerDown={(event) => event.stopPropagation()}>
    <input autoFocus role="combobox" aria-label="查找命令或知识" placeholder="输入知识或操作…" aria-expanded="true" aria-controls="ux-command-results" aria-activedescendant={rows[index] ? `command-${index}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex((old) => Math.max(0, Math.min(rows.length - 1, old + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && rows[index]) { event.preventDefault(); run(rows[index]); }
    }} /><p className="ux-hint">↑↓ 选择 · Enter 执行 · Esc 关闭</p>
    <div id="ux-command-results" role="listbox">{rows.map((row, i) => <button id={`command-${i}`} type="button" role="option" aria-selected={i === index} key={row.id} className={i === index ? "is-active" : ""} onMouseEnter={() => setIndex(i)} onClick={() => run(row)}><strong>{row.title}</strong>{row.hint && <small>{row.hint}</small>}</button>)}</div>{rows.length === 0 && <p className="ux-hint">没有匹配命令</p>}
  </section></div>;
}
