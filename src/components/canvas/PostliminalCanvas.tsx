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
  type ConnectionLineComponentProps,
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
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Cpu,
  Eraser,
  Image as ImageIcon,
  Info,
  Minus,
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
import { imageGenerationProgressPercent } from "@/lib/imageGenerationProgress";
import { removeImageBackground } from "@/lib/backgroundRemovalClient";
import {
  CANVAS_GRID_GAP,
  CANVAS_SNAP_GRID,
  snapCanvasPosition,
} from "@/lib/canvasGrid";
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
import {
  DEFAULT_OPENAI_IMAGE_API_MODEL,
  estimateOpenAiImageOutputCostUsd,
  formatUsdCents,
  normalizeOpenAiImageResolution,
} from "@/lib/openAiImagePricing";
import type {
  EdgeType,
  NodeData,
  NodeStatus,
  NodeType,
  PostliminalNode,
} from "@/types/project";
import { BackgroundRemovalNode } from "./nodes/BackgroundRemovalNode";
import { BriefNode } from "./nodes/BriefNode";
import { GroupNode } from "./nodes/GroupNode";
import { ImageGenerationNode } from "./nodes/ImageGenerationNode";
import { ImageOutputNode } from "./nodes/ImageOutputNode";
import {
  IMAGE_HANDLE_TOP,
  IMAGE_MODEL_HEIGHT,
  IMAGE_MODEL_WIDTH,
  PROMPT_HANDLE_TOP,
} from "./nodes/NodePrimitives";
import { PromptNode } from "./nodes/PromptNode";

const nodeTypes = {
  brief: BriefNode,
  prompt: PromptNode,
  image_generation: ImageGenerationNode,
  background_removal: BackgroundRemovalNode,
  image_output: ImageOutputNode,
  group: GroupNode,
  image_reference: ImageOutputNode,
  selection_group: GroupNode,
};
const IMAGE_GENERATION_BATCH_CONCURRENCY = 2;
const BACKGROUND_REMOVAL_BATCH_CONCURRENCY = 2;
const FLOATING_GLASS_CLASS =
  "border border-white/[0.10] bg-white/[0.075] shadow-[0_24px_80px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl";

function LiminalEdge(props: EdgeProps) {
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
  const color = data?.color ?? "#6aa6ff";

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      interactionWidth={18}
      style={{
        ...props.style,
        stroke: color,
        strokeWidth: props.selected ? 2 : 1.35,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        filter: `drop-shadow(0 0 7px ${color}24)`,
      }}
    />
  );
}

const edgeTypes = {
  liminal: LiminalEdge,
};

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
    label: "Import image",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    type: "background_removal",
    label: "Remove background",
    icon: <Eraser className="h-4 w-4" />,
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
  if (source.type === "background_removal" && target.type === "image_output") {
    return "generated";
  }
  if (
    (
      source.type === "image_generation" ||
      source.type === "background_removal" ||
      source.type === "image_output" ||
      source.type === "image_reference"
    ) &&
    (target.type === "image_generation" || target.type === "background_removal")
  ) {
    return "variation_of";
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

  return promptEdges.includes(type) ? "#f5b950" : "#6aa6ff";
}

function edgeTone(type: EdgeType) {
  return edgeColor(type) === "#f5b950" ? "prompt" : "image";
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
  return handleTone(handleId) === "prompt" ? "#f5b950" : "#6aa6ff";
}

function BatchConnectionLine(props: ConnectionLineComponentProps<Node<NodeData>>) {
  const project = useProjectStore((state) => state.project);
  const fromNode = project.nodes.find((node) => node.id === props.fromNode.id);
  const fromHandleId = props.fromHandle.id;
  const selectedSameTypeNodes =
    fromNode && project.selectedNodeIds.includes(fromNode.id)
      ? project.selectedNodeIds
          .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
          .filter(
            (node): node is PostliminalNode =>
              node !== undefined && node.type === fromNode.type,
          )
      : [];
  const previewNodes = selectedSameTypeNodes.length > 1
    ? selectedSameTypeNodes
    : fromNode
      ? [fromNode]
      : [];
  const fallbackPath = getBezierPath({
    sourceX: props.fromX,
    sourceY: props.fromY,
    sourcePosition: props.fromPosition,
    targetX: props.toX,
    targetY: props.toY,
    targetPosition: props.toPosition,
    curvature: 0.34,
  })[0];
  const handleTop =
    handleTone(fromHandleId) === "prompt"
      ? pixelOffset(PROMPT_HANDLE_TOP)
      : pixelOffset(IMAGE_HANDLE_TOP);
  const isSourceHandle = props.fromHandle.type === "source";
  const color = handleColor(fromHandleId);

  return (
    <g className="react-flow__connection">
      {previewNodes.length > 0
        ? previewNodes.map((node) => {
            const size = fallbackNodeSize(node.type);
            const sourceX = isSourceHandle
              ? node.position.x + size.width
              : node.position.x;
            const sourceY = node.position.y + handleTop;
            const [path] = getBezierPath({
              sourceX,
              sourceY,
              sourcePosition: props.fromPosition,
              targetX: props.toX,
              targetY: props.toY,
              targetPosition: props.toPosition,
              curvature: 0.34,
            });

            return (
              <path
                key={node.id}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={1.35}
                strokeLinecap="round"
                strokeOpacity={node.id === props.fromNode.id ? 0.95 : 0.58}
                style={{
                  ...props.connectionLineStyle,
                  filter: `drop-shadow(0 0 7px ${color}24)`,
                }}
              />
            );
          })
        : (
          <path
            d={fallbackPath}
            fill="none"
            stroke={color}
            strokeWidth={1.35}
            strokeLinecap="round"
            style={props.connectionLineStyle}
          />
        )}
    </g>
  );
}

