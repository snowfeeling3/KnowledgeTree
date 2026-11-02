import { stageCount, yearLabel } from "../lib/timeline";
import type { NodeRecord, Stage } from "../types";

type Props = {
  stages: Stage[];
  nodes: NodeRecord[];
  stageFilter: string | null;
  onFilterStage: (id: string | null) => void;
};

export function Timeline({ stages, nodes, stageFilter, onFilterStage }: Props) {
  return (
    <div className="timeline" role="listbox" aria-label="阶段时间线">
      <button type="button" className={stageFilter === null ? "is-active" : ""} aria-pressed={stageFilter === null} onClick={() => onFilterStage(null)}>
        <strong>全部阶段</strong>
        <small>{nodes.length} 个节点</small>
      </button>
      {stages.map((stage) => {
        const label = yearLabel(stage.start, stage.end);
        const active = stageFilter === stage.id;
        return (
          <button
            key={stage.id}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            title={stage.description || stage.title}
            onClick={() => onFilterStage(active ? null : stage.id)}
          >
            <strong>{stage.title}</strong>
            <small>{label || "年份未定"} · {stageCount(nodes, stage.id)} 个节点</small>
          </button>
        );
      })}
      {stages.length === 0 && <p className="muted">阶段会按顺序和年份排成时间线。</p>}
    </div>
  );
}
