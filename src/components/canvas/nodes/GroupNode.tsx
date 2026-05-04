"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { FolderKanban } from "lucide-react";
import type { NodeData } from "@/types/project";
import {
  isHandleConnected,
  NodeFrame,
  SourceHandle,
  TargetHandle,
} from "./NodePrimitives";

type FlowNode = Node<NodeData>;

export function GroupNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <NodeFrame className="w-[286px] border-dashed" selected={selected}>
      <TargetHandle
        id="image-in"
        tone="image"
        connected={isHandleConnected(data, "image-in")}
      />
      <SourceHandle
        id="image-out"
        tone="image"
        connected={isHandleConnected(data, "image-out")}
      />
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/[0.10] bg-white/[0.055] text-white/[0.82] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <FolderKanban className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/[0.46]">
            Group
          </div>
          <div className="truncate text-sm font-medium text-white/[0.9]">
            {String(data.title ?? "Selection Group")}
          </div>
          <div className="mt-1 text-xs text-white/[0.48]">
            {Number(data.count ?? 0)} canvas nodes
          </div>
        </div>
      </div>
    </NodeFrame>
  );
}
