import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
export type DocumentHeading = { id: string; title: string; depth: number; line: number };
type AstNode = { type: string; value?: string; depth?: number; children?: AstNode[]; position?: { start: { line: number } } };
const parser = unified().use(remarkParse).use(remarkGfm);
export function headingId(line: number) { return `md-heading-${line}`; }
export function markdownHeadings(source: string): DocumentHeading[] {
  const root = parser.parse(source) as AstNode;
  const text = (node: AstNode): string => node.value ?? (node.children ?? []).map(text).join("");
  const headings: DocumentHeading[] = [];
  const visit = (node: AstNode) => {
    if (node.type === "heading" && node.position) headings.push({ id: headingId(node.position.start.line), title: text(node), depth: node.depth ?? 1, line: node.position.start.line });
    for (const child of node.children ?? []) visit(child);
  };
  visit(root); return headings;
}
export function wrapMarkdown(source: string, start: number, end: number, before: string, after = "") {
  return { content: source.slice(0, start) + before + source.slice(start, end) + after + source.slice(end), start: start + before.length, end: end + before.length };
}
