import type { NodeRecord } from "../types";
import { parentChoices } from "../lib/forest";
/** The same target resolution drives the preview and the eventual mutation. */
export function stageMoveTarget(id: string, stage: string, nodes: NodeRecord[]) {
  const root = nodes.find((node) => node.stage === stage && (!node.parent || nodes.find((parent) => parent.id === node.parent)?.stage !== stage));
  const parent = root?.id === id ? root.parent ?? null : root?.id ?? null;
  return { stage, parent, valid: !parent || parentChoices(nodes, id).some((node) => node.id === parent) };
}
