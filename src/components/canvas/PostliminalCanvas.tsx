"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ReactFlow,
  ReactFlowProvider,
  PanOnScrollMode,
  SelectionMode,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type OnEdgesDelete,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodesDelete,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import {
  ArrowRight,
  Asterisk,
  ChevronDown,
  ChevronRight,
  Circle,
  Cpu,
  Hand,
  Image as ImageIcon,
  Info,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Settings,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import {
  generateChatGptImages,
  resolveImageGenerationInputs,
} from "@/lib/imageGenerationClient";
import {
  DEFAULT_IMAGE_MODEL_ID,
  getImageModelOption,
} from "@/lib/imageModels";
import {
  defaultSettings,
  normalizeSettings,
  type LocalSettings,
  SETTINGS_STORAGE_KEY,
  writeLocalSettings,
} from "@/lib/localSettings";
import type {
  EdgeType,
  NodeData,
  NodeStatus,
  NodeType,
  PostliminalNode,
} from "@/types/project";
import { BriefNode } from "./nodes/BriefNode";
import { GroupNode } from "./nodes/GroupNode";
import { ImageGenerationNode } from "./nodes/ImageGenerationNode";
import { ImageOutputNode } from "./nodes/ImageOutputNode";
import { IMAGE_HANDLE_TOP, PROMPT_HANDLE_TOP } from "./nodes/NodePrimitives";
import { PromptNode } from "./nodes/PromptNode";

const nodeTypes = {
  brief: BriefNode,
  prompt: PromptNode,
  image_generation: ImageGenerationNode,
  image_output: ImageOutputNode,
  group: GroupNode,
  image_reference: ImageOutputNode,
  selection_group: GroupNode,
};

function WeavyEdge(props: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.34,
  });
  const data = props.data as { color?: string } | undefined;
  const color = data?.color ?? "#52d6b1";

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      interactionWidth={18}
      style={{
        ...props.style,
        stroke: color,
        strokeWidth: props.selected ? 2.1 : 1.45,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        filter: `drop-shadow(0 0 5px ${color}36)`,
      }}
    />
  );
}

const edgeTypes = {
  weavy: WeavyEdge,
};

const GRID_GAP = 20;
const snapGrid: [number, number] = [GRID_GAP, GRID_GAP];

function snapPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / GRID_GAP) * GRID_GAP,
    y: Math.round(position.y / GRID_GAP) * GRID_GAP,
  };
}

const menuItems: Array<{
  type: NodeType;
  label: string;
  icon: ReactNode;
}> = [
  { type: "prompt", label: "Prompt", icon: <Plus className="h-4 w-4" /> },
  {
    type: "image_generation",
    label: "Image model",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    type: "image_reference",
    label: "Import",
    icon: <ImageIcon className="h-4 w-4" />,
  },
];

function inferEdgeType(
  source?: PostliminalNode,
  target?: PostliminalNode,
): EdgeType {
  if (!source || !target) return "references";
  if (source.type === "brief" && target.type === "prompt") return "derived_from";
  if (source.type === "prompt" && target.type === "image_generation") {
    return "input_to";
  }
  if (source.type === "image_generation" && target.type === "image_output") {
    return "generated";
  }
  if (source.type === "image_output" && target.type === "prompt") {
    return "refined_from";
  }
  if (target.type === "image_reference") return "references";
  return "references";
}

function typeLabel(type: NodeType) {
  return type.replace(/_/g, " ");
}

function edgeColor(type: EdgeType) {
  const promptEdges: EdgeType[] = ["derived_from", "input_to"];

  return promptEdges.includes(type) ? "#df72f4" : "#52d6b1";
}

function edgeTone(type: EdgeType) {
  return edgeColor(type) === "#df72f4" ? "prompt" : "image";
}

function edgeSourceHandle(type: EdgeType) {
  return edgeTone(type) === "prompt" ? "prompt-out" : "image-out";
}

function edgeTargetHandle(type: EdgeType) {
  return edgeTone(type) === "prompt" ? "prompt-in" : "image-in";
}

function handleTone(handleId?: string | null) {
  return handleId?.includes("prompt") ? "prompt" : "image";
}

function handleColor(handleId?: string | null) {
  return handleTone(handleId) === "prompt" ? "#df72f4" : "#52d6b1";
}

