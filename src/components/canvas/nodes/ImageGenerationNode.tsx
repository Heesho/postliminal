"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import type { Node, NodeProps } from "@xyflow/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRightEllipsis,
  Cpu,
  Download,
  Expand,
  LoaderCircle,
  Square,
  X,
} from "lucide-react";
import {
  DEFAULT_IMAGE_MODEL_ID,
  getImageModelOption,
} from "@/lib/imageModels";
import { normalizeOpenAiImageResolution } from "@/lib/openAiImagePricing";
import {
  generateChatGptImages,
  resolveImageGenerationInputs,
} from "@/lib/imageGenerationClient";
import { imageGenerationProgressPercent } from "@/lib/imageGenerationProgress";
import { useProjectStore } from "@/store/projectStore";
import type { NodeData } from "@/types/project";
import {
  CARD_HEADER_HEIGHT,
  IMAGE_HANDLE_TOP,
  IMAGE_MODEL_WIDTH,
  isHandleConnected,
  NodeFrame,
  PROMPT_HANDLE_TOP,
  SourceHandle,
  TargetHandle,
} from "./NodePrimitives";

type FlowNode = Node<NodeData>;
const promptLabelTop = `calc(${PROMPT_HANDLE_TOP} - 20px)`;
const imageLabelTop = `calc(${IMAGE_HANDLE_TOP} - 20px)`;
const connectorLabel =
  "pointer-events-none absolute text-[10px] font-semibold leading-none tracking-wide";
const minPreviewHeight = 220;
const maxPreviewHeight = 560;

type ImageSize = {
  width: number;
  height: number;
};

function boundedRuns(value: unknown) {
  return Math.max(
    1,
    Math.min(8, typeof value === "number" && Number.isFinite(value) ? value : 1),
  );
}

function activeImageIndexFromData(value: unknown, imageCount: number) {
  if (imageCount <= 0) return 0;

  const fallbackIndex = imageCount - 1;
  const rawIndex =
    typeof value === "number" && Number.isFinite(value) ? value : fallbackIndex;

  return Math.max(0, Math.min(imageCount - 1, Math.round(rawIndex)));
}

function parseImageSize(value: unknown): ImageSize | undefined {
  if (typeof value !== "string") return undefined;

  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;

  return { width, height };
}

function metadataApiSize(data: NodeData) {
  const metadata = data.generatedImageMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const apiSize = (metadata as Record<string, unknown>).apiSize;
  return typeof apiSize === "string" ? apiSize : undefined;
}

function previewHeightForSize(size: ImageSize) {
  return Math.round(
      Math.max(
        minPreviewHeight,
        Math.min(maxPreviewHeight, IMAGE_MODEL_WIDTH * (size.height / size.width)),
      ),
    );
}

function imageDownloadName(nodeId: string, imageIndex: number) {
  const safeNodeId = nodeId.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
  return `${safeNodeId || "postliminal-image"}-${imageIndex + 1}.png`;
}

function safeDownloadBaseName(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
}

function galleryTitle(title: unknown, fallback: string) {
  if (typeof title !== "string") return fallback;

  const trimmedTitle = title.trim();
  if (!trimmedTitle) return fallback;

  return trimmedTitle.replace(/\s+Image Model$/i, "") || fallback;
}

