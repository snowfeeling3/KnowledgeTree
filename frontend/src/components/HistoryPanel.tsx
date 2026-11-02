import { useState } from "react";
import { api, errorText } from "../api";
import type { ChangeDiff, History } from "../types";

type Props = {
  subjectId: string;
  history: History | null;
  onClose: () => void;
  onStatus: (message: string) => void;
};

export function HistoryPanel({ subjectId, history, onClose, onStatus }: Props) {
  const [diff, setDiff] = useState<ChangeDiff | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function openDiff(hash: string) {
    try {
      const next = await api.subjectDiff(subjectId, hash);
      setSelected(hash);
      setDiff(next);
    } catch (error) {
      onStatus(errorText(error));
    }
  }

  return (
    <aside className="history-panel" aria-label="知识历史">
      <div className="history-head">
        <strong>知识历史</strong>
        <button type="button" className="ghost" onClick={onClose}>关闭</button>
      </div>
      {history?.note && <p className="muted">{history.note}</p>}
      {!history && <p className="muted">正在读取历史。</p>}
      {history && history.entries.length === 0 && <p className="muted">还没有提交。</p>}
      <div className="history-list">
        {history?.entries.map((entry) => (
          <button key={entry.hash} type="button" className={selected === entry.hash ? "row is-active" : "row"} onClick={() => { void openDiff(entry.hash); }}>
            <span>{entry.summary}</span>
            <small>{shortWhen(entry.committed_at)}</small>
          </button>
        ))}
      </div>
      {diff && (
        <div className="history-diff">
          <p>{diff.summary}</p>
          <ul>
            {diff.files.map((file) => (
              <li key={`${file.status}-${file.path}`}><code>{file.status}</code> {file.path}</li>
            ))}
          </ul>
          <pre>{diff.patch || "这次提交没有文本差异。"}</pre>
        </div>
      )}
    </aside>
  );
}

function shortWhen(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
