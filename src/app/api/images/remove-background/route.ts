import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import {
  DEFAULT_OPENAI_IMAGE_API_MODEL,
  OPENAI_IMAGE_MODEL_CANDIDATES,
} from "@/lib/openAiImagePricing";

export const runtime = "nodejs";

type RemoveBackgroundRequest = {
  apiKey?: unknown;
  imageDataUrl?: unknown;
  imageUrl?: unknown;
  projectId?: unknown;
  nodeId?: unknown;
};

type OpenAIImageItem = {
  b64_json?: string;
  url?: string;
};

type OpenAIImagesResponse = {
  data?: OpenAIImageItem[];
  error?: {
    message?: string;
  };
};

const PROJECT_ASSETS_DIR = path.join(process.cwd(), "projects");
const OPENAI_IMAGE_TIMEOUT_MS = 120000;
const REMOVE_BACKGROUND_PROMPT =
  "Remove the image background completely and return the subject as a clean transparent PNG. Preserve the original subject geometry, colors, edges, and details. Do not add a new background, shadow, border, badge, text, watermark, or extra objects.";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safePathSegment(value: unknown, fallback: string) {
  const segment = stringValue(value)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);

  return segment || fallback;
}

function mimeTypeForFileName(fileName: string) {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/png";
}

async function projectAssetDataUrl(imageUrl: string) {
  const assetPath = decodeURIComponent(
    imageUrl.slice("/api/project-assets/".length),
  );
  const segments = assetPath.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === ".." || segment.includes("\0"))
  ) {
    throw new Error("Invalid local project asset URL");
  }

  const projectAssetsRoot = path.resolve(PROJECT_ASSETS_DIR);
  const filePath = path.resolve(PROJECT_ASSETS_DIR, ...segments);
  if (!filePath.startsWith(`${projectAssetsRoot}${path.sep}`)) {
    throw new Error("Invalid local project asset URL");
  }

  const buffer = await readFile(filePath);
  const mimeType = mimeTypeForFileName(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function openAiImageUrl(imageUrl: string) {
  if (imageUrl.startsWith("/api/project-assets/")) {
    return await projectAssetDataUrl(imageUrl);
  }

  return imageUrl;
}

async function imageBufferFromUrl(imageUrl: string) {
  const dataUrlMatch = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return Buffer.from(dataUrlMatch[2], "base64");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download background-removed image (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function saveRemovedBackgroundImage({
  projectId,
  nodeId,
  imageUrl,
}: {
  projectId: string;
  nodeId: string;
  imageUrl: string;
}) {
  const assetDir = path.join(PROJECT_ASSETS_DIR, projectId, "images", nodeId);
  await mkdir(assetDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${timestamp}-transparent.png`;
  const filePath = path.join(assetDir, fileName);
  await writeFile(filePath, await imageBufferFromUrl(imageUrl));

  return {
    filePath,
    url: `/api/project-assets/${projectId}/images/${nodeId}/${fileName}`,
  };
}

async function callOpenAiRemoveBackground({
  apiKey,
  model,
  imageUrl,
}: {
  apiKey: string;
  model: string;
  imageUrl: string;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_IMAGE_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: REMOVE_BACKGROUND_PROMPT,
        images: [{ image_url: imageUrl }],
        n: 1,
        quality: "medium",
        size: "1024x1024",
        background: "transparent",
        output_format: "png",
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("OpenAI image API timed out after 120 seconds");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => null)) as
    | OpenAIImagesResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `OpenAI image API failed (${response.status})`,
    );
  }

  const image =
    payload?.data
      ?.map((item) =>
        item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url || "",
      )
      .find(Boolean) ?? "";

  if (!image) {
    throw new Error("Background removal returned no image.");
  }

  return image;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RemoveBackgroundRequest;
  const apiKey = stringValue(body.apiKey) || process.env.OPENAI_API_KEY || "";
  const localImageDataUrl = stringValue(body.imageDataUrl);
  const sourceImageUrl = stringValue(body.imageUrl);
  const projectId = safePathSegment(body.projectId, "untitled-project");
  const nodeId = safePathSegment(body.nodeId, "background-removal");

  if (localImageDataUrl) {
    if (!localImageDataUrl.startsWith("data:image/png;base64,")) {
      return NextResponse.json(
        { error: "Background removal output must be a PNG data URL." },
        { status: 400 },
      );
    }

    try {
      const savedImage = await saveRemovedBackgroundImage({
        projectId,
        nodeId,
        imageUrl: localImageDataUrl,
      });

      return NextResponse.json({
        image: savedImage.url,
        file: savedImage.filePath,
        model: "local-background-matte",
        size: "source",
      });
    } catch {
      return NextResponse.json({ error: "Background removal failed." }, { status: 500 });
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Add an OpenAI API key in settings or set OPENAI_API_KEY." },
      { status: 400 },
    );
  }

  if (!sourceImageUrl) {
    return NextResponse.json(
      { error: "Connect an image before removing the background." },
      { status: 400 },
    );
  }

  const imageUrl = await openAiImageUrl(sourceImageUrl);
  const configuredModel =
    process.env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_IMAGE_API_MODEL;
  const modelCandidates = OPENAI_IMAGE_MODEL_CANDIDATES.includes(
    configuredModel as (typeof OPENAI_IMAGE_MODEL_CANDIDATES)[number],
  )
    ? OPENAI_IMAGE_MODEL_CANDIDATES.slice(
        OPENAI_IMAGE_MODEL_CANDIDATES.indexOf(
          configuredModel as (typeof OPENAI_IMAGE_MODEL_CANDIDATES)[number],
        ),
      )
    : [configuredModel];

  let lastError = "Background removal failed";
  for (const model of modelCandidates) {
    try {
      const removedBackgroundImage = await callOpenAiRemoveBackground({
        apiKey,
        model,
        imageUrl,
      });
      const savedImage = await saveRemovedBackgroundImage({
        projectId,
        nodeId,
        imageUrl: removedBackgroundImage,
      });

      return NextResponse.json({
        image: savedImage.url,
        file: savedImage.filePath,
        model,
        size: "1024x1024",
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