function CanvasControls({
  onOpenSettings,
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  onOpenSettings: () => void;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const controlButtonClass =
    "grid h-9 w-9 place-items-center rounded-[12px] text-white/[0.56] transition hover:bg-white/[0.10] hover:text-white/[0.94] disabled:pointer-events-none disabled:text-white/[0.20]";

  return (
    <div
      className={`absolute right-4 top-4 z-30 flex h-10 items-center gap-1 rounded-[14px] p-1 ${FLOATING_GLASS_CLASS}`}
    >
      <button
        aria-label="Undo"
        title="Undo"
        className={controlButtonClass}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        aria-label="Redo"
        title="Redo"
        className={controlButtonClass}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <div
        aria-label={`Zoom ${Math.round(zoom * 100)}%`}
        title="Zoom"
        className="grid h-9 min-w-[58px] place-items-center rounded-[12px] px-2 font-mono text-[11px] font-semibold leading-none tabular-nums text-white/[0.66]"
      >
        {Math.round(zoom * 100)}%
      </div>
      <div className="mx-0.5 h-6 w-px bg-white/[0.10]" />
      <button
        aria-label="Settings"
        title="Settings"
        className={controlButtonClass}
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
    <aside className="absolute inset-y-0 right-0 z-50 w-[360px] border-l border-white/[0.10] bg-white/[0.075] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-white/[0.08] p-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/[0.34]">
              Settings
            </div>
            <div className="mt-1 text-sm font-medium text-white/[0.92]">
              Image model
            </div>
          </div>
          <button
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-[10px] text-white/[0.46] transition hover:bg-white/[0.08] hover:text-white/[0.92]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="text-xs text-white/[0.52]">Fixed image model</div>
            <div className="mt-1 text-sm font-medium text-white/[0.92]">
              {imageModel.label}
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-white/[0.62]">OpenAI API key</span>
            <input
              className="mt-2 h-10 w-full rounded-[14px] border border-white/[0.09] bg-white/[0.04] px-3 text-sm text-white/[0.92] outline-none transition focus:border-[#f5b950]/45 focus:bg-white/[0.065]"
              type="password"
              placeholder="sk-..."
              value={settings.openaiApiKey}
              onChange={(event) =>
                updateSettings({ openaiApiKey: event.target.value })
              }
            />
          </label>

          <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.04] p-3 text-xs leading-5 text-white/[0.54]">
            The API key stays in this browser for the local prototype. You can
            also set OPENAI_API_KEY in the local environment before starting the
            app.
          </div>
        </div>
      </div>
    </aside>
  );
}

