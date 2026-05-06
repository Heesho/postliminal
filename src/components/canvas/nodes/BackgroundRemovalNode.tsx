"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { ArrowRight, Eraser, LoaderCircle, X } from "lucide-react";
import { removeImageBackground } from "@/lib/backgroundRemovalClient";
import { resolveImageGenerationInputs } from "@/lib/imageGenerationClient";
import { useProjectStore } from "@/store/projectStore";
import type { NodeData } from "@/types/project";
import {
  CARD_HEADER_HEIGHT,
  IMAGE_MODEL_HEIGHT,
  IMAGE_MODEL_WIDTH,
  isHandleConnected,
  NodeFrame,
  SourceHandle,
  TargetHandle,
} from "./NodePrimitives";

type FlowNode = Node<NodeData>;

const checkerStyle = {
  backgroundColor: "#11121a",
  backgroundImage:
    "linear-gradient(45deg, #0c0c10 25%, transparent 25%), linear-gradient(-45deg, #0c0c10 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0c0c10 75%), linear-gradient(-45deg, transparent 75%, #0c0c10 75%)",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
  backgroundSize: "20px 20px",
};

function generatedImageUrls(value: unknown) {
  return Array.isArray(value)
    ? value.filter((imageUrl): imageUrl is string => typeof imageUrl === "string")
    : [];
}

export function BackgroundRemovalNode({
  id,
  data,
  selected,
}: NodeProps<FlowNode>) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunning = data.status === "running";
  const hasImageInput = isHandleConnected(data, "image-in");
  const hasImageOutput = isHandleConnected(data, "image-out");
  const outputImageUrl = generatedImageUrls(data.generatedImageUrls).slice(-1)[0] ?? "";
  const previewImageUrl = outputImageUrl;
  const lastRunError =
    typeof data.lastRunError === "string" ? data.lastRunError : "";

  const runRemoval = async () => {
    if (isRunning) return;

    const imageUrl =
      resolveImageGenerationInputs(useProjectStore.getState().project, id).imageUrls.slice(
        -1,
      )[0] ?? "";
    if (!imageUrl) {
      updateNode(
        id,
        {
          data: {
            status: "error",
            lastRunError: "Connect an image before removing the background.",
          },
        },
        "human",
      );
      return;
    }

    updateNode(
      id,
      {
        data: {
          status: "running",
          lastRunError: "",
        },
      },
      "human",
    );

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await removeImageBackground({
        projectId: useProjectStore.getState().project.projectId,
        nodeId: id,
        imageUrl,
        signal: abortController.signal,
      });

      updateNode(
        id,
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
          },
        },
        "human",
      );
    } catch (error) {
      updateNode(
        id,
        {
          data: {
            status: "error",
            lastRunError:
              error instanceof Error ? error.message : "Background removal failed.",
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
  };

  return (
    <NodeFrame
      className="flex flex-col"
      selected={selected}
      style={{ width: IMAGE_MODEL_WIDTH, height: IMAGE_MODEL_HEIGHT }}
    >
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
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] border border-[#6aa6ff]/25 bg-[#6aa6ff]/10 text-[#6aa6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(106,166,255,0.10)]">
            <Eraser className="h-4 w-4" />
          </div>
          <div className="truncate text-[13px] font-medium text-white/[0.94]">
            {String(data.title ?? "Remove Background")}
          </div>
        </div>

        {isRunning ? (
          <button
            type="button"
            className="nodrag nopan flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.14] bg-white/[0.075] px-3 text-[11px] font-medium text-white/[0.72]"
            onClick={(event) => {
              event.stopPropagation();
              cancelRun();
            }}
          >
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className="nodrag nopan flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.16] bg-white/[0.08] px-3 text-[11px] font-medium text-white/[0.9] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:border-white/[0.26] hover:bg-white/[0.12]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void runRemoval();
            }}
          >
            <ArrowRight className="h-3 w-3" />
            Run
          </button>
        )}
      </div>

      <div className="nodrag nopan min-h-0 flex-1">
        <div
          className="relative h-full overflow-hidden rounded-b-[18px] rounded-t-none"
          style={checkerStyle}
        >
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Background removed"
              className="block h-full w-full object-contain"
              draggable={false}
            />
          ) : null}

          {!isRunning && lastRunError ? (
            <div className="absolute inset-x-3 bottom-3 rounded-[12px] border border-[#f5b950]/[0.22] bg-[#f5b950]/[0.10] px-3 py-2 text-[11px] font-medium leading-4 text-white/[0.88] shadow-[0_14px_34px_rgba(0,0,0,0.36)] backdrop-blur-xl">
              <span className="block truncate">Failed: {lastRunError}</span>
            </div>
          ) : null}
        </div>
      </div>
    </NodeFrame>
  );
}
