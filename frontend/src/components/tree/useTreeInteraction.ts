import { useCallback, useMemo, useState } from "react";
import type { TreeHighlight } from "../../lib/tree-interaction";

/** Hover, selection and collapse stay outside scene resolution. */
export function useTreeInteraction(selectedId: string | null, stageFilter: string | null) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const highlight = useMemo<TreeHighlight>(() => ({
    selectedId,
    hoveredId,
    stageFilter,
    collapsedIds,
    expandedIds,
  }), [collapsedIds, expandedIds, hoveredId, selectedId, stageFilter]);
  const hover = useCallback((id: string | null) => {
    setHoveredId((current) => current === id ? current : id);
  }, []);
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return { highlight, hover, toggleCollapsed, toggleExpanded, collapsedCount: collapsedIds.size };
}
