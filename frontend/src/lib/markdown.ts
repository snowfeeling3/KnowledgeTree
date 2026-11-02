import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(source: string): string {
  const safe = source.replaceAll("<", "&lt;");
  const parsed = marked.parse(safe, { async: false });
  if (typeof parsed !== "string") {
    throw new Error("Markdown 解析没有返回文本");
  }
  return parsed;
}
