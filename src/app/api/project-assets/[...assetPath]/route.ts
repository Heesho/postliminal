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

export async function GET(
  _request: Request,
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
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeForPath(filePath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