function AppSidebar({
  onOpenProjects,
  onOpenSettings,
}: {
  onOpenProjects: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="absolute inset-y-0 left-0 z-40 flex w-12 flex-col items-center justify-between border-r border-white/10 bg-[#202024]/95 py-3 shadow-2xl">
      <button
        aria-label="Open projects"
        title="Open projects"
        className="grid h-8 w-8 place-items-center rounded-md bg-zinc-100 text-sm font-semibold text-zinc-950 transition hover:bg-white"
        onClick={onOpenProjects}
      >
        P
      </button>
      <button
        aria-label="Settings"
        title="Settings"
        className="grid h-9 w-9 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        onClick={onOpenSettings}
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: LocalSettings;
  onChange: (settings: LocalSettings) => void;
  onClose: () => void;
}) {
  const updateSettings = (patch: Partial<LocalSettings>) => {
    onChange(normalizeSettings({ ...settings, ...patch }));
  };
  const imageModel = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);

  return (
    <aside className="absolute inset-y-0 right-0 z-50 w-[360px] border-l border-white/10 bg-[#242428]/98 shadow-2xl backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-white/10 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Settings
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-100">
              Image model
            </div>
          </div>
          <button
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.07] hover:text-zinc-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          <div className="rounded-md border border-white/10 bg-[#19191d] p-3">
            <div className="text-xs text-zinc-500">Fixed image model</div>
            <div className="mt-1 text-sm font-medium text-zinc-100">
              {imageModel.label}
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-zinc-400">OpenAI API key</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#19191d] px-3 text-sm text-zinc-100 outline-none focus:border-white/25"
              type="password"
              placeholder="sk-..."
              value={settings.openaiApiKey}
              onChange={(event) =>
                updateSettings({ openaiApiKey: event.target.value })
              }
            />
          </label>

          <div className="rounded-md border border-white/10 bg-[#19191d] p-3 text-xs leading-5 text-zinc-400">
            The API key stays in this browser for the local prototype. You can
            also set OPENAI_API_KEY in the local environment before starting the
            app.
          </div>
        </div>
      </div>
    </aside>
  );
}

