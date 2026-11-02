import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { History, NodeRecord, Relation, Stage, TreeLayout } from "../types";
export function useWorkspaceData(subjectId: string) {
  const [nodes, setNodes] = useState<NodeRecord[]>([]), [stages, setStages] = useState<Stage[]>([]), [relations, setRelations] = useState<Relation[]>([]);
  const [layout, setLayout] = useState<TreeLayout | null>(null), [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const structure = useCallback(async () => {
    const [nextNodes, nextLayout, nextRelations] = await Promise.all([api.listNodes(subjectId), api.layoutSubject(subjectId), api.listRelations(subjectId)]);
    setNodes(nextNodes); setLayout(nextLayout); setRelations(nextRelations);
  }, [subjectId]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const nextStages = await api.listStages(subjectId); await structure(); setStages(nextStages); }
    catch (caught) { setError(String(caught)); }
    finally { setLoading(false); }
  }, [structure, subjectId]);
  useEffect(() => { void load(); }, [load]);
  const patchNode = useCallback((node: NodeRecord) => setNodes((current) => current.map((item) => item.id === node.id ? node : item)), []);
  const loadHistory = async () => { const next = await api.subjectHistory(subjectId, 30); setHistory(next); };
  return { subjectId, nodes, stages, relations, layout, history, loading, error, load, structure, patchNode, setStages, setRelations, loadHistory };
}
export type WorkspaceData = ReturnType<typeof useWorkspaceData>;
