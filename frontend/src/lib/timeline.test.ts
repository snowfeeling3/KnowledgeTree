import { expect, test } from "vitest";
import { stageCount, yearLabel } from "./timeline";

test("formats open, closed, and negative stage years", () => {
  expect(yearLabel(1945, 1980)).toBe("1945–1980");
  expect(yearLabel(-500, -400)).toBe("-500–-400");
  expect(yearLabel(1971, null)).toBe("1971");
  expect(yearLabel(null, null)).toBe("");
});

test("counts only nodes assigned to the stage", () => {
  expect(stageCount([{ stage: "cpu" }, { stage: null }, { stage: "cpu" }, {}], "cpu")).toBe(2);
});
