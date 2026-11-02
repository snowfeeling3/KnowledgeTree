import { lazy, Suspense, type CSSProperties } from "react";
import type { Subject } from "../../types";
import type { ThemeName } from "../ThemeSwitch";
import { useWorkspaceController } from "../../workspace/useWorkspaceController";
import { MenuBar } from "../MenuBar";
import { TreeView } from "../TreeView";
const DocumentPane = lazy(() => import("../DocumentPane").then(module => ({ default: module.DocumentPane })));
import { Explorer } from "../Explorer";
import { Timeline } from "../Timeline";
import { HistoryPanel } from "../HistoryPanel";
import { GlobalSearch } from "../../search/GlobalSearch";
import { QuickAdd } from "../../node-actions/QuickAdd";
import { PanelResizer } from "../../panels/PanelResizer";
import { StudyPanel } from "../../panels/StudyPanel";
import { workspaceMenus } from "./WorkspaceMenus";
import { Breadcrumb } from "../../panels/Breadcrumb";
import { PropertiesEditor } from "../../panels/PropertiesEditor";
import { useWorkspaceOverlays } from "./WorkspaceOverlays";
import { CommandPalette } from "../../commands/CommandPalette";
import { workspaceCommands } from "../../commands/CommandRegistry";
import { useNodeDrag } from "../../interaction/DragController";
import { WorkspaceModals } from "./WorkspaceModals";
export type WorkspaceProps = { subject: Subject; theme: ThemeName; onTheme: (theme: ThemeName) => void; onBack: () => void; onStatus: (message: string) => void };
export function Workspace({ subject, theme, onTheme, onBack, onStatus }: WorkspaceProps) {
  const c = useWorkspaceController(subject, onStatus), { prefs } = c.panels;
  const overlays = useWorkspaceOverlays(c), drag = useNodeDrag(c);
  const focus = prefs.focusRegion;
  const left = focus === "outline" || !focus && prefs.left !== "closed";
  const tree = focus === "tree" || !focus && prefs.tree !== "closed";
  const documentVisible = !focus || focus === "document";
  const interaction = { onContextMenu: overlays.onContextMenu, onSelect: (id: string) => c.select(id), onOpen: (id: string) => c.select(id, true), onFocus: (id: string) => c.jump(id), onToggleCollapsed: c.toggleCollapse, onRename: (id: string) => { c.select(id); c.setRenameId(id); c.panels.patch({ editing: true }); } };
  const goBack = () => c.attempt(c.saves.flush().then(onBack));
  const close = (region: "outline" | "tree") => c.panels.patch({ [region === "outline" ? "left" : "tree"]: "closed", focusRegion: null });
  return <main id="main-content" tabIndex={-1} {...drag.handlers} className={`workspace ux-workspace study-workspace${c.showTimeline ? " has-timeline" : ""}${prefs.editing ? " is-editing" : " is-browsing"}`}>
    <MenuBar groups={workspaceMenus(c, goBack, theme, onTheme)} extra={<span>{subject.title}</span>} />
    <header className="workspace-toolbar"><div className="subject-context"><button type="button" className="back-button" onClick={goBack} aria-label="返回全部学科">←</button><div><span className="eyebrow">学习工作区</span><strong>{subject.title}</strong></div></div>
      <div className="toolbar-actions"><button type="button" className="toolbar-action" aria-pressed={prefs.left !== "closed"} onClick={() => c.panels.toggleRegion("outline")}>大纲</button><button type="button" className="toolbar-action" aria-pressed={prefs.tree !== "closed"} onClick={() => c.panels.toggleRegion("tree")}>知识树</button><button type="button" className="toolbar-action" aria-pressed={c.showTimeline} onClick={() => c.setShowTimeline(!c.showTimeline)}>时间线</button><button type="button" className="toolbar-action" onClick={() => c.command("search")}>搜索 <kbd>Ctrl F</kbd></button><button type="button" className="toolbar-action" onClick={() => c.command("palette")}>命令 <kbd>Ctrl K</kbd></button>{prefs.editing && <button type="button" className="toolbar-primary" onClick={() => c.command("child")}>添加知识 <kbd>N</kbd></button>}</div>
    </header>
    <Breadcrumb subject={subject} nodes={c.data.nodes} stages={c.data.stages} selectedId={c.selectedId} onJump={(id) => c.jump(id, true, false)} onStage={c.setStageFilter} onFit={() => c.panels.patch({ focusRegion: null })} />
    {c.showTimeline && <div className="study-timeline"><Timeline stages={c.data.stages} nodes={c.data.nodes} stageFilter={c.stageFilter} onFilterStage={c.setStageFilter} /><button type="button" className="ghost" aria-label="收起时间线" onClick={() => c.setShowTimeline(false)}>×</button></div>}
    {c.data.loading && <div className="workspace-loading" role="status">正在读取学习资料…</div>}
    {c.data.error ? <section className="workspace-message" role="alert"><strong>{c.data.error}</strong><button type="button" onClick={() => { void c.data.load(); }}>重新读取</button></section> : <div className={`study-body${left ? " with-outline" : ""}${tree ? " with-tree" : ""}${focus ? " is-maximized" : ""}`} style={{ "--explorer-width": `${prefs.leftWidth}px`, "--tree-width": `${prefs.treeWidth}px` } as CSSProperties}>
      {left && <StudyPanel className="study-outline" title="知识大纲" maximized={focus === "outline"} onMaximize={() => c.panels.focus("outline")} onClose={() => close("outline")}><Explorer stages={c.data.stages} nodes={c.data.nodes} selectedId={c.selectedId} stageFilter={c.stageFilter} onFilterStage={c.setStageFilter} onSelect={(id) => c.select(id)} interaction={interaction} collapsed={c.collapsed} onToggleCollapsed={c.toggleCollapse} />{focus === "outline" && <button type="button" className="return-to-reading" onClick={() => c.panels.patch({ focusRegion: null })}>阅读选中知识</button>}</StudyPanel>}
      {left && documentVisible && <PanelResizer label="调整大纲宽度" value={prefs.leftWidth} min={190} max={460} onDelta={delta => c.panels.patch({ leftWidth: prefs.leftWidth + delta })} />}
      {tree && <StudyPanel className="study-tree" title="知识树" maximized={focus === "tree"} onMaximize={() => c.panels.focus("tree")} onClose={() => close("tree")}>
        <div className="tree-region-tools"><label>布局<select aria-label="知识树布局" name="tree-layout" value={c.layoutMode} onChange={event => c.changeLayout(event.target.value as typeof c.layoutMode)}><option value="mindmap">脉络知识树</option><option value="illustrated">插画知识树</option><option value="legacy">传统树布局</option></select></label><button type="button" className="ghost" onClick={() => c.command("fit")}>适应视野</button>{focus === "tree" && <button type="button" onClick={() => c.panels.patch({ focusRegion: null })}>阅读选中知识</button>}</div>
        <div className="tree-column"><TreeView key={c.layoutMode} layout={c.data.layout} stages={c.data.stages} records={c.data.nodes} relations={c.data.relations} subjectTitle={subject.title} layoutMode={c.layoutMode} selectedId={c.selectedId} focusedId={c.focusedId} stageFilter={c.stageFilter} resetSignal={c.resetSignal} onSelect={(id) => c.select(id)} interaction={interaction} navigation={c.navigation} persistenceKey={`${subject.id}:${c.layoutMode}:study`} collapsed={c.collapsed} expanded={c.expanded} onToggleCollapsed={c.toggleCollapse} onToggleExpanded={c.toggleExpanded} /></div>
      </StudyPanel>}
      {tree && documentVisible && <PanelResizer label="调整知识树宽度" value={prefs.treeWidth} min={280} max={800} onDelta={delta => c.panels.patch({ treeWidth: prefs.treeWidth + delta })} />}
      <div className="study-main-document" hidden={!documentVisible}>
        <Suspense fallback={<p className="document-loading" role="status">正在打开学习正文…</p>}><DocumentPane properties={prefs.editing && c.selected ? <PropertiesEditor key={c.selected.id} subjectId={subject.id} node={c.selected} saves={c.saves} onMetadataSave={patch => c.actions.update(c.selected!.id, patch)} onSave={facts => c.actions.facts(c.selected!.id, facts)} /> : undefined} node={c.selected} content={c.docs.draft.content} saved={c.docs.draft.saved} relations={c.data.relations} nodes={c.data.nodes} mode={prefs.editing ? "edit" : "preview"} showFacts={c.showFacts} showRelations={c.showRelations} onChange={c.docs.edit} onRequestEdit={() => c.panels.patch({ editing: true })} onRequestRead={() => c.panels.patch({ editing: false })} onDeleteRelation={id => c.attempt(c.actions.removeRelation(id))} saveState={c.docs.loading ? "loading" : c.docs.draft.state} saveError={c.docs.readError || c.docs.draft.error} onNavigate={id => c.jump(id, true, false)} onFocus={() => c.panels.focus("document")} focused={focus === "document"} /></Suspense>
      </div>
    </div>}
    {c.quick && <div className="study-quick-layer"><QuickAdd parentTitle={c.selected?.title ?? subject.title} kind={c.quick} onCreate={c.createQuick} onClose={() => c.setQuick(null)} /></div>}
    {c.historyOpen && <HistoryPanel subjectId={subject.id} history={c.data.history} onClose={() => c.setHistoryOpen(false)} onStatus={onStatus} />}
    {c.searchOpen && <GlobalSearch data={c.data} subject={subject} recent={prefs.recent} onJump={(id, open) => { c.jump(id, open, false); c.panels.patch({ focusRegion: null }); }} onClose={() => c.setSearchOpen(false)} />}
    <WorkspaceModals c={c} />{overlays.overlays}{drag.overlay}
    {c.paletteOpen && <CommandPalette commands={workspaceCommands(c, onTheme)} onClose={() => c.setPaletteOpen(false)} />}
    {c.notice && <div className="ux-toast" role="status">{c.notice}{c.actions.history.canUndo && <button type="button" onClick={() => c.command("undo")}>撤销</button>}</div>}
  </main>;
}
