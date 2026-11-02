import type { NodeRecord } from "../../types";
/** Details use existing records, outside the scene geometry and its label budget. */
export function TreeFocusDetails({ nodes, focusedId, onSelect }: { nodes: readonly NodeRecord[]; focusedId: string | null | undefined; onSelect: (id: string) => void }) {
  const focused = nodes.find((node) => node.id === focusedId); if (!focused) return null;
  const children = nodes.filter((node) => node.parent === focused.id);
  return <section className="ux-focus-details" aria-label="聚焦知识详情"><strong>{focused.title}</strong>{(focused.purpose || focused.problem) && <p>{focused.purpose || focused.problem}</p>}{children.length > 0 && <><small>下级知识 · {children.length} 项</small><div>{children.slice(0, 8).map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)} title={node.purpose ?? node.title}>{node.title}</button>)}</div>{children.length > 8 && <small>其余 {children.length - 8} 项可在大纲或正文中查看</small>}</>}</section>;
}
