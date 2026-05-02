"use client";

import { create } from "zustand";
import { createId } from "@/lib/id";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption } from "@/lib/imageModels";
import { defaultNodeData, mockOutputGradient } from "@/lib/nodeDefaults";
import type {
  Actor,
  AgentAction,
  CreateBranchInput,
  CreateGroupInput,
  CreateNodeInput,
  EdgeType,
  NodeData,
  Position,
  PostliminalEdge,
  PostliminalNode,
  ProjectSummary,
  ProjectState,
  UpdateNodePatch,
} from "@/types/project";

const PROJECT_STORAGE_KEY = "postliminal.project.v1";
const PROJECTS_STORAGE_KEY = "postliminal.projects.v1";
const ACTIVE_PROJECT_STORAGE_KEY = "postliminal.activeProjectId.v1";
const DEFAULT_PROJECT_ID = "postliminal";
const DEFAULT_PROJECT_TITLE = "AI Fund Hero Study";

const now = () => new Date().toISOString();

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function createEmptyProject(
  title = DEFAULT_PROJECT_TITLE,
  projectId = DEFAULT_PROJECT_ID,
): ProjectState {
  return {
    projectId,
    title,
    dna: {},
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    selectedAssetIds: [],
    agentActions: [],
    updatedAt: now(),
  };
}

function appendActivity(
  project: ProjectState,
  type: string,
  actor: Actor,
  payload: Record<string, unknown> = {},
): ProjectState {
  const createdAt = now();
  const action: AgentAction = {
    id: createId("action"),
    type,
    actor,
    payload,
    createdAt,
  };

  return {
    ...project,
    agentActions: [...project.agentActions, action].slice(-240),
    updatedAt: createdAt,
  };
}

function projectSummary(project: ProjectState): ProjectSummary {
  return {
    projectId: project.projectId,
    title: project.title,
    updatedAt: project.updatedAt,
  };
}

function upsertProjectSummary(
  summaries: ProjectSummary[],
  project: ProjectState,
) {
  return [
    projectSummary(project),
    ...summaries.filter((item) => item.projectId !== project.projectId),
  ];
}

function edgeTone(type: EdgeType) {
  const promptEdges: EdgeType[] = ["derived_from", "input_to"];
  return promptEdges.includes(type) ? "prompt" : "image";
}

function edgeSourceHandle(type: EdgeType) {
  return edgeTone(type) === "prompt" ? "prompt-out" : "image-out";
}

function edgeTargetHandle(type: EdgeType) {
  return edgeTone(type) === "prompt" ? "prompt-in" : "image-in";
}

function dedupeConnectorEdges(edges: PostliminalEdge[]) {
  const usedSources = new Set<string>();
  const usedTargets = new Set<string>();
  const deduped: PostliminalEdge[] = [];

  edges.forEach((edge) => {
    const sourceKey = `${edge.source}:${edgeSourceHandle(edge.type)}`;
    const targetKey = `${edge.target}:${edgeTargetHandle(edge.type)}`;
    if (usedSources.has(sourceKey) || usedTargets.has(targetKey)) return;

    usedSources.add(sourceKey);
    usedTargets.add(targetKey);
    deduped.push(edge);
  });

  return deduped;
}

function readStoredProjects(): ProjectState[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(parseProject) : [];
  } catch {
    return [];
  }
}

function persistProject(project: ProjectState) {
  if (!canUseStorage()) return;
  const storedProjects = readStoredProjects();
  const projects = [
    project,
    ...storedProjects.filter((item) => item.projectId !== project.projectId),
  ];

  window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.projectId);
}

function parseProject(json: string | ProjectState): ProjectState {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid project JSON");
  }

  const fallback = createEmptyProject();
  const project = parsed as Partial<ProjectState>;

  return {
    projectId: project.projectId ?? fallback.projectId,
    title:
      project.title === "Postliminal" || project.title === "postliminal"
        ? DEFAULT_PROJECT_TITLE
        : project.title ?? DEFAULT_PROJECT_TITLE,
    dna: project.dna ?? {},
    nodes: Array.isArray(project.nodes) ? project.nodes : [],
    edges: Array.isArray(project.edges) ? dedupeConnectorEdges(project.edges) : [],
    selectedNodeIds: Array.isArray(project.selectedNodeIds)
      ? project.selectedNodeIds
      : [],
    selectedAssetIds: Array.isArray(project.selectedAssetIds)
      ? project.selectedAssetIds
      : [],
    agentActions: Array.isArray(project.agentActions)
      ? project.agentActions
      : [],
    updatedAt: project.updatedAt ?? now(),
  };
}