function imageExtension(contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

async function imageBlobFromUrl(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Image download failed.");
  }

  return await response.blob();
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function localProjectAssetPath(imageUrl: string) {
  if (typeof window === "undefined") return "";

  const url = new URL(imageUrl, window.location.href);
  if (
    url.origin === window.location.origin &&
    url.pathname.startsWith("/api/project-assets/")
  ) {
    return url.pathname;
  }

  return "";
}

type SavedDownloadResult = {
  count?: number;
  directory?: string;
  fileName?: string;
  savedPath?: string;
};

async function saveProjectAssetsToDownloads(
  imageUrls: string[],
  filename: string,
) {
  const assetPaths = imageUrls.map(localProjectAssetPath);
  if (assetPaths.some((assetPath) => !assetPath)) return undefined;

  const response = await fetch("/api/images/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assets: assetPaths,
      name: filename,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (SavedDownloadResult & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Download failed.");
  }

  return payload ?? undefined;
}

function savedDownloadMessage(result: SavedDownloadResult) {
  return result.fileName
    ? `Saved to Downloads/${result.fileName}`
    : "Saved to Downloads";
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateParts(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

function uint16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value: number) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

async function zipImageFiles(files: { name: string; blob: Blob }[]) {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  const { dosDate, dosTime } = zipDateParts();

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const name = encoder.encode(file.name);
    const crc = crc32(data);

    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(dosTime),
      ...uint16(dosDate),
      ...uint32(crc),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
    ]);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(dosTime),
      ...uint16(dosDate),
      ...uint32(crc),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
    ]);

    localChunks.push(localHeader, name, data);
    centralChunks.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralDirectory.length),
    ...uint32(offset),
    ...uint16(0),
  ]);

  const zipBytes = concatBytes([
    ...localChunks,
    centralDirectory,
    endOfCentralDirectory,
  ]);
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuffer).set(zipBytes);

  return new Blob([zipBuffer], {
    type: "application/zip",
  });
}

async function downloadImageUrl(imageUrl: string, filename: string) {
  const blob = await imageBlobFromUrl(imageUrl);
  const extension = imageExtension(blob.type);
  const normalizedFilename = filename.replace(/\.[^.]+$/, `.${extension}`);
  saveBlob(blob, normalizedFilename);
}

