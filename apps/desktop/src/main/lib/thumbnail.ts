import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import log from "electron-log/main.js";
import sharp, { type Metadata } from "sharp";
import { isThumbnailFileExtension } from "../../shared/media-index";
import { libraryRoot, thumbnailCacheRoot } from "../paths";

const LEGACY_THUMBS_DIRNAME = "_thumbs";
const MIN_WIDTH = 32;
const MAX_WIDTH = 2048;
const WEBP_QUALITY = 78;
/** Cap concurrent sharp jobs so a fast scroll can't peg every core. */
const MAX_CONCURRENT = 4;

export type ThumbnailPriority = "foreground" | "background";

/** Raster formats safe to downscale; animated/vector are served as the original. */
const NATIVE_RASTER_EXT = new Set([".heic", ".heif"]);

export function isThumbnailable(ext: string): boolean {
  return isThumbnailFileExtension(ext);
}

export function isIsoBaseMediaHeader(header: Uint8Array): boolean {
  return (
    header.byteLength >= 12 &&
    Buffer.from(header).toString("ascii", 4, 8) === "ftyp"
  );
}

/** Detect still raster bytes when legacy imports have no usable file extension. */
export function isRasterImageHeader(header: Uint8Array): boolean {
  if (header.byteLength >= 2 && header[0] === 0xff && header[1] === 0xd8) {
    return true;
  }
  if (
    header.byteLength >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return true;
  }
  if (
    header.byteLength >= 12 &&
    Buffer.from(header).toString("ascii", 0, 4) === "RIFF" &&
    Buffer.from(header).toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }
  return isIsoBaseMediaHeader(header);
}

/** Clamps a requested width; null on garbage so the caller uses the original. */
export function clampThumbWidth(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const w = Math.round(raw);
  if (w <= 0) return null;
  return Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH);
}

/** Per-output in-flight dedupe so concurrent requests share one generation. */
const inflight = new Map<string, Promise<string | null>>();

/** Foreground card requests jump speculative warming; only one background transform may run at once. */
export function createThumbnailScheduler(
  maxConcurrent: number,
  maxBackground = 2,
) {
  let active = 0;
  let backgroundActive = 0;
  const foreground: Array<() => void> = [];
  const background: Array<() => void> = [];

  function drain(): void {
    while (active < maxConcurrent) {
      const next =
        foreground.shift() ??
        (backgroundActive < maxBackground ? background.shift() : undefined);
      if (!next) return;
      next();
    }
  }

  async function run<T>(
    priority: ThumbnailPriority,
    task: () => Promise<T>,
  ): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => {
        active += 1;
        if (priority === "background") backgroundActive += 1;
        resolve();
      };
      (priority === "foreground" ? foreground : background).push(start);
      drain();
    });
    try {
      return await task();
    } finally {
      active -= 1;
      if (priority === "background") backgroundActive -= 1;
      drain();
    }
  }

  return { run };
}

const scheduler = createThumbnailScheduler(MAX_CONCURRENT);

interface ThumbnailRequest {
  /** Protocol host; partitions the cache so a deleted save's thumbs drop as a unit. */
  saveId: string;
  /** Absolute source path, already validated to live in the items dir. */
  sourcePath: string;
  /** Target width in device pixels, already clamped. */
  width: number;
  /** Content version (sha256 prefix); null falls back to mtime+size. */
  version: string | null;
  /** Visible cards are foreground; speculative library preparation is background. */
  priority?: ThumbnailPriority;
}

interface ThumbnailSetRequest extends Omit<ThumbnailRequest, "width"> {
  widths: readonly number[];
}

type ThumbnailKind = "sharp" | "native";
type ThumbnailOutput = { width: number; out: string };

