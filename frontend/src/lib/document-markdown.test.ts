import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "../components/MarkdownContent";
import { markdownHeadings, wrapMarkdown } from "./document-markdown";
import { normalizeWorkspacePreferences } from "../panels/PanelState";
describe("Markdown learning workspace", () => {
  it("uses parsed headings, including setext headings, ignoring fenced code", () => {
    const source = '# 标题\n\n```md\n## 不是标题\n```\n\n小节\n----\n\n## **重点**';
    expect(markdownHeadings(source).map(h => [h.title, h.line])).toEqual([["标题", 1], ["小节", 7], ["重点", 10]]);
    const html = renderToStaticMarkup(createElement(MarkdownContent, { content: source }));
    expect(html).toContain('id="md-heading-7"'); expect(html).toContain('id="md-heading-10"');
  });
  it("renders tables and tasks without executing HTML or unsafe URLs", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { content: '| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] 已复习\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert%281%29)' }));
    expect(html).toContain('<table>'); expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('href="javascript:');
  });
  it("preserves the selected text when inserting formatting", () => {
    expect(wrapMarkdown('abc 内容 xyz', 4, 6, '**', '**')).toEqual({ content: 'abc **内容** xyz', start: 6, end: 8 });
  });
  it("migrates old panel settings to a permanent document without losing the selected note", () => {
    expect(normalizeWorkspacePreferences({ left: 'closed', right: 'peek', selected: 'cpu', leftWidth: 9999 })).toMatchObject({ right: 'open', tree: 'closed', selected: 'cpu', left: 'closed', leftWidth: 460, focusRegion: null });
    expect(normalizeWorkspacePreferences({ treeWidth: -100 })).toMatchObject({ treeWidth: 280 });
  });
});
