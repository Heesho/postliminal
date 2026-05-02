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

export function BriefNode({ data, selected }: NodeProps<FlowNode>) {
  const text = String(data.text ?? "");

  return (
    <NodeFrame className="w-[286px]" selected={selected}>
      <TargetHandle
        id="prompt-in"
        tone="prompt"
        offset="prompt"
        connected={isHandleConnected(data, "prompt-in")}
      />
      <SourceHandle
        id="prompt-out"
        tone="prompt"
        offset="prompt"
        connected={isHandleConnected(data, "prompt-out")}
      />
      <NodeHeader label={String(data.title ?? "Brief")} />
      <div className="px-3">
        <div className="max-h-40 overflow-hidden rounded-md bg-[#3a3a3f] px-4 py-3 text-[13px] leading-5 text-zinc-100/95">
          {text || "Brief text"}
        </div>
      </div>
      <NodeFooter>
        <AddFooterLabel>Add variable</AddFooterLabel>
      </NodeFooter>
    </NodeFrame>
  );
}
