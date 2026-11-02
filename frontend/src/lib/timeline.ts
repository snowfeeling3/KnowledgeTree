export function yearLabel(start?: number | null, end?: number | null): string {
  if (start != null && end != null) return `${start}–${end}`;
  if (start != null) return `${start}`;
  if (end != null) return `${end}`;
  return "";
}

export function stageCount(nodes: ReadonlyArray<{ stage?: string | null }>, stageId: string): number {
  return nodes.reduce((count, node) => count + (node.stage === stageId ? 1 : 0), 0);
}
