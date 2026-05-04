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
      <div className="px-4">
        <div className="max-h-40 overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-[13px] leading-5 text-white/[0.74] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {text || "Brief text"}
        </div>
      </div>
      <NodeFooter>
        <AddFooterLabel>Add field</AddFooterLabel>
      </NodeFooter>
    </NodeFrame>
  );
}
