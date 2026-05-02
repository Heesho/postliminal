export type ImageModelId = "chatgpt-images-2";

export type ImageProvider = "openai";

export type ImageModelOption = {
  id: ImageModelId;
  provider: ImageProvider;
  label: string;
  nodeLabel: string;
};

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    id: "chatgpt-images-2",
    provider: "openai",
    label: "ChatGPT Images 2.0",
    nodeLabel: "Image Model",
  },
];

export const DEFAULT_IMAGE_MODEL_ID: ImageModelId = "chatgpt-images-2";

export function getImageModelOption(modelId?: unknown) {
  return (
    IMAGE_MODEL_OPTIONS.find((option) => option.id === modelId) ??
    IMAGE_MODEL_OPTIONS[0]
  );
}
