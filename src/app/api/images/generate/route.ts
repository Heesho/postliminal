import { NextResponse } from "next/server";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import {
  DEFAULT_OPENAI_IMAGE_API_MODEL,
  OPENAI_IMAGE_MODEL_CANDIDATES,
} from "@/lib/openAiImagePricing";

export const runtime = "nodejs";

type GenerateImagesRequest = {
  apiKey?: unknown;
  prompt?: unknown;
  imageUrls?: unknown;
  quality?: unknown;
  resolution?: unknown;
  runs?: unknown;
  projectId?: unknown;
  generationNodeId?: unknown;
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

const supportedSizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const supportedQualities = new Set(["low", "medium", "high", "auto"]);
const OPENAI_IMAGE_TIMEOUT_MS = 120000;
const PROJECT_ASSETS_DIR = path.join(process.cwd(), "projects");
const RECOVERY_CLOCK_SKEW_MS = 5000;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampRuns(value: unknown) {
  return Math.max(
    1,
    Math.min(8, typeof value === "number" && Number.isFinite(value) ? value : 1),
  );
}

function normalizeQuality(value: unknown) {
  const quality = stringValue(value);
  return supportedQualities.has(quality) ? quality : "medium";
}

function normalizeSize(value: unknown) {
  const resolution = stringValue(value);
  if (supportedSizes.has(resolution)) return resolution;
  if (resolution === "2048x1152") return "1536x1024";
  return "1024x1024";
}

function normalizeImageUrls(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => stringValue(item))
    .filter(
      (item) =>
        item.startsWith("data:image/") ||
        item.startsWith("http") ||
        item.startsWith("/api/project-assets/"),
    )
    .slice(0, 8);
}

function safePathSegment(value: unknown, fallback: string) {
  const segment = stringValue(value)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);

  return segment || fallback;
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
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
    return {
      buffer: Buffer.from(dataUrlMatch[2], "base64"),
      extension: extensionForMime(dataUrlMatch[1]),
    };
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    extension: extensionForMime(contentType),
  };
}

async function saveGeneratedImages({
  projectId,
  generationNodeId,
  images,
}: {
  projectId: string;
  generationNodeId: string;
  images: string[];
}) {
  const assetDir = path.join(
    PROJECT_ASSETS_DIR,
    projectId,
    "images",
    generationNodeId,
  );
  await mkdir(assetDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return Promise.all(
    images.map(async (imageUrl, index) => {
      const image = await imageBufferFromUrl(imageUrl);
      const fileName = `${timestamp}-${index + 1}.${image.extension}`;
      const filePath = path.join(assetDir, fileName);
      await writeFile(filePath, image.buffer);

      return {
        filePath,
        url: `/api/project-assets/${projectId}/images/${generationNodeId}/${fileName}`,
      };
    }),
  );
}

async function listGeneratedImagesSince({
  projectId,
  generationNodeId,
  since,
}: {
  projectId: string;
  generationNodeId: string;
  since: number;
}) {
  const assetDir = path.join(
    PROJECT_ASSETS_DIR,
    projectId,
    "images",
    generationNodeId,
  );

  let entries;
  try {
    entries = await readdir(assetDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const images = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => /\.(png|jpe?g|webp)$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(assetDir, entry.name);
        const fileStat = await stat(filePath);

        return {
          name: entry.name,
          mtimeMs: fileStat.mtimeMs,
          url: `/api/project-assets/${projectId}/images/${generationNodeId}/${entry.name}`,
        };
      }),
  );

  return images
    .filter((image) => image.mtimeMs >= since - RECOVERY_CLOCK_SKEW_MS)
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
    .map((image) => image.url);
}

async function callOpenAIImages({
  apiKey,
  model,
  prompt,
  imageUrls,
  quality,
  size,
  runs,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  imageUrls: string[];
  quality: string;
  size: string;
  runs: number;
}) {
  const isEdit = imageUrls.length > 0;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_IMAGE_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(
      `https://api.openai.com/v1/images/${isEdit ? "edits" : "generations"}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isEdit
            ? {
                model,
                prompt,
                images: imageUrls.map((imageUrl) => ({ image_url: imageUrl })),
                n: runs,
                quality,
                size,
                background: "opaque",
                output_format: "png",
              }
            : {
                model,
                prompt,
                n: runs,
                quality,
                size,
                background: "opaque",
                output_format: "png",
              },
        ),
      },
    );
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

  const images =
    payload?.data
      ?.map((item) =>
        item.b64_json
          ? `data:image/png;base64,${item.b64_json}`
          : item.url || "",
      )
      .filter(Boolean) ?? [];

  return images;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GenerateImagesRequest;
  const apiKey = stringValue(body.apiKey) || process.env.OPENAI_API_KEY || "";
  const prompt = stringValue(body.prompt);

  if (!apiKey) {
    return NextResponse.json(
      { error: "Add an OpenAI API key in settings or set OPENAI_API_KEY." },
      { status: 400 },
    );
  }

  if (!prompt) {
    return NextResponse.json(
      { error: "Connect a prompt or add prompt text before running the model." },
      { status: 400 },
    );
  }

  const quality = normalizeQuality(body.quality);
  const size = normalizeSize(body.resolution);
  const runs = clampRuns(body.runs);
  const imageUrls = await Promise.all(
    normalizeImageUrls(body.imageUrls).map(openAiImageUrl),
  );
  const projectId = safePathSegment(body.projectId, "untitled-project");
  const generationNodeId = safePathSegment(
    body.generationNodeId,
    "image-generation",
  );
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

  let lastError = "Image generation failed";
  for (const model of modelCandidates) {
    try {
      const images = await callOpenAIImages({
        apiKey,
        model,
        prompt,
        imageUrls,
        quality,
        size,
        runs,
      });
      const savedImages = await saveGeneratedImages({
        projectId,
        generationNodeId,
        images,
      });

      return NextResponse.json({
        images: savedImages.map((image) => image.url),
        files: savedImages.map((image) => image.filePath),
        model,
        size,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = safePathSegment(
    url.searchParams.get("projectId"),
    "untitled-project",
  );
  const generationNodeId = safePathSegment(
    url.searchParams.get("generationNodeId"),
    "image-generation",
  );
  const since = Number(url.searchParams.get("since") ?? 0);
  const images = await listGeneratedImagesSince({
    projectId,
    generationNodeId,
    since: Number.isFinite(since) ? since : 0,
  });

  return NextResponse.json({ images });
}
