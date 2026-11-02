import type { ReactNode } from "react";
export function StudyPanel({ title, maximized, onMaximize, onClose, children, className = "" }: { title: string; maximized: boolean; onMaximize: () => void; onClose: () => void; children: ReactNode; className?: string }) {
  return <section className={`study-panel ${className}`} aria-label={title}>
    <header className="study-panel-header"><strong>{title}</strong><div><button type="button" className="ghost" onClick={onMaximize} aria-label={`${maximized ? "还原" : "最大化"}${title}`} title={maximized ? "还原区域" : "单独查看"}>{maximized ? "还原" : "单独查看"}</button><button type="button" className="ghost" onClick={onClose} aria-label={`收起${title}`}>×</button></div></header>
    <div className="study-panel-content">{children}</div>
  </section>;
}
