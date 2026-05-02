import type { NodeData, NodeType } from "@/types/project";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption } from "./imageModels";

const outputGradients = [
  "from-zinc-950 via-neutral-700 to-amber-300",
  "from-black via-stone-800 to-cyan-300",
  "from-neutral-950 via-zinc-700 to-violet-300",
  "from-stone-950 via-neutral-600 to-yellow-200",
  "from-black via-slate-700 to-teal-200",
  "from-zinc-950 via-stone-600 to-fuchsia-200",
];

export function defaultNodeData(type: NodeType, index = 0): NodeData {
  switch (type) {
    case "brief":
      return {
        title: "Visual Brief",
        text: "",
        status: "ready",
      };
    case "prompt":
      return {
        title: "Prompt",
        text: "Describe the frame, motion, materials, light, and constraints.",
        status: "ready",
      };
    case "image_generation":
      return {
        title: "Image Model",
        model: DEFAULT_IMAGE_MODEL_ID,
        modelLabel: getImageModelOption(DEFAULT_IMAGE_MODEL_ID).nodeLabel,
        status: "idle",
      };
    case "image_output":
      return {
        title: `Output ${index + 1}`,
        status: "completed",
        selected: false,
        gradient: outputGradients[index % outputGradients.length],
        seed: 2400 + index,
      };
    case "group":
    case "selection_group":
      return {
        title: "Group",
        status: "ready",
      };
    case "image_reference":
      return {
        title: "image.png",
        kind: "image_file",
        status: "ready",
        selected: false,
        gradient: outputGradients[index % outputGradients.length],
      };
    default:
      return {
        title: "Node",
        status: "idle",
      };
  }
}

export function mockOutputGradient(index: number) {
  return outputGradients[index % outputGradients.length];
}
