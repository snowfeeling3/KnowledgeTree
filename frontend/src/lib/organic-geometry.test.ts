import { describe, expect, it } from "vitest";
import { resolveBranchGeometry, resolveLabelPlacement, resolveLeafPlacement } from "./organic-geometry";

describe("organic geometry", () => {
  const layout = {
    width: 700,
    height: 500,
    nodes: [
      { id: "root", title: "Root", type: "concept" as const, x: 40, y: 420, depth: 0 },
      { id: "stage", title: "Stage", type: "concept" as const, stage: "stage", parent: "root", x: 180, y: 360, depth: 1 },
      { id: "branch", title: "Branch", type: "concept" as const, parent: "stage", x: 330, y: 270, depth: 2 },
      { id: "leaf", title: "Leaf", type: "concept" as const, parent: "branch", x: 500, y: 180, depth: 3 },
    ],
    edges: [
      { from: "root", to: "stage", kind: "timeline" },
      { from: "stage", to: "branch", kind: "parent" },
      { from: "branch", to: "leaf", kind: "parent" },
    ],
  };

  it("is deterministic and attaches the leaf to its parent branch tip", () => {
    const firstBranches = resolveBranchGeometry(layout);
    const secondBranches = resolveBranchGeometry(layout);
    const firstLeaves = resolveLeafPlacement(layout, firstBranches);
    const secondLeaves = resolveLeafPlacement(layout, secondBranches);
    const branch = firstBranches.find((item) => item.toId === "leaf" && item.kind === "parent")!;
    const leaf = firstLeaves.find((item) => item.nodeId === "leaf")!;
    expect(leaf.anchor).toBe(branch.tipPoint);
    expect(leaf.direction).toBe(branch.tipTangent);
    expect(leaf.anchor).toEqual(secondLeaves.find((item) => item.nodeId === "leaf")!.anchor);
    expect(leaf.direction).toEqual(secondLeaves.find((item) => item.nodeId === "leaf")!.direction);
    expect(firstBranches.map((item) => item.path)).toEqual(secondBranches.map((item) => item.path));
    expect(resolveLabelPlacement(layout, firstBranches, firstLeaves)).toEqual(resolveLabelPlacement(layout, secondBranches, secondLeaves));
    expect(branch).toEqual(expect.objectContaining({
      depth: 2,
      basePoint: expect.any(Object),
      tipPoint: expect.any(Object),
      baseTangent: expect.any(Object),
      tipTangent: expect.any(Object),
      widthBase: expect.any(Number),
      widthTip: expect.any(Number),
    }));
  });
});
