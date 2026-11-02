import { readStored, writeStored } from "../lifecycle/preferences";
import { registerLifecycleSave } from "../lifecycle/saving";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Subject } from "../types";
import type { TreeLayoutMode } from "../lib/illustrated-tree-layout";
import { useWorkspaceData } from "./useWorkspaceData";
import { useDocumentSession } from "./useDocumentSession";
import { usePanelState } from "../panels/PanelState";
import { useNodeActions, quickAddInput } from "../node-actions/useNodeActions";
import { useShortcuts } from "../commands/ShortcutManager";
import type { NavigationRequest, LearningTrailSink } from "../interaction/NavigationController";
import { SaveCoordinator } from "./SaveCoordinator";
export type WorkspaceModal = "stage" | "pick-stage" | "edit-stage" | "node" | "relation" | "structure" | "facts" | null;
export function useWorkspaceController(subject: Subject, onStatus: (message: string) => void, onVisit?: LearningTrailSink) {
  const data = useWorkspaceData(subject.id), panels = usePanelState(subject.id), docs = useDocumentSession(subject.id, onStatus);
  const [selectedId, setSelectedId] = useState<string | null>(panels.prefs.selected), [focusedId, setFocusedId] = useState<string | null>(panels.prefs.focused);
  const [stageFilter, setStageFilter] = useState<string | null>(null), [searchOpen, setSearchOpen] = useState(false), [paletteOpen, setPaletteOpen] = useState(false);
  const [modal, setModal] = useState<WorkspaceModal>(null), [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [quick, setQuick] = useState<"child" | "sibling" | null>(null), [renameId, setRenameId] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false), [showRelations, setShowRelations] = useState(true), [historyOpen, setHistoryOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false), [resetSignal, setResetSignal] = useState(0), [navigation, setNavigation] = useState<NavigationRequest | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set()), [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [layoutMode, setLayoutMode] = useState<TreeLayoutMode>(() => { try { const saved = readStored<string>("knowledge-tree-layout", "mindmap"); return saved === "legacy" || saved === "illustrated" ? saved : "mindmap"; } catch { return "mindmap"; } });
  const mapInitialized = useRef(false);
  useEffect(() => {
    if (layoutMode !== "mindmap" || !data.layout?.nodes.length || mapInitialized.current) return;
    mapInitialized.current = true;
    if (data.layout.nodes.length > 80) setCollapsed(new Set(data.layout.nodes.filter(node => node.depth >= 1 && data.layout!.nodes.some(child => child.parent === node.id)).map(node => node.id)));
  }, [layoutMode, data.layout]);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6500); return () => clearTimeout(timer); }, [notice]);
  const report = (message: string) => { setNotice(message); onStatus(message); };
  const sequence = useRef(0), restored = useRef(false);
  const saves = useRef(new SaveCoordinator()).current;
  const docFlush = useRef(docs.flush); docFlush.current = docs.flush;
  useEffect(() => saves.register(() => docFlush.current()), [saves]);
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const select = (id: string | null, open = false) => {
    void saves.flush().catch((error) => report(`保存失败，草稿保留：${error}`));
    if (id && layoutMode === "mindmap") setCollapsed(old => {
      const next = new Set(old), seen = new Set<string>();
      let parent = data.nodes.find(node => node.id === id)?.parent;
      while (parent && !seen.has(parent)) { seen.add(parent); next.delete(parent); parent = data.nodes.find(node => node.id === parent)?.parent; }
      return next;
    });
    setSelectedId(id); if (!id) { panels.patch({ selected: null }); return; }
    panels.visit(id); if (open && panels.prefs.focusRegion !== "document") panels.patch({ focusRegion: null });
    onVisit?.({ subjectId: subject.id, nodeId: id, visitedAt: new Date().toISOString() });
    void docs.open(id);
  };
  const jump = (id: string, open = false, focus = true) => { setStageFilter(null); select(id, open); if (focus) { setFocusedId(id); panels.patch({ focused: id }); } setNavigation({ id, sequence: ++sequence.current, kind: focus ? "focus" : "jump" }); report(`已定位「${data.nodes.find((node) => node.id === id)?.title ?? id}」`); };
  const actions = useNodeActions(data, docs, (id) => { select(id); if (id) setNavigation({ id, sequence: ++sequence.current, kind: "jump" }); }, report, () => saves.flush());
  useEffect(() => registerLifecycleSave(async () => { await saves.flush(); await actions.history.idle(); await saves.flush(); await actions.history.idle(); }), [saves, actions.history]);
  const attempt = (operation: Promise<unknown>) => { void operation.catch((error) => report(`操作失败：${error}`)); };
  const toggleCollapse = (id = selectedId) => { if (!id) return; setCollapsed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleExpanded = (id: string) => setExpanded((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const escape = () => { if (searchOpen) setSearchOpen(false); else if (paletteOpen) setPaletteOpen(false); else if (quick) setQuick(null); else if (renameId) setRenameId(null); else if (modal) setModal(null); else { setFocusedId(null); panels.patch({ focused: null, ...(panels.prefs.right === "peek" ? { right: "closed" as const } : {}), ...(panels.prefs.left === "peek" ? { left: "closed" as const } : {}) }); } };
  const command = (id: string) => {
    if (id === "search") setSearchOpen(true);
    else if (id === "palette") setPaletteOpen(true);
    else if (id === "save") attempt(saves.flush().then(() => report("Saved · 已保存")));
    else if (id === "mode") panels.patch({ editing: !panels.prefs.editing });
    else if (id === "escape") { if (panels.prefs.focusRegion) panels.patch({ focusRegion: null }); else escape(); }
    else if (id === "undo") attempt(saves.flush().then(() => actions.history.undo()).then(() => report("已撤销")));
    else if (id === "redo") attempt(saves.flush().then(() => actions.history.redo()).then(() => report("已重做")));
    else if (id === "fit") { setResetSignal((value) => value + 1); setFocusedId(null); panels.patch({ focused: null }); }
    else if (id === "child" || id === "sibling") { panels.patch({ editing: true }); setQuick(id); }
    else if (selectedId && id === "open") select(selectedId, true);
    else if (selectedId && id === "focus") jump(selectedId, false);
    else if (selectedId && id === "rename") { panels.patch({ editing: true }); setRenameId(selectedId); }
    else if (selectedId && id === "collapse") toggleCollapse();
    else if (selectedId && id === "delete") attempt(actions.remove(selectedId));
  };
  useShortcuts(command);
  useEffect(() => { if (!data.loading && focusedId && !data.nodes.some((node) => node.id === focusedId)) { setFocusedId(null); panels.patch({ focused: null }); } }, [data.loading, data.nodes, focusedId]);
  useEffect(() => {
    if (data.loading || restored.current) return;
    restored.current = true;
    const initial = data.nodes.find(node => node.id === selectedId) ?? data.nodes.find(node => !node.parent) ?? data.nodes[0];
    if (initial) select(initial.id); else { setSelectedId(null); setFocusedId(null); }
  }, [data.loading]);
  const changeLayout = (mode: TreeLayoutMode) => { setLayoutMode(mode); panels.patch({ tree: "open" }); try { writeStored("knowledge-tree-layout", mode); } catch { /* session fallback */ } };
  const createQuick = async (title: string) => { await actions.create(quickAddInput(title, quick ?? "child", selected, data.nodes, stageFilter)); };
  const createStage = async (input: Parameters<typeof api.createStage>[1]) => { const stage = await api.createStage(subject.id, input); data.setStages((old) => [...old, stage]); report(`已创建阶段「${stage.title}」`); };
  return { subject, data, docs, saves, panels, selectedId, selected, focusedId, stageFilter, setStageFilter, searchOpen, setSearchOpen, paletteOpen, setPaletteOpen, modal, setModal, editingStageId, setEditingStageId, quick, setQuick, renameId, setRenameId, showFacts, setShowFacts, showRelations, setShowRelations, historyOpen, setHistoryOpen, showTimeline, setShowTimeline, resetSignal, navigation, collapsed, expanded, layoutMode, notice, select, jump, actions, attempt, command, report, toggleCollapse, toggleExpanded, changeLayout, createQuick, createStage };
}
export type WorkspaceController = ReturnType<typeof useWorkspaceController>;

