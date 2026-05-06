import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROJECT_ASSETS_DIR = path.join(process.cwd(), "projects");

function contentTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function isSafeSegment(segment: string) {
  return /^[a-zA-Z0-9_.-]+$/.test(segment) && segment !== "..";
}

function safeDownloadName(value: string | null) {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assetPath?: string[] }> },
) {
  const { assetPath = [] } = await context.params;
  if (assetPath.length === 0 || !assetPath.every(isSafeSegment)) {
    return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
  }

  const filePath = path.join(PROJECT_ASSETS_DIR, ...assetPath);
  const relativePath = path.relative(PROJECT_ASSETS_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    const downloadName = safeDownloadName(
      new URL(request.url).searchParams.get("download"),
    );
    const headers = new Headers({
      "Content-Type": contentTypeForPath(filePath),
      "Cache-Control": "no-store",
    });

    if (downloadName) {
      headers.set("Content-Disposition", `attachment; filename="${downloadName}"`);
    }

    return new Response(new Uint8Array(file), {
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
