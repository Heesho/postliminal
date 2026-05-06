"use client";

import { readLocalSettings } from "@/lib/localSettings";

export type RemoveBackgroundInput = {
  projectId: string;
  nodeId: string;
  imageUrl: string;
  signal?: AbortSignal;
};

export type RemoveBackgroundResult = {
  image: string;
  model: string;
  size: string;
};

const BACKGROUND_REMOVAL_TIMEOUT_MS = 120000;

export async function removeImageBackground(
  input: RemoveBackgroundInput,
): Promise<RemoveBackgroundResult> {
  const settings = readLocalSettings();
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(
    () => timeoutController.abort(),
    BACKGROUND_REMOVAL_TIMEOUT_MS,
  );
  const abortRequest = () => timeoutController.abort();

  input.signal?.addEventListener("abort", abortRequest, { once: true });

  let response: Response;
  try {
    response = await fetch("/api/images/remove-background", {
      method: "POST",
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: settings.openaiApiKey.trim(),
        projectId: input.projectId,
        nodeId: input.nodeId,
        imageUrl: input.imageUrl,
      }),
    });
  } catch {
    if (timeoutController.signal.aborted) {
      throw new Error(
        input.signal?.aborted
          ? "Background removal was cancelled."
          : "Background removal timed out after 120 seconds.",
      );
    }

    throw new Error("Background removal request failed.");
  } finally {
    window.clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", abortRequest);
  }

  const payload = (await response.json().catch(() => null)) as
    | (Partial<RemoveBackgroundResult> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Background removal failed.");
  }

  if (typeof payload?.image !== "string" || payload.image.length === 0) {
    throw new Error("Background removal returned no image.");
  }

  return {
    image: payload.image,
    model: typeof payload.model === "string" ? payload.model : "gpt-image-2",
    size: typeof payload.size === "string" ? payload.size : "1024x1024",
  };
}
