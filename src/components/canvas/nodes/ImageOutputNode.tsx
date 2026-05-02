"use client";

import type { Node, NodeProps } from "@xyflow/react";
import type { NodeData } from "@/types/project";
import {
  AddFooterLabel,
  isHandleConnected,
  NodeFooter,
  NodeFrame,
  NodeHeader,
  SourceHandle,
  TargetHandle,
} from "./NodePrimitives";

type FlowNode = Node<NodeData>;

export function ImageOutputNode({ data, selected }: NodeProps<FlowNode>) {
  const isSelected = Boolean(data.selected);
  const isReference = data.nodeType === "image_reference";
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";

  return (
    <NodeFrame className="w-[286px]" selected={selected || isSelected}>
      {isReference ? null : (
        <TargetHandle
          id="image-in"
          tone="image"
          offset="image"
          connected={isHandleConnected(data, "image-in")}
        />
      )}
      <SourceHandle
        id="image-out"
        tone="image"
        offset="image"
        connected={isHandleConnected(data, "image-out")}
      />
      <NodeHeader label={String(data.title ?? "image.png")} />
      <div className="px-3">
        <div
          className={`relative h-40 overflow-hidden rounded-md border ${
            isSelected ? "border-emerald-300/70" : "border-white/5"
          } bg-[#f1ebdc]`}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={String(data.title ?? "image")}
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(244,238,222,0.55)_34%,rgba(22,105,122,0.1)_64%),radial-gradient(circle_at_72%_32%,rgba(198,160,76,0.85),transparent_10%),radial-gradient(circle_at_25%_78%,rgba(20,116,134,0.55),transparent_23%),linear-gradient(135deg,transparent_44%,rgba(63,74,62,0.62)_45%,rgba(63,74,62,0.35)_57%,transparent_58%)]" />
              <div className="absolute left-7 top-7 max-w-40 text-[#222225]">
                <div className="text-lg font-semibold leading-5">
                  AI-native GTM engineering
                </div>
                <div className="mt-2 h-1.5 w-11 bg-[#222225]" />
              </div>
            </>
          )}
        </div>
      </div>
      <NodeFooter>
        <AddFooterLabel>Add more images</AddFooterLabel>
      </NodeFooter>
    </NodeFrame>
  );
}
