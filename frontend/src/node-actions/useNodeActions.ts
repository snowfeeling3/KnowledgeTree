import { useRef, useState } from "react";
import { api } from "../api";
import type { NewNodeInput, NewRelationInput, UpdateNodeFactsInput, UpdateNodeInput } from "../api-inputs";
import type { NodeRecord, NodeSnapshot, Relation } from "../types";
import { UndoManager } from "../history/UndoManager";
import { inheritedStage } from "../interaction/NavigationController";
import { parentChoices } from "../lib/forest";
import type { WorkspaceData } from "../workspace/useWorkspaceData";
import type { useDocumentSession } from "../workspace/useDocumentSession";
import { stageMoveTarget } from "./Move";

export function nodeUpdate(node: NodeRecord): UpdateNodeInput { return { title: node.title, type: node.type, parent: node.parent ?? null, stage: node.stage ?? null, status: node.status, tags: [...node.tags] }; }
export function quickAddInput(title: string, kind: "child" | "sibling", current: NodeRecord | null, nodes: readonly NodeRecord[], stageFilter: string | null): NewNodeInput {
  return { title: title.trim(), type: kind === "sibling" && current ? current.type : "concept", parent: kind === "child" ? current?.id ?? null : current?.parent ?? null, stage: inheritedStage(current?.id, nodes) ?? stageFilter, tags: [] };
}
export function useNodeActions(data: WorkspaceData, docs: ReturnType<typeof useDocumentSession>, select: (id: string | null) => void, report: (message: string) => void, flush: () => Promise<void>) {
  const [, redraw] = useState(0);
  const latest = useRef({ data, docs, select, report, flush }); latest.current = { data, docs, select, report, flush };
  const manager = useRef<UndoManager | null>(null);
  if (!manager.current) manager.current = new UndoManager(() => redraw((value) => value + 1));
  const history = manager.current;
  const refresh = () => latest.current.data.structure();
  const create = async (input: NewNodeInput) => {
    await latest.current.flush();
    return history.run(async () => {
    const node = await api.createNode(data.subjectId, input); await refresh(); latest.current.select(node.id); report(`已创建「${node.title}」`);
    let snapshot: NodeSnapshot;
    history.record({ label: `创建 ${node.title}`, undo: async () => { await latest.current.docs.flush(); snapshot = await api.deleteNodeUndoable(data.subjectId, node.id); latest.current.docs.forget(node.id); await refresh(); latest.current.select(node.parent ?? null); }, redo: async () => { await api.restoreNode(data.subjectId, snapshot); await refresh(); latest.current.select(node.id); } });
    return node;
    });
  };
  const update = (id: string, patch: Partial<UpdateNodeInput>) => history.run(async () => {
    const before = latest.current.data.nodes.find((node) => node.id === id); if (!before) throw new Error("节点已不存在");
    const old = nodeUpdate(before), next = { ...old, ...patch };
    const structural = old.parent !== next.parent || old.stage !== next.stage;
    const apply = async (value: UpdateNodeInput) => { const node = await api.updateNode(data.subjectId, id, value); if (structural) { await refresh(); latest.current.select(id); } else latest.current.data.patchNode(node); };
    await apply(next); history.record({ label: `修改 ${before.title}`, undo: () => apply(old), redo: () => apply(next) }); report(`已保存「${next.title}」`);
  });
  const remove = async (id: string) => {
    await latest.current.flush();
    return history.run(async () => {
    const node = latest.current.data.nodes.find((item) => item.id === id); if (!node) return;
    if (latest.current.data.nodes.some((item) => item.parent === id)) throw new Error("此节点仍有子节点，请先移动或删除子节点。");
    let snapshot = await api.deleteNodeUndoable(data.subjectId, id);
    latest.current.docs.forget(id); await refresh(); latest.current.select(node.parent ?? null);
    history.record({ label: `删除 ${node.title}`, undo: async () => { await api.restoreNode(data.subjectId, snapshot); await refresh(); latest.current.docs.seed(id, snapshot.document); latest.current.select(id); }, redo: async () => { await latest.current.docs.flush(); snapshot = await api.deleteNodeUndoable(data.subjectId, id); latest.current.docs.forget(id); await refresh(); latest.current.select(node.parent ?? null); } });
    report(`已删除「${node.title}」 · 可撤销`);
    });
  };
  const facts = async (id: string, input: UpdateNodeFactsInput) => { const node = await api.updateNodeFacts(data.subjectId, id, input); latest.current.data.patchNode(node); };
  const relation = (input: NewRelationInput) => history.run(async () => {
    let result = await api.createRelation(data.subjectId, input);
    const add = (item: Relation) => latest.current.data.setRelations((all) => [...all.filter((other) => other.id !== item.id), item]);
    const drop = (id: string) => latest.current.data.setRelations((all) => all.filter((item) => item.id !== id));
    add(result); history.record({ label: "建立关系", undo: async () => { await api.deleteRelation(data.subjectId, result.id); drop(result.id); }, redo: async () => { result = await api.createRelation(data.subjectId, { ...input, id: result.id }); add(result); } }); report("已建立关系"); return result;
  });
  const removeRelation = (id: string) => history.run(async () => {
    const item = latest.current.data.relations.find((relation) => relation.id === id); if (!item) return;
    const drop = () => latest.current.data.setRelations((all) => all.filter((relation) => relation.id !== id));
    await api.deleteRelation(data.subjectId, id); drop();
    history.record({ label: "移除关系", undo: async () => { const restored = await api.createRelation(data.subjectId, item); latest.current.data.setRelations((all) => [...all, restored]); }, redo: async () => { await api.deleteRelation(data.subjectId, id); drop(); } }); report("已移除关系 · 可撤销");
  });
  const move = async (id: string, target: { node?: string; stage?: string }) => {
    await latest.current.flush();
    if (target.node && !parentChoices(latest.current.data.nodes, id).some((node) => node.id === target.node)) throw new Error("不能移动到自己或自己的后代下面");
    const stageTarget = target.stage ? stageMoveTarget(id, target.stage, latest.current.data.nodes) : null;
    if (stageTarget && !stageTarget.valid) throw new Error("不能移动到自己的后代阶段下");
    await update(id, target.node ? { parent: target.node, stage: inheritedStage(target.node, latest.current.data.nodes) } : { stage: stageTarget?.stage, parent: stageTarget?.parent });
    report(`已移动至「${target.node ? latest.current.data.nodes.find((node) => node.id === target.node)?.title : latest.current.data.stages.find((stage) => stage.id === target.stage)?.title}」 · 可撤销`);
  };
  return { create, update, remove, facts, relation, removeRelation, move, history };
}

