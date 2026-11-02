import type { WorkspaceController } from "../workspace/useWorkspaceController";
import type { ThemeName } from "../components/ThemeSwitch";
import { fuzzyScore } from "../search/SearchIndexAdapter";
export type Command = { id: string; title: string; keywords?: string; hint?: string; run: () => void };
export function workspaceCommands(c: WorkspaceController, onTheme: (theme: ThemeName) => void): Command[] {
  const command = (id: string, title: string, keywords: string, hint?: string): Command => ({ id, title, keywords, hint, run: () => c.command(id) });
  const rows = [command("search", "搜索知识", "search", "Ctrl F"), command("fit", "适应整棵树", "fit tree"), command("mode", "切换浏览 / 编辑", "browse edit mode", "Ctrl E"),
    { id: "left", title: "切换大纲面板", keywords: "toggle panels explorer", run: () => c.panels.toggleRegion("outline") },
    { id: "right", title: "切换知识树区域", keywords: "toggle panels tree", run: () => c.panels.toggleRegion("tree") },
    ...(["light", "everforest", "dark"] as const).map((theme) => ({ id: `theme:${theme}`, title: `主题 · ${theme}`, keywords: "change theme", run: () => onTheme(theme) })),
    ...c.data.stages.map((stage) => ({ id: `stage:${stage.id}`, title: `前往阶段 · ${stage.title}`, keywords: "go stage", run: () => { c.setStageFilter(stage.id); const root = c.data.nodes.find((node) => node.stage === stage.id); if (root) c.jump(root.id, false, false); c.setStageFilter(stage.id); } })),
  ];
  if (c.actions.history.canUndo) rows.push(command("undo", "撤销上次操作", "undo", "Ctrl Z"));
  if (c.actions.history.canRedo) rows.push(command("redo", "重做上次操作", "redo", "Ctrl Shift Z"));
  if (c.selected) rows.unshift(command("child", `添加子节点 · ${c.selected.title}`, "create child", "N"), command("sibling", `添加同级 · ${c.selected.title}`, "create sibling", "Shift N"));
  if (c.selected && c.data.nodes.length > 1) rows.push({ id: "relation", title: `建立关系 · ${c.selected.title}`, keywords: "create relation", run: () => { c.panels.patch({ editing: true }); c.setModal("relation"); } });
  const recent = new Set(c.panels.prefs.recent);
  const nodes = [...c.data.nodes].sort((a, b) => (recent.has(a.id) ? c.panels.prefs.recent.indexOf(a.id) : 100) - (recent.has(b.id) ? c.panels.prefs.recent.indexOf(b.id) : 100) || a.title.localeCompare(b.title));
  for (const node of nodes) {
    const hint = recent.has(node.id) ? "最近访问" : undefined;
    rows.push({ id: `open:${node.id}`, title: `打开 · ${node.title}`, keywords: `${node.id} open node ${node.tags.join(" ")} ${hint ? "recent 最近访问" : ""}`, hint, run: () => c.jump(node.id, true) },
      { id: `focus:${node.id}`, title: `聚焦 · ${node.title}`, keywords: "focus node", run: () => c.jump(node.id) },
      { id: `child:${node.id}`, title: `在 ${node.title} 下添加子节点`, keywords: "create child under", run: () => { c.select(node.id); c.panels.patch({ editing: true }); c.setQuick("child"); } },
      { id: `relations:${node.id}`, title: `查看关系 · ${node.title}`, keywords: "show relations", run: () => { c.jump(node.id, true); c.setShowRelations(true); } });
  }
  return rows;
}
export function matchCommands(rows: Command[], query: string): Command[] {
  if (!query.trim()) return rows.slice(0, 30);
  return rows.map((row, index) => ({ row, index, score: Math.max(fuzzyScore(row.title, query), fuzzyScore(row.keywords ?? "", query)) }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 60).map((item) => item.row);
}
