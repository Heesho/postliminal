"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  Expand,
  Grid2X2,
  LoaderCircle,
  Square,
  X,
} from "lucide-react";
import {
  DEFAULT_IMAGE_MODEL_ID,
  getImageModelOption,
} from "@/lib/imageModels";
import { normalizeOpenAiImageResolution } from "@/lib/openAiImagePricing";
import {
  generateChatGptImages,
  resolveImageGenerationInputs,
} from "@/lib/imageGenerationClient";
import { useProjectStore } from "@/store/projectStore";
import type { NodeData } from "@/types/project";
import {
  CARD_HEADER_HEIGHT,
  IMAGE_HANDLE_TOP,
  isHandleConnected,
  NodeFrame,
  PROMPT_HANDLE_TOP,
  SourceHandle,
  TargetHandle,
} from "./NodePrimitives";

type FlowNode = Node<NodeData>;
const promptLabelTop = `calc(${PROMPT_HANDLE_TOP} - 20px)`;
const imageLabelTop = `calc(${IMAGE_HANDLE_TOP} - 20px)`;
const connectorLabel =
  "pointer-events-none absolute text-[10px] font-semibold leading-none tracking-wide";
const imageModelWidth = 362;
const minPreviewHeight = 220;
const maxPreviewHeight = 560;

type ImageSize = {
  width: number;
  height: number;
};

const frameBackgrounds = [
  "linear-gradient(180deg,rgba(255,248,226,0.92),rgba(230,222,197,0.4)_34%,rgba(29,123,139,0.82)_82%),radial-gradient(circle_at_82%_34%,rgba(174,139,70,0.75),transparent_12%),radial-gradient(circle_at_72%_60%,rgba(120,88,50,0.62),transparent_18%)",
  "linear-gradient(180deg,rgba(244,235,212,0.88),rgba(197,198,181,0.55)_36%,rgba(18,98,120,0.78)_84%),radial-gradient(circle_at_24%_68%,rgba(44,126,134,0.5),transparent_24%),radial-gradient(circle_at_72%_44%,rgba(146,102,59,0.7),transparent_17%)",
  "linear-gradient(180deg,rgba(231,224,207,0.84),rgba(150,165,155,0.45)_40%,rgba(35,82,96,0.78)_90%),radial-gradient(circle_at_72%_32%,rgba(191,156,89,0.7),transparent_11%),radial-gradient(circle_at_46%_76%,rgba(28,92,114,0.7),transparent_20%)",
  "linear-gradient(180deg,rgba(250,241,218,0.9),rgba(214,205,180,0.45)_38%,rgba(27,111,127,0.8)_88%),radial-gradient(circle_at_42%_44%,rgba(150,111,67,0.64),transparent_17%),radial-gradient(circle_at_78%_72%,rgba(35,105,119,0.7),transparent_22%)",
  "linear-gradient(180deg,rgba(236,229,211,0.88),rgba(197,199,181,0.54)_36%,rgba(37,112,128,0.84)_88%),radial-gradient(circle_at_58%_40%,rgba(191,151,81,0.72),transparent_13%),radial-gradient(circle_at_32%_78%,rgba(29,96,112,0.72),transparent_18%)",
  "linear-gradient(180deg,rgba(246,238,219,0.9),rgba(224,214,189,0.44)_34%,rgba(31,102,124,0.82)_88%),radial-gradient(circle_at_78%_44%,rgba(141,95,55,0.68),transparent_17%),radial-gradient(circle_at_22%_70%,rgba(38,118,128,0.58),transparent_20%)",
];

function previewBackground(index: number) {
  return {
    backgroundColor: "#f4f4f4",
    backgroundImage: frameBackgrounds[index % frameBackgrounds.length],
    backgroundSize: "cover",
  };
}

function boundedRuns(value: unknown) {
  return Math.max(
    1,
    Math.min(8, typeof value === "number" && Number.isFinite(value) ? value : 1),
  );
}

function parseImageSize(value: unknown): ImageSize | undefined {
  if (typeof value !== "string") return undefined;

  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;

  return { width, height };
}

function metadataApiSize(data: NodeData) {
  const metadata = data.generatedImageMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const apiSize = (metadata as Record<string, unknown>).apiSize;
  return typeof apiSize === "string" ? apiSize : undefined;
}

function previewHeightForSize(size: ImageSize) {
  return Math.round(
    Math.max(
      minPreviewHeight,
      Math.min(maxPreviewHeight, imageModelWidth * (size.height / size.width)),
    ),
  );
}

