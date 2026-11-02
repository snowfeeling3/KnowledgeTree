import { expect, test } from "vitest";
import { buildForest, parentChoices } from "./forest";
import type { NodeRecord } from "../types";

function node(id: string, title: string, parent?: string): NodeRecord {
  return {
    id,
    title,
    type: "concept",
    parent: parent ?? null,
    created: "2026-09-29T00:00:00Z",
    updated: "2026-09-29T00:00:00Z",
    status: "active",
    tags: [],
  };
}

test("nests children and keeps a missing parent visible", () => {
  const forest = buildForest([
    node("cpu", "CPU", "org"),
    node("org", "计算机组成"),
    node("alu", "ALU", "cpu"),
    node("lost", "孤立", "missing"),
  ]);
  expect(forest.map((item) => item.id).sort()).toEqual(["lost", "org"]);
  expect(forest.find((item) => item.id === "org")?.children[0]?.children[0]?.id).toBe("alu");
});

test("a parent cycle does not recurse forever", () => {
  const forest = buildForest([node("a", "A", "b"), node("b", "B", "a")]);
  expect(forest).toHaveLength(2);
});

test("parent choices exclude a node and everything under it", () => {
  const nodes = [
    node("org", "计算机组成"),
    node("cpu", "CPU", "org"),
    node("alu", "ALU", "cpu"),
    node("reg", "Register", "cpu"),
  ];
  expect(parentChoices(nodes, "cpu").map((item) => item.id)).toEqual(["org"]);
  expect(parentChoices(nodes, "alu").map((item) => item.id).sort()).toEqual(["cpu", "org", "reg"]);
});

test("parent choices stay in title order and skip a parent cycle", () => {
  expect(
    parentChoices(
      [node("b", "乙"), node("a", "甲"), node("self", "己", "a")],
      "self",
    ).map((item) => item.title),
  ).toEqual(["甲", "乙"]);
  expect(
    parentChoices(
      [node("b", "乙", "a"), node("a", "甲", "b"), node("c", "丙")],
      "a",
    ).map((item) => item.id),
  ).toEqual(["c"]);
});
