import { removeStored } from "../lifecycle/preferences";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { DocumentSaveQueue, type DocumentDraft } from "./DocumentSaveQueue";
import { readPreference, writePreference } from "../panels/PanelState";
export function useDocumentSession(subjectId: string, report: (message: string) => void) {
  const [, redraw] = useState(0), [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [readError, setReadError] = useState("");
  const latestReport = useRef(report); latestReport.current = report;
  const request = useRef(0), reads = useRef(new Map<string, Promise<string>>());
  const queue = useRef<DocumentSaveQueue | null>(null);
  if (!queue.current) queue.current = new DocumentSaveQueue((id, text) => api.writeDocument(subjectId, id, text), () => {
    for (const [id, draft] of queue.current!.drafts) {
      const key = `kt-document-draft:${subjectId}:${id}`;
      if (draft.content !== draft.saved) writePreference(key, { content: draft.content, saved: draft.saved });
      else { try { removeStored(key); } catch { /* in-memory fallback */ } }
    }
    redraw((value) => value + 1);
    const failed = [...queue.current!.drafts.values()].find((draft) => draft.state === "failed");
    if (failed) latestReport.current(`保存失败：${failed.error}。草稿仍保留，请 Ctrl+S 重试。`);
  });
  const open = async (id: string) => {
    const sequence = ++request.current;
    setActiveId(id); setReadError("");
    void queue.current!.flush().catch(() => {});
    if (queue.current!.drafts.has(id)) { setLoading(false); return; }
    setLoading(true);
    try {
      let reading = reads.current.get(id);
      if (!reading) { reading = api.readDocument(subjectId, id); reads.current.set(id, reading); }
      const text = await reading;
      const recovered = readPreference<{ content: string; saved: string } | null>(`kt-document-draft:${subjectId}:${id}`, null);
      queue.current!.seed(id, text);
      if (recovered && recovered.content !== text) {
        if (recovered.saved === text) queue.current!.edit(id, recovered.content);
        else { queue.current!.drafts.set(id, { content: recovered.content, saved: text, state: "failed", error: "已恢复本地草稿；磁盘正文已变化，请检查后按 Ctrl+S 保存" }); latestReport.current("已恢复未保存草稿，请检查后 Ctrl+S 保存"); }
      }
    } catch (error) { if (request.current === sequence) { setReadError(String(error)); latestReport.current(`打开失败：${error}`); } }
    finally { reads.current.delete(id); if (request.current === sequence) setLoading(false); }
  };
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if ([...queue.current!.drafts.values()].some((draft) => draft.content !== draft.saved)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => { window.removeEventListener("beforeunload", guard); void queue.current!.flush().catch(() => {}); };
  }, []);
  const draft: DocumentDraft = activeId && queue.current.drafts.get(activeId) || { content: "", saved: "", state: loading ? "loading" : "saved" };
  return { activeId, draft, loading, readError, open, edit: (text: string) => { if (activeId) queue.current!.edit(activeId, text); }, flush: () => queue.current!.flush(), forget: (id: string) => queue.current!.forget(id), seed: (id: string, text: string) => queue.current!.seed(id, text) };
}