function ProjectHeader({ title }: { title: string }) {
  return (
    <div
      className="absolute left-16 top-4 z-30 flex h-9 items-center rounded-md border border-white/10 bg-[#202024]/92 px-3 shadow-xl backdrop-blur-xl"
      aria-label="Current project"
    >
      <div className="text-sm font-medium text-zinc-100">{title}</div>
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onCreate,
  onClose,
}: {
  x: number;
  y: number;
  onCreate: (type: NodeType) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-40 w-52 overflow-hidden rounded-lg border border-white/10 bg-[#232327]/95 p-1 shadow-2xl backdrop-blur-xl"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        Create box
      </div>
      {menuItems.map((item) => (
        <button
          key={item.type}
          className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-zinc-200 transition hover:bg-white/[0.07]"
          onClick={() => onCreate(item.type)}
        >
          <span className="text-zinc-400">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

type LooseConnectionStart = {
  nodeId: string;
  handleId: string;
  handleType: "source" | "target";
};

function clientPointFromEvent(event: MouseEvent | TouchEvent) {
  if ("changedTouches" in event && event.changedTouches[0]) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }

  if ("clientX" in event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return null;
}

function droppedOnHandle(event: MouseEvent | TouchEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(".react-flow__handle"));
}

function looseConnectionNodeType(
  start: LooseConnectionStart,
  startNode?: PostliminalNode,
): NodeType {
  if (start.handleType === "target") {
    return handleTone(start.handleId) === "prompt" ? "prompt" : "image_generation";
  }

  if (startNode?.type === "brief" && handleTone(start.handleId) === "prompt") {
    return "prompt";
  }

  return "image_generation";
}

function looseConnectionEdgeType(
  start: LooseConnectionStart,
  startNode: PostliminalNode | undefined,
  createdType: NodeType,
): EdgeType {
  if (start.handleType === "target") {
    return handleTone(start.handleId) === "prompt" ? "input_to" : "references";
  }

  if (startNode?.type === "brief" && createdType === "prompt") {
    return "derived_from";
  }

  if (handleTone(start.handleId) === "prompt") {
    return "input_to";
  }

  return "references";
}

function nodeWidth(type: NodeType) {
  return type === "image_generation" ? 362 : 286;
}

function pixelOffset(value: string) {
  return Number.parseFloat(value);
}

function looseConnectionAnchorTop(
  start: LooseConnectionStart,
  createdType: NodeType,
  edgeType: EdgeType,
) {
  if (start.handleType === "target") {
    return createdType === "image_output" || createdType === "image_reference"
      ? pixelOffset(IMAGE_HANDLE_TOP)
      : pixelOffset(PROMPT_HANDLE_TOP);
  }

  return edgeTargetHandle(edgeType) === "image-in"
    ? pixelOffset(IMAGE_HANDLE_TOP)
    : pixelOffset(PROMPT_HANDLE_TOP);
}

function looseConnectionPosition(
  point: { x: number; y: number },
  start: LooseConnectionStart,
  createdType: NodeType,
  edgeType: EdgeType,
) {
  const top = looseConnectionAnchorTop(start, createdType, edgeType);
  const x =
    start.handleType === "target" ? point.x - nodeWidth(createdType) : point.x;

  return snapPosition({
    x,
    y: point.y - top,
  });
}

function looseConnectionNodeData(type: NodeType): NodeData {
  if (type === "image_generation") {
    const modelOption = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
    return {
      title: "Image Model",
      model: modelOption.id,
      modelLabel: modelOption.nodeLabel,
      status: "idle",
    };
  }

  if (type === "prompt") {
    return {
      title: "Prompt",
      text: "Describe the next image direction.",
      status: "ready",
    };
  }

  return {};
}

function BottomToolbar({
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const historyButtonClass =
    "grid h-8 w-8 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:text-zinc-600";

  return (
    <div className="absolute bottom-4 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-1 rounded-lg border border-white/10 bg-[#242428]/95 p-1 shadow-2xl backdrop-blur-xl">
      <button
        aria-label="Select"
        title="Select"
        className="grid h-8 w-8 place-items-center rounded-md bg-lime-200 text-zinc-950"
      >
        <MousePointer2 className="h-4 w-4" />
      </button>
      <button
        aria-label="Pan"
        title="Pan"
        className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      >
        <Hand className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <button
        aria-label="Undo"
        title="Undo"
        className={historyButtonClass}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        aria-label="Redo"
        title="Redo"
        className={historyButtonClass}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <div className="px-2 text-xs text-zinc-400">{Math.round(zoom * 100)}%</div>
    </div>
  );
}

function TopRightTaskWidget() {
  return (
    <div className="absolute right-4 top-4 z-30 w-36 rounded-md border border-white/10 bg-[#242428] px-3 py-3 shadow-2xl">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-none text-zinc-200">
        <Asterisk className="h-3.5 w-3.5" />
        <span>616 credits</span>
      </div>
      <button className="mt-3 flex items-center gap-1.5 text-xs leading-none text-zinc-200 transition hover:text-zinc-50">
        Tasks
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>
    </div>
  );
}

const imageModelRunCost = 9;
const imageModelQualities = ["low", "medium", "high"] as const;
const imageModelResolutions = ["1024x1024", "1536x1024", "2048x1152"] as const;

function stringDataValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberDataValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedRuns(value: unknown) {
  return Math.max(1, Math.min(8, numberDataValue(value, 1)));
}

function SidebarDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <div className="flex items-center gap-1 text-xs text-zinc-400">
        {label} <Info className="h-3 w-3" />
      </div>
      <button
        type="button"
        className="mt-2 flex h-8 w-full items-center justify-between rounded border border-white/10 bg-[#1c1c21] px-2 text-left text-xs font-medium text-zinc-100 outline-none transition hover:border-white/20 focus:border-white/25"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded border border-white/10 bg-[#19191d] py-1 shadow-2xl">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`flex h-8 w-full items-center px-2 text-left text-xs transition ${
                option === value
                  ? "bg-white/[0.07] text-zinc-50"
                  : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50"
              }`}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function useImageModelRunner() {
  const project = useProjectStore((state) => state.project);
  const updateNode = useProjectStore((state) => state.updateNode);
  const createMockOutputs = useProjectStore((state) => state.createMockOutputs);
  const createImageOutputs = useProjectStore((state) => state.createImageOutputs);

  return useCallback(
    async (node: PostliminalNode) => {
      if (node.data.status === "running") return;

      const option = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
      const modelVariant = stringDataValue(node.data.modelVariant, "GPT Image 2");
      const quality = stringDataValue(node.data.quality, "medium");
      const resolution = stringDataValue(node.data.resolution, "2048x1152");
      const runs = boundedRuns(node.data.runs);
      const inputs = resolveImageGenerationInputs(project, node.id);

      updateNode(
        node.id,
        {
          data: {
            model: option.id,
            modelLabel: option.nodeLabel,
            modelVariant,
            quality,
            resolution,
            runs,
            status: "running",
            lastRunError: "",
          },
        },
        "human",
      );

      try {
        const result = await generateChatGptImages({
          ...inputs,
          quality,
          resolution,
          runs,
        });

        createImageOutputs(node.id, result.images, "human", {
          sourceModel: "ChatGPT Images 2.0",
          apiModel: result.model,
          apiSize: result.size,
          quality,
          resolution,
          prompt: inputs.prompt,
        });
        updateNode(node.id, { data: { lastRunError: "" } }, "human");
      } catch (error) {
        createMockOutputs(node.id, "human");
        updateNode(
          node.id,
          {
            data: {
              lastRunError:
                error instanceof Error
                  ? error.message
                  : "Image generation failed",
            },
          },
          "human",
        );
      }
    },
    [createImageOutputs, createMockOutputs, project, updateNode],
  );
}

function ImageModelTaskRow({
  node,
  expanded,
  onToggle,
}: {
  node: PostliminalNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const quality = stringDataValue(node.data.quality, "medium");
  const resolution = stringDataValue(node.data.resolution, "2048x1152");
  const runs = boundedRuns(node.data.runs);
  const isRunning = node.data.status === "running";

  const updateData = (data: NodeData) => {
    updateNode(node.id, { data }, "human");
  };

  const errorMessage = stringDataValue(node.data.lastRunError, "");

  return (
    <div>
      <button
        className="flex h-12 w-full items-center gap-2 px-4 text-left text-xs text-zinc-100 transition hover:bg-white/[0.035]"
        onClick={onToggle}
      >
        <Cpu className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
        <span className="min-w-0 flex-1 truncate">
          {isRunning ? "Image Model Running" : "Image Model"}
        </span>
        <span className="flex items-center gap-1 text-zinc-200">
          <Sparkles className="h-3.5 w-3.5" />
          {runs * imageModelRunCost}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
        )}
      </button>

      {expanded ? (
        <div className="space-y-4 px-4 pb-5">
          <SidebarDropdown
            label="Quality"
            value={quality}
            options={imageModelQualities}
            onChange={(nextQuality) => updateData({ quality: nextQuality })}
          />

          <SidebarDropdown
            label="Resolution"
            value={resolution}
            options={imageModelResolutions}
            onChange={(nextResolution) =>
              updateData({ resolution: nextResolution })
            }
          />

          {errorMessage ? (
            <div className="rounded border border-amber-300/15 bg-amber-300/5 px-2.5 py-2 text-[11px] leading-4 text-amber-100/80">
              Using mock fallback: {errorMessage}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ImageModelInspector({ nodes }: { nodes: PostliminalNode[] }) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const runImageModel = useImageModelRunner();
  const [expandedNodeId, setExpandedNodeId] = useState(nodes[0]?.id ?? "");
  const runningCount = nodes.filter((node) => node.data.status === "running").length;
  const canRun = nodes.some((node) => node.data.status !== "running");
  const footerRuns = boundedRuns(nodes[0]?.data.runs);
  const totalCost = nodes.reduce(
    (sum, node) => sum + boundedRuns(node.data.runs) * imageModelRunCost,
    0,
  );

  useEffect(() => {
    if (nodes.length === 0) return;
    if (!nodes.some((node) => node.id === expandedNodeId)) {
      setExpandedNodeId(nodes[0].id);
    }
  }, [expandedNodeId, nodes]);

  const updateAllRuns = (nextRuns: number) => {
    const runs = boundedRuns(nextRuns);
    nodes.forEach((node) => updateNode(node.id, { data: { runs } }, "human"));
  };

  const runSelected = async () => {
    await Promise.allSettled(
      nodes
        .filter((node) => node.data.status !== "running")
        .map((node) => runImageModel(node)),
    );
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-50 w-[252px] border-l border-white/10 bg-[#242428] shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-none text-zinc-200">
            <Asterisk className="h-3.5 w-3.5" />
            <span>616 credits</span>
          </div>
          <button className="mt-3 flex items-center gap-1.5 text-xs leading-none text-zinc-200 transition hover:text-zinc-50">
            Tasks {runningCount > 0 ? `${runningCount} Running` : ""}
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {nodes.map((node) => (
            <ImageModelTaskRow
              key={node.id}
              node={node}
              expanded={expandedNodeId === node.id}
              onToggle={() =>
                setExpandedNodeId((current) =>
                  current === node.id ? "" : node.id,
                )
              }
            />
          ))}
        </div>

        <div className="border-t border-white/15 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Run selected nodes
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs font-medium text-zinc-100">Runs</div>
            <div className="flex h-7 items-center overflow-hidden rounded border border-white/15 bg-[#1c1c21]">
              <button
                className="grid h-7 w-8 place-items-center text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:text-zinc-700"
                disabled={footerRuns <= 1}
                onClick={() => updateAllRuns(footerRuns - 1)}
              >
                <Minus className="h-3 w-3" />
              </button>
              <div className="w-9 text-center text-xs font-semibold text-zinc-100">
                {footerRuns}
              </div>
              <button
                className="grid h-7 w-8 place-items-center text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                onClick={() => updateAllRuns(footerRuns + 1)}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <div className="text-zinc-500">Total cost</div>
            <div className="flex items-center gap-1 text-zinc-100">
              <Sparkles className="h-3.5 w-3.5" />
              {totalCost} credits
            </div>
          </div>
          <button
            className="mt-4 flex h-8 w-full items-center justify-center gap-2 rounded bg-[#e8e6c8] text-xs font-medium text-zinc-950 transition hover:bg-[#f2f0d4] disabled:cursor-default disabled:opacity-55"
            disabled={!canRun}
            onClick={runSelected}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            {runningCount > 0 ? "Running" : "Run selected"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function NodeInspector({
  nodes,
}: {
  nodes: PostliminalNode[];
}) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const deleteNode = useProjectStore((state) => state.deleteNode);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const toggleImageSelected = useProjectStore((state) => state.toggleImageSelected);
  const node = nodes[0];
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    setTitle(String(node?.data.title ?? ""));
    setText(String(node?.data.text ?? ""));
  }, [node?.data.text, node?.data.title, node?.id]);

  const imageModelNodes = nodes.filter(
    (selectedNode) => selectedNode.type === "image_generation",
  );

  if (imageModelNodes.length > 0) {
    return <ImageModelInspector nodes={imageModelNodes} />;
  }
  if (!node) return null;
  if (node.type === "prompt") {
    return null;
  }

  const saveTitle = () => {
    updateNode(node.id, { data: { title: title.trim() || typeLabel(node.type) } });
  };

  const saveText = () => {
    updateNode(node.id, { data: { text } });
  };

  const status = String(node.data.status ?? "idle") as NodeStatus;

  return (
    <aside className="absolute inset-y-0 right-0 z-50 w-[324px] border-l border-white/10 bg-[#242428] shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-white/10 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {typeLabel(node.type)}
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-100">
              {node.data.title ? String(node.data.title) : "Untitled"}
            </div>
          </div>
          <button
            aria-label="Close inspector"
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.07] hover:text-zinc-100"
            onClick={() => clearSelection("human")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <label className="block">
            <span className="text-xs text-zinc-400">Title</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#19191d] px-3 text-sm text-zinc-100 outline-none focus:border-white/25"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
            />
          </label>

          {"text" in node.data || node.type === "brief" ? (
            <label className="block">
              <span className="text-xs text-zinc-400">Prompt</span>
              <textarea
                className="mt-2 min-h-48 w-full resize-none rounded-md border border-white/10 bg-[#19191d] px-3 py-3 text-sm leading-6 text-zinc-100 outline-none focus:border-white/25"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={saveText}
              />
            </label>
          ) : null}

          <div className="rounded-md border border-white/10 bg-[#19191d] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Status</span>
              <span className="flex items-center gap-2 capitalize text-zinc-200">
                <Circle className="h-2 w-2 fill-emerald-300 text-emerald-300" />
                {status}
              </span>
            </div>
          </div>

          {node.type === "image_output" ? (
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] text-sm text-zinc-100 transition hover:bg-white/[0.08]"
              onClick={() => toggleImageSelected(node.id, "human")}
            >
              <Wand2 className="h-4 w-4" />
              {node.data.selected ? "Unselect output" : "Select output"}
            </button>
          ) : null}
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-300/15 bg-red-400/5 text-sm text-red-200 transition hover:bg-red-400/10"
            onClick={() => deleteNode(node.id, "human")}
          >
            <Trash2 className="h-4 w-4" />
            Delete box
          </button>
        </div>
      </div>
    </aside>
  );
}

function ViewportManager({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  const didInitialFit = useRef(false);

  useEffect(() => {
    if (nodeCount === 0 || didInitialFit.current) return;
    didInitialFit.current = true;

    const timeout = window.setTimeout(
      () => fitView({ padding: 0.28, duration: 0 }),
      80,
    );
    return () => window.clearTimeout(timeout);
  }, [fitView, nodeCount]);

  return null;
}

function CanvasSurface({ onOpenProjects }: { onOpenProjects: () => void }) {
  const project = useProjectStore((state) => state.project);
  const connectNodes = useProjectStore((state) => state.connectNodes);
  const disconnectNodes = useProjectStore((state) => state.disconnectNodes);
  const deleteNode = useProjectStore((state) => state.deleteNode);
  const moveNode = useProjectStore((state) => state.moveNode);
  const selectNode = useProjectStore((state) => state.selectNode);
  const selectNodes = useProjectStore((state) => state.selectNodes);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const createNode = useProjectStore((state) => state.createNode);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore((state) => state.canUndo);
  const canRedo = useProjectStore((state) => state.canRedo);
  const { screenToFlowPosition } = useReactFlow();
  const looseConnectionStartRef = useRef<LooseConnectionStart | null>(null);
  const connectionCompletedRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [connectionLineColor, setConnectionLineColor] = useState("#52d6b1");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    position: { x: number; y: number };
  } | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<LocalSettings>(defaultSettings);

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;

    try {
      setSettings(normalizeSettings(JSON.parse(raw) as Partial<LocalSettings>));
    } catch {
      setSettings(defaultSettings);
    }
  }, []);

  const saveSettings = useCallback((nextSettings: LocalSettings) => {
    const normalized = normalizeSettings(nextSettings);
    setSettings(normalized);
    writeLocalSettings(normalized);
  }, []);

  const selectedNodes = useMemo(
    () =>
      project.selectedNodeIds
        .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
        .filter((node): node is PostliminalNode => Boolean(node)),
    [project.nodes, project.selectedNodeIds],
  );

  const storeNodes = useMemo<Node<NodeData>[]>(() => {
    const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
    const connectedHandles = new Map<string, Set<string>>();
    const generatedOutputCounts = new Map<string, number>();
    const generatedImageUrls = new Map<string, string[]>();
    const markConnected = (nodeId: string, handleId: string) => {
      const existing = connectedHandles.get(nodeId) ?? new Set<string>();
      existing.add(handleId);
      connectedHandles.set(nodeId, existing);
    };

    project.edges.forEach((edge) => {
      markConnected(edge.source, edgeSourceHandle(edge.type));

      if (
        edge.type === "generated" &&
        nodeById.get(edge.source)?.type === "image_generation" &&
        nodeById.get(edge.target)?.type === "image_output"
      ) {
        const imageUrl = nodeById.get(edge.target)?.data.imageUrl;
        generatedOutputCounts.set(
          edge.source,
          (generatedOutputCounts.get(edge.source) ?? 0) + 1,
        );
        if (typeof imageUrl === "string" && imageUrl.length > 0) {
          generatedImageUrls.set(edge.source, [
            ...(generatedImageUrls.get(edge.source) ?? []),
            imageUrl,
          ]);
        }
      }

      if (nodeById.get(edge.target)?.type !== "prompt") {
        markConnected(edge.target, edgeTargetHandle(edge.type));
      }
    });

    return project.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...node.data,
        nodeType: node.type,
        generatedImageCount: generatedOutputCounts.get(node.id) ?? 0,
        generatedImageUrls: generatedImageUrls.get(node.id) ?? [],
        connectedHandles: Object.fromEntries(
          Array.from(connectedHandles.get(node.id) ?? []).map((handleId) => [
            handleId,
            true,
          ]),
        ),
      },
      selected: project.selectedNodeIds.includes(node.id),
      zIndex:
        node.type === "group" || node.type === "selection_group" ? 0 : 5,
    }));
  }, [project.edges, project.nodes, project.selectedNodeIds]);

  const [flowNodes, setFlowNodes] = useState<Node<NodeData>[]>(storeNodes);

  useEffect(() => {
    setFlowNodes(storeNodes);
  }, [storeNodes]);

  useEffect(() => {
    setSelectedEdgeIds((edgeIds) =>
      edgeIds.filter((edgeId) =>
        project.edges.some((edge) => edge.id === edgeId),
      ),
    );
  }, [project.edges]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      const key = event.key.toLowerCase();
      const usesShortcutModifier = event.metaKey || event.ctrlKey;

      if (usesShortcutModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (usesShortcutModifier && key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (
        selectedEdgeIds.length === 0 ||
        (event.key !== "Backspace" && event.key !== "Delete")
      ) {
        return;
      }

      event.preventDefault();
      selectedEdgeIds.forEach((edgeId) => disconnectNodes(edgeId, "human"));
      setSelectedEdgeIds([]);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disconnectNodes, redo, selectedEdgeIds, undo]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      const item = Array.from(event.clipboardData?.items ?? []).find(
        (clipboardItem) =>
          clipboardItem.kind === "file" &&
          clipboardItem.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (!file) return;

      event.preventDefault();
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") return;
        createNode({
          type: "image_reference",
          createdBy: "human",
          position: snapPosition(
            screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            }),
          ),
          data: {
            title: file.name || "pasted-image.png",
            imageUrl: reader.result,
            kind: "image_file",
            status: "ready",
          },
        });
      });
      reader.readAsDataURL(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [createNode, screenToFlowPosition]);

  const flowEdges = useMemo<Edge[]>(() => {
    const nodeById = new Map(project.nodes.map((node) => [node.id, node]));

    return project.edges
      .filter((edge) => nodeById.get(edge.target)?.type !== "prompt")
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edgeSourceHandle(edge.type),
        targetHandle: edgeTargetHandle(edge.type),
        type: "weavy",
        selected: selectedEdgeIds.includes(edge.id),
        selectable: true,
        focusable: true,
        animated: false,
        data: {
          color: edgeColor(edge.type),
        },
        interactionWidth: 18,
        style: {
          stroke: edgeColor(edge.type),
          strokeOpacity: 0.9,
        },
      }));
  }, [project.edges, project.nodes, selectedEdgeIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<NodeData>>[]) => {
      const snappedChanges = changes.map((change) => {
        if (change.type !== "position" || !change.position) return change;
        return {
          ...change,
          position: snapPosition(change.position),
        };
      });

      setFlowNodes((nodes) => applyNodeChanges(snappedChanges, nodes));
      snappedChanges.forEach((change) => {
        if (
          change.type === "position" &&
          !change.dragging &&
          change.position
        ) {
          moveNode(change.id, change.position, "human");
        }
      });
    },
    [moveNode],
  );

  const onNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: Node<NodeData>) => {
      moveNode(node.id, snapPosition(node.position), "human");
    },
    [moveNode],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      connectionCompletedRef.current = true;
      const source = project.nodes.find((node) => node.id === connection.source);
      const target = project.nodes.find((node) => node.id === connection.target);
      connectNodes(
        connection.source,
        connection.target,
        inferEdgeType(source, target),
        "human",
      );
    },
    [connectNodes, project.nodes],
  );

  const onConnectStart = useCallback<OnConnectStart>(
    (_event, params) => {
      const nodeId = params.nodeId;
      const handleId = params.handleId;
      const handleType = params.handleType;
      connectionCompletedRef.current = false;

      if (
        !nodeId ||
        !handleId ||
        (handleType !== "source" && handleType !== "target")
      ) {
        looseConnectionStartRef.current = null;
        return;
      }

      looseConnectionStartRef.current = {
        nodeId,
        handleId,
        handleType,
      };
      setConnectionLineColor(handleColor(handleId));
    },
    [],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event) => {
      const start = looseConnectionStartRef.current;
      looseConnectionStartRef.current = null;

      if (!start) return;
      if (connectionCompletedRef.current) {
        connectionCompletedRef.current = false;
        return;
      }
      if (droppedOnHandle(event)) return;

      const point = clientPointFromEvent(event);
      if (!point) return;

      const startNode = project.nodes.find((node) => node.id === start.nodeId);
      if (!startNode) return;

      const createdType = looseConnectionNodeType(start, startNode);
      const edgeType = looseConnectionEdgeType(start, startNode, createdType);
      const createdNode = createNode({
        type: createdType,
        createdBy: "human",
        position: looseConnectionPosition(
          screenToFlowPosition(point),
          start,
          createdType,
          edgeType,
        ),
        data: looseConnectionNodeData(createdType),
      });

      if (start.handleType === "target") {
        connectNodes(createdNode.id, start.nodeId, edgeType, "human");
      } else {
        connectNodes(start.nodeId, createdNode.id, edgeType, "human");
      }
      selectNode(createdNode.id, "human");
    },
    [connectNodes, createNode, project.nodes, screenToFlowPosition, selectNode],
  );

  const onNodesDelete = useCallback<OnNodesDelete>(
    (nodes) => {
      nodes.forEach((node) => deleteNode(node.id, "human"));
    },
    [deleteNode],
  );

  const onEdgesDelete = useCallback<OnEdgesDelete>(
    (edges) => {
      edges.forEach((edge) => disconnectNodes(edge.id, "human"));
      setSelectedEdgeIds([]);
    },
    [disconnectNodes],
  );

  const onEdgeClick = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      event.stopPropagation();
      clearSelection("human");
      setContextMenu(null);
      setSelectedEdgeIds([edge.id]);
    },
    [clearSelection],
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      setSelectedEdgeIds(edges.map((edge) => edge.id));

      if (nodes.length === 0) {
        clearSelection("human");
        return;
      }
      if (nodes.length === 1) {
        selectNode(nodes[0].id, "human");
        return;
      }
      selectNodes(nodes.map((node) => node.id), "human");
    },
    [clearSelection, selectNode, selectNodes],
  );

  const openContextMenu = (event: ReactMouseEvent | globalThis.MouseEvent) => {
    event.preventDefault();
    const flowPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 230),
      y: Math.min(event.clientY, window.innerHeight - 260),
      position: snapPosition(flowPosition),
    });
  };

  const createFromMenu = (type: NodeType) => {
    if (!contextMenu) return;
    const modelOption = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
    const data: NodeData =
      type === "image_generation"
        ? {
            title: "Image Model",
            model: modelOption.id,
            modelLabel: modelOption.nodeLabel,
            status: "idle",
          }
        : type === "image_reference"
          ? {
              title: "image.png",
              kind: "image_file",
              status: "ready",
            }
          : {};

    createNode({
      type,
      position: snapPosition(contextMenu.position),
      createdBy: "human",
      data,
    });
    setContextMenu(null);
  };

  return (
    <section className="relative h-full min-w-0 overflow-hidden bg-[#111114]">
      <AppSidebar
        onOpenProjects={onOpenProjects}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <ProjectHeader title={project.title} />
      <NodeInspector nodes={selectedNodes} />
      {selectedNodes.length === 0 ||
      selectedNodes.every((node) => node.type === "prompt") ? (
        <TopRightTaskWidget />
      ) : null}
      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          onChange={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      <BottomToolbar
        zoom={zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      {project.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8 text-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">
              Right click to create a box.
            </div>
            <div className="mt-3 text-xl font-medium text-zinc-200">
              Postliminal canvas
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCreate={createFromMenu}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <ReactFlow
        className="postliminal-flow"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onEdgeClick={onEdgeClick}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={openContextMenu}
        onPaneClick={() => {
          setContextMenu(null);
          setSelectedEdgeIds([]);
        }}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        minZoom={0.02}
        maxZoom={2}
        connectionLineStyle={{
          stroke: connectionLineColor,
          strokeWidth: 1.55,
          strokeLinecap: "round",
          filter: `drop-shadow(0 0 5px ${connectionLineColor}55)`,
        }}
        snapToGrid
        snapGrid={snapGrid}
        zoomOnScroll={false}
        zoomActivationKeyCode={["Control", "Meta"]}
        panOnDrag={[1]}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        panOnScrollSpeed={0.8}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={["Backspace", "Delete"]}
        selectionKeyCode={null}
        multiSelectionKeyCode={["Meta", "Shift"]}
        onAuxClick={(event) => event.preventDefault()}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_GAP}
          size={1}
          offset={0.5}
          color="rgba(156,156,168,0.42)"
          bgColor="#111114"
        />
        <ViewportManager nodeCount={project.nodes.length} />
      </ReactFlow>
    </section>
  );
}

export function PostliminalCanvas({
  onOpenProjects,
}: {
  onOpenProjects: () => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasSurface onOpenProjects={onOpenProjects} />
    </ReactFlowProvider>
  );
}
