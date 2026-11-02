import { expect, test } from "vitest";
import { renderMarkdown } from "./markdown";

test("renders headings and neutralizes raw html", () => {
  expect(renderMarkdown("# CPU")).toContain("<h1");
  expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script>");
  expect(renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |")).toContain("<table");
});
