export const DEFAULT_OPENAI_IMAGE_API_MODEL = "gpt-image-2";

export const OPENAI_IMAGE_MODEL_CANDIDATES = [
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
] as const;

type OpenAiImageApiModel = (typeof OPENAI_IMAGE_MODEL_CANDIDATES)[number];
type OpenAiImageQuality = "low" | "medium" | "high";
type OpenAiImageResolution = "1024x1024" | "1536x1024" | "1024x1536";

const imageOutputCostUsd: Record<
  OpenAiImageApiModel,
  Record<OpenAiImageQuality, Record<OpenAiImageResolution, number>>
> = {
  "gpt-image-2": {
    low: {
      "1024x1024": 0.006,
      "1536x1024": 0.005,
      "1024x1536": 0.005,
    },
    medium: {
      "1024x1024": 0.053,
      "1536x1024": 0.041,
      "1024x1536": 0.041,
    },
    high: {
      "1024x1024": 0.211,
      "1536x1024": 0.165,
      "1024x1536": 0.165,
    },
  },
  "gpt-image-1.5": {
    low: {
      "1024x1024": 0.009,
      "1536x1024": 0.013,
      "1024x1536": 0.013,
    },
    medium: {
      "1024x1024": 0.034,
      "1536x1024": 0.05,
      "1024x1536": 0.05,
    },
    high: {
      "1024x1024": 0.133,
      "1536x1024": 0.2,
      "1024x1536": 0.2,
    },
  },
  "gpt-image-1": {
    low: {
      "1024x1024": 0.011,
      "1536x1024": 0.016,
      "1024x1536": 0.016,
    },
    medium: {
      "1024x1024": 0.042,
      "1536x1024": 0.063,
      "1024x1536": 0.063,
    },
    high: {
      "1024x1024": 0.167,
      "1536x1024": 0.25,
      "1024x1536": 0.25,
    },
  },
};

function normalizeModel(value: unknown): OpenAiImageApiModel {
  return OPENAI_IMAGE_MODEL_CANDIDATES.includes(value as OpenAiImageApiModel)
    ? (value as OpenAiImageApiModel)
    : DEFAULT_OPENAI_IMAGE_API_MODEL;
}

export function normalizeOpenAiImageQuality(
  value: unknown,
): OpenAiImageQuality {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}

export function normalizeOpenAiImageResolution(
  value: unknown,
): OpenAiImageResolution {
  if (value === "1024x1024" || value === "1536x1024" || value === "1024x1536") {
    return value;
  }

  if (value === "2048x1152") {
    return "1536x1024";
  }

  return "1024x1024";
}

export function estimateOpenAiImageOutputCostUsd({
  model,
  quality,
  resolution,
  runs,
}: {
  model?: unknown;
  quality: unknown;
  resolution: unknown;
  runs: number;
}) {
  const pricedModel = normalizeModel(model);
  const pricedQuality = normalizeOpenAiImageQuality(quality);
  const pricedResolution = normalizeOpenAiImageResolution(resolution);

  return imageOutputCostUsd[pricedModel][pricedQuality][pricedResolution] * runs;
}

export function formatUsdCents(value: number) {
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }

  const cents = value * 100;
  const formatted =
    cents < 1 ? cents.toFixed(2) : cents < 10 ? cents.toFixed(1) : cents.toFixed(1);

  return `${formatted.replace(/\.0$/, "")}¢`;
}
