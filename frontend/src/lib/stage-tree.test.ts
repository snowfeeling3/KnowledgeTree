import { describe, expect, it } from "vitest";
import { resolveBranchGeometry, resolveLeafPlacement } from "./organic-geometry";
import { buildStageTreeLayout } from "./stage-tree";

describe("buildStageTreeLayout", () => {
  it("places the earliest stage at the tree base and newer stages above it", () => {
    const layout = {
      width: 900,
      height: 600,
      nodes: [
        { id: "subject", title: "计算机", type: "concept" as const, x: 0, y: 0, depth: 0 },
        { id: "foundation", title: "计算基础", type: "concept" as const, stage: "foundation", parent: "subject", x: 0, y: 0, depth: 1 },
        { id: "modern", title: "现代 AI", type: "concept" as const, stage: "modern", parent: "subject", x: 0, y: 0, depth: 1 },
        { id: "logic", title: "逻辑门", type: "hardware" as const, stage: "foundation", parent: "foundation", x: 0, y: 0, depth: 2 },
      ],
      edges: [],
    };
    const result = buildStageTreeLayout(layout, [
      { type: "stage", id: "foundation", title: "计算基础", description: "", order: 1, created: "", updated: "" },
      { type: "stage", id: "modern", title: "现代 AI", description: "", order: 2, created: "", updated: "" },
    ]);
    const node = (id: string) => result!.nodes.find((item) => item.id === id)!;
    expect(node("foundation").y).toBeGreaterThan(node("modern").y);
    expect(node("subject").y).toBeGreaterThan(node("foundation").y);
    expect(result!.edges.some((edge) => edge.kind === "timeline" && edge.from === "foundation" && edge.to === "modern")).toBe(true);
  });

  it("grows an ascending trunk and staggers sibling branches", () => {
    const layout = {
      width: 900,
      height: 600,
      nodes: [
        { id: "subject", title: "计算机", type: "concept" as const, x: 0, y: 0, depth: 0 },
        { id: "foundation", title: "计算基础", type: "concept" as const, stage: "foundation", parent: "subject", x: 0, y: 0, depth: 1 },
        { id: "modern", title: "现代 AI", type: "concept" as const, stage: "modern", parent: "subject", x: 0, y: 0, depth: 1 },
        { id: "logic", title: "逻辑门", type: "hardware" as const, stage: "foundation", parent: "foundation", x: 0, y: 0, depth: 2 },
        { id: "memory", title: "存储", type: "hardware" as const, stage: "foundation", parent: "foundation", x: 0, y: 0, depth: 2 },
        { id: "cpu", title: "处理器", type: "hardware" as const, stage: "foundation", parent: "foundation", x: 0, y: 0, depth: 2 },
        { id: "gate", title: "与门", type: "hardware" as const, stage: "foundation", parent: "logic", x: 0, y: 0, depth: 3 },
        { id: "latch", title: "锁存器", type: "hardware" as const, stage: "foundation", parent: "logic", x: 0, y: 0, depth: 3 },
      ],
      edges: [],
    };
    const result = buildStageTreeLayout(layout, [
      { type: "stage", id: "foundation", title: "计算基础", description: "", order: 1, start: 1930, end: 1950, created: "", updated: "" },
      { type: "stage", id: "modern", title: "现代 AI", description: "", order: 2, start: 2010, created: "", updated: "" },
    ])!;
    const node = (id: string) => result.nodes.find((item) => item.id === id)!;
    const rise = node("subject").y - node("modern").y;
    const run = Math.abs(node("modern").x - node("subject").x);
    expect(rise).toBeGreaterThan(run * 1.4);
    expect(node("logic").y).toBeLessThan(node("foundation").y);
    const branches = resolveBranchGeometry(result);
    const primaries = ["logic", "memory", "cpu"].map((id) => branches.find((branch) => branch.toId === id && branch.kind === "parent")!);
    const bases = primaries.map((branch) => `${branch.basePoint.x.toFixed(2)},${branch.basePoint.y.toFixed(2)}`);
    expect(new Set(bases).size).toBe(3);
    for (const branch of primaries) {
      const distance = Math.hypot(branch.basePoint.x - node("foundation").x, branch.basePoint.y - node("foundation").y);
      expect(distance).toBeGreaterThan(8);
      expect(branch.widthBase).toBeGreaterThanOrEqual(7);
      expect(branch.widthBase).toBeLessThanOrEqual(10);
    }
    const angles = primaries.map((branch) => Math.atan2(branch.tipPoint.y - branch.basePoint.y, branch.tipPoint.x - branch.basePoint.x));
    const gaps = [Math.abs(angles[0] - angles[1]), Math.abs(angles[1] - angles[2]), Math.abs(angles[0] - angles[2])];
    expect(Math.min(...gaps)).toBeGreaterThan(0.25);
    const forks = ["gate", "latch"].map((id) => branches.find((branch) => branch.toId === id)!);
    for (const fork of forks) {
      const distance = Math.hypot(fork.basePoint.x - node("logic").x, fork.basePoint.y - node("logic").y);
      expect(distance).toBeGreaterThan(8);
    }
    const trunk = branches.filter((branch) => branch.role === "trunk");
    expect(trunk[0].widthBase).toBeGreaterThan(trunk[0].widthTip);
    expect(trunk[0].widthBase).toBeGreaterThanOrEqual(trunk[trunk.length - 1].widthBase);
    expect(trunk[0].widthBase).toBeGreaterThanOrEqual(14);
    expect(trunk[0].widthBase).toBeLessThanOrEqual(16);
    expect(trunk[trunk.length - 1].widthTip).toBeGreaterThanOrEqual(8);
    expect(trunk[trunk.length - 1].widthTip).toBeLessThan(12);
    const gate = branches.find((branch) => branch.toId === "gate")!;
    const leaves = resolveLeafPlacement(result, branches);
    const leaf = leaves.find((item) => item.nodeId === "gate")!;
    expect(leaf.anchor).toBe(gate.tipPoint);
    expect(leaf.direction).toBe(gate.tipTangent);
    const stem = Math.hypot(leaf.stemEnd.x - leaf.anchor.x, leaf.stemEnd.y - leaf.anchor.y);
    expect(stem).toBeGreaterThan(gate.widthTip + 12);
  });

  it("opens an upper-middle canopy instead of a horizontal band", () => {
    const stageIds = ["s0", "s1", "s2", "s3", "s4"];
    const years = [1900, 1940, 1970, 1995, 2020];
    const nodes = [
      { id: "root", title: "Root", type: "concept" as const, x: 0, y: 0, depth: 0 },
      ...stageIds.map((id) => ({ id, title: id, type: "concept" as const, stage: id, parent: "root", x: 0, y: 0, depth: 1 })),
    ];
    for (const stage of stageIds) {
      for (const name of ["a", "b", "c"]) {
        const id = `${stage}-${name}`;
        nodes.push({ id, title: id, type: "concept" as const, stage, parent: stage, x: 0, y: 0, depth: 2 });
        if (name === "b") {
          nodes.push({ id: `${id}-1`, title: `${id}-1`, type: "concept" as const, stage, parent: id, x: 0, y: 0, depth: 3 });
          nodes.push({ id: `${id}-2`, title: `${id}-2`, type: "concept" as const, stage, parent: id, x: 0, y: 0, depth: 3 });
        }
      }
    }
    const result = buildStageTreeLayout({
      width: 1,
      height: 1,
      nodes,
      edges: [],
    }, stageIds.map((id, index) => ({
      type: "stage",
      id,
      title: id,
      description: "",
      order: index + 1,
      start: years[index],
      created: "",
      updated: "",
    })))!;
    const node = (id: string) => result.nodes.find((item) => item.id === id)!;
    const rise = node("root").y - node("s4").y;
    const run = Math.abs(node("s4").x - node("root").x);
    expect(rise).toBeGreaterThan(run * 1.4);
    const xs = result.nodes.map((item) => item.x);
    const ys = result.nodes.map((item) => item.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(height).toBeGreaterThan(width * 0.8);
    const branches = resolveBranchGeometry(result);
    const primaries = (stage: string) => ["a", "b", "c"].map((name) => branches.find((branch) => branch.toId === `${stage}-${name}`)!);
    for (const stage of stageIds) {
      const group = primaries(stage);
      expect(new Set(group.map((branch) => `${branch.basePoint.x.toFixed(1)},${branch.basePoint.y.toFixed(1)}`)).size).toBe(3);
      const angles = group.map((branch) => Math.atan2(branch.tipPoint.y - branch.basePoint.y, branch.tipPoint.x - branch.basePoint.x));
      const gaps = [Math.abs(angles[0] - angles[1]), Math.abs(angles[1] - angles[2]), Math.abs(angles[0] - angles[2])];
      expect(Math.min(...gaps)).toBeGreaterThan(0.35);
      for (const branch of group) {
        expect(branch.tipPoint.y).toBeLessThan(branch.basePoint.y - 24);
        const chord = Math.atan2(branch.tipPoint.y - branch.basePoint.y, branch.tipPoint.x - branch.basePoint.x);
        expect(chord).toBeLessThan(-0.28);
        expect(chord).toBeGreaterThan(-Math.PI + 0.28);
        expect(Math.hypot(branch.basePoint.x - node(stage).x, branch.basePoint.y - node(stage).y)).toBeGreaterThan(8);
      }
    }
    const spread = (stage: string) => {
      const tips = primaries(stage).map((branch) => branch.tipPoint.x);
      return Math.max(...tips) - Math.min(...tips);
    };
    expect(spread("s2")).toBeGreaterThan(spread("s4"));
    expect(spread("s2")).toBeGreaterThan(spread("s0"));
    const forks = ["s2-b-1", "s2-b-2"].map((id) => branches.find((branch) => branch.toId === id)!);
    for (const fork of forks) {
      expect(Math.hypot(fork.basePoint.x - node("s2-b").x, fork.basePoint.y - node("s2-b").y)).toBeGreaterThan(8);
      expect(fork.tipPoint.y).toBeLessThan(fork.basePoint.y);
    }
  });

});
