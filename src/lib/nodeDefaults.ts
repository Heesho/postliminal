import type { NodeData, NodeType } from "@/types/project";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption } from "./imageModels";

const outputGradients = [
  "from-[#06070a] via-[#35413f] to-[#d8b45c]",
  "from-[#06070a] via-[#243336] to-[#77d5ce]",
  "from-[#0a0c10] via-[#4d4637] to-[#eee7d6]",
  "from-[#101216] via-[#324447] to-[#aeb9b3]",
  "from-[#06070a] via-[#3c3a32] to-[#e7ca82]",
  "from-[#101216] via-[#263234] to-[#c7d0ca]",
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
        quality: "medium",
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
