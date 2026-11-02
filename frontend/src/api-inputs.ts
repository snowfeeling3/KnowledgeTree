import type { NodeStatus, NodeType, RelationType } from "./types";

export type NewStageInput = {
  title: string;
  id?: string | null;
  description: string;
  start?: number | null;
  end?: number | null;
  order?: number | null;
};

export type UpdateStageInput = {
  title: string;
  description: string;
  start?: number | null;
  end?: number | null;
  order: number;
};

export type NewNodeInput = {
  title: string;
  id?: string | null;
  type: NodeType;
  stage?: string | null;
  parent?: string | null;
  tags: string[];
};

export type UpdateNodeFactsInput = {
  origin?: string | null;
  inventor?: string | null;
  organization?: string | null;
  year?: number | null;
  purpose?: string | null;
  problem?: string | null;
  solution?: string | null;
  references: string[];
};

export type UpdateNodeInput = {
  title: string;
  type: NodeType;
  stage?: string | null;
  parent?: string | null;
  status: NodeStatus;
  tags: string[];
};

export type NewRelationInput = {
  id?: string | null;
  from: string;
  to: string;
  type: RelationType;
  note?: string | null;
};
