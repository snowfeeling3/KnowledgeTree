import { useEffect, useRef } from "react";
export type ContextItem = { id: string; title: string; hint?: string; danger?: boolean; run: () => void };
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  return <div className="ux-context-backdrop" onPointerDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }}><div ref={ref} className="ux-context-menu" role="menu" aria-label="节点操作" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 248)), top: Math.max(8, Math.min(y, window.innerHeight - items.length * 32 - 18)) }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  }}>{items.map((item) => <button type="button" key={item.id} role="menuitem" className={item.danger ? "is-danger" : ""} onClick={() => { onClose(); item.run(); }}><span>{item.title}</span><kbd>{item.hint}</kbd></button>)}</div></div>;
}
