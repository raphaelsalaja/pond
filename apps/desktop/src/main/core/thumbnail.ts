import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import log from "electron-log/main.js";
import sharp, { type Metadata } from "sharp";
import { eagleFormatGroup } from "../../shared/eagle-formats";
import { THUMBNAIL_CACHE_VERSION } from "../../shared/media-index";
import { thumbnailSidecarCandidates } from "../../shared/save-file-names";
import { decodeHeicOnMac } from "../lib/heic";
import {
  createThumbnailScheduler,
  isIsoBaseMediaHeader,
  isRasterImageHeader,
  NATIVE_RASTER_EXT,
  type ThumbnailKind,
  type ThumbnailPriority,
  thumbnailKindForExtension,
} from "../lib/thumbnail";
import { thumbnailCacheRoot } from "../paths";
import { extractOfficePreview } from "./office-preview";
import { extractRawPreviewJpeg } from "./raw-preview";
import {
  libraryMediaMetadata,
  readLibraryMedia,
  readLibraryMediaRange,
  writeLibraryMedia,
} from "./storage/library-media-storage";

const WEBP_QUALITY = 78;
const MAX_CONCURRENT = 4;

const inflight = new Map<string, Promise<string | null>>();

const scheduler = createThumbnailScheduler(MAX_CONCURRENT);

interface ThumbnailRequest {
  saveId: string;
  sourcePath: string;
  width: number;
  version: string | null;
  priority?: ThumbnailPriority;
}

type ThumbnailOutput = { width: number; out: string };

export async function getOrCreateThumbnail(
  req: ThumbnailRequest,
): Promise<{ path: string } | null> {
  const exact = lookupExactCachedThumbnail(req);
  if (exact) return exact;

  const { saveId, sourcePath, width } = req;
  const version = await resolveVersion(sourcePath, req.version);
  if (!version) return null;
  const dir = join(thumbnailCacheRoot(), sanitizeSegment(saveId));
  const out = thumbnailOutput(dir, sourcePath, version, width);

  if (existsSync(out)) return { path: out };

  const existing = inflight.get(out);
  if (existing) {
    const done = await existing;
    return done ? { path: done } : null;
  }

  const kind = await detectThumbnailKind(sourcePath);
  if (!kind) return null;
  const task = generate(
    out,
    dir,
    sourcePath,
    width,
    kind,
    req.priority ?? "foreground",
  );
  inflight.set(out, task);
  try {
    const done = await task;
    return done ? { path: done } : null;
  } finally {
    inflight.delete(out);
  }
}

function lookupExactCachedThumbnail(req: {
  saveId: string;
  sourcePath: string;
  width: number;
  version: string | null;
}): { path: string } | null {
  if (!req.version) return null;
  const dir = join(thumbnailCacheRoot(), sanitizeSegment(req.saveId));
  const out = thumbnailOutput(dir, req.sourcePath, req.version, req.width);
  return existsSync(out) ? { path: out } : null;
}

/** A versionless URL can outlive its file, so only a versioned thumbnail is immutable. */
export async function resolveCardThumbnail(req: {
  saveId: string;
  sourcePath: string;
  width: number;
  version: string | null;
}): Promise<{ path: string; immutable: boolean }> {
  const thumb = await getOrCreateThumbnail({ ...req, priority: "visible" });
  return thumb
    ? { path: thumb.path, immutable: req.version !== null }
    : { path: req.sourcePath, immutable: false };
}

async function generate(
  out: string,
  dir: string,
  sourcePath: string,
  width: number,
  kind: ThumbnailKind,
  priority: ThumbnailPriority,
): Promise<string | null> {
  const results = await generateMany(
    [{ out, width }],
    dir,
    sourcePath,
    kind,
    priority,
  );
  return results.get(out) ?? null;
}