function getNodeTitle(node?: PostliminalNode) {
  return String(node?.data.title ?? node?.type ?? "node");
}

function operationPayloadForNode(node: PostliminalNode) {
  return {
    nodeId: node.id,
    nodeType: node.type,
    title: node.data.title ?? null,
  };
}

function cloneProject(project: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(project)) as ProjectState;
}

type ProjectStore = {
  project: ProjectState;
  projects: ProjectSummary[];
  activeProjectId: string;
  hasHydrated: boolean;
  undoStack: ProjectState[];
  redoStack: ProjectState[];
  canUndo: boolean;
  canRedo: boolean;
  hydrateProject: () => void;
  createProject: (title: string) => ProjectState;
  switchProject: (projectId: string) => void;
  undo: () => void;
  redo: () => void;
  createNode: (input: CreateNodeInput) => PostliminalNode;
  updateNode: (nodeId: string, patch: UpdateNodePatch, actor?: Actor) => void;
  deleteNode: (nodeId: string, actor?: Actor) => void;
  connectNodes: (
    sourceId: string,
    targetId: string,
    type: EdgeType,
    createdBy?: Actor,
  ) => PostliminalEdge | undefined;
  disconnectNodes: (edgeId: string, actor?: Actor) => void;
  moveNode: (nodeId: string, position: Position, actor?: Actor) => void;
  selectNode: (nodeId: string, actor?: Actor) => void;
  selectNodes: (nodeIds: string[], actor?: Actor) => void;
  clearSelection: (actor?: Actor) => void;
  toggleImageSelected: (nodeId: string, actor?: Actor) => void;
  createBranch: (input: CreateBranchInput) => void;
  createGroup: (input: CreateGroupInput) => PostliminalNode | undefined;
  autoLayout: (actor?: Actor) => void;
  resetProject: () => void;
  loadProject: (json: string | ProjectState) => void;
  exportProject: () => string;
  createMockOutputs: (generationNodeId: string, actor?: Actor) => void;
  createImageOutputs: (
    generationNodeId: string,
    imageUrls: string[],
    actor?: Actor,
    metadata?: NodeData,
  ) => void;
};

