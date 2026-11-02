import { useState } from "react";
import type { WorkspaceController } from "../../workspace/useWorkspaceController";
import { InlineRename } from "../../node-actions/InlineRename";
import { ContextMenu } from "../../node-actions/ContextMenu";
import { contextItems } from "../../node-actions/contextItems";
export function useWorkspaceOverlays(c: WorkspaceController) {
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const rename = c.data.nodes.find((node) => node.id === c.renameId);
  const overlays = <>{rename && <InlineRename key={rename.id} node={rename} onSave={(title) => c.actions.update(rename.id, { title })} onClose={() => c.setRenameId(null)} />}{context && <ContextMenu {...context} items={contextItems(c, context.id)} onClose={() => setContext(null)} />}</>;
  return { overlays, onContextMenu: (id: string, x: number, y: number) => setContext({ id, x, y }) };
}