function GalleryOverlay({
  imageUrls,
  activeImage,
  onActiveImageChange,
  onClose,
  downloadStatus,
  isDownloading,
  onDownload,
}: {
  imageUrls: string[];
  activeImage: number;
  onActiveImageChange: (index: number) => void;
  onClose: () => void;
  downloadStatus: string;
  isDownloading: boolean;
  onDownload: () => void | Promise<void>;
}) {
  const safeActiveImage = Math.min(activeImage, imageUrls.length - 1);
  const activeImageUrl = imageUrls[safeActiveImage];
  const hasThumbnailRail = imageUrls.length > 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onActiveImageChange(
          (safeActiveImage + imageUrls.length - 1) % imageUrls.length,
        );
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onActiveImageChange((safeActiveImage + 1) % imageUrls.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageUrls.length, onActiveImageChange, onClose, safeActiveImage]);

  if (!activeImageUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-[#050507]/90 text-white backdrop-blur-2xl"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-[14px] border border-white/[0.10] bg-white/[0.08] text-white/[0.72] shadow-2xl transition hover:bg-white/[0.12] hover:text-white"
        aria-label="Close gallery"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X className="h-4 w-4" />
      </button>

      <div
        className="absolute right-4 top-4 flex h-10 items-center gap-1 rounded-[14px] border border-white/[0.10] bg-white/[0.08] px-2 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-3 font-mono text-xs text-white/[0.68]">
          {safeActiveImage + 1} / {imageUrls.length}
        </div>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-[10px] text-white/[0.72] transition hover:bg-white/[0.10] hover:text-white disabled:pointer-events-none disabled:text-white/[0.30]"
          aria-label={hasThumbnailRail ? "Download all images" : "Download image"}
          title={hasThumbnailRail ? "Download all" : "Download image"}
          disabled={isDownloading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void onDownload();
          }}
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {downloadStatus ? (
        <div
          className="pointer-events-none absolute bottom-4 left-1/2 max-w-[min(calc(100vw-2rem),520px)] -translate-x-1/2 rounded-[12px] border border-white/[0.12] bg-white/[0.10] px-3 py-2 text-center text-xs font-medium text-white/[0.88] shadow-2xl backdrop-blur-2xl"
          aria-live="polite"
        >
          {downloadStatus}
        </div>
      ) : null}

      <div
        className={`grid h-full gap-5 px-8 py-24 ${
          hasThumbnailRail ? "grid-cols-[1fr_140px]" : "grid-cols-1"
        }`}
      >
        <div className="flex min-h-0 items-center justify-center">
          <img
            src={activeImageUrl}
            alt={`Generated image ${safeActiveImage + 1}`}
            className="max-h-full max-w-full object-contain"
            draggable={false}
            onClick={(event) => event.stopPropagation()}
          />
        </div>

        {hasThumbnailRail ? (
          <div
            className="postliminal-hidden-scrollbar min-h-0 overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-2">
              {imageUrls.map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className={`aspect-square overflow-hidden rounded-[8px] bg-black transition ${
                    index === safeActiveImage
                      ? "outline outline-2 outline-white/[0.78]"
                      : "opacity-74 hover:opacity-100"
                  }`}
                  onClick={() => onActiveImageChange(index)}
                  title={`Image ${index + 1}`}
                >
                  <img
                    src={imageUrl}
                    alt={`Generated thumbnail ${index + 1}`}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ImageGenerationNode({ id, data, selected }: NodeProps<FlowNode>) {
  const project = useProjectStore((state) => state.project);
  const updateNode = useProjectStore((state) => state.updateNode);
  const createImageOutputs = useProjectStore((state) => state.createImageOutputs);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [viewMode, setViewMode] = useState<"single" | "multi">("single");
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadedImageSizes, setLoadedImageSizes] = useState<Record<string, ImageSize>>(
    {},
  );
  const previousPreviewCountRef = useRef(0);
  const didTrackPreviewCountRef = useRef(false);
  const downloadStatusTimeoutRef = useRef<number | null>(null);
  const model = getImageModelOption(data.model);
  const hasPrompt = isHandleConnected(data, "prompt-in");
  const hasImageInput = isHandleConnected(data, "image-in");
  const hasImageOutput = isHandleConnected(data, "image-out");
  const isRunning = data.status === "running";
  const isQueued = data.status === "queued";
  const lastRunError =
    typeof data.lastRunError === "string" ? data.lastRunError : "";
  const displayRunError =
    lastRunError === "Failed to fetch"
      ? "Generation was interrupted by the local dev server. Run it again."
      : lastRunError;
  const generatedImageUrls = Array.isArray(data.generatedImageUrls)
    ? data.generatedImageUrls.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string",
      )
    : [];
  const previewCount = Math.max(
    0,
    Math.min(24, generatedImageUrls.length),
  );
  const hasPreview = previewCount > 0;
  const resolution = normalizeOpenAiImageResolution(data.resolution);
  const metadataSize = parseImageSize(metadataApiSize(data));
  const configuredSize = parseImageSize(resolution) ?? { width: 1024, height: 1024 };
  const checkerStyle = {
    backgroundColor: "#11121a",
    backgroundImage:
      "linear-gradient(45deg, #0c0c10 25%, transparent 25%), linear-gradient(-45deg, #0c0c10 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0c0c10 75%), linear-gradient(-45deg, transparent 75%, #0c0c10 75%)",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
    backgroundSize: "20px 20px",
  };
  const showMultiView = hasPreview && viewMode === "multi";
  const safeActiveImage = activeImageIndexFromData(
    data.activeGeneratedImageIndex,
    previewCount,
  );
  const activeImageUrl = generatedImageUrls[safeActiveImage];
  const activeImageSize =
    (activeImageUrl ? loadedImageSizes[activeImageUrl] : undefined) ??
    metadataSize ??
    configuredSize;
  const previewHeight = previewHeightForSize(activeImageSize);
  const nodeHeight = CARD_HEADER_HEIGHT + previewHeight;
  const downloadTitle = galleryTitle(data.title, model.nodeLabel);
  const downloadBaseName = safeDownloadBaseName(downloadTitle) || id;
  const currentImageDownloadName = imageDownloadName(
    downloadBaseName,
    safeActiveImage,
  );
  const allImagesDownloadName = `${downloadBaseName || "postliminal-images"}.zip`;
  const showDownloadStatus = (message: string) => {
    setDownloadStatus(message);
    if (downloadStatusTimeoutRef.current !== null) {
      window.clearTimeout(downloadStatusTimeoutRef.current);
    }
    downloadStatusTimeoutRef.current = window.setTimeout(() => {
      setDownloadStatus("");
      downloadStatusTimeoutRef.current = null;
    }, 3600);
  };
  const downloadCurrentImage = async () => {
    if (!activeImageUrl) return;
    const savedDownload = await saveProjectAssetsToDownloads(
      [activeImageUrl],
      currentImageDownloadName,
    );
    if (savedDownload) {
      showDownloadStatus(savedDownloadMessage(savedDownload));
      return;
    }

    await downloadImageUrl(activeImageUrl, currentImageDownloadName);
    showDownloadStatus("Download started.");
  };
  const downloadAllImages = async () => {
    if (generatedImageUrls.length <= 1) {
      await downloadCurrentImage();
      return;
    }

    const savedDownload = await saveProjectAssetsToDownloads(
      generatedImageUrls,
      allImagesDownloadName,
    );
    if (savedDownload) {
      showDownloadStatus(savedDownloadMessage(savedDownload));
      return;
    }

    const files = await Promise.all(
      generatedImageUrls.map(async (imageUrl, index) => {
        const blob = await imageBlobFromUrl(imageUrl);
        const extension = imageExtension(blob.type);

        return {
          blob,
          name: imageDownloadName(downloadBaseName, index).replace(
            /\.[^.]+$/,
            `.${extension}`,
          ),
        };
      }),
    );
    const zipBlob = await zipImageFiles(files);
    saveBlob(zipBlob, allImagesDownloadName);
    showDownloadStatus("Download started.");
  };
  const downloadPreviewImages = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      if (showMultiView) {
        await downloadAllImages();
      } else {
        await downloadCurrentImage();
      }
    } catch (error) {
      showDownloadStatus(
        error instanceof Error ? error.message : "Download failed.",
      );
    } finally {
      setIsDownloading(false);
    }
  };
  const downloadGalleryImages = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      await downloadAllImages();
    } catch (error) {
      showDownloadStatus(
        error instanceof Error ? error.message : "Download failed.",
      );
    } finally {
      setIsDownloading(false);
    }
  };
  const openGallery = () => {
    if (!hasPreview) return;
    setIsGalleryOpen(true);
  };
  const setActiveImageForNode = useCallback(
    (nextIndexOrUpdater: number | ((currentIndex: number) => number)) => {
      if (!hasPreview) return;

      const rawNextIndex =
        typeof nextIndexOrUpdater === "function"
          ? nextIndexOrUpdater(safeActiveImage)
          : nextIndexOrUpdater;
      const nextIndex = activeImageIndexFromData(rawNextIndex, previewCount);
      if (data.activeGeneratedImageIndex === nextIndex) return;

      updateNode(
        id,
        {
          data: {
            activeGeneratedImageIndex: nextIndex,
          },
        },
        "human",
      );
    },
    [
      data.activeGeneratedImageIndex,
      hasPreview,
      id,
      previewCount,
      safeActiveImage,
      updateNode,
    ],
  );
  const rememberImageSize = (src: string, image: HTMLImageElement) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width <= 0 || height <= 0) return;

    setLoadedImageSizes((current) => {
      const existing = current[src];
      if (existing?.width === width && existing.height === height) {
        return current;
      }

      return { ...current, [src]: { width, height } };
    });
  };

  useEffect(() => {
    if (!isRunning) {
      setProgress(0);
      return;
    }

    setProgress(imageGenerationProgressPercent(data.runStartedAt));

    const timer = window.setInterval(() => {
      setProgress(imageGenerationProgressPercent(data.runStartedAt));
    }, 120);

    return () => window.clearInterval(timer);
  }, [data.runStartedAt, isRunning]);

  useEffect(() => {
    return () => {
      if (downloadStatusTimeoutRef.current !== null) {
        window.clearTimeout(downloadStatusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousPreviewCount = previousPreviewCountRef.current;
    previousPreviewCountRef.current = previewCount;
    if (!didTrackPreviewCountRef.current) {
      didTrackPreviewCountRef.current = true;
      return;
    }

    if (!hasPreview) {
      setViewMode("single");
      return;
    }

    if (previewCount > previousPreviewCount) {
      setActiveImageForNode(previewCount - 1);
      return;
    }
  }, [hasPreview, previewCount, setActiveImageForNode]);

  const previousImage = () => {
    if (!hasPreview) return;
    setActiveImageForNode((index) => (index + previewCount - 1) % previewCount);
  };
  const nextImage = () => {
    if (!hasPreview) return;
    setActiveImageForNode((index) => (index + 1) % previewCount);
  };
  const handleMultiViewWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!selected) return;

    const container = event.currentTarget;
    const canScrollVertically =
      container.scrollHeight > container.clientHeight + 1;
    const isMostlyVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);

    if (!canScrollVertically || !isMostlyVertical) return;

    const isScrollingDown = event.deltaY > 0;
    const isScrollingUp = event.deltaY < 0;
    const hasRoomAbove = container.scrollTop > 0;
    const hasRoomBelow =
      container.scrollTop + container.clientHeight < container.scrollHeight - 1;

    if ((isScrollingDown && hasRoomBelow) || (isScrollingUp && hasRoomAbove)) {
      event.stopPropagation();
    }
  };
  const runModel = async () => {
    if (isRunning) return;

    const option = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
    const runs = boundedRuns(data.runs);
    const quality = typeof data.quality === "string" ? data.quality : "medium";
    const inputs = resolveImageGenerationInputs(project, id);
    const runStartedAt = Date.now();

    updateNode(
      id,
      {
        data: {
          model: option.id,
          modelLabel: option.nodeLabel,
          status: "running",
          lastRunError: "",
          runStartedAt,
        },
      },
      "human",
    );

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await generateChatGptImages({
        ...inputs,
        projectId: project.projectId,
        generationNodeId: id,
        quality,
        resolution,
        runs,
        startedAt: runStartedAt,
        signal: abortController.signal,
      });

      createImageOutputs(id, result.images, "human", {
        sourceModel: option.label,
        apiModel: result.model,
        apiSize: result.size,
        quality,
        resolution,
        prompt: inputs.prompt,
      });
      updateNode(
        id,
        { data: { lastRunError: "", runMessage: "", runStartedAt: undefined } },
        "human",
      );
    } catch (error) {
      updateNode(
        id,
        {
          data: {
            status: "error",
            runMessage: "",
            runStartedAt: undefined,
            lastRunError:
              error instanceof Error
                ? error.message
                : "Image generation failed",
          },
        },
        "human",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };
  const cancelRun = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    updateNode(
      id,
      {
        data: {
          status: "error",
          runMessage: "",
          runStartedAt: undefined,
          lastRunError: "Image generation was cancelled.",
        },
      },
      "human",
    );
  };

  return (
    <NodeFrame
      className="flex flex-col"
      selected={selected}
      style={{ width: IMAGE_MODEL_WIDTH, height: nodeHeight }}
    >
      {selected ? (
        <div
          className={`${connectorLabel} right-full mr-4 w-16 text-right font-mono font-medium tracking-[0.08em] text-[#f5b950]`}
          style={{ top: promptLabelTop }}
        >
          Prompt
        </div>
      ) : null}
      {selected ? (
        <div
          className={`${connectorLabel} right-full mr-4 w-16 text-right font-mono font-medium tracking-[0.08em] text-[#6aa6ff]`}
          style={{ top: imageLabelTop }}
        >
          Image
        </div>
      ) : null}
      {selected ? (
        <div
          className={`${connectorLabel} left-full ml-4 w-12 text-left font-mono font-medium tracking-[0.08em] text-[#6aa6ff]`}
          style={{ top: imageLabelTop }}
        >
          Image
        </div>
      ) : null}
      <TargetHandle
        id="prompt-in"
        tone="prompt"
        offset="prompt"
        connected={hasPrompt}
      />
      <TargetHandle
        id="image-in"
        tone="image"
        offset="image"
        connected={hasImageInput}
      />
      <SourceHandle
        id="image-out"
        tone="image"
        offset="image"
        connected={hasImageOutput}
      />
      <div
        className="postliminal-node-header flex items-center justify-between gap-4 px-5"
        style={{ height: CARD_HEADER_HEIGHT }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] border border-[#6aa6ff]/25 bg-[#6aa6ff]/10 text-[#6aa6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(106,166,255,0.10)]">
            <Cpu className="h-4 w-4" />
          </span>
          <div className="truncate text-[13px] font-medium text-white/[0.92]">
            {model.nodeLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {isRunning ? (
            <div className="flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.14] bg-white/[0.08] px-3 text-[11px] font-medium text-white/[0.9]">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#f5b950]" />
              <span>{progress}%</span>
              <button
                type="button"
                aria-label="Cancel image generation"
                className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/[0.52] transition hover:bg-white/[0.10] hover:text-white/[0.86]"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRun();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : isQueued ? (
            <div className="flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.12] bg-white/[0.06] px-3 text-[11px] font-medium text-white/[0.68]">
              Queued
            </div>
          ) : (
            <button
              type="button"
              className="nodrag nopan flex h-9 items-center gap-2 rounded-[11px] border border-white/[0.16] bg-white/[0.08] px-3 text-[11px] font-medium text-white/[0.9] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:border-white/[0.26] hover:bg-white/[0.12]"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                runModel();
              }}
            >
              <ArrowRight className="h-3 w-3" />
              Run
            </button>
          )}
        </div>
      </div>
      <div className="nodrag nopan min-h-0 flex-1">
        <div
          className={`group/preview relative h-full overflow-hidden rounded-b-[18px] rounded-t-none shadow-none ${
            hasPreview ? "bg-transparent" : "bg-[#11121a]"
          }`}
        >
          {showMultiView ? (
            <div
              className={`postliminal-hidden-scrollbar h-full ${
                selected ? "nowheel overscroll-contain" : ""
              } ${
                selected && previewCount > 4
                  ? "overflow-y-auto"
                  : "overflow-hidden"
              }`}
              onWheelCapture={handleMultiViewWheel}
            >
              <div className="grid grid-cols-2 gap-0 bg-black">
                {Array.from({ length: previewCount }).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className="nodrag nopan aspect-square overflow-hidden bg-black transition"
                    style={generatedImageUrls[index] ? undefined : checkerStyle}
                    onClick={() => setActiveImageForNode(index)}
                    title={`Image ${index + 1}`}
                  >
                    {generatedImageUrls[index] ? (
                      // Render the returned PNG directly; do not recolor it with CSS.
                      <img
                        src={generatedImageUrls[index]}
                        alt={`Generated image ${index + 1}`}
                        className="block h-full w-full object-contain"
                        draggable={false}
                        onLoad={(event) =>
                          rememberImageSize(
                            generatedImageUrls[index],
                            event.currentTarget,
                          )
                        }
                      />
                    ) : null}
                    <span className="sr-only">Image {index + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : hasPreview && activeImageUrl ? (
            <img
              src={activeImageUrl}
              alt="Generated image"
              className="block h-full w-full object-contain"
              draggable={false}
              onLoad={(event) =>
                rememberImageSize(activeImageUrl, event.currentTarget)
              }
            />
          ) : hasPreview ? (
            <div className="h-full w-full" style={checkerStyle} />
          ) : (
            <div className="h-full w-full" style={checkerStyle} />
          )}

          {hasPreview ? (
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100">
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/46 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/46 to-transparent" />
            </div>
          ) : null}

          {hasPreview ? (
            <div className="absolute inset-x-2 top-2 flex items-center justify-between opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100">
              <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.10] bg-black/28 px-1.5 py-1 font-mono text-[10px] font-medium text-white/80 backdrop-blur-md">
                <button
                  type="button"
                  className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/75 transition hover:bg-white/10 hover:text-white"
                  title={viewMode === "single" ? "Multi view" : "Single view"}
                  onClick={() =>
                    setViewMode((mode) => (mode === "single" ? "multi" : "single"))
                  }
                >
                  {viewMode === "single" ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronsLeftRightEllipsis className="h-3.5 w-3.5" />
                  )}
                </button>
                {showMultiView ? (
                  <span>{previewCount} images</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/65 transition hover:bg-white/10 hover:text-white"
                      title="Previous image"
                      onClick={previousImage}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span>
                      {safeActiveImage + 1} / {previewCount}
                    </span>
                    <button
                      type="button"
                      className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] text-white/65 transition hover:bg-white/10 hover:text-white"
                      title="Next image"
                      onClick={nextImage}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-[10px] border border-white/[0.10] bg-black/28 px-1.5 py-1 text-white/75 backdrop-blur-md">
                <button
                  type="button"
                  className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] transition hover:bg-white/10 hover:text-white"
                  title="Gallery view"
                  onClick={openGallery}
                >
                  <Expand className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="nodrag nopan grid h-5 w-5 place-items-center rounded-[7px] transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:text-white/30"
                  title={showMultiView ? "Download all" : "Download image"}
                  aria-label={showMultiView ? "Download all images" : "Download image"}
                  disabled={isDownloading}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void downloadPreviewImages();
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {downloadStatus ? (
            <div
              className="pointer-events-none absolute inset-x-3 bottom-3 rounded-[12px] border border-white/[0.12] bg-white/[0.10] px-3 py-2 text-center text-[11px] font-medium leading-4 text-white/[0.88] shadow-[0_14px_34px_rgba(0,0,0,0.36)] backdrop-blur-xl"
              aria-live="polite"
            >
              {downloadStatus}
            </div>
          ) : null}

          {hasPreview && !showMultiView ? (
            <div className="absolute bottom-2 left-2 rounded-[7px] border border-white/[0.10] bg-black/38 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white/85 opacity-0 backdrop-blur-md transition-opacity duration-150 group-hover/preview:opacity-100">
              {resolution}
            </div>
          ) : null}

          {!isRunning && displayRunError ? (
            <div className="absolute inset-x-3 bottom-3 rounded-[12px] border border-[#f5b950]/[0.22] bg-[#f5b950]/[0.10] px-3 py-2 text-[11px] font-medium leading-4 text-white/[0.88] shadow-[0_14px_34px_rgba(0,0,0,0.36)] backdrop-blur-xl">
              <span className="block truncate">Failed: {displayRunError}</span>
            </div>
          ) : null}
        </div>
      </div>
      {isGalleryOpen ? (
        <GalleryOverlay
          imageUrls={generatedImageUrls}
          activeImage={safeActiveImage}
          onActiveImageChange={setActiveImageForNode}
          onClose={() => setIsGalleryOpen(false)}
          downloadStatus={downloadStatus}
          isDownloading={isDownloading}
          onDownload={downloadGalleryImages}
        />
      ) : null}
    </NodeFrame>
  );
}