export const useProjectStore = create<ProjectStore>()((set, get) => {
  const commit = (
    project: ProjectState,
    type: string,
    actor: Actor,
    payload: Record<string, unknown> = {},
    options: { history?: boolean } = {},
  ) => {
    const shouldTrackHistory = options.history ?? true;
    const undoStack = shouldTrackHistory
      ? [...get().undoStack, cloneProject(get().project)].slice(-80)
      : get().undoStack;
    const redoStack = shouldTrackHistory ? [] : get().redoStack;
    const committed = appendActivity(project, type, actor, payload);
    set({
      project: committed,
      projects: upsertProjectSummary(get().projects, committed),
      activeProjectId: committed.projectId,
      undoStack,
      redoStack,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    });
    persistProject(committed);
    return committed;
  };

  const recordActivity = (
    type: string,
    actor: Actor,
    payload: Record<string, unknown> = {},
  ) => {
    const committed = appendActivity(get().project, type, actor, payload);
    set({
      project: committed,
      projects: upsertProjectSummary(get().projects, committed),
      activeProjectId: committed.projectId,
    });
    persistProject(committed);
  };

  return {
    project: createEmptyProject(),
    projects: [projectSummary(createEmptyProject())],
    activeProjectId: DEFAULT_PROJECT_ID,
    hasHydrated: false,
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,

    hydrateProject: () => {
      if (!canUseStorage() || get().hasHydrated) {
        set({ hasHydrated: true });
        return;
      }

      const storedProjects = readStoredProjects();
      const activeProjectId = window.localStorage.getItem(
        ACTIVE_PROJECT_STORAGE_KEY,
      );
      const storedProject = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      let projects = storedProjects;
      let project =
        projects.find((item) => item.projectId === activeProjectId) ??
        projects[0] ??
        get().project;

      if (projects.length === 0 && storedProject) {
        try {
          project = parseProject(storedProject);
          projects = [project];
        } catch {
          project = createEmptyProject();
          projects = [project];
        }
      }

      if (projects.length === 0) {
        projects = [project];
      }

      persistProject(project);
      set({
        project,
        projects: projects.map(projectSummary),
        activeProjectId: project.projectId,
        hasHydrated: true,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
    },

    createProject: (title) => {
      const project = appendActivity(
        createEmptyProject(title.trim() || "untitled", createId("project")),
        "create_project",
        "human",
      );
      persistProject(project);
      set({
        project,
        projects: readStoredProjects().map(projectSummary),
        activeProjectId: project.projectId,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
      return project;
    },

    switchProject: (projectId) => {
      const project = readStoredProjects().find(
        (item) => item.projectId === projectId,
      );
      if (!project) return;

      if (canUseStorage()) {
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
      }

      set({
        project,
        projects: readStoredProjects().map(projectSummary),
        activeProjectId: project.projectId,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
    },

    undo: () => {
      const { undoStack, redoStack, project, projects } = get();
      const previous = undoStack[undoStack.length - 1];
      if (!previous) return;

      const nextUndoStack = undoStack.slice(0, -1);
      const nextRedoStack = [cloneProject(project), ...redoStack].slice(0, 80);
      const restored = cloneProject(previous);

      set({
        project: restored,
        projects: upsertProjectSummary(projects, restored),
        activeProjectId: restored.projectId,
        undoStack: nextUndoStack,
        redoStack: nextRedoStack,
        canUndo: nextUndoStack.length > 0,
        canRedo: nextRedoStack.length > 0,
      });
      persistProject(restored);
    },

    redo: () => {
      const { undoStack, redoStack, project, projects } = get();
      const next = redoStack[0];
      if (!next) return;

      const nextUndoStack = [...undoStack, cloneProject(project)].slice(-80);
      const nextRedoStack = redoStack.slice(1);
      const restored = cloneProject(next);

      set({
        project: restored,
        projects: upsertProjectSummary(projects, restored),
        activeProjectId: restored.projectId,
        undoStack: nextUndoStack,
        redoStack: nextRedoStack,
        canUndo: nextUndoStack.length > 0,
        canRedo: nextRedoStack.length > 0,
      });
      persistProject(restored);
    },

    createNode: (input) => {
      const actor = input.createdBy ?? "human";
      const timestamp = now();
      const type = input.type;
      const sameTypeCount = get().project.nodes.filter(
        (node) => node.type === type,
      ).length;
      const node: PostliminalNode = {
        id: createId(type),
        type,
        position: input.position ?? { x: 120, y: 120 },
        data: {
          ...defaultNodeData(type, sameTypeCount),
          ...input.data,
        },
        createdBy: actor,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const nextProject: ProjectState = {
        ...get().project,
        nodes: [...get().project.nodes, node],
      };
      commit(nextProject, "create_node", actor, operationPayloadForNode(node));
      return node;
    },

    updateNode: (nodeId, patch, actor = "human") => {
      const project = get().project;
      const existing = project.nodes.find((node) => node.id === nodeId);
      if (!existing) return;

      const nodes = project.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          position: patch.position ?? node.position,
          data: patch.data ? { ...node.data, ...patch.data } : node.data,
          updatedAt: now(),
        };
      });

      commit(
        { ...project, nodes },
        "update_node",
        actor,
        {
          nodeId,
          nodeType: existing.type,
          title: patch.data?.title ?? existing.data.title ?? null,
        },
      );
    },

    deleteNode: (nodeId, actor = "human") => {
      const project = get().project;
      const existing = project.nodes.find((node) => node.id === nodeId);
      if (!existing) return;

      const nextProject: ProjectState = {
        ...project,
        nodes: project.nodes.filter((node) => node.id !== nodeId),
        edges: project.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
        selectedNodeIds: project.selectedNodeIds.filter((id) => id !== nodeId),
        selectedAssetIds: project.selectedAssetIds.filter((id) => id !== nodeId),
      };

      commit(nextProject, "delete_node", actor, operationPayloadForNode(existing));
    },

    connectNodes: (sourceId, targetId, type, createdBy = "human") => {
      if (sourceId === targetId) return undefined;
      const project = get().project;
      const source = project.nodes.find((node) => node.id === sourceId);
      const target = project.nodes.find((node) => node.id === targetId);
      if (!source || !target) return undefined;

      const existing = project.edges.find(
        (edge) =>
          edge.source === sourceId &&
          edge.target === targetId &&
          edge.type === type,
      );
      if (existing) return existing;

      const edge: PostliminalEdge = {
        id: createId("edge"),
        source: sourceId,
        target: targetId,
        type,
        createdBy,
        createdAt: now(),
      };
      const sourceHandle = edgeSourceHandle(type);
      const targetHandle = edgeTargetHandle(type);
      const edges = project.edges.filter((existingEdge) => {
        const conflictsWithSource =
          existingEdge.source === sourceId &&
          edgeSourceHandle(existingEdge.type) === sourceHandle;
        const conflictsWithTarget =
          existingEdge.target === targetId &&
          edgeTargetHandle(existingEdge.type) === targetHandle;

        return !conflictsWithSource && !conflictsWithTarget;
      });

      commit(
        { ...project, edges: [...edges, edge] },
        "connect_nodes",
        createdBy,
        {
          edgeId: edge.id,
          sourceId,
          sourceTitle: getNodeTitle(source),
          targetId,
          targetTitle: getNodeTitle(target),
          edgeType: type,
        },
      );
      return edge;
    },

    disconnectNodes: (edgeId, actor = "human") => {
      const project = get().project;
      const existing = project.edges.find((edge) => edge.id === edgeId);
      if (!existing) return;

      commit(
        { ...project, edges: project.edges.filter((edge) => edge.id !== edgeId) },
        "disconnect_nodes",
        actor,
        {
          edgeId,
          edgeType: existing.type,
        },
      );
    },

    moveNode: (nodeId, position, actor = "human") => {
      const project = get().project;
      const existing = project.nodes.find((node) => node.id === nodeId);
      if (!existing) return;
      if (
        Math.round(existing.position.x) === Math.round(position.x) &&
        Math.round(existing.position.y) === Math.round(position.y)
      ) {
        return;
      }

      const nodes = project.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, position, updatedAt: now() }
          : node,
      );

      commit(
        { ...project, nodes },
        "move_node",
        actor,
        {
          nodeId,
          title: existing.data.title ?? null,
          position,
        },
      );
    },

    selectNode: (nodeId, actor = "human") => {
      const project = get().project;
      if (!project.nodes.some((node) => node.id === nodeId)) return;
      if (
        project.selectedNodeIds.length === 1 &&
        project.selectedNodeIds[0] === nodeId
      ) {
        return;
      }

      commit(
        { ...project, selectedNodeIds: [nodeId] },
        "select_node",
        actor,
        { nodeId },
        { history: false },
      );
    },

    selectNodes: (nodeIds, actor = "human") => {
      const project = get().project;
      const validNodeIds = nodeIds.filter((nodeId) =>
        project.nodes.some((node) => node.id === nodeId),
      );
      const uniqueNodeIds = Array.from(new Set(validNodeIds));
      if (
        uniqueNodeIds.length === project.selectedNodeIds.length &&
        uniqueNodeIds.every((nodeId, index) => project.selectedNodeIds[index] === nodeId)
      ) {
        return;
      }

      commit(
        { ...project, selectedNodeIds: uniqueNodeIds },
        "select_nodes",
        actor,
        { nodeIds: uniqueNodeIds },
        { history: false },
      );
    },

    clearSelection: (actor = "human") => {
      const project = get().project;
      if (project.selectedNodeIds.length === 0) return;
      commit(
        { ...project, selectedNodeIds: [] },
        "clear_selection",
        actor,
        {},
        { history: false },
      );
    },

    toggleImageSelected: (nodeId, actor = "human") => {
      const project = get().project;
      const existing = project.nodes.find((node) => node.id === nodeId);
      if (!existing || existing.type !== "image_output") return;

      const selected = !Boolean(existing.data.selected);
      const selectedAssetIds = selected
        ? Array.from(new Set([...project.selectedAssetIds, nodeId]))
        : project.selectedAssetIds.filter((id) => id !== nodeId);

      const nodes = project.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, selected },
              updatedAt: now(),
            }
          : node,
      );

      commit(
        { ...project, nodes, selectedAssetIds },
        selected ? "select_image_output" : "unselect_image_output",
        actor,
        {
          nodeId,
          title: existing.data.title ?? null,
        },
      );
    },

    createBranch: (input) => {
      const actor = input.createdBy ?? "agent";
      const sourceIds =
        input.sourceNodeIds && input.sourceNodeIds.length > 0
          ? input.sourceNodeIds
          : get().project.selectedAssetIds;
      const sources = sourceIds
        .map((id) => get().project.nodes.find((node) => node.id === id))
        .filter((node): node is PostliminalNode => Boolean(node));

      if (sources.length === 0) {
        recordActivity("create_branch_skipped", actor, {
          reason: "no_source_nodes",
        });
        return;
      }

      sources.forEach((source, index) => {
        const baseY = source.position.y + index * 28;
        const prompt = get().createNode({
          type: "prompt",
          position: { x: source.position.x + 360, y: baseY },
          createdBy: actor,
          data: {
            title: `Refine ${getNodeTitle(source)}`,
            text:
              input.promptText ??
              `Refine this selected frame into a stronger cinematic direction. Preserve the black-and-white world and use one intentional gold accent.`,
            status: "ready",
          },
        });
        get().connectNodes(source.id, prompt.id, "refined_from", actor);

        const generation = get().createNode({
          type: "image_generation",
          position: { x: prompt.position.x + 340, y: prompt.position.y + 6 },
          createdBy: actor,
          data: {
            title: "Refinement Pass",
            model: DEFAULT_IMAGE_MODEL_ID,
            modelLabel: getImageModelOption(DEFAULT_IMAGE_MODEL_ID).nodeLabel,
            status: "idle",
          },
        });
        get().connectNodes(prompt.id, generation.id, "input_to", actor);
      });

      recordActivity("create_branch", actor, {
        sourceNodeIds: sources.map((source) => source.id),
        branchCount: sources.length,
      });
    },

    createGroup: (input) => {
      const actor = input.createdBy ?? "human";
      const project = get().project;
      const nodeIds = input.nodeIds ?? project.selectedNodeIds;
      const groupedNodes = nodeIds
        .map((id) => project.nodes.find((node) => node.id === id))
        .filter((node): node is PostliminalNode => Boolean(node));

      const minX =
        groupedNodes.length > 0
          ? Math.min(...groupedNodes.map((node) => node.position.x)) - 36
          : 140;
      const minY =
        groupedNodes.length > 0
          ? Math.min(...groupedNodes.map((node) => node.position.y)) - 72
          : 140;

      const timestamp = now();
      const group: PostliminalNode = {
        id: createId("group"),
        type: "group",
        position: input.position ?? { x: minX, y: minY },
        data: {
          ...defaultNodeData("group"),
          title: input.title ?? "Selection Group",
          childNodeIds: nodeIds,
          count: nodeIds.length,
        },
        createdBy: actor,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      commit(
        { ...project, nodes: [...project.nodes, group] },
        "create_group",
        actor,
        {
          nodeId: group.id,
          title: group.data.title ?? null,
          childCount: nodeIds.length,
        },
      );
      return group;
    },

    autoLayout: (actor = "human") => {
      const project = get().project;
      const briefNodes = project.nodes.filter((node) => node.type === "brief");
      const promptNodes = project.nodes.filter((node) => node.type === "prompt");
      const generationNodes = project.nodes.filter(
        (node) => node.type === "image_generation",
      );
      const outputNodes = project.nodes.filter(
        (node) => node.type === "image_output",
      );

      const rowSpacing = outputNodes.length > 0 ? 286 : 204;
      const promptOrder = [...promptNodes].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const positions = new Map<string, Position>();

      briefNodes.forEach((node, index) => {
        positions.set(node.id, { x: 72, y: 160 + index * 220 });
      });

      promptOrder.forEach((prompt, index) => {
        const y = 150 + index * rowSpacing;
        positions.set(prompt.id, { x: 420, y });

        const generationEdge = project.edges.find(
          (edge) => edge.source === prompt.id && edge.type === "input_to",
        );
        const generation = generationEdge
          ? generationNodes.find((node) => node.id === generationEdge.target)
          : undefined;

        if (generation) {
          positions.set(generation.id, { x: 770, y: y + 2 });
          const outputs = project.edges
            .filter(
              (edge) => edge.source === generation.id && edge.type === "generated",
            )
            .map((edge) => outputNodes.find((node) => node.id === edge.target))
            .filter((node): node is PostliminalNode => Boolean(node));

          outputs.forEach((output, outputIndex) => {
            positions.set(output.id, {
              x: 1116 + outputIndex * 258,
              y: y - 6,
            });
          });
        }
      });

      const orphanGenerations = generationNodes.filter(
        (node) => !positions.has(node.id),
      );
      orphanGenerations.forEach((node, index) => {
        positions.set(node.id, { x: 770, y: 72 + index * rowSpacing });
      });

      const orphanOutputs = outputNodes.filter((node) => !positions.has(node.id));
      orphanOutputs.forEach((node, index) => {
        positions.set(node.id, { x: 1116, y: 72 + index * rowSpacing });
      });

      project.nodes
        .filter((node) => node.type === "group" || node.type === "selection_group")
        .forEach((node, index) => {
          positions.set(node.id, { x: 392, y: 22 + index * 86 });
        });

      const nodes = project.nodes.map((node) =>
        positions.has(node.id)
          ? {
              ...node,
              position: positions.get(node.id) as Position,
              updatedAt: now(),
            }
          : node,
      );

      commit(
        { ...project, nodes },
        "auto_layout",
        actor,
        { nodeCount: nodes.length },
      );
    },

    resetProject: () => {
      const current = get().project;
      const project = appendActivity(
        createEmptyProject(current.title, current.projectId),
        "reset_project",
        "human",
      );
      set({
        project,
        projects: upsertProjectSummary(get().projects, project),
        activeProjectId: project.projectId,
        undoStack: [cloneProject(current)].slice(-80),
        redoStack: [],
        canUndo: true,
        canRedo: false,
      });
      persistProject(project);
    },

    loadProject: (json) => {
      const current = get().project;
      const loaded = parseProject(json);
      const project = appendActivity(loaded, "load_project", "human", {
        projectId: loaded.projectId,
      });
      set({
        project,
        projects: upsertProjectSummary(get().projects, project),
        activeProjectId: project.projectId,
        undoStack: [...get().undoStack, cloneProject(current)].slice(-80),
        redoStack: [],
        canUndo: true,
        canRedo: false,
      });
      persistProject(project);
    },

    exportProject: () => JSON.stringify(get().project, null, 2),

    createMockOutputs: (generationNodeId, actor = "human") => {
      const generation = get().project.nodes.find(
        (node) => node.id === generationNodeId && node.type === "image_generation",
      );
      if (!generation) return;

      get().updateNode(
        generationNodeId,
        { data: { status: "running" } },
        actor,
      );

      const existingOutputs = get().project.edges.filter(
        (edge) => edge.source === generationNodeId && edge.type === "generated",
      ).length;

      for (let index = 0; index < 3; index += 1) {
        const outputIndex = existingOutputs + index;
        const sourceModel = getImageModelOption(generation.data.model);
        const output = get().createNode({
          type: "image_output",
          createdBy: actor,
          position: {
            x: generation.position.x + 360 + index * 252,
            y: generation.position.y,
          },
          data: {
            title: `Output ${outputIndex + 1}`,
            status: "completed",
            selected: false,
            gradient: mockOutputGradient(outputIndex),
            seed: 2400 + outputIndex,
            sourceModel: sourceModel.label,
          } satisfies NodeData,
        });
        get().connectNodes(generationNodeId, output.id, "generated", actor);
      }

      get().updateNode(
        generationNodeId,
        { data: { status: "completed" } },
        actor,
      );
      recordActivity("create_mock_outputs", actor, {
        generationNodeId,
        outputCount: 3,
      });
    },

    createImageOutputs: (
      generationNodeId,
      imageUrls,
      actor = "human",
      metadata = {},
    ) => {
      const generation = get().project.nodes.find(
        (node) => node.id === generationNodeId && node.type === "image_generation",
      );
      const urls = imageUrls.filter((imageUrl) => imageUrl.length > 0);
      if (!generation || urls.length === 0) return;

      const existingOutputs = get().project.edges.filter(
        (edge) => edge.source === generationNodeId && edge.type === "generated",
      ).length;
      const sourceModel = getImageModelOption(generation.data.model);

      urls.forEach((imageUrl, index) => {
        const outputIndex = existingOutputs + index;
        const output = get().createNode({
          type: "image_output",
          createdBy: actor,
          position: {
            x: generation.position.x + 360 + (index % 3) * 252,
            y: generation.position.y + Math.floor(index / 3) * 260,
          },
          data: {
            title: `Output ${outputIndex + 1}`,
            status: "completed",
            selected: false,
            imageUrl,
            sourceModel: sourceModel.label,
            ...metadata,
          } satisfies NodeData,
        });
        get().connectNodes(generationNodeId, output.id, "generated", actor);
      });

      get().updateNode(
        generationNodeId,
        { data: { status: "completed" } },
        actor,
      );
      recordActivity("create_image_outputs", actor, {
        generationNodeId,
        outputCount: urls.length,
        sourceModel: sourceModel.label,
      });
    },
  };
});
