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
  startedAt?: number;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
};

export type GenerateImagesResult = {
  images: string[];
  model: string;
  size: string;
};

const IMAGE_GENERATION_TIMEOUT_MS = 120000;
const RECOVERY_POLL_INTERVAL_MS = 1800;
const RECOVERY_POLL_TIMEOUT_MS = 130000;

function dataString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function generatedImageUrls(value: unknown) {
  return Array.isArray(value)
    ? value.filter((imageUrl): imageUrl is string => typeof imageUrl === "string")
    : [];
}

function activeGeneratedImageUrl(data: ProjectState["nodes"][number]["data"]) {
  const imageUrls = generatedImageUrls(data.generatedImageUrls);
  if (imageUrls.length === 0) return [];

  const fallbackIndex = imageUrls.length - 1;
  const rawIndex =
    typeof data.activeGeneratedImageIndex === "number" &&
    Number.isFinite(data.activeGeneratedImageIndex)
      ? data.activeGeneratedImageIndex
      : fallbackIndex;
  const activeIndex = Math.max(
    0,
    Math.min(imageUrls.length - 1, Math.round(rawIndex)),
  );

  return [imageUrls[activeIndex]];
}

export async function listSavedGeneratedImages({
  projectId,
  generationNodeId,
  since = 0,
}: {
  projectId: string;
  generationNodeId: string;
  since?: number;
}) {
  const params = new URLSearchParams({
    projectId,
    generationNodeId,
    since: String(since),
  });
  const response = await fetch(`/api/images/generate?${params.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    | { images?: unknown }
    | null;

  if (!response.ok || !Array.isArray(payload?.images)) return [];

  return payload.images.filter(
    (imageUrl): imageUrl is string => typeof imageUrl === "string",
  );
}

function waitForRecoveryPoll(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Image generation was cancelled."));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("Image generation was cancelled."));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForSavedGeneratedImages({
  projectId,
  generationNodeId,
  since,
  signal,
}: {
  projectId: string;
  generationNodeId: string;
  since: number;
  signal?: AbortSignal;
}) {
  const deadline = Date.now() + RECOVERY_POLL_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const recoveredImages = await listSavedGeneratedImages({
      projectId,
      generationNodeId,
      since,
    }).catch(() => []);

    if (recoveredImages.length > 0) return recoveredImages;

    await waitForRecoveryPoll(
      Math.min(RECOVERY_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())),
      signal,
    );
  }

  return [];
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
    .flatMap((edge) => {
      const node = nodeById.get(edge.source);
      if (node?.type === "image_reference" || node?.type === "image_output") {
        return [dataString(node.data.imageUrl)].filter(Boolean);
      }

      if (node?.type === "image_generation") {
        return activeGeneratedImageUrl(node.data);
      }

      if (node?.type === "background_removal") {
        return activeGeneratedImageUrl(node.data);
      }

      return [];
    })
    .slice(0, 8);

  return { prompt, imageUrls };
}

export async function generateChatGptImages(
  input: GenerateImagesInput,
): Promise<GenerateImagesResult> {
  const settings = readLocalSettings();
  const requestStartedAt = input.startedAt ?? Date.now();
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(
    () => timeoutController.abort(),
    IMAGE_GENERATION_TIMEOUT_MS,
  );
  const abortRequest = () => timeoutController.abort();

  input.signal?.addEventListener("abort", abortRequest, { once: true });
  input.onStatus?.("Sending request to image model...");

  const recoverAfterInterruptedRequest = async (error: unknown) => {
    input.onStatus?.("Still generating. Waiting for saved image...");
    const recoveredImages = await waitForSavedGeneratedImages({
      projectId: input.projectId,
      generationNodeId: input.generationNodeId,
      since: requestStartedAt,
      signal: input.signal,
    });

    if (recoveredImages.length > 0) {
      input.onStatus?.("Saved image found. Attaching to canvas...");
      return {
        images: recoveredImages,
        model: "gpt-image-2",
        size: input.resolution,
      };
    }

    const message = error instanceof Error ? error.message : "";
    if (message === "Failed to fetch") {
      throw new Error(
        "The local image request was interrupted and no saved image appeared within two minutes.",
      );
    }

    throw error;
  };

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

    return await recoverAfterInterruptedRequest(error);
  } finally {
    window.clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", abortRequest);
  }

  input.onStatus?.("Image model responded. Saving output...");

  let payload: (Partial<GenerateImagesResult> & { error?: string }) | null;
  try {
    payload = (await response.json()) as
      | (Partial<GenerateImagesResult> & { error?: string })
      | null;
  } catch (error) {
    if (response.ok) return await recoverAfterInterruptedRequest(error);
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Image generation failed");
  }

  const images = Array.isArray(payload?.images)
    ? payload.images.filter((image): image is string => typeof image === "string")
    : [];

  if (images.length === 0) {
    const recoveredImages = await waitForSavedGeneratedImages({
      projectId: input.projectId,
      generationNodeId: input.generationNodeId,
      since: requestStartedAt,
      signal: input.signal,
    });

    if (recoveredImages.length > 0) {
      return {
        images: recoveredImages,
        model: typeof payload?.model === "string" ? payload.model : "gpt-image-2",
        size: typeof payload?.size === "string" ? payload.size : input.resolution,
      };
    }

    throw new Error("Image generation returned no images.");
  }

  return {
    images,
    model: typeof payload?.model === "string" ? payload.model : "gpt-image-2",
    size: typeof payload?.size === "string" ? payload.size : input.resolution,
  };
}
