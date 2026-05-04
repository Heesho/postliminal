"use client";

import type { Node, NodeProps } from "@xyflow/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { TextCursorInput } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import type { NodeData } from "@/types/project";
import {
  CARD_HEADER_HEIGHT,
  isHandleConnected,
  IMAGE_MODEL_HEIGHT,
  NodeFrame,
  PROMPT_HANDLE_TOP,
  SourceHandle,
} from "./NodePrimitives";

type FlowNode = Node<NodeData>;
const promptLabelTop = `calc(${PROMPT_HANDLE_TOP} - 20px)`;
const promptNodeChromeHeight = CARD_HEADER_HEIGHT;
const promptGridSize = 20;
const promptTextMinHeight = 84;
const promptTextMaxHeight = IMAGE_MODEL_HEIGHT - promptNodeChromeHeight;

function snapPromptHeight(contentHeight: number) {
  const clampedHeight = Math.max(
    promptTextMinHeight,
    Math.min(promptTextMaxHeight, contentHeight),
  );
  const snappedCardHeight =
    Math.ceil((clampedHeight + promptNodeChromeHeight) / promptGridSize) *
    promptGridSize;

  return Math.min(
    promptTextMaxHeight,
    snappedCardHeight - promptNodeChromeHeight,
  );
}

export function PromptNode({ id, data, selected }: NodeProps<FlowNode>) {
  const updateNode = useProjectStore((state) => state.updateNode);
  const text = String(data.text ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(text);
  const [textareaHeight, setTextareaHeight] = useState(promptTextMinHeight);
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const contentHeight = textarea.scrollHeight;
    const nextIsAtMaxHeight = contentHeight >= promptTextMaxHeight;
    const nextHeight = nextIsAtMaxHeight
      ? promptTextMaxHeight
      : snapPromptHeight(contentHeight);

    setIsAtMaxHeight(nextIsAtMaxHeight);
    setTextareaHeight(nextHeight);
    textarea.style.height = `${nextHeight}px`;
  }, [draft]);

  const saveDraft = () => {
    if (draft === text) return;
    updateNode(id, { data: { text: draft } }, "human");
  };
  const handleTextareaWheel = (event: WheelEvent<HTMLTextAreaElement>) => {
    if (!selected) {
      event.currentTarget.blur();
      return;
    }

    const textarea = event.currentTarget;
    const canScrollVertically = textarea.scrollHeight > textarea.clientHeight + 1;
    const isMostlyVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);

    if (!canScrollVertically || !isMostlyVertical) return;

    const isScrollingDown = event.deltaY > 0;
    const isScrollingUp = event.deltaY < 0;
    const hasRoomAbove = textarea.scrollTop > 0;
    const hasRoomBelow =
      textarea.scrollTop + textarea.clientHeight < textarea.scrollHeight - 1;

    if ((isScrollingDown && hasRoomBelow) || (isScrollingUp && hasRoomAbove)) {
      event.stopPropagation();
    }
  };

  return (
    <NodeFrame
      className={`w-[360px] ${isAtMaxHeight ? "flex flex-col" : ""}`}
      selected={selected}
      style={isAtMaxHeight ? { height: IMAGE_MODEL_HEIGHT } : undefined}
    >
      {selected ? (
        <div
          className="pointer-events-none absolute left-full ml-4 w-16 text-left font-mono text-[10px] font-medium leading-none tracking-[0.08em] text-[#f5b950]"
          style={{ top: promptLabelTop }}
        >
          Prompt
        </div>
      ) : null}
      <SourceHandle
        id="prompt-out"
        tone="prompt"
        offset="prompt"
        connected={isHandleConnected(data, "prompt-out")}
      />
      <div
        className="postliminal-node-header flex items-center justify-between px-5"
        style={{ height: CARD_HEADER_HEIGHT }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] border border-[#f5b950]/25 bg-[#f5b950]/10 text-[#f5b950] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(245,185,80,0.10)]">
            <TextCursorInput className="h-4 w-4" />
          </span>
          <div className="truncate text-[13px] font-medium text-white/[0.92]">
            Prompt
          </div>
        </div>
      </div>
      <div
        className={`nodrag nopan ${
          isAtMaxHeight ? "min-h-0 flex-1" : ""
        }`}
      >
        <textarea
          ref={textareaRef}
          className={`block w-full resize-none rounded-b-[18px] rounded-t-none border-0 bg-[#17181d] px-5 py-4 text-[13px] font-normal leading-[1.55] text-white/[0.76] outline-none shadow-none transition focus:bg-[#1b1c22] ${
            selected ? "overflow-y-auto overscroll-contain" : "overflow-y-hidden"
          }`}
          style={{ height: isAtMaxHeight ? "100%" : textareaHeight }}
          value={draft}
          placeholder="Prompt text"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveDraft}
          onWheelCapture={handleTextareaWheel}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </NodeFrame>
  );
}