function ProjectHeader({
  title,
  onOpenProjects,
  onRename,
}: {
  title: string;
  onOpenProjects: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(title);
    }
  }, [editing, title]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const save = () => {
    const nextTitle = draft.trim() || "Untitled project";
    onRename(nextTitle);
    setDraft(nextTitle);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(title);
    setEditing(false);
  };

  return (
    <div
      className={`absolute left-4 top-4 z-30 flex h-10 max-w-[min(calc(100vw-2rem),420px)] items-center gap-2 overflow-hidden rounded-[14px] px-1.5 ${FLOATING_GLASS_CLASS}`}
      aria-label="Current project"
    >
      <button
        type="button"
        aria-label="Open projects"
        title="Open projects"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] outline-none transition hover:bg-white/[0.10]"
        onClick={onOpenProjects}
      >
        <span className="postliminal-mark scale-[0.78]" aria-hidden="true" />
      </button>

      <div
        className="flex h-7 min-w-0 max-w-[360px] items-center overflow-hidden pr-3"
        onDoubleClick={() => setEditing(true)}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="nodrag nopan h-7 min-w-0 bg-transparent text-sm font-medium text-white/[0.94] outline-none"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 truncate text-left text-sm font-medium text-white/[0.92] outline-none transition hover:text-white"
            title="Rename project"
            onClick={() => setEditing(true)}
          >
            {title}
          </button>
        )}
      </div>
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
      className="absolute z-40 w-52 overflow-hidden rounded-[16px] border border-white/[0.10] bg-white/[0.075] p-1 shadow-2xl backdrop-blur-2xl"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.34]">
        Add
      </div>
      {menuItems.map((item) => (
        <button
          key={item.type}
          className="flex h-10 w-full items-center gap-3 rounded-[12px] px-3 text-sm text-white/[0.88] transition hover:bg-white/[0.08]"
          onClick={() => onCreate(item.type)}
        >
          <span className="text-white/[0.50]">{item.icon}</span>
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

  return createdType === "image_generation" ? "variation_of" : "references";
}

function nodeWidth(type: NodeType) {
  if (type === "background_removal" || type === "image_generation") {
    return IMAGE_MODEL_WIDTH;
  }

  return 286;
}

type NodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function fallbackNodeSize(type?: string) {
  if (type === "image_generation" || type === "background_removal") {
    return { width: IMAGE_MODEL_WIDTH, height: IMAGE_MODEL_HEIGHT };
  }

  if (type === "prompt") {
    return { width: 360, height: 220 };
  }

  return { width: 286, height: 180 };
}

function measuredNodeSize(node: Node<NodeData>) {
  const measured = node.measured;
  const fallback = fallbackNodeSize(node.type);

  return {
    width: node.width ?? measured?.width ?? fallback.width,
    height: node.height ?? measured?.height ?? fallback.height,
  };
}

function nodeBounds(
  node: Node<NodeData>,
  position = node.position,
): NodeBounds {
  const size = measuredNodeSize(node);

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
}

function overlapArea(a: NodeBounds, b: NodeBounds) {
  const width = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );

  return width * height;
}

function boundsContainPoint(bounds: NodeBounds, point: { x: number; y: number }) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function nodeAtPoint(
  nodes: Node<NodeData>[],
  point: { x: number; y: number },
  excludedNodeId: string,
) {
  return nodes
    .filter((node) => node.id !== excludedNodeId)
    .filter((node) => boundsContainPoint(nodeBounds(node), point))
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
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

  return snapCanvasPosition({
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

  if (type === "background_removal") {
    return {
      title: "Remove Background",
      status: "idle",
    };
  }

  if (type === "prompt") {
    return {
      title: "Prompt",
      text: "",
      placeholder: "Describe the next image direction.",
      status: "ready",
    };
  }

  return {};
}

const imageModelQualities = ["low", "medium", "high"] as const;
const imageModelResolutions = ["1024x1024", "1536x1024", "1024x1536"] as const;

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof window.Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative block"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1 text-xs text-white/[0.56]">
        {label} <Info className="h-3 w-3" />
      </div>

      <div className="relative mt-2">
        <button
          type="button"
          className={`flex h-9 w-full items-center justify-between rounded-[14px] border px-3 text-left text-xs font-medium text-white/[0.9] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition ${
            open
              ? "border-[#f5b950]/45 bg-white/[0.075]"
              : "border-white/[0.09] bg-white/[0.045] hover:border-white/[0.18] hover:bg-white/[0.065]"
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{value}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-white/[0.38] transition ${
              open ? "rotate-180 text-white/[0.62]" : ""
            }`}
          />
        </button>

        {open ? (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-[14px] border border-white/[0.12] bg-[#202024]/95 p-1 shadow-[0_18px_48px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
            role="listbox"
          >
            {options.map((option) => {
              const selected = option === value;

              return (
                <button
                  key={option}
                  type="button"
                  className={`flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-xs font-medium transition ${
                    selected
                      ? "bg-[#f5b950]/18 text-white"
                      : "text-white/[0.72] hover:bg-white/[0.08] hover:text-white/[0.92]"
                  }`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <span className="grid h-3.5 w-3.5 place-items-center">
                    {selected ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useImageModelRunner() {
  const updateNode = useProjectStore((state) => state.updateNode);
  const createImageOutputs = useProjectStore((state) => state.createImageOutputs);

  return useCallback(
    async (nodeId: string) => {
      const project = useProjectStore.getState().project;
      const node = project.nodes.find(
        (item) => item.id === nodeId && item.type === "image_generation",
      );
      if (!node) return;
      if (node.data.status === "running") return;

      const option = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
      const modelVariant = stringDataValue(
        node.data.modelVariant,
        "GPT Image 2",
      );
      const quality = stringDataValue(node.data.quality, "medium");
      const resolution = normalizeOpenAiImageResolution(node.data.resolution);
      const runs = boundedRuns(node.data.runs);
      const inputs = resolveImageGenerationInputs(project, node.id);
      const runStartedAt = Date.now();

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
            runStartedAt,
          },
        },
        "human",
      );

      try {
        const result = await generateChatGptImages({
          ...inputs,
          projectId: project.projectId,
          generationNodeId: node.id,
          quality,
          resolution,
          runs,
          startedAt: runStartedAt,
        });

        createImageOutputs(node.id, result.images, "human", {
          sourceModel: option.label,
          apiModel: result.model,
          apiSize: result.size,
          quality,
          resolution,
          prompt: inputs.prompt,
        });
        updateNode(
          node.id,
          {
            data: {
              lastRunError: "",
              runMessage: "",
              runStartedAt: undefined,
            },
          },
          "human",
        );
      } catch (error) {
        updateNode(
          node.id,
          {
            data: {
              status: "error",
              runMessage: "",
              runStartedAt: undefined,
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
    [createImageOutputs, updateNode],
  );
}

function useBackgroundRemovalRunner() {
  const updateNode = useProjectStore((state) => state.updateNode);

  return useCallback(
    async (nodeId: string) => {
      const project = useProjectStore.getState().project;
      const node = project.nodes.find(
        (item) => item.id === nodeId && item.type === "background_removal",
      );
      if (!node) return;
      if (node.data.status === "running") return;

      const imageUrl =
        resolveImageGenerationInputs(project, node.id).imageUrls.slice(-1)[0] ??
        "";
      if (!imageUrl) {
        updateNode(
          node.id,
          {
            data: {
              status: "error",
              lastRunError: "Connect an image before removing the background.",
              runStartedAt: undefined,
            },
          },
          "human",
        );
        return;
      }

      const runStartedAt = Date.now();
      updateNode(
        node.id,
        {
          data: {
            status: "running",
            lastRunError: "",
            runStartedAt,
          },
        },
        "human",
      );

      try {
        const result = await removeImageBackground({
          projectId: project.projectId,
          nodeId: node.id,
          imageUrl,
        });

        updateNode(
          node.id,
          {
            data: {
              status: "completed",
              generatedImageCount: 1,
              generatedImageUrls: [result.image],
              activeGeneratedImageIndex: 0,
              generatedImageMetadata: {
                sourceModel: "Remove background",
                apiModel: result.model,
                apiSize: result.size,
              },
              lastRunError: "",
              runStartedAt: undefined,
            },
          },
          "human",
        );
      } catch (error) {
        updateNode(
          node.id,
          {
            data: {
              status: "error",
              lastRunError:
                error instanceof Error ? error.message : "Background removal failed.",
              runStartedAt: undefined,
            },
          },
          "human",
        );
      }
    },
    [updateNode],
  );
}

function ImageModelTaskRow({
  node,
  expanded,
  queued,
  nowMs,
  onToggle,
}: {
  node: PostliminalNode;
  expanded: boolean;
  queued: boolean;
  nowMs: number;
  onToggle: () => void;
}) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const quality = stringDataValue(node.data.quality, "medium");
  const resolution = normalizeOpenAiImageResolution(node.data.resolution);
  const runs = boundedRuns(node.data.runs);
  const estimatedCost = estimateOpenAiImageOutputCostUsd({
    model: DEFAULT_OPENAI_IMAGE_API_MODEL,
    quality,
    resolution,
    runs,
  });
  const isRunning = node.data.status === "running";
  const isQueued = queued || node.data.status === "queued";

  const updateData = (data: NodeData) => {
    updateNode(node.id, { data }, "human");
  };

  const errorMessage = stringDataValue(node.data.lastRunError, "");
  const displayErrorMessage =
    errorMessage === "Failed to fetch"
      ? "Generation was interrupted by the local dev server. Run it again."
      : errorMessage;
  const progress = isRunning
    ? imageGenerationProgressPercent(node.data.runStartedAt, nowMs)
    : 0;

  return (
    <div>
      <button
        className="flex h-12 w-full items-center gap-2 px-4 text-left text-xs text-white/[0.9] transition hover:bg-white/[0.055]"
        onClick={onToggle}
      >
        <Cpu className="h-3.5 w-3.5 shrink-0 text-[#6aa6ff]" />
        <span className="min-w-0 flex-1 truncate">
          {isRunning
            ? "Image model running"
            : isQueued
              ? "Image model queued"
              : "Image model"}
        </span>
        <span className="font-mono text-[11px] text-white/[0.72]">
          {isRunning ? `${progress}%` : `~${formatUsdCents(estimatedCost)}`}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/[0.38]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-white/[0.38]" />
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

          {displayErrorMessage ? (
            <div className="rounded-[12px] border border-[#f5b950]/[18%] bg-[#f5b950]/[7%] px-2.5 py-2 text-[11px] leading-4 text-white/[0.82]">
              Image generation failed: {displayErrorMessage}
            </div>
          ) : null}
          {isQueued ? (
            <div className="rounded-[12px] border border-white/[0.12] bg-white/[0.05] px-2.5 py-2 text-[11px] leading-4 text-white/[0.68]">
              Waiting for an open generation slot...
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
  const [queuedNodeIds, setQueuedNodeIds] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isBatchRunningRef = useRef(false);
  const runningCount = nodes.filter((node) => node.data.status === "running").length;
  const canRun =
    !isBatchRunning &&
    nodes.some(
      (node) => node.data.status !== "running" && node.data.status !== "queued",
    );
  const footerRuns = boundedRuns(nodes[0]?.data.runs);
  const totalCost = nodes.reduce(
    (sum, node) =>
      sum +
      estimateOpenAiImageOutputCostUsd({
        model: DEFAULT_OPENAI_IMAGE_API_MODEL,
        quality: node.data.quality,
        resolution: node.data.resolution,
        runs: boundedRuns(node.data.runs),
      }),
    0,
  );
  const runningProgress =
    runningCount > 0
      ? Math.round(
          nodes
            .filter((node) => node.data.status === "running")
            .reduce(
              (sum, node) =>
                sum + imageGenerationProgressPercent(node.data.runStartedAt, nowMs),
              0,
            ) / runningCount,
        )
      : 0;

  useEffect(() => {
    if (nodes.length === 0) return;
    if (expandedNodeId && !nodes.some((node) => node.id === expandedNodeId)) {
      setExpandedNodeId(nodes[0].id);
    }
  }, [expandedNodeId, nodes]);

  useEffect(() => {
    if (runningCount === 0) return;

    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, [runningCount]);

  const updateAllRuns = (nextRuns: number) => {
    if (isBatchRunning) return;
    const runs = boundedRuns(nextRuns);
    nodes.forEach((node) => updateNode(node.id, { data: { runs } }, "human"));
  };

  const runSelected = async () => {
    if (isBatchRunningRef.current) return;

    const nodeIds = nodes
      .filter(
        (node) => node.data.status !== "running" && node.data.status !== "queued",
      )
      .map((node) => node.id);
    if (nodeIds.length === 0) return;

    isBatchRunningRef.current = true;
    setIsBatchRunning(true);
    setQueuedNodeIds(new Set(nodeIds));
    nodeIds.forEach((nodeId) =>
      updateNode(
        nodeId,
        {
          data: {
            status: "queued",
            lastRunError: "",
          },
        },
        "human",
      ),
    );

    let nextIndex = 0;
    const runNext = async () => {
      while (nextIndex < nodeIds.length) {
        const nodeId = nodeIds[nextIndex];
        nextIndex += 1;
        setQueuedNodeIds((current) => {
          const nextQueued = new Set(current);
          nextQueued.delete(nodeId);
          return nextQueued;
        });
        await runImageModel(nodeId);
      }
    };

    try {
      await Promise.allSettled(
        Array.from(
          { length: Math.min(IMAGE_GENERATION_BATCH_CONCURRENCY, nodeIds.length) },
          () => runNext(),
        ),
      );
    } finally {
      isBatchRunningRef.current = false;
      setIsBatchRunning(false);
      setQueuedNodeIds(new Set());
    }
  };

  return (
    <aside
      className="absolute inset-y-0 right-0 z-50 w-[252px] border-l border-white/[0.10] bg-white/[0.075] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {nodes.map((node) => (
            <ImageModelTaskRow
              key={node.id}
              node={node}
              expanded={expandedNodeId === node.id}
              queued={queuedNodeIds.has(node.id)}
              nowMs={nowMs}
              onToggle={() =>
                setExpandedNodeId((current) =>
                  current === node.id ? "" : node.id,
                )
              }
            />
          ))}
        </div>

        <div className="border-t border-white/[0.10] px-4 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/[0.34]">
            Run selected nodes
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs font-medium text-white/[0.9]">Runs</div>
            <div className="flex h-8 items-center overflow-hidden rounded-[12px] border border-white/[0.10] bg-white/[0.045]">
              <button
                className="grid h-8 w-8 place-items-center text-white/[0.52] transition hover:bg-white/[0.08] hover:text-white/[0.9] disabled:text-white/[0.18]"
                disabled={isBatchRunning || footerRuns <= 1}
                onClick={() => updateAllRuns(footerRuns - 1)}
              >
                <Minus className="h-3 w-3" />
              </button>
              <div className="w-9 text-center font-mono text-xs font-semibold text-white/[0.9]">
                {footerRuns}
              </div>
              <button
                className="grid h-8 w-8 place-items-center text-white/[0.52] transition hover:bg-white/[0.08] hover:text-white/[0.9]"
                disabled={isBatchRunning}
                onClick={() => updateAllRuns(footerRuns + 1)}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <div className="text-white/[0.48]">Est. output cost</div>
            <div className="font-mono text-xs font-semibold text-white/[0.9]">
              ~{formatUsdCents(totalCost)}
            </div>
          </div>
          <button
            className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-[12px] border border-white/[0.14] bg-white/[0.10] text-xs font-medium text-white/[0.92] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-white/[0.14] disabled:cursor-default disabled:opacity-55"
            disabled={!canRun}
            onClick={runSelected}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            {runningCount > 0
              ? `Running ${runningProgress}%`
              : isBatchRunning
                ? "Running"
                : "Run selected"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function BackgroundRemovalTaskRow({
  node,
  expanded,
  queued,
  nowMs,
  onToggle,
}: {
  node: PostliminalNode;
  expanded: boolean;
  queued: boolean;
  nowMs: number;
  onToggle: () => void;
}) {
  const isRunning = node.data.status === "running";
  const isQueued = queued || node.data.status === "queued";
  const errorMessage = stringDataValue(node.data.lastRunError, "");
  const progress = isRunning
    ? imageGenerationProgressPercent(node.data.runStartedAt, nowMs)
    : 0;

  return (
    <div>
      <button
        className="flex h-12 w-full items-center gap-2 px-4 text-left text-xs text-white/[0.9] transition hover:bg-white/[0.055]"
        onClick={onToggle}
      >
        <Eraser className="h-3.5 w-3.5 shrink-0 text-[#6aa6ff]" />
        <span className="min-w-0 flex-1 truncate">
          {isRunning
            ? "Remove background running"
            : isQueued
              ? "Remove background queued"
              : "Remove background"}
        </span>
        <span className="font-mono text-[11px] text-white/[0.72]">
          {isRunning ? `${progress}%` : isQueued ? "queued" : ""}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/[0.38]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-white/[0.38]" />
        )}
      </button>

      {expanded ? (
        <div className="space-y-4 px-4 pb-5">
          <div>
            <div className="flex items-center gap-1 text-xs text-white/[0.56]">
              Method <Info className="h-3 w-3" />
            </div>
            <div className="mt-2 flex h-9 w-full items-center rounded-[14px] border border-white/[0.09] bg-white/[0.045] px-3 text-xs font-medium text-white/[0.9] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              Transparent PNG
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-[12px] border border-[#f5b950]/[18%] bg-[#f5b950]/[7%] px-2.5 py-2 text-[11px] leading-4 text-white/[0.82]">
              Background removal failed: {errorMessage}
            </div>
          ) : null}
          {isQueued ? (
            <div className="rounded-[12px] border border-white/[0.12] bg-white/[0.05] px-2.5 py-2 text-[11px] leading-4 text-white/[0.68]">
              Waiting for an open background removal slot...
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BackgroundRemovalInspector({ nodes }: { nodes: PostliminalNode[] }) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const runBackgroundRemoval = useBackgroundRemovalRunner();
  const [expandedNodeId, setExpandedNodeId] = useState(nodes[0]?.id ?? "");
  const [queuedNodeIds, setQueuedNodeIds] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isBatchRunningRef = useRef(false);
  const runningCount = nodes.filter((node) => node.data.status === "running").length;
  const canRun =
    !isBatchRunning &&
    nodes.some(
      (node) => node.data.status !== "running" && node.data.status !== "queued",
    );
  const runningProgress =
    runningCount > 0
      ? Math.round(
          nodes
            .filter((node) => node.data.status === "running")
            .reduce(
              (sum, node) =>
                sum + imageGenerationProgressPercent(node.data.runStartedAt, nowMs),
              0,
            ) / runningCount,
        )
      : 0;

  useEffect(() => {
    if (nodes.length === 0) return;
    if (expandedNodeId && !nodes.some((node) => node.id === expandedNodeId)) {
      setExpandedNodeId(nodes[0].id);
    }
  }, [expandedNodeId, nodes]);

  useEffect(() => {
    if (runningCount === 0) return;

    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, [runningCount]);

  const runSelected = async () => {
    if (isBatchRunningRef.current) return;

    const nodeIds = nodes
      .filter(
        (node) => node.data.status !== "running" && node.data.status !== "queued",
      )
      .map((node) => node.id);
    if (nodeIds.length === 0) return;

    isBatchRunningRef.current = true;
    setIsBatchRunning(true);
    setQueuedNodeIds(new Set(nodeIds));
    nodeIds.forEach((nodeId) =>
      updateNode(
        nodeId,
        {
          data: {
            status: "queued",
            lastRunError: "",
          },
        },
        "human",
      ),
    );

    let nextIndex = 0;
    const runNext = async () => {
      while (nextIndex < nodeIds.length) {
        const nodeId = nodeIds[nextIndex];
        nextIndex += 1;
        setQueuedNodeIds((current) => {
          const nextQueued = new Set(current);
          nextQueued.delete(nodeId);
          return nextQueued;
        });
        await runBackgroundRemoval(nodeId);
      }
    };

    try {
      await Promise.allSettled(
        Array.from(
          {
            length: Math.min(BACKGROUND_REMOVAL_BATCH_CONCURRENCY, nodeIds.length),
          },
          () => runNext(),
        ),
      );
    } finally {
      isBatchRunningRef.current = false;
      setIsBatchRunning(false);
      setQueuedNodeIds(new Set());
    }
  };

  return (
    <aside
      className="absolute inset-y-0 right-0 z-50 w-[252px] border-l border-white/[0.10] bg-white/[0.075] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {nodes.map((node) => (
            <BackgroundRemovalTaskRow
              key={node.id}
              node={node}
              expanded={expandedNodeId === node.id}
              queued={queuedNodeIds.has(node.id)}
              nowMs={nowMs}
              onToggle={() =>
                setExpandedNodeId((current) =>
                  current === node.id ? "" : node.id,
                )
              }
            />
          ))}
        </div>

        <div className="border-t border-white/[0.10] px-4 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/[0.34]">
            Run selected nodes
          </div>
          <button
            className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-[12px] border border-white/[0.14] bg-white/[0.10] text-xs font-medium text-white/[0.92] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-white/[0.14] disabled:cursor-default disabled:opacity-55"
            disabled={!canRun}
            onClick={runSelected}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            {runningCount > 0
              ? `Running ${runningProgress}%`
              : isBatchRunning
                ? "Running"
                : "Run selected"}
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
  const backgroundRemovalNodes = nodes.filter(
    (selectedNode) => selectedNode.type === "background_removal",
  );

  if (imageModelNodes.length > 0) {
    return <ImageModelInspector nodes={imageModelNodes} />;
  }
  if (backgroundRemovalNodes.length > 0) {
    return <BackgroundRemovalInspector nodes={backgroundRemovalNodes} />;
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
    <aside className="absolute inset-y-0 right-0 z-50 w-[324px] border-l border-white/[0.10] bg-white/[0.075] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-white/[0.08] p-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/[0.34]">
              {typeLabel(node.type)}
            </div>
            <div className="mt-1 text-sm font-medium text-white/[0.92]">
              {node.data.title ? String(node.data.title) : "Untitled"}
            </div>
          </div>
          <button
            aria-label="Close inspector"
            className="grid h-8 w-8 place-items-center rounded-[10px] text-white/[0.46] transition hover:bg-white/[0.08] hover:text-white/[0.92]"
            onClick={() => clearSelection("human")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <label className="block">
            <span className="text-xs text-white/[0.56]">Title</span>
            <input
              className="mt-2 h-10 w-full rounded-[14px] border border-white/[0.09] bg-white/[0.04] px-3 text-sm text-white/[0.92] outline-none transition focus:border-[#f5b950]/45 focus:bg-white/[0.065]"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
            />
          </label>

          {"text" in node.data || node.type === "brief" ? (
            <label className="block">
              <span className="text-xs text-white/[0.56]">Prompt</span>
              <textarea
                className="mt-2 min-h-48 w-full resize-none rounded-[14px] border border-white/[0.09] bg-white/[0.04] px-3 py-3 text-sm leading-6 text-white/[0.84] outline-none transition focus:border-[#f5b950]/45 focus:bg-white/[0.065]"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={saveText}
              />
            </label>
          ) : null}

          <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/[0.48]">Status</span>
              <span className="flex items-center gap-2 capitalize text-white/[0.84]">
                <Circle className="h-2 w-2 fill-[#6aa6ff] text-[#6aa6ff]" />
                {status}
              </span>
            </div>
          </div>

          {node.type === "image_output" ? (
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.10] bg-white/[0.055] text-sm text-white/[0.88] transition hover:bg-white/[0.10]"
              onClick={() => toggleImageSelected(node.id, "human")}
            >
              <Wand2 className="h-4 w-4" />
              {node.data.selected ? "Unselect output" : "Select output"}
            </button>
          ) : null}
        </div>

        <div className="border-t border-white/[0.08] p-4">
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-[#ff7a70]/20 bg-[#ff7a70]/[7%] text-sm text-[#ffc5bf] transition hover:bg-[#ff7a70]/[12%]"
            onClick={() => deleteNode(node.id, "human")}
          >
            <Trash2 className="h-4 w-4" />
            Delete
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
  const renameProject = useProjectStore((state) => state.renameProject);
  const duplicateSelectedNodes = useProjectStore(
    (state) => state.duplicateSelectedNodes,
  );
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore((state) => state.canUndo);
  const canRedo = useProjectStore((state) => state.canRedo);
  const { getNodes, screenToFlowPosition } = useReactFlow();
  const looseConnectionStartRef = useRef<LooseConnectionStart | null>(null);
  const connectionSelectionRef = useRef<string[]>([]);
  const selectionHistoryRef = useRef<{
    current: string[];
    previous: string[];
  }>({
    current: project.selectedNodeIds,
    previous: [],
  });
  const connectionCompletedRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [connectionLineColor, setConnectionLineColor] = useState("#6aa6ff");
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
  const rememberSelection = useCallback((nodeIds: string[]) => {
    const nextNodeIds = [...nodeIds];
    const current = selectionHistoryRef.current.current;
    if (sameStringArray(current, nextNodeIds)) return;

    selectionHistoryRef.current = {
      current: nextNodeIds,
      previous: current,
    };
  }, []);

  const selectedNodes = useMemo(
    () =>
      project.selectedNodeIds
        .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
        .filter((node) => node?.type !== "image_output")
        .filter((node): node is PostliminalNode => Boolean(node)),
    [project.nodes, project.selectedNodeIds],
  );

  const storeNodes = useMemo<Node<NodeData>[]>(() => {
    const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
    const connectedHandles = new Map<string, Set<string>>();
    const generatedImageUrls = new Map<string, string[]>();
    const markConnected = (nodeId: string, handleId: string) => {
      const existing = connectedHandles.get(nodeId) ?? new Set<string>();
      existing.add(handleId);
      connectedHandles.set(nodeId, existing);
    };

    project.edges.forEach((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);

      if (
        edge.type === "generated" &&
        sourceNode?.type === "image_generation" &&
        targetNode?.type === "image_output"
      ) {
        const imageUrl = targetNode.data.imageUrl;
        if (typeof imageUrl === "string" && imageUrl.length > 0) {
          generatedImageUrls.set(edge.source, [
            ...(generatedImageUrls.get(edge.source) ?? []),
            imageUrl,
          ]);
        }
      }

      if (sourceNode?.type === "image_output" || targetNode?.type === "image_output") {
        return;
      }

      markConnected(edge.source, edgeSourceHandle(edge.type));

      if (targetNode?.type !== "prompt") {
        markConnected(edge.target, edgeTargetHandle(edge.type));
      }
    });

    return project.nodes
      .filter((node) => node.type !== "image_output")
      .map((node) => {
        const nodeGeneratedImageUrls = Array.isArray(node.data.generatedImageUrls)
          ? node.data.generatedImageUrls.filter(
              (imageUrl): imageUrl is string => typeof imageUrl === "string",
            )
          : [];
        const outputNodeImageUrls = generatedImageUrls.get(node.id) ?? [];
        const combinedImageUrls = Array.from(
          new Set([...nodeGeneratedImageUrls, ...outputNodeImageUrls]),
        );

        return {
          id: node.id,
          type: node.type,
          position: node.position,
          data: {
            ...node.data,
            nodeType: node.type,
            generatedImageCount: combinedImageUrls.length,
            generatedImageUrls: combinedImageUrls,
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
        };
      });
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
      const hasSelectedNodes = project.selectedNodeIds.length > 0;

      if (usesShortcutModifier && key === "c" && hasSelectedNodes) {
        event.preventDefault();
        return;
      }

      if (usesShortcutModifier && key === "v" && hasSelectedNodes) {
        event.preventDefault();
        duplicateSelectedNodes("human");
        return;
      }

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
  }, [
    disconnectNodes,
    duplicateSelectedNodes,
    project.selectedNodeIds.length,
    redo,
    selectedEdgeIds,
    undo,
  ]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (project.selectedNodeIds.length > 0) {
        event.preventDefault();
        duplicateSelectedNodes("human");
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
          position: snapCanvasPosition(
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
  }, [createNode, duplicateSelectedNodes, project.selectedNodeIds.length, screenToFlowPosition]);

  const flowEdges = useMemo<Edge[]>(() => {
    const nodeById = new Map(project.nodes.map((node) => [node.id, node]));

    return project.edges
      .filter((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        return (
          source &&
          target &&
          source.type !== "image_output" &&
          target.type !== "image_output" &&
          target.type !== "prompt"
        );
      })
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edgeSourceHandle(edge.type),
        targetHandle: edgeTargetHandle(edge.type),
        type: "liminal",
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
          position: snapCanvasPosition(change.position),
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
      const position = snapCanvasPosition(node.position);
      moveNode(node.id, position, "human");

      if (node.type !== "prompt" && node.type !== "image_generation") return;

      const draggedBounds = nodeBounds(node, position);
      const targetType = node.type === "prompt" ? "image_generation" : "prompt";
      const target = getNodes()
        .filter(
          (candidate) =>
            candidate.id !== node.id && candidate.type === targetType,
        )
        .map((candidate) => ({
          node: candidate,
          area: overlapArea(draggedBounds, nodeBounds(candidate)),
        }))
        .filter((candidate) => candidate.area > 0)
        .sort((a, b) => b.area - a.area)[0]?.node;

      if (!target) return;

      if (node.type === "prompt") {
        connectNodes(node.id, target.id, "input_to", "human");
      } else {
        connectNodes(target.id, node.id, "input_to", "human");
      }
    },
    [connectNodes, getNodes, moveNode],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      connectionCompletedRef.current = true;
      const source = project.nodes.find((node) => node.id === connection.source);
      const target = project.nodes.find((node) => node.id === connection.target);
      if (!source || !target) return;

      const selectedAtStart =
        connectionSelectionRef.current.length > 1
          ? connectionSelectionRef.current
          : project.selectedNodeIds.length > 1
            ? project.selectedNodeIds
            : connectionSelectionRef.current.length > 0
              ? connectionSelectionRef.current
              : project.selectedNodeIds;
      const sourceHandle = connection.sourceHandle;
      const targetHandle = connection.targetHandle;

      if (
        sourceHandle &&
        sourceHandle === looseConnectionStartRef.current?.handleId
      ) {
        const selectedSources = selectedAtStart
          .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
          .filter(
            (node): node is PostliminalNode =>
              node !== undefined && node.type === source.type,
          );
        let connectedCount = 0;

        if (selectedSources.length > 1) {
          selectedSources.forEach((selectedSource) => {
            const edgeType = inferEdgeType(selectedSource, target);
            if (edgeSourceHandle(edgeType) !== sourceHandle) return;
            if (targetHandle && edgeTargetHandle(edgeType) !== targetHandle) return;

            const edge = connectNodes(
              selectedSource.id,
              target.id,
              edgeType,
              "human",
            );
            if (edge) connectedCount += 1;
          });

          if (connectedCount > 0) return;
        }
      }

      if (
        target &&
        (target.type === "image_generation" ||
          target.type === "background_removal") &&
        (targetHandle === "prompt-in" || targetHandle === "image-in") &&
        selectedAtStart.includes(target.id)
      ) {
        const selectedImageTargets = selectedAtStart
          .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
          .filter(
            (node): node is PostliminalNode =>
              node !== undefined && node.type === target.type,
          );
        let connectedCount = 0;

        if (selectedImageTargets.length > 1) {
          selectedImageTargets.forEach((selectedTarget) => {
            const edgeType = inferEdgeType(source, selectedTarget);
            if (sourceHandle && edgeSourceHandle(edgeType) !== sourceHandle) return;
            if (edgeTargetHandle(edgeType) !== targetHandle) return;

            const edge = connectNodes(
              source.id,
              selectedTarget.id,
              edgeType,
              "human",
            );
            if (edge) connectedCount += 1;
          });

          if (connectedCount > 0) return;
        }
      }

      const edgeType = inferEdgeType(source, target);
      if (targetHandle && edgeTargetHandle(edgeType) !== targetHandle) return;
      if (sourceHandle && edgeSourceHandle(edgeType) !== sourceHandle) return;

      connectNodes(connection.source, connection.target, edgeType, "human");
    },
    [connectNodes, project.nodes, project.selectedNodeIds],
  );

  const onConnectStart = useCallback<OnConnectStart>(
    (_event, params) => {
      const nodeId = params.nodeId;
      const handleId = params.handleId;
      const handleType = params.handleType;
      connectionCompletedRef.current = false;
      connectionSelectionRef.current = [];

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
      const startNode = project.nodes.find((node) => node.id === nodeId);
      const previousSelection = selectionHistoryRef.current.previous;
      const currentSelection =
        project.selectedNodeIds.length === 1 &&
        project.selectedNodeIds[0] === nodeId &&
        previousSelection.length > 1
          ? previousSelection
          : project.selectedNodeIds;
      const selectedNodesOfSameType = currentSelection.filter((selectedId) => {
        const selectedNode = project.nodes.find((node) => node.id === selectedId);
        return selectedNode?.type === startNode?.type;
      });
      connectionSelectionRef.current = selectedNodesOfSameType.includes(nodeId)
        ? selectedNodesOfSameType
        : currentSelection.length > 0
          ? currentSelection
          : [nodeId];
      setConnectionLineColor(handleColor(handleId));
    },
    [project.nodes, project.selectedNodeIds],
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

      const selectedConnectorNodes = connectionSelectionRef.current
        .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
        .filter(
          (node): node is PostliminalNode =>
            node !== undefined && node.type === startNode.type,
        );
      const connectorNodes = selectedConnectorNodes.some(
        (node) => node.id === startNode.id,
      )
        ? selectedConnectorNodes
        : [...selectedConnectorNodes, startNode];
      const connectSourceToConnectorTargets = (
        sourceNode: PostliminalNode,
        explicitEdgeType?: EdgeType,
      ) => {
        let connectedCount = 0;

        connectorNodes.forEach((targetNode) => {
          const batchEdgeType =
            explicitEdgeType ?? inferEdgeType(sourceNode, targetNode);
          if (edgeTargetHandle(batchEdgeType) !== start.handleId) return;

          const edge = connectNodes(
            sourceNode.id,
            targetNode.id,
            batchEdgeType,
            "human",
          );
          if (edge) connectedCount += 1;
        });

        return connectedCount;
      };
      const connectConnectorSourcesToTarget = (
        targetNode: PostliminalNode,
        explicitEdgeType?: EdgeType,
      ) => {
        let connectedCount = 0;

        connectorNodes.forEach((sourceNode) => {
          const batchEdgeType =
            explicitEdgeType ?? inferEdgeType(sourceNode, targetNode);
          if (edgeSourceHandle(batchEdgeType) !== start.handleId) return;

          const edge = connectNodes(
            sourceNode.id,
            targetNode.id,
            batchEdgeType,
            "human",
          );
          if (edge) connectedCount += 1;
        });

        return connectedCount;
      };

      const flowPoint = screenToFlowPosition(point);
      const droppedNode = nodeAtPoint(getNodes(), flowPoint, start.nodeId);
      const droppedStoreNode = droppedNode
        ? project.nodes.find((node) => node.id === droppedNode.id)
        : undefined;

      if (droppedStoreNode) {
        const connectedCount =
          start.handleType === "target"
            ? connectSourceToConnectorTargets(droppedStoreNode)
            : connectConnectorSourcesToTarget(droppedStoreNode);
        if (connectedCount > 0) return;

        if (start.handleType === "target") {
          connectNodes(
            droppedStoreNode.id,
            startNode.id,
            inferEdgeType(droppedStoreNode, startNode),
            "human",
          );
        } else {
          connectNodes(
            startNode.id,
            droppedStoreNode.id,
            inferEdgeType(startNode, droppedStoreNode),
            "human",
          );
        }
        return;
      }

      const createdType = looseConnectionNodeType(start, startNode);
      const edgeType = looseConnectionEdgeType(start, startNode, createdType);
      const createdNode = createNode({
        type: createdType,
        createdBy: "human",
        position: looseConnectionPosition(
          flowPoint,
          start,
          createdType,
          edgeType,
        ),
        data: looseConnectionNodeData(createdType),
      });

      const connectedCount =
        start.handleType === "target"
          ? connectSourceToConnectorTargets(createdNode, edgeType)
          : connectConnectorSourcesToTarget(createdNode, edgeType);
      if (connectedCount > 0) {
        selectNode(createdNode.id, "human");
        return;
      }

      if (start.handleType === "target") {
        connectNodes(createdNode.id, start.nodeId, edgeType, "human");
      } else {
        connectNodes(start.nodeId, createdNode.id, edgeType, "human");
      }
      selectNode(createdNode.id, "human");
    },
    [
      connectNodes,
      createNode,
      getNodes,
      project.nodes,
      screenToFlowPosition,
      selectNode,
    ],
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
      const nodeIds = nodes.map((node) => node.id);
      rememberSelection(nodeIds);
      setSelectedEdgeIds(edges.map((edge) => edge.id));

      if (nodes.length === 0) {
        clearSelection("human");
        return;
      }
      if (nodes.length === 1) {
        selectNode(nodeIds[0], "human");
        return;
      }
      selectNodes(nodeIds, "human");
    },
    [clearSelection, rememberSelection, selectNode, selectNodes],
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
      position: snapCanvasPosition(flowPosition),
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
	        : type === "background_removal"
	          ? {
	              title: "Remove Background",
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
      position: snapCanvasPosition(contextMenu.position),
      createdBy: "human",
      data,
    });
    setContextMenu(null);
  };

  return (
    <section className="postliminal-surface postliminal-canvas-surface relative h-full min-w-0 overflow-hidden">
      <CanvasControls
        onOpenSettings={() => setSettingsOpen(true)}
        zoom={zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />
      <ProjectHeader
        title={project.title}
        onOpenProjects={onOpenProjects}
        onRename={renameProject}
      />
      <NodeInspector nodes={selectedNodes} />
      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          onChange={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {project.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8 text-center">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.26em] text-white/[0.52]">
              Right click to add a node.
            </div>
            <div className="mt-3 text-xl font-medium text-white/[0.9]">
              PostLiminal canvas
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
          strokeWidth: 1.4,
          strokeLinecap: "round",
          filter: `drop-shadow(0 0 7px ${connectionLineColor}30)`,
        }}
        connectionLineComponent={BatchConnectionLine}
        snapToGrid
        snapGrid={CANVAS_SNAP_GRID}
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
          gap={CANVAS_GRID_GAP}
          size={1.05}
          offset={0.5}
          color="rgba(174,185,179,0.34)"
          bgColor="transparent"
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
