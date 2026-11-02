export type SemanticRank = "root" | "stage" | "domain" | "topic" | "technology" | "concept";

export type TrunkModel = Readonly<{
  baseX: number;
  baseY: number;
  rise: number;
  run: number;
  bow: number;
}>;

/**
 * Spatial rules live here so layout, geometry and labels share one contract.
 * Widths are fixed. Distances below are minimums; collision may only add space.
 */
export const DENSITY = Object.freeze({
  width: Object.freeze({
    trunkBase: 16,
    trunkMid: 12,
    trunkTip: 8,
    primary: 7,
    secondary: 4.5,
    twig: 2.2,
    leafStem: 1.2,
    relation: 1.2,
  }),
  spacing: Object.freeze({
    stageMin: 120,
    primary: 90,
    secondary: 48,
    leaf: 28,
    label: 22,
  }),
  stage: Object.freeze({
    base: 90,
    scale: 16,
  }),
  length: Object.freeze({
    primary: 110,
    primaryScale: 22,
    secondary: 60,
    secondaryScale: 14,
    twig: 28,
    twigScale: 8,
  }),
  collision: Object.freeze({
    x: 24,
    y: 32,
  }),
  leaf: Object.freeze({
    stemLength: 36,
  }),
  visibleChildCap: 5,
  visibleChildHard: 7,
  labelGap: 22,
  labelBudget: Object.freeze({
    far: 18,
    medium: 30,
    near: 55,
  }),
  lod: Object.freeze({
    far: 0.45,
    medium: 0.75,
    near: 1.1,
  }),
  opening: Object.freeze({
    crowdedNodes: 48,
    maxScaleGap: 0.02,
    fitMinScale: 0.28,
    fitMaxScale: 1.15,
  }),
});

export const LABEL_PRIORITY: Readonly<Record<SemanticRank, number>> = Object.freeze({
  root: 110,
  stage: 100,
  domain: 80,
  topic: 60,
  technology: 40,
  concept: 20,
});

export function openingScaleCap(nodeCount: number): number {
  if (nodeCount >= DENSITY.opening.crowdedNodes) return DENSITY.lod.far - DENSITY.opening.maxScaleGap;
  return DENSITY.opening.fitMaxScale;
}

export function semanticRank(depth: number, childCount: number): SemanticRank {
  if (depth <= 0) return "root";
  if (depth === 1) return "stage";
  if (depth === 2) return "domain";
  if (depth === 3) return "topic";
  if (childCount > 0) return "technology";
  return "concept";
}

/** Trunk tapers 16 → 12 → 8. Midpoint of the parameter is exactly 12. */
export function trunkWidthAt(progress: number): number {
  const time = Math.min(1, Math.max(0, progress));
  return DENSITY.width.trunkBase + (DENSITY.width.trunkTip - DENSITY.width.trunkBase) * time;
}

export function stageSpacing(descendantCount: number): number {
  const grown = DENSITY.stage.base + DENSITY.stage.scale * Math.sqrt(Math.max(0, descendantCount));
  return Math.max(DENSITY.spacing.stageMin, grown);
}

export function branchLength(depth: number, descendantCount: number, _crown = 1, jitter = 0): number {
  const span = Math.sqrt(Math.max(0, descendantCount));
  const length = depth <= 2
    ? DENSITY.length.primary + DENSITY.length.primaryScale * span
    : depth === 3
      ? DENSITY.length.secondary + DENSITY.length.secondaryScale * span
      : DENSITY.length.twig + DENSITY.length.twigScale * span;
  return length + jitter;
}

export function spacingForDepth(depth: number): number {
  if (depth <= 2) return DENSITY.spacing.primary;
  if (depth === 3) return DENSITY.spacing.secondary;
  return DENSITY.spacing.leaf;
}

/** Show every child up to the hard cap. Larger sets collapse to the soft cap plus +N. */
export function visibleChildLimit(count: number): number {
  if (count <= DENSITY.visibleChildHard) return count;
  return DENSITY.visibleChildCap;
}

export function labelBudgetForLod(lod: "overview" | "structure" | "technology" | "detail"): number {
  if (lod === "overview") return DENSITY.labelBudget.far;
  if (lod === "detail") return DENSITY.labelBudget.near;
  return DENSITY.labelBudget.medium;
}

/**
 * Stations are pixel distances along an ascending trunk.
 * Extra is collision growth and is never folded back into a fixed height.
 */
export function trunkStations(descendantCounts: readonly number[], extraGaps: readonly number[] = []): { model: TrunkModel; progress: number[] } {
  const lead = 170;
  const tail = 120;
  const stations = [lead];
  for (let index = 1; index < descendantCounts.length; index += 1) {
    const gap = Math.max(stageSpacing(descendantCounts[index - 1]), stageSpacing(descendantCounts[index])) + Math.max(0, extraGaps[index] ?? 0);
    stations.push(stations[stations.length - 1] + gap);
  }
  const rise = Math.max(lead + tail, (stations[stations.length - 1] ?? lead) + tail);
  const run = Math.min(360, rise * 0.22);
  const bow = Math.min(42, rise * 0.035);
  return {
    model: Object.freeze({
      baseX: 520,
      baseY: 260 + rise,
      rise,
      run,
      bow,
    }),
    progress: stations.map((distance) => distance / rise),
  };
}
