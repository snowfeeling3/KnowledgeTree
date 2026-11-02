import { invoke } from "@tauri-apps/api/core";
import { trackWrite } from "./lifecycle/saving";
import type { NewNodeInput, NewRelationInput, NewStageInput, UpdateNodeFactsInput, UpdateNodeInput, UpdateStageInput } from "./api-inputs";
import type { ChangeDiff, History, NodeRecord, NodeSnapshot, Relation, SearchHit, Stage, Subject, TreeLayout } from "./types";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new Error("当前不是桌面端。请在仓库根目录运行 pnpm dev。");
  }
  const task = invoke<T>(command, args);
  return /^(create_|update_|delete_|restore_|write_)/.test(command) ? trackWrite(task) : task;
}

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

export const api = {
  libraryRoot: () => call<string>("library_root"),
  listSubjects: () => call<Subject[]>("list_subjects"),
  createSubject: (title: string, description: string, id: string) =>
    call<Subject>("create_subject", { title, description, id: id.trim() || null }),
  listStages: (subjectId: string) => call<Stage[]>("list_stages", { subjectId }),
  createStage: (subjectId: string, stage: NewStageInput) => call<Stage>("create_stage", { subjectId, stage }),
  updateStage: (subjectId: string, stageId: string, stage: UpdateStageInput) =>
    call<Stage>("update_stage", { subjectId, stageId, stage }),
  deleteStage: (subjectId: string, stageId: string) => call<void>("delete_stage", { subjectId, stageId }),
  listNodes: (subjectId: string) => call<NodeRecord[]>("list_nodes", { subjectId }),
  createNode: (subjectId: string, node: NewNodeInput) => call<NodeRecord>("create_node", { subjectId, node }),
  updateNode: (subjectId: string, nodeId: string, node: UpdateNodeInput) =>
    call<NodeRecord>("update_node", { subjectId, nodeId, node }),
  updateNodeFacts: (subjectId: string, nodeId: string, facts: UpdateNodeFactsInput) =>
    call<NodeRecord>("update_node_facts", { subjectId, nodeId, facts }),
  deleteNode: (subjectId: string, nodeId: string) => call<void>("delete_node", { subjectId, nodeId }),
  deleteNodeUndoable: (subjectId: string, nodeId: string) => call<NodeSnapshot>("delete_node_undoable", { subjectId, nodeId }),
  restoreNode: (subjectId: string, snapshot: NodeSnapshot) => call<NodeRecord>("restore_node", { subjectId, snapshot }),
  listRelations: (subjectId: string) => call<Relation[]>("list_relations", { subjectId }),
  createRelation: (subjectId: string, relation: NewRelationInput) =>
    call<Relation>("create_relation", { subjectId, relation }),
  deleteRelation: (subjectId: string, relationId: string) =>
    call<void>("delete_relation", { subjectId, relationId }),
  readDocument: (subjectId: string, nodeId: string) => call<string>("read_document", { subjectId, nodeId }),
  writeDocument: (subjectId: string, nodeId: string, content: string) =>
    call<void>("write_document", { subjectId, nodeId, content }),
  searchNodes: (subjectId: string, query: string) => call<SearchHit[]>("search_nodes", { subjectId, query }),
  layoutSubject: (subjectId: string) => call<TreeLayout>("layout_subject", { subjectId }),
  subjectHistory: (subjectId: string, limit = 30) => call<History>("subject_history", { subjectId, limit }),
  subjectDiff: (subjectId: string, hash: string) => call<ChangeDiff>("subject_diff", { subjectId, hash }),
};
