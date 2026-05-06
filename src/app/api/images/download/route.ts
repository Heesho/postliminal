import { access, mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROJECT_ASSETS_DIR = path.join(process.cwd(), "projects");
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");

type SaveDownloadRequest = {
  assets?: unknown;
  name?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeDownloadName(value: string | null, fallback: string) {
  const safeName = (value ?? "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-|-$/g, "");

  return safeName || fallback;
}

function normalizeAssetUrls(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, 24);
}

function extensionForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "jpg";
  if (extension === ".webp") return "webp";
  return "png";
}

function fileNameForIndex(baseName: string, index: number, filePath: string) {
  return `${baseName}-${index + 1}.${extensionForPath(filePath)}`;
}

function fileNameForSingleAsset(name: string, filePath: string) {
  const parsedName = path.parse(name);
  const baseName = parsedName.name || "postliminal-image";
  return `${baseName}.${extensionForPath(filePath)}`;
}

function localProjectAssetPath(assetUrl: string) {
  let pathname: string;
  try {
    pathname = new URL(assetUrl, "http://postliminal.local").pathname;
  } catch {
    return "";
  }

  if (!pathname.startsWith("/api/project-assets/")) return "";

  const assetPath = decodeURIComponent(
    pathname.slice("/api/project-assets/".length),
  );
  const segments = assetPath.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === ".." || segment.includes("\0"))
  ) {
    return "";
  }

  const projectAssetsRoot = path.resolve(PROJECT_ASSETS_DIR);
  const filePath = path.resolve(PROJECT_ASSETS_DIR, ...segments);
  if (!filePath.startsWith(`${projectAssetsRoot}${path.sep}`)) return "";

  return filePath;
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
  return Buffer.from([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32(value: number) {
  return Buffer.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function zipImageFiles(files: { name: string; data: Buffer }[]) {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  const { dosDate, dosTime } = zipDateParts();

  files.forEach((file) => {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(name.length),
      uint16(0),
    ]);
    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
    ]);

    localChunks.push(localHeader, name, file.data);
    centralChunks.push(centralHeader, name);
    offset += localHeader.length + name.length + file.data.length;
  });

  const centralDirectory = Buffer.concat(centralChunks);
  const endOfCentralDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);

  return Buffer.concat([
    ...localChunks,
    centralDirectory,
    endOfCentralDirectory,
  ]);
}

async function uniqueDownloadPath(fileName: string) {
  await mkdir(DOWNLOADS_DIR, { recursive: true });

  const parsedPath = path.parse(fileName);
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidateName = `${parsedPath.name}${suffix}${parsedPath.ext}`;
    const candidatePath = path.join(DOWNLOADS_DIR, candidateName);

    try {
      await access(candidatePath);
    } catch {
      return {
        fileName: candidateName,
        filePath: candidatePath,
      };
    }
  }

  throw new Error("Could not create a unique download name.");
}

async function saveDownloadFile(fileName: string, data: Buffer) {
  const download = await uniqueDownloadPath(fileName);
  await writeFile(download.filePath, data);

  return {
    fileName: download.fileName,
    savedPath: download.filePath,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const assetUrls = url.searchParams.getAll("asset");
  if (assetUrls.length === 0 || assetUrls.length > 24) {
    return NextResponse.json({ error: "Invalid download assets." }, { status: 400 });
  }

  const filePaths = assetUrls.map(localProjectAssetPath);
  if (filePaths.some((filePath) => !filePath)) {
    return NextResponse.json({ error: "Invalid download assets." }, { status: 400 });
  }

  try {
    const baseName = safeDownloadName(url.searchParams.get("name"), "images").replace(
      /\.zip$/i,
      "",
    );
    const files = await Promise.all(
      filePaths.map(async (filePath, index) => ({
        name: fileNameForIndex(baseName, index, filePath),
        data: await readFile(filePath),
      })),
    );
    const zipFile = zipImageFiles(files);

    return new Response(new Uint8Array(zipFile), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${baseName}.zip"`,
        "Content-Type": "application/zip",
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | SaveDownloadRequest
    | null;
  const assetUrls = normalizeAssetUrls(payload?.assets);
  if (assetUrls.length === 0 || assetUrls.length > 24) {
    return NextResponse.json({ error: "Invalid download assets." }, { status: 400 });
  }

  const filePaths = assetUrls.map(localProjectAssetPath);
  if (filePaths.some((filePath) => !filePath)) {
    return NextResponse.json({ error: "Invalid download assets." }, { status: 400 });
  }

  try {
    const requestedName = safeDownloadName(
      stringValue(payload?.name) || null,
      assetUrls.length === 1 ? "postliminal-image.png" : "postliminal-images.zip",
    );

    if (filePaths.length === 1) {
      const filePath = filePaths[0];
      const file = await readFile(filePath);
      const fileName = fileNameForSingleAsset(requestedName, filePath);
      const savedFile = await saveDownloadFile(fileName, file);

      return NextResponse.json({
        count: 1,
        directory: DOWNLOADS_DIR,
        ...savedFile,
      });
    }

    const baseName = requestedName.replace(/\.zip$/i, "") || "postliminal-images";
    const files = await Promise.all(
      filePaths.map(async (filePath, index) => ({
        name: fileNameForIndex(baseName, index, filePath),
        data: await readFile(filePath),
      })),
    );
    const zipFile = zipImageFiles(files);
    const savedFile = await saveDownloadFile(`${baseName}.zip`, zipFile);

    return NextResponse.json({
      count: files.length,
      directory: DOWNLOADS_DIR,
      ...savedFile,
    });
  } catch {
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