async function generateMany(
  outputs: readonly ThumbnailOutput[],
  dir: string,
  sourcePath: string,
  kind: ThumbnailKind,
  priority: ThumbnailPriority,
): Promise<Map<string, string>> {
  return scheduler.run(priority, async () => {
    const results = new Map<string, string>();
    try {
      const missing = outputs.filter(({ out }) => {
        if (!existsSync(out)) return true;
        results.set(out, out);
        return false;
      });
      if (missing.length === 0) return results;

      const maxWidth = Math.max(...missing.map(({ width }) => width));
      const source = await thumbnailPipeline(sourcePath, maxWidth, kind);
      if (!source) return results;
      const { pipeline } = source;

      await mkdir(dir, { recursive: true });
      for (const { out, width } of missing) {
        try {
          const bytes = await pipeline
            .clone()
            .resize({ width, fit: "inside", withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
          try {
            await writeLibraryMedia(out, bytes);
          } finally {
            bytes.fill(0);
          }
          results.set(out, out);
        } catch (err) {
          log.warn("[pond thumbnail] width failed", sourcePath, width, err);
        }
      }
      return results;
    } catch (err) {
      log.warn("[pond thumbnail] generate failed", sourcePath, err);
      return results;
    }
  });
}

async function thumbnailPipeline(
  sourcePath: string,
  width: number,
  kind: ThumbnailKind,
): Promise<{
  pipeline: ReturnType<typeof sharp>;
  metadata: Metadata;
} | null> {
  if (kind === "native") {
    const imported = await importedThumbnailSidecarPipeline(sourcePath);
    if (imported) return imported;
  }
  if (kind === "native") {
    return nativeThumbnailPipeline(sourcePath, width);
  }
  try {
    const pipeline = sharp(sourcePath, { failOn: "none", pages: 1 });
    return { pipeline, metadata: await pipeline.metadata() };
  } catch {
    return kind === "sharp-or-native"
      ? nativeThumbnailPipeline(sourcePath, width)
      : null;
  }
}

async function detectThumbnailKind(
  sourcePath: string,
): Promise<ThumbnailKind | null> {
  const ext = extname(sourcePath).toLowerCase();
  const extensionKind = thumbnailKindForExtension(ext);
  if (extensionKind && extensionKind !== "native") return extensionKind;
  try {
    const header = await readFileHeader(sourcePath);
    if (!isRasterImageHeader(header)) return extensionKind;
    return isIsoBaseMediaHeader(header) ? "native" : "sharp";
  } catch {
    return extensionKind;
  }
}

async function resolveVersion(
  sourcePath: string,
  version: string | null,
): Promise<string | null> {
  if (version) return version;
  try {
    const [source, media] = await Promise.all([
      stat(sourcePath),
      libraryMediaMetadata(sourcePath),
    ]);
    return `${Math.round(source.mtimeMs)}-${media.originalSize}`;
  } catch {
    return null;
  }
}

function thumbnailOutput(
  dir: string,
  sourcePath: string,
  version: string,
  width: number,
): string {
  const key = createHash("sha1")
    .update(`${sourcePath}|${version}|${width}|webp|${THUMBNAIL_CACHE_VERSION}`)
    .digest("hex")
    .slice(0, 20);
  return join(dir, `${key}.webp`);
}

async function nativeThumbnailPipeline(
  sourcePath: string,
  width: number,
): Promise<{
  pipeline: ReturnType<typeof sharp>;
  metadata: Metadata;
} | null> {
  const imported = await importedThumbnailSidecarPipeline(sourcePath);
  if (imported) return imported;
  if (
    process.platform === "darwin" &&
    NATIVE_RASTER_EXT.has(extname(sourcePath).toLowerCase())
  ) {
    const pipeline = sharp(await decodeHeicOnMac(sourcePath, width));
    return { pipeline, metadata: await pipeline.metadata() };
  }
  const raw = await rawThumbnailPipeline(sourcePath);
  if (raw) return raw;
  const native = await osNativeThumbnail(sourcePath, width);
  if (native) return native;
  return officeThumbnailPipeline(sourcePath);
}

async function importedThumbnailSidecarPipeline(sourcePath: string): Promise<{
  pipeline: ReturnType<typeof sharp>;
  metadata: Metadata;
} | null> {
  for (const name of thumbnailSidecarCandidates(sourcePath)) {
    const sidecarPath = join(dirname(sourcePath), name);
    if (!existsSync(sidecarPath)) continue;
    try {
      const pipeline = sharp(await readLibraryMedia(sidecarPath), {
        failOn: "none",
      });
      return { pipeline, metadata: await pipeline.metadata() };
    } catch {}
  }
  return null;
}

async function rawThumbnailPipeline(sourcePath: string): Promise<{
  pipeline: ReturnType<typeof sharp>;
  metadata: Metadata;
} | null> {
  const extension = extname(sourcePath).toLowerCase().replace(/^\./, "");
  if (eagleFormatGroup(extension) !== "rawImage") return null;
  try {
    const jpeg = extractRawPreviewJpeg(await readLibraryMedia(sourcePath));
    if (!jpeg) return null;
    const pipeline = sharp(jpeg, { failOn: "none" });
    return { pipeline, metadata: await pipeline.metadata() };
  } catch {
    return null;
  }
}

async function officeThumbnailPipeline(sourcePath: string): Promise<{
  pipeline: ReturnType<typeof sharp>;
  metadata: Metadata;
} | null> {
  const preview = await extractOfficePreview(sourcePath);
  if (!preview) return null;
  try {
    const pipeline = sharp(preview, { failOn: "none" });
    return { pipeline, metadata: await pipeline.metadata() };
  } catch {
    return null;
  }
}

async function osNativeThumbnail(
  sourcePath: string,
  width: number,
): Promise<{
  pipeline: ReturnType<typeof sharp>;
  metadata: Metadata;
} | null> {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return null;
  }
  const { nativeImage } = await import("electron");
  const image = await nativeImage.createThumbnailFromPath(sourcePath, {
    width,
    height: width,
  });
  if (image.isEmpty()) return null;
  const nativePipeline = sharp(image.toPNG(), { failOn: "none" });
  return {
    pipeline: nativePipeline,
    metadata: await nativePipeline.metadata(),
  };
}

async function readFileHeader(sourcePath: string): Promise<Buffer> {
  const { originalSize } = await libraryMediaMetadata(sourcePath);
  const chunks: Buffer[] = [];
  for await (const chunk of readLibraryMediaRange({
    path: sourcePath,
    start: 0,
    endExclusive: Math.min(originalSize, 12),
  })) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
