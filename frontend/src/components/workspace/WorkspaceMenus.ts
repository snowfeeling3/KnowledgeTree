import type { WorkspaceController } from "../../workspace/useWorkspaceController";
import type { MenuGroup } from "../MenuBar";
import { THEMES, type ThemeName } from "../ThemeSwitch";
export function workspaceMenus(c: WorkspaceController, onBack: () => void, theme: ThemeName, onTheme: (theme: ThemeName) => void): MenuGroup[] {
  return [
    { id: "file", label: "文件", items: [{ id: "back", label: "全部学科", onSelect: onBack }, { id: "save", label: "立即保存", hint: "Ctrl+S", onSelect: () => c.command("save") }] },
    { id: "knowledge", label: "知识", items: [
      { id: "open", label: "打开正文", hint: "Enter", disabled: !c.selected, onSelect: () => c.command("open") },
      { id: "focus", label: "聚焦当前分枝", hint: "F", disabled: !c.selected, onSelect: () => c.command("focus") },
      ...(c.panels.prefs.editing ? [
        { id: "child", label: "快速添加子节点", hint: "N", onSelect: () => c.command("child") }, { id: "sibling", label: "快速添加同级", hint: "Shift+N", disabled: !c.selected, onSelect: () => c.command("sibling") },
        { id: "rename", label: "重命名", hint: "F2", disabled: !c.selected, onSelect: () => c.command("rename") },
        { id: "node", label: "完整新建表单", onSelect: () => c.setModal("node") }, { id: "stage", label: "新建阶段", onSelect: () => c.setModal("stage") },
        { id: "relation", label: "建立关系", disabled: c.data.nodes.length < 2, onSelect: () => c.setModal("relation") },
        { id: "structure", label: "结构与移动", disabled: !c.selected, onSelect: () => c.setModal("structure") },
        { id: "facts", label: "编辑属性", disabled: !c.selected, onSelect: () => { c.setShowFacts(true); if (c.selectedId) c.select(c.selectedId, true); } },
        { id: "edit-stage", label: "编辑阶段", disabled: !c.data.stages.length, onSelect: () => c.setModal("pick-stage") },
        { id: "delete", label: "删除当前节点", hint: "Delete", danger: true, disabled: !c.selected || c.data.nodes.some((node) => node.parent === c.selectedId), onSelect: () => c.command("delete") },
      ] : []),
    ] },
    { id: "view", label: "视图", items: [
      { id: "mode", label: "编辑模式", checked: c.panels.prefs.editing, hint: "Ctrl+E", onSelect: () => c.command("mode") },
      { id: "explorer", label: "大纲", checked: c.panels.prefs.left !== "closed", onSelect: () => c.panels.toggleRegion("outline") },
      { id: "tree", label: "知识树区域", checked: c.panels.prefs.tree !== "closed", onSelect: () => c.panels.toggleRegion("tree") },
      { id: "document", label: "专注正文", checked: c.panels.prefs.focusRegion === "document", onSelect: () => c.panels.focus("document") },
      { id: "timeline", label: "时间线", checked: c.showTimeline, onSelect: () => c.setShowTimeline(!c.showTimeline) },
      { id: "mindmap-layout", label: "脉络知识树", checked: c.layoutMode === "mindmap", onSelect: () => c.changeLayout("mindmap") },
      { id: "illustrated-layout", label: "插画知识树", checked: c.layoutMode === "illustrated", onSelect: () => c.changeLayout("illustrated") },
      { id: "legacy-layout", label: "传统树布局", checked: c.layoutMode === "legacy", onSelect: () => c.changeLayout("legacy") },
      { id: "fit", label: "适应整树", onSelect: () => c.command("fit") },
    ] },
    { id: "tools", label: "工具", items: [
      { id: "search", label: "搜索并定位", hint: "Ctrl+F", onSelect: () => c.command("search") },
      { id: "palette", label: "命令面板", hint: "Ctrl+K", onSelect: () => c.command("palette") },
      { id: "undo", label: "撤销", hint: "Ctrl+Z", disabled: !c.actions.history.canUndo, onSelect: () => c.command("undo") },
      { id: "redo", label: "重做", hint: "Ctrl+Shift+Z", disabled: !c.actions.history.canRedo, onSelect: () => c.command("redo") },
      { id: "history", label: "提交记录", checked: c.historyOpen, onSelect: () => { c.setHistoryOpen(!c.historyOpen); c.attempt(c.data.loadHistory()); } },
      { id: "relations", label: "相关知识", checked: c.showRelations, onSelect: () => { c.setShowRelations(!c.showRelations); if (c.selectedId) c.select(c.selectedId, true); } },
    ] },
    { id: "theme", label: "主题", items: THEMES.map(([value, label]) => ({ id: value, label, checked: value === theme, onSelect: () => onTheme(value) })) },
  ];
}
