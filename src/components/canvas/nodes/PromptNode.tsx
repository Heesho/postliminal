"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { TextCursorInput } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
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
const promptBodyPaddingBottom = 12;
const promptNodeChromeHeight = CARD_HEADER_HEIGHT + promptBodyPaddingBottom;
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
  const stopCanvasWheel = (event: WheelEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
  };

  return (
    <NodeFrame
      className={`w-[360px] ${isAtMaxHeight ? "flex flex-col" : ""}`}
      selected={selected}
      style={isAtMaxHeight ? { height: IMAGE_MODEL_HEIGHT } : undefined}
    >
      {selected ? (
        <div
          className="pointer-events-none absolute left-full ml-5 w-14 text-left text-[10px] font-semibold leading-none tracking-wide text-[#df72f4]"
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
        className="flex items-center justify-between px-4"
        style={{ height: CARD_HEADER_HEIGHT }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <TextCursorInput className="h-4 w-4 shrink-0 text-zinc-300" />
          <div className="truncate text-[13px] font-medium text-zinc-200/95">
            Prompt
          </div>
        </div>
        <div className="text-sm leading-none text-zinc-300/70">...</div>
      </div>
      <div
        className={`nodrag nopan px-3 pb-3 ${
          isAtMaxHeight ? "min-h-0 flex-1" : ""
        }`}
      >
        <textarea
          ref={textareaRef}
          className="nowheel w-full resize-none overflow-y-auto overscroll-contain rounded-md border-0 bg-[#3a3a3f] px-4 py-3 text-[16px] font-medium leading-7 text-zinc-100/95 outline-none transition focus:bg-[#414146] focus:ring-1 focus:ring-white/15"
          style={{ height: isAtMaxHeight ? "100%" : textareaHeight }}
          value={draft}
          placeholder="Prompt text"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveDraft}
          onWheelCapture={stopCanvasWheel}
          onWheel={stopCanvasWheel}
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
