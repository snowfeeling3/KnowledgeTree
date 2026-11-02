export type NodeType =
  | "concept"
  | "technology"
  | "person"
  | "organization"
  | "algorithm"
  | "hardware"
  | "software"
  | "protocol"
  | "theory"
  | "standard"
  | "event";

export type RelationType =
  | "predecessor"
  | "successor"
  | "derived_from"
  | "inspired_by"
  | "depends_on"
  | "implements"
  | "replaces"
  | "related_to"
  | "contains";

export type NodeStatus = "draft" | "active" | "archived";

export type Subject = {
  type: string;
  format_version: number;
  id: string;
  title: string;
  description: string;
  created: string;
  updated: string;
};

export type Stage = {
  type: string;
  id: string;
  title: string;
  description: string;
  start?: number | null;
  end?: number | null;
  order: number;
  created: string;
  updated: string;
};

export type NodeRecord = {
  id: string;
  title: string;
  type: NodeType;
  stage?: string | null;
  parent?: string | null;
  created: string;
  updated: string;
  status: NodeStatus;
  tags: string[];
  origin?: string | null;
  inventor?: string | null;
  organization?: string | null;
  year?: number | null;
  purpose?: string | null;
  problem?: string | null;
  solution?: string | null;
  references?: string[];
};

export type Relation = {
  id: string;
  from: string;
  to: string;
  type: RelationType;
  note?: string | null;
  created: string;
};

export type LayoutNode = {
  id: string;
  title: string;
  type: NodeType;
  stage?: string | null;
  parent?: string | null;
  x: number;
  y: number;
  depth: number;
};

export type LayoutEdge = {
  from: string;
  to: string;
  kind: string;
  attach?: number;
};

export type GrowthCluster = {
  parentId: string;
  count: number;
  x: number;
  y: number;
};

export type TrunkModel = {
  baseX: number;
  baseY: number;
  rise: number;
  run: number;
  bow: number;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  groupedIds?: string[];
  clusters?: GrowthCluster[];
  trunk?: TrunkModel;
};

export type SearchHit = {
  node_id: string;
  title: string;
  type: NodeType;
  field: string;
  snippet: string;
};

export type NodeSnapshot = { node: NodeRecord; document: string; relations: Relation[] };

export type HistoryEntry = {
  hash: string;
  summary: string;
  committed_at: string;
};

export type History = {
  ready: boolean;
  note: string;
  entries: HistoryEntry[];
};

export type DiffFile = {
  status: string;
  path: string;
};

export type ChangeDiff = {
  hash: string;
  summary: string;
  files: DiffFile[];
  patch: string;
};

export const NODE_STATUSES: Array<[NodeStatus, string]> = [
  ["draft", "草稿"],
  ["active", "现行"],
  ["archived", "归档"],
];

export const NODE_TYPES: Array<[NodeType, string]> = [
  ["concept", "概念"],
  ["technology", "技术"],
  ["person", "人物"],
  ["organization", "组织"],
  ["algorithm", "算法"],
  ["hardware", "硬件"],
  ["software", "软件"],
  ["protocol", "协议"],
  ["theory", "理论"],
  ["standard", "标准"],
  ["event", "事件"],
];

export const RELATION_TYPES: Array<[RelationType, string]> = [
  ["contains", "包含"],
  ["predecessor", "前驱"],
  ["successor", "后继"],
  ["derived_from", "派生自"],
  ["inspired_by", "启发自"],
  ["depends_on", "依赖于"],
  ["implements", "实现"],
  ["replaces", "取代"],
  ["related_to", "相关"],
];

export function labelOf(options: ReadonlyArray<readonly [string, string]>, value: string): string {
  return options.find(([id]) => id === value)?.[1] ?? value;
}