export function ImageGenerationNode({ id, data, selected }: NodeProps<FlowNode>) {
  const project = useProjectStore((state) => state.project);
  const updateNode = useProjectStore((state) => state.updateNode);
  const createImageOutputs = useProjectStore((state) => state.createImageOutputs);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [viewMode, setViewMode] = useState<"single" | "multi">("single");
  const [activeImage, setActiveImage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadedImageSizes, setLoadedImageSizes] = useState<Record<string, ImageSize>>(
    {},
  );
  const model = getImageModelOption(data.model);
  const hasPrompt = isHandleConnected(data, "prompt-in");
  const hasImageInput = isHandleConnected(data, "image-in");
  const hasImageOutput = isHandleConnected(data, "image-out");
  const isRunning = data.status === "running";
  const generatedImageCount =
    typeof data.generatedImageCount === "number" ? data.generatedImageCount : 0;
  const generatedImageUrls = Array.isArray(data.generatedImageUrls)
    ? data.generatedImageUrls.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string",
      )
    : [];
  const previewCount = Math.max(
    0,
    Math.min(24, Math.max(generatedImageUrls.length, generatedImageCount)),
  );
  const hasPreview = previewCount > 0;
  const resolution = normalizeOpenAiImageResolution(data.resolution);
  const metadataSize = parseImageSize(metadataApiSize(data));
  const configuredSize = parseImageSize(resolution) ?? { width: 1024, height: 1024 };
  const checkerStyle = {
    backgroundColor: "#11121a",
    backgroundImage:
      "linear-gradient(45deg, #0c0c10 25%, transparent 25%), linear-gradient(-45deg, #0c0c10 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0c0c10 75%), linear-gradient(-45deg, transparent 75%, #0c0c10 75%)",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
    backgroundSize: "20px 20px",
  };
  const showMultiView = hasPreview && viewMode === "multi";
  const activeImageUrl = generatedImageUrls[activeImage];
  const activeImageSize =
    (activeImageUrl ? loadedImageSizes[activeImageUrl] : undefined) ??
    metadataSize ??
    configuredSize;
  const previewHeight = previewHeightForSize(activeImageSize);
  const nodeHeight = CARD_HEADER_HEIGHT + previewHeight;
  const rememberImageSize = (src: string, image: HTMLImageElement) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width <= 0 || height <= 0) return;

    setLoadedImageSizes((current) => {
      const existing = current[src];
      if (existing?.width === width && existing.height === height) {
        return current;
      }

      return { ...current, [src]: { width, height } };
    });
  };

  useEffect(() => {
    if (!isRunning) {
      setProgress(0);
      return;
    }

    const startedAt = Date.now();
    setProgress(6);

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(96, 6 + Math.round((elapsed / 3200) * 90));
      setProgress(nextProgress);
    }, 120);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!hasPreview) {
      setViewMode("single");
      setActiveImage(0);
      return;
    }

    if (activeImage >= previewCount) {
      setActiveImage(Math.max(0, previewCount - 1));
    }
  }, [activeImage, hasPreview, previewCount]);

  const previousImage = () => {
    if (!hasPreview) return;
    setActiveImage((index) => (index + previewCount - 1) % previewCount);
  };
  const nextImage = () => {
    if (!hasPreview) return;
    setActiveImage((index) => (index + 1) % previewCount);
  };
  const runModel = async () => {
    if (isRunning) return;

    const option = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
    const runs = boundedRuns(data.runs);
    const quality = typeof data.quality === "string" ? data.quality : "medium";
    const inputs = resolveImageGenerationInputs(project, id);

    updateNode(
      id,
      {
        data: {
          model: option.id,
          modelLabel: option.nodeLabel,
          status: "running",
          lastRunError: "",
        },
      },
      "human",
    );

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await generateChatGptImages({
        ...inputs,
        projectId: project.projectId,
        generationNodeId: id,
        quality,
        resolution,
        runs,
        signal: abortController.signal,
      });

      createImageOutputs(id, result.images, "human", {
        sourceModel: option.label,
        apiModel: result.model,
        apiSize: result.size,
        quality,
        resolution,
        prompt: inputs.prompt,
      });
      updateNode(id, { data: { lastRunError: "" } }, "human");
    } catch (error) {
      updateNode(
        id,
        {
          data: {
            status: "error",
            lastRunError:
              error instanceof Error
                ? error.message
                : "Image generation failed",
          },
        },
        "human",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };
  const cancelRun = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    updateNode(
      id,
      {
        data: {
          status: "error",
          lastRunError: "Image generation was cancelled.",
        },
      },
      "human",
    );
  };

  return (
    <NodeFrame
      className="flex flex-col"
      selected={selected}
      style={{ width: imageModelWidth, height: nodeHeight }}
    >
      {selected ? (
        <div
          className={`${connectorLabel} right-full mr-4 w-16 text-right font-mono font-medium tracking-[0.08em] text-[#f5b950]`}
          style={{ top: promptLabelTop }}
        >
          Prompt
        </div>
      ) : null}
      {selected ? (
        <div
          className={`${connectorLabel} right-full mr-4 w-16 text-right font-mono font-medium tracking-[0.08em] text-[#6aa6ff]`}
          style={{ top: imageLabelTop }}
        >
          Image
        </div>
      ) : null}
      {selected ? (
        <div
          className={`${connectorLabel} left-full ml-4 w-12 text-left font-mono font-medium tracking-[0.08em] text-[#6aa6ff]`}
          style={{ top: imageLabelTop }}
        >
          Image
        </div>
      ) : null}
      <TargetHandle
        id="prompt-in"
        tone="prompt"
        offset="prompt"
        connected={hasPrompt}
      />
      <TargetHandle
        id="image-in"
        tone="image"
        offset="image"
        connected={hasImageInput}
      />
      <SourceHandle
        id="image-out"
        tone="image"
        offset="image"
        connected={hasImageOutput}
      />
      <div
        className="postliminal-node-header flex items-center justify-between gap-4 px-5"
        style={{ height: CARD_HEADER_HEIGHT }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] border border-[#6aa6ff]/25 bg-[#6aa6ff]/10 text-[#6aa6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(106,166,255,0.10)]">
            <Cpu className="h-4 w-4" />
          </span>
          <div className="truncate text-[13px] font-medium text-white/[0.92]">
            {model.nodeLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {isRunning ? (
            <div className="flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.14] bg-white/[0.08] px-3 text-[11px] font-medium text-white/[0.9]">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#f5b950]" />
              <span>{progress}%</span>
              <button
                type="button"
                aria-label="Cancel image generation"
                className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/[0.52] transition hover:bg-white/[0.10] hover:text-white/[0.86]"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRun();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="nodrag nopan flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.16] bg-white/[0.08] px-3 text-[11px] font-medium text-white/[0.9] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:border-white/[0.26] hover:bg-white/[0.12]"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                runModel();
              }}
            >
              <ArrowRight className="h-3 w-3" />
              Run
            </button>
          )}
        </div>
      </div>
      <div className="nodrag nopan min-h-0 flex-1">
        <div
          className={`group/preview relative h-full overflow-hidden rounded-b-[18px] rounded-t-none shadow-none ${
            hasPreview ? "bg-transparent" : "bg-[#11121a]"
          }`}
        >
          {showMultiView ? (
            <div className="grid h-full grid-cols-3 gap-1.5">
              {Array.from({ length: previewCount }).map((_, index) => (
                <button
                  key={index}
                  className={`nodrag nopan overflow-hidden border transition ${
                    activeImage === index
                      ? "border-white/[0.88] ring-1 ring-[#f5b950]/60"
                      : "border-black/25"
                  }`}
                  style={
                    generatedImageUrls[index] ? undefined : previewBackground(index)
                  }
                  onClick={() => setActiveImage(index)}
                  title={`Image ${index + 1}`}
                >
                  {generatedImageUrls[index] ? (
                    // Render the returned PNG directly; do not recolor it with CSS.
                    <img
                      src={generatedImageUrls[index]}
                      alt={`Generated image ${index + 1}`}
                      className="block h-full w-full object-contain"
                      draggable={false}
                      onLoad={(event) =>
                        rememberImageSize(
                          generatedImageUrls[index],
                          event.currentTarget,
                        )
                      }
                    />
                  ) : null}
                  <span className="sr-only">Image {index + 1}</span>
                </button>
              ))}
            </div>
          ) : hasPreview && activeImageUrl ? (
            <img
              src={activeImageUrl}
              alt="Generated image"
              className="block h-full w-full object-contain"
              draggable={false}
              onLoad={(event) =>
                rememberImageSize(activeImageUrl, event.currentTarget)
              }
            />
          ) : hasPreview ? (
            <div className="h-full w-full" style={previewBackground(activeImage)} />
          ) : (
            <div className="h-full w-full" style={checkerStyle} />
          )}

          {hasPreview ? (
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100">
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/46 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/46 to-transparent" />
            </div>
          ) : null}

          {hasPreview ? (
            <div className="absolute inset-x-2 top-2 flex items-center justify-between opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100">
              <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.10] bg-black/28 px-1.5 py-1 font-mono text-[10px] font-medium text-white/80 backdrop-blur-md">
                <button
                  className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/75 transition hover:bg-white/10 hover:text-white"
                  title={viewMode === "single" ? "Multi view" : "Single view"}
                  onClick={() =>
                    setViewMode((mode) => (mode === "single" ? "multi" : "single"))
                  }
                >
                  {viewMode === "single" ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Grid2X2 className="h-3.5 w-3.5" />
                  )}
                </button>
                {showMultiView ? (
                  <span>{previewCount} images</span>
                ) : (
                  <>
                    <button
                      className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/65 transition hover:bg-white/10 hover:text-white"
                      title="Previous image"
                      onClick={previousImage}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span>
                      {activeImage + 1} / {previewCount}
                    </span>
                    <button
                      className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/65 transition hover:bg-white/10 hover:text-white"
                      title="Next image"
                      onClick={nextImage}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-[10px] border border-white/[0.10] bg-black/28 px-1.5 py-1 text-white/75 backdrop-blur-md">
                <button
                  className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] transition hover:bg-white/10 hover:text-white"
                  title="Expand image"
                >
                  <Expand className="h-3.5 w-3.5" />
                </button>
                <button
                  className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] transition hover:bg-white/10 hover:text-white"
                  title="Download image"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {hasPreview && !showMultiView ? (
            <div className="absolute bottom-2 left-2 rounded-[7px] border border-white/[0.10] bg-black/38 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white/85 opacity-0 backdrop-blur-md transition-opacity duration-150 group-hover/preview:opacity-100">
              {resolution}
            </div>
          ) : null}
        </div>
      </div>
    </NodeFrame>
  );
}
