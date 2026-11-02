import type { NodeRecord } from "../types";

export function factLines(node: NodeRecord): Array<[string, string]> {
  const lines: Array<[string, string]> = [];
  const add = (label: string, value?: string | null) => {
    const text = value?.trim();
    if (text) lines.push([label, text]);
  };
  add("来源", node.origin);
  add("发明者", node.inventor);
  add("组织", node.organization);
  if (node.year != null) lines.push(["年份", String(node.year)]);
  add("目的", node.purpose);
  add("问题", node.problem);
  add("方案", node.solution);
  const references = (node.references ?? []).map((item) => item.trim()).filter(Boolean);
  if (references.length > 0) lines.push(["引用", references.join("；")]);
  return lines;
}
