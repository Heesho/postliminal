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
    <NodeFrame
      className="w-[286px] border-dashed"
      selected={selected}
    >
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
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-[#3a3a3f] text-zinc-200">
          <FolderKanban className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
            Group
          </div>
          <div className="truncate text-sm font-medium text-zinc-100">
            {String(data.title ?? "Selection Group")}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {Number(data.count ?? 0)} canvas nodes
          </div>
        </div>
      </div>
    </NodeFrame>
  );
}
