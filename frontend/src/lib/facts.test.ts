import { expect, test } from "vitest";
import { factLines } from "./facts";
import type { NodeRecord } from "../types";

test("lists filled facts and skips blanks", () => {
  const node: NodeRecord = {
    id: "cpu",
    title: "CPU",
    type: "hardware",
    created: "2026-09-29T00:00:00Z",
    updated: "2026-09-29T00:00:00Z",
    status: "active",
    tags: [],
    inventor: " Engineering ",
    year: 1971,
    origin: " ",
    references: ["Intel 4004", ""],
  };
  expect(factLines(node)).toEqual([
    ["发明者", "Engineering"],
    ["年份", "1971"],
    ["引用", "Intel 4004"],
  ]);
});
