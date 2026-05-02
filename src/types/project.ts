export type NodeType =
  | "brief"
  | "prompt"
  | "image_reference"
  | "image_generation"
  | "image_output"
  | "selection_group"
  | "group";

export type EdgeType =
  | "derived_from"
  | "input_to"
  | "generated"
  | "refined_from"
  | "selected_into"
  | "references"
  | "variation_of";

export type Actor = "human" | "agent";

export type NodeStatus = "idle" | "ready" | "running" | "completed" | "error";

export type Position = {
  x: number;
  y: number;
};

export type NodeData = {
  title?: string;
  text?: string;
  status?: NodeStatus;
  imageUrl?: string;
  selected?: boolean;
  model?: string;
  [key: string]: unknown;
};

export type PostliminalNode = {
  id: string;
  type: NodeType;
  position: Position;
  data: NodeData;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
};

export type PostliminalEdge = {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  createdBy: Actor;
  createdAt: string;
};

export type AgentAction = {
  id: string;
  type: string;
  actor: Actor;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ProjectState = {
  projectId: string;
  title: string;
  dna: {
    description?: string;
    style?: string[];
    avoid?: string[];
  };
  nodes: PostliminalNode[];
  edges: PostliminalEdge[];
  selectedNodeIds: string[];
  selectedAssetIds: string[];
  agentActions: AgentAction[];
  updatedAt: string;
};

export type ProjectSummary = {
  projectId: string;
  title: string;
  updatedAt: string;
};

export type CreateNodeInput = {
  type: NodeType;
  position?: Position;
  data?: NodeData;
  createdBy?: Actor;
};

export type UpdateNodePatch = {
  position?: Position;
  data?: Partial<NodeData>;
};

export type CreateBranchInput = {
  sourceNodeIds?: string[];
  promptText?: string;
  createdBy?: Actor;
};

export type CreateGroupInput = {
  title?: string;
  nodeIds?: string[];
  position?: Position;
  createdBy?: Actor;
};
