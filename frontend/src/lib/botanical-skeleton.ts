import { cubicPoint, cubicTangent, taperedBody, type Cubic, type Point } from "./organic-geometry";
import type { BranchGeometry, SceneBounds } from "./tree-scene";

export type BotanicalSlot = Readonly<{
  id: string;
  parentId: string;
  level: 1 | 2 | 3;
  point: Point;
  curve: Cubic;
  side: number;
  sector: number;
}>;
export type BotanicalSkeleton = Readonly<{
  branches: readonly BranchGeometry[];
  slots: readonly BotanicalSlot[];
  sectors: readonly SceneBounds[];
  bounds: SceneBounds;
  root: Point;
  leaves: readonly { path: string; anchorId: string }[];
}>;

const p = (x: number, y: number): Point => Object.freeze({ x, y });
const bounds = (left: number, top: number, right: number, bottom: number): SceneBounds =>
  Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top });

/** Art-directed, disjoint crown chambers. No recursive data expansion is allowed. */
const CHAMBERS = [
  { side: -1, base: 0.22, tip: p(240, 625), box: bounds(105, 560, 500, 805) },
  { side: 1, base: 0.37, tip: p(935, 535), box: bounds(630, 465, 1070, 735) },
  { side: -1, base: 0.52, tip: p(185, 355), box: bounds(25, 290, 500, 550) },
  { side: 1, base: 0.68, tip: p(975, 265), box: bounds(630, 220, 1110, 435) },
  { side: 0, base: 1, tip: p(548, 60), box: bounds(380, 5, 760, 210) },
] as const;

export function botanicalSkeletonLayout(weights: readonly number[] = []): BotanicalSkeleton {
  const trunk: Cubic = { p0: p(560, 1010), p1: p(539, 765), p2: p(589, 490), p3: p(567, 275) };
  const branches: BranchGeometry[] = [wood("trunk", "subject", "crown", trunk, "trunk", 30, 9)];
  const slots: BotanicalSlot[] = [];
  const leaves: { path: string; anchorId: string }[] = [];
  const maxWeight = Math.max(1, ...weights);

  CHAMBERS.forEach((chamber, sector) => {
    // Bounded growth inside reserved chambers: larger groups get longer limbs.
    const growth = weights[sector] ? 0.88 + 0.12 * Math.sqrt(weights[sector] / maxWeight) : 0.91;
    const start = cubicPoint(trunk, chamber.base);
    const tip = p(start.x + (chamber.tip.x - start.x) * growth, chamber.tip.y);
    const curve: Cubic = {
      p0: start,
      p1: p(start.x + chamber.side * 45, start.y - 110),
      p2: p(tip.x - chamber.side * 45, tip.y + 110),
      p3: tip,
    };
    const id = `limb-${sector}`;
    slots.push(Object.freeze({ id, parentId: "subject", level: 1, curve, point: cubicPoint(curve, 0.36), side: chamber.side, sector }));
    branches.push(wood(id, "subject", id, curve, "primary", 10.5, 2.6));
    leaves.push({ path: leafPath(tip, chamber.side || -1, 27), anchorId: id });

    for (let index = 0; index < 4; index += 1) {
      // Different stations, never a fan at one junction; the limb extends first.
      const station = 0.35 + index * 0.17;
      const origin = cubicPoint(curve, station);
      const side = chamber.side || (index % 2 ? 1 : -1);
      const spread = [22, 62, 104, 78][index] * growth;
      const lift = [123, 108, 53, 80][index];
      const end = chamber.side
        ? p(Math.max(chamber.box.left + 48, Math.min(chamber.box.right - 48, origin.x + side * spread)), Math.max(chamber.box.top + 42, origin.y - lift))
        : p(origin.x + side * [80, 110, 125, 80][index], Math.max(50, origin.y - 40));
      const secondary: Cubic = { p0: origin, p1: p(origin.x + side * (index % 2 ? 35 : 10), origin.y - 28), p2: p(end.x - side * 12, end.y + 34), p3: end };
      const childId = `${id}-b${index}`;
      slots.push(Object.freeze({ id: childId, parentId: id, level: 2, curve: secondary, point: end, side, sector }));
      branches.push(wood(childId, id, childId, secondary, "secondary", 4.4, 1.5));
      leaves.push({ path: leafPath(end, side, 21), anchorId: childId });
      for (let twig = 0; twig < 3; twig += 1) {
        const attach = cubicPoint(secondary, 0.37 + twig * 0.24);
        const tip = p(attach.x + side * (26 + twig * 5), attach.y - 26 - twig * 5);
        const fine: Cubic = { p0: attach, p1: p(attach.x + side * 14, attach.y - 5), p2: p(tip.x - side * 5, tip.y + 9), p3: tip };
        const twigId = `${childId}-t${twig}`;
        slots.push(Object.freeze({ id: twigId, parentId: childId, level: 3, curve: fine, point: tip, side, sector }));
        branches.push(wood(twigId, childId, twigId, fine, "twig", 1.8, 0.65));
      }
    }
  });
  return Object.freeze({
    branches: Object.freeze(branches), slots: Object.freeze(slots), leaves: Object.freeze(leaves),
    root: trunk.p0, sectors: Object.freeze(CHAMBERS.map((item) => item.box)), bounds: bounds(-15, -30, 1150, 1110),
  });
}

function wood(id: string, fromId: string, toId: string, curve: Cubic, role: BranchGeometry["role"], widthBase: number, widthTip: number): BranchGeometry {
  const path = `M ${curve.p0.x} ${curve.p0.y} C ${curve.p1.x} ${curve.p1.y}, ${curve.p2.x} ${curve.p2.y}, ${curve.p3.x} ${curve.p3.y}`;
  return Object.freeze({ id, fromId, toId, kind: "botanical", role, path, bodyPath: taperedBody(curve, widthBase, widthTip),
    basePoint: curve.p0, tipPoint: curve.p3, baseTangent: cubicTangent(curve, 0), tipTangent: cubicTangent(curve, 1),
    widthBase, widthTip, depth: role === "trunk" ? 0 : role === "primary" ? 1 : role === "secondary" ? 2 : 3 });
}

function leafPath(origin: Point, side: number, size: number): string {
  const tip = p(origin.x + side * size * 0.72, origin.y - size);
  return `M ${origin.x} ${origin.y} Q ${origin.x - side * 5} ${origin.y - size} ${tip.x} ${tip.y} Q ${origin.x + side * size} ${origin.y - 3} ${origin.x} ${origin.y} Z`;
}