/** Resolves a cached WebP thumb, generating on demand; null means serve the original. */
export async function getOrCreateThumbnail(
  req: ThumbnailRequest,
): Promise<{ path: string } | null> {
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

  const legacyDir = join(
    libraryRoot(),
    LEGACY_THUMBS_DIRNAME,
    sanitizeSegment(saveId),
  );
  const legacyOut = thumbnailOutput(legacyDir, sourcePath, version, width);
  if (existsSync(legacyOut)) {
    const promotion = promoteLegacyThumbnail(legacyOut, out, dir);
    inflight.set(out, promotion);
    try {
      const done = await promotion;
      return done ? { path: done } : null;
    } finally {
      inflight.delete(out);
    }
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

/** Generates several cache buckets through one decoded source pipeline. */
export async function prepareThumbnails(
  req: ThumbnailSetRequest,
): Promise<void> {
  const widths = [...new Set(req.widths)];
  if (widths.length === 0) return;
  const version = await resolveVersion(req.sourcePath, req.version);
  if (!version) return;
  const segment = sanitizeSegment(req.saveId);
  const dir = join(thumbnailCacheRoot(), segment);
  const legacyDir = join(libraryRoot(), LEGACY_THUMBS_DIRNAME, segment);
  const outputs = widths.map((width) => ({
    width,
    out: thumbnailOutput(dir, req.sourcePath, version, width),
    legacyOut: thumbnailOutput(legacyDir, req.sourcePath, version, width),
  }));

  const waits: Promise<string | null>[] = [];
  const missing: ThumbnailOutput[] = [];
  const owned: Array<readonly [string, Promise<string | null>]> = [];
  for (const output of outputs) {
    if (existsSync(output.out)) continue;
    const existing = inflight.get(output.out);
    if (existing) waits.push(existing);
    else if (existsSync(output.legacyOut)) {
      const promotion = promoteLegacyThumbnail(
        output.legacyOut,
        output.out,
        dir,
      );
      inflight.set(output.out, promotion);
      waits.push(promotion);
      owned.push([output.out, promotion] as const);
    } else missing.push(output);
  }

  if (missing.length > 0) {
    const kind = await detectThumbnailKind(req.sourcePath);
    if (kind) {
      const batch = generateMany(
        missing,
        dir,
        req.sourcePath,
        kind,
        req.priority ?? "foreground",
      );
      const generated = missing.map((output) => {
        const promise = batch.then(
          (results) => results.get(output.out) ?? null,
        );
        inflight.set(output.out, promise);
        waits.push(promise);
        return [output.out, promise] as const;
      });
      owned.push(...generated);
    }
  }
  try {
    await Promise.all(waits);
  } finally {
    for (const [out, promise] of owned) {
      if (inflight.get(out) === promise) inflight.delete(out);
    }
  }
}

async function promoteLegacyThumbnail(
  legacyOut: string,
  out: string,
  dir: string,
): Promise<string | null> {
  if (existsSync(out)) return out;
  const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dir, { recursive: true });
    await copyFile(legacyOut, tmp);
    await rename(tmp, out);
    return out;
  } catch (err) {
    await unlink(tmp).catch(() => {});
    /** Keep serving the portable legacy cache if iCloud promotion is unavailable. */
    if (existsSync(legacyOut)) {
      log.warn("[pond thumbnail] local promotion failed", legacyOut, err);
      return legacyOut;
    }
    return null;
  }
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
      /** Re-check: another request may have produced it while we queued. */
      const missing = outputs.filter(({ out }) => {
        if (!existsSync(out)) return true;
        results.set(out, out);
        return false;
      });
      if (missing.length === 0) return results;

      const maxWidth = Math.max(...missing.map(({ width }) => width));
      const source = await thumbnailPipeline(sourcePath, maxWidth, kind);
      if (!source) return results;
      const { pipeline, metadata: meta } = source;
      /** Multi-page = animated; resizing would flatten it, so serve the original. */
      if ((meta.pages ?? 1) > 1) return results;

      await mkdir(dir, { recursive: true });
      /** Keep the LQIP first while clones share the same decoded input. */
      for (const { out, width } of [...missing].sort(
        (a, b) => a.width - b.width,
      )) {
        try {
          /** Write to a temp path then rename so a crash can't leave a truncated cache hit. */
          const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
          await pipeline
            .clone()
            .resize({ width, fit: "inside", withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toFile(tmp);
          await rename(tmp, out);
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
    return nativeThumbnailPipeline(sourcePath, width);
  }

  const pipeline = sharp(sourcePath, { failOn: "none" });
  /** Decode by file contents: imported JPEGs can carry a misleading .heic extension. */
  return { pipeline, metadata: await pipeline.metadata() };
}

async function detectThumbnailKind(
  sourcePath: string,
): Promise<ThumbnailKind | null> {
  const ext = extname(sourcePath).toLowerCase();
  if (isThumbnailable(ext) && !NATIVE_RASTER_EXT.has(ext)) return "sharp";
  try {
    const header = await readFileHeader(sourcePath);
    if (!isRasterImageHeader(header)) return null;
    return isIsoBaseMediaHeader(header) ? "native" : "sharp";
  } catch {
    return null;
  }
}

async function resolveVersion(
  sourcePath: string,
  version: string | null,
): Promise<string | null> {
  if (version) return version;
  try {
    const source = await stat(sourcePath);
    return `${Math.round(source.mtimeMs)}-${source.size}`;
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
    .update(`${sourcePath}|${version}|${width}|webp`)
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
  /** For a genuine HEIC that bundled sharp cannot decode, ask the OS thumbnail service. */
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
  const handle = await open(sourcePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
