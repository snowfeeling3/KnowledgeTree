import type { ContextItem } from "./ContextMenu";
import type { WorkspaceController } from "../workspace/useWorkspaceController";
export function contextItems(c: WorkspaceController, id: string): ContextItem[] {
  const node = c.data.nodes.find((node) => node.id === id); if (!node) return [];
  const edit = (action: () => void) => { c.select(id); c.panels.patch({ editing: true }); action(); };
  const children = c.data.nodes.some((node) => node.parent === id);
  return [
    { id: "open", title: "打开正文", hint: "Enter", run: () => c.select(id, true) },
    { id: "focus", title: "聚焦分枝", hint: "F", run: () => c.jump(id) },
    { id: "child", title: "添加子节点", hint: "N", run: () => edit(() => c.setQuick("child")) },
    { id: "sibling", title: "添加同级节点", hint: "Shift N", run: () => edit(() => c.setQuick("sibling")) },
    { id: "rename", title: "重命名", hint: "F2", run: () => edit(() => c.setRenameId(id)) },
    { id: "properties", title: "编辑属性", run: () => edit(() => { c.setShowFacts(true); c.select(id, true); }) },
    ...(c.data.nodes.length > 1 ? [{ id: "relation", title: "建立关系", run: () => edit(() => c.setModal("relation")) }] : []),
    { id: "move", title: "移动 / 更改上级", run: () => edit(() => c.setModal("structure")) },
    ...(children ? [{ id: "collapse", title: c.collapsed.has(id) ? "展开" : "收起", hint: "Space", run: () => c.toggleCollapse(id) }] : []),
    { id: "copy", title: "复制节点 ID", run: () => c.attempt(navigator.clipboard.writeText(id).then(() => c.report("已复制节点 ID"))) },
    ...(!children ? [{ id: "delete", title: "删除 · 可撤销", hint: "Delete", danger: true, run: () => c.attempt(c.actions.remove(id)) }] : []),
  ];
}
