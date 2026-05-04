"use client";

import { readLocalSettings } from "@/lib/localSettings";
import type { ProjectState } from "@/types/project";

export type ImageGenerationInputs = {
  prompt: string;
  imageUrls: string[];
};

export type GenerateImagesInput = ImageGenerationInputs & {
  projectId: string;
  generationNodeId: string;
  quality: string;
  resolution: string;
  runs: number;
  signal?: AbortSignal;
};

export type GenerateImagesResult = {
  images: string[];
  model: string;
  size: string;
};

const IMAGE_GENERATION_TIMEOUT_MS = 120000;

function dataString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveImageGenerationInputs(
  project: ProjectState,
  generationNodeId: string,
): ImageGenerationInputs {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
  const incomingEdges = project.edges.filter(
    (edge) => edge.target === generationNodeId,
  );
  const promptNode = incomingEdges
    .map((edge) => nodeById.get(edge.source))
    .find((node) => node?.type === "prompt");

  const prompt =
    dataString(promptNode?.data.text) ||
    dataString(promptNode?.data.title) ||
    "A cinematic editorial image for an AI investment firm, restrained and premium.";

  const imageUrls = incomingEdges
    .map((edge) => nodeById.get(edge.source))
    .filter((node) => node?.type === "image_reference" || node?.type === "image_output")
    .map((node) => dataString(node?.data.imageUrl))
    .filter(Boolean)
    .slice(0, 8);

  return { prompt, imageUrls };
}

export async function generateChatGptImages(
  input: GenerateImagesInput,
): Promise<GenerateImagesResult> {
  const settings = readLocalSettings();
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(
    () => timeoutController.abort(),
    IMAGE_GENERATION_TIMEOUT_MS,
  );
  const abortRequest = () => timeoutController.abort();

  input.signal?.addEventListener("abort", abortRequest, { once: true });

  let response: Response;
  try {
    response = await fetch("/api/images/generate", {
      method: "POST",
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: settings.openaiApiKey.trim(),
        projectId: input.projectId,
        generationNodeId: input.generationNodeId,
        prompt: input.prompt,
        imageUrls: input.imageUrls,
        quality: input.quality,
        resolution: input.resolution,
        runs: input.runs,
      }),
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new Error(
        input.signal?.aborted
          ? "Image generation was cancelled."
          : "Image generation timed out after 120 seconds.",
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", abortRequest);
  }

  const payload = (await response.json().catch(() => null)) as
    | Partial<GenerateImagesResult> & { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Image generation failed");
  }

  const images = Array.isArray(payload?.images)
    ? payload.images.filter((image): image is string => typeof image === "string")
    : [];

  if (images.length === 0) {
    throw new Error("Image generation returned no images");
  }

  return {
    images,
    model: typeof payload?.model === "string" ? payload.model : "gpt-image-2",
    size: typeof payload?.size === "string" ? payload.size : input.resolution,
  };
}
