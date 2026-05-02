import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateImagesRequest = {
  apiKey?: unknown;
  prompt?: unknown;
  imageUrls?: unknown;
  quality?: unknown;
  resolution?: unknown;
  runs?: unknown;
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
    .filter((item) => item.startsWith("data:image/") || item.startsWith("http"))
    .slice(0, 8);
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
  const response = await fetch(
    `https://api.openai.com/v1/images/${isEdit ? "edits" : "generations"}`,
    {
      method: "POST",
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
              output_format: "png",
            }
          : {
              model,
              prompt,
              n: runs,
              quality,
              size,
              output_format: "png",
            },
      ),
    },
  );

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
  const imageUrls = normalizeImageUrls(body.imageUrls);
  const configuredModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
  const modelCandidates =
    configuredModel === "gpt-image-1.5"
      ? ["gpt-image-1.5", "gpt-image-1"]
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

      return NextResponse.json({
        images,
        model,
        size,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
