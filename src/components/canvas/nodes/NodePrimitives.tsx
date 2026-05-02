"use client";

import type { CSSProperties, ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { NodeData, NodeStatus } from "@/types/project";

export function NodeFrame({
  children,
  className = "",
  selected = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-visible rounded-lg border bg-[#25252a] shadow-[0_10px_28px_rgba(0,0,0,0.34)] ${
        selected
          ? "border-zinc-200/70 ring-2 ring-zinc-200/10"
          : "border-[#36363c]"
      } ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function NodeHeader({
  label,
}: {
  label: string;
  title?: string;
  status?: NodeStatus;
}) {
  return (
    <div className="flex h-9 items-center justify-between px-3">
      <div className="truncate text-[11px] font-medium text-zinc-300/95">
        {label}
      </div>
      <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400/70" />
    </div>
  );
}

export function NodeFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-9 items-center justify-between gap-3 px-3 pb-3 pt-2 text-[10px] text-zinc-300 ${className}`}
    >
      {children}
    </div>
  );
}

export function AddFooterLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-300">
      <Plus className="h-3 w-3" />
      {children}
    </div>
  );
}

type HandleTone = "prompt" | "image";
type HandleOffset = "center" | "prompt" | "image";

export const PROMPT_HANDLE_TOP = "80px";
export const IMAGE_HANDLE_TOP = "120px";
export const CARD_HEADER_HEIGHT = 56;
export const IMAGE_MODEL_HEIGHT = 420;

function handleColor(tone: HandleTone) {
  return tone === "prompt" ? "#df72f4" : "#52d6b1";
}

function handleStyle(
  tone: HandleTone,
  offset: HandleOffset,
  topOverride?: string,
): CSSProperties {
  const color = handleColor(tone);
  const top =
    topOverride ??
    (offset === "prompt"
      ? PROMPT_HANDLE_TOP
      : offset === "image"
        ? IMAGE_HANDLE_TOP
        : "50%");

  return {
    top,
    "--postliminal-handle-color": color,
    zIndex: 20,
  } as CSSProperties;
}

export function isHandleConnected(data: NodeData, handleId: string) {
  const connectedHandles = data.connectedHandles;
  if (
    !connectedHandles ||
    typeof connectedHandles !== "object" ||
    Array.isArray(connectedHandles)
  ) {
    return false;
  }

  return Boolean((connectedHandles as Record<string, unknown>)[handleId]);
}

export function SourceHandle({
  id,
  tone = "image",
  offset = "center",
  top,
  connected = false,
}: {
  id?: string;
  tone?: HandleTone;
  offset?: HandleOffset;
  top?: string;
  connected?: boolean;
}) {
  return (
    <Handle
      id={id}
      type="source"
      position={Position.Right}
      className={`postliminal-handle !h-6 !w-6 !border-0 ${
        connected ? "postliminal-handle--connected" : ""
      }`}
      style={handleStyle(tone, offset, top)}
    />
  );
}

export function TargetHandle({
  id,
  tone = "prompt",
  offset = "center",
  top,
  connected = false,
}: {
  id?: string;
  tone?: HandleTone;
  offset?: HandleOffset;
  top?: string;
  connected?: boolean;
}) {
  return (
    <Handle
      id={id}
      type="target"
      position={Position.Left}
      className={`postliminal-handle !h-6 !w-6 !border-0 ${
        connected ? "postliminal-handle--connected" : ""
      }`}
      style={handleStyle(tone, offset, top)}
    />
  );
}
