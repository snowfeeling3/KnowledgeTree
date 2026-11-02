import type { MouseEvent, KeyboardEvent } from "react";
export type NodeInteraction = {
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
  onRename: (id: string) => void;
  onToggleCollapsed?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
};
export function nodeSurfaceEvents(interaction: NodeInteraction) {
  const idAt = (target: EventTarget | null, root: EventTarget) => target instanceof Element && target.closest("[data-node-surface]") === root ? target.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId : undefined;
  return {
    "data-node-surface": "true",
    onClickCapture: (event: MouseEvent) => { if ((event.target as Element).closest(".tree-collapse, .tree-cluster, .mindmap-collapse, [data-collection]")) return; const id = idAt(event.target, event.currentTarget); if (id) { event.stopPropagation(); interaction.onSelect(id); } },
    onDoubleClickCapture: (event: MouseEvent) => { const id = idAt(event.target, event.currentTarget); if (id) { event.stopPropagation(); if ((event.target as Element).closest("text, .node-row-title, [data-node-title]")) interaction.onRename(id); else interaction.onFocus(id); } },
    onContextMenuCapture: (event: MouseEvent) => { const id = idAt(event.target, event.currentTarget); if (id && interaction.onContextMenu) { event.preventDefault(); event.stopPropagation(); interaction.onContextMenu(id, event.clientX, event.clientY); } },
    onKeyDownCapture: (event: KeyboardEvent) => { if ((event.target as Element).closest(".mindmap-collapse")) return; const id = idAt(event.target, event.currentTarget); if (!id || event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); interaction.onOpen(id); } else if (event.key === " " && interaction.onToggleCollapsed) { event.preventDefault(); event.stopPropagation(); interaction.onToggleCollapsed(id); } },
  };
}

