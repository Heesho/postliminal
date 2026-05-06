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
      className={`postliminal-node-frame relative overflow-visible rounded-[18px] border bg-white/[0.06] shadow-[0_30px_70px_-28px_rgba(0,0,0,0.8)] backdrop-blur-2xl ${
        selected
          ? "postliminal-node-frame--selected border-white/[0.72]"
          : "border-white/[0.10]"
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
    <div
      className="postliminal-node-header flex items-center justify-between px-5"
      style={{ height: CARD_HEADER_HEIGHT }}
    >
      <div className="truncate text-[13px] font-medium text-white/[0.92]">
        {label}
      </div>
      <MoreHorizontal className="h-3.5 w-3.5 text-white/[0.42]" />
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
      className={`flex min-h-12 items-center justify-between gap-3 px-4 pb-4 pt-3 text-[11px] text-white/[0.56] ${className}`}
    >
      {children}
    </div>
  );
}

export function AddFooterLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-white/[0.54]">
      <Plus className="h-3 w-3" />
      {children}
    </div>
  );
}

type HandleTone = "prompt" | "image";
type HandleOffset = "center" | "prompt" | "image";

export const PROMPT_HANDLE_TOP = "32px";
export const IMAGE_HANDLE_TOP = "52px";
export const CARD_HEADER_HEIGHT = 76;
export const IMAGE_MODEL_WIDTH = 362;
export const IMAGE_MODEL_HEIGHT = 420;

function handleColor(tone: HandleTone) {
  return tone === "prompt" ? "#f5b950" : "#6aa6ff";
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
      className={`postliminal-handle !h-7 !w-7 !border-0 ${
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
      className={`postliminal-handle !h-7 !w-7 !border-0 ${
        connected ? "postliminal-handle--connected" : ""
      }`}
      style={handleStyle(tone, offset, top)}
    />
  );
}
