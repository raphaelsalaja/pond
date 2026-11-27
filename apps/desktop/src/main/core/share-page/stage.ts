import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import log from "electron-log/main.js";
import sharp from "sharp";
import { saveDirIn } from "../../paths";
import type { MediaJob, StagedMedia, StagedSize } from "./plan";

/** The long edge of a still on the page, and of a card. Big enough for a retina screen, small enough to send. */
const FULL_EDGE = 2560;
const CARD_WIDTH = 720;
const CARD_HEIGHT = 1800;
const VIDEO_TIMEOUT_MS = 10 * 60_000;

export interface StageInput {
  jobs: ReadonlyArray<MediaJob>;
  /** The page's folder; files land in its `media/`. */
  directory: string;
  /** The absolute path of a job's source file, or null when it isn't safely inside the Library. */
  source: (job: MediaJob) => string | null;
  /** Without ffmpeg, videos are left out rather than copied with their metadata. */
  ffmpeg: string | null;
  /** Runs before each job, so the caller can stop the export. */
  beforeJob?: (job: MediaJob) => void | Promise<void>;
  afterJob?: (job: MediaJob) => void | Promise<void>;
}

/** A Save's `files` are paths inside its folder; one that climbs out of it is never read. */
export function saveFilePath(
  libraryRoot: string,
  job: MediaJob,
): string | null {
  const directory = saveDirIn(libraryRoot, job.saveId);
  const path = resolve(directory, job.file);
  const inside = relative(directory, path);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return null;
  return path;
}

/** Writes every job's file. A file that fails is logged and left out; the page links only what was written. */
export async function stageMedia(input: StageInput): Promise<StagedMedia> {
  await mkdir(join(input.directory, "media"), { recursive: true });
  const staged = new Map<string, StagedSize>();
  for (const job of input.jobs) {
    await input.beforeJob?.(job);
    const from = input.source(job);
    const to = join(input.directory, job.to);
    if (from) {
      try {
        staged.set(
          job.to,
          job.role === "video"
            ? await stageVideo(from, to, job, input.ffmpeg)
            : await stageStill(from, to, job),
        );
      } catch (error) {
        log.warn("[pond share page] left out a file", job.to, error);
      }
    }
    await input.afterJob?.(job);
  }
  return staged;
}

/** Re-encoding drops EXIF, GPS, XMP, and ICC data: sharp writes none of it unless asked to. */
async function stageStill(
  from: string,
  to: string,
  job: MediaJob,
): Promise<StagedSize> {
  let image = sharp(from, { animated: true }).autoOrient();
  if (job.orient.rotate) image = image.rotate(job.orient.rotate);
  if (job.orient.flipX) image = image.flop();
  if (job.orient.flipY) image = image.flip();
  await image
    .resize({
      ...(job.role === "thumbnail"
        ? { width: CARD_WIDTH, height: CARD_HEIGHT }
        : { width: FULL_EDGE, height: FULL_EDGE }),
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toFile(to);
  const written = await sharp(to).metadata();
  return { width: written.width, height: written.pageHeight ?? written.height };
}

/** Remuxes without re-encoding and drops container, stream, and chapter metadata (creation time, location, device). */
async function stageVideo(
  from: string,
  to: string,
  job: MediaJob,
  ffmpeg: string | null,
): Promise<StagedSize> {
  if (!ffmpeg) throw new Error("ffmpeg isn't available");
  const args = [
    "-v",
    "error",
    "-y",
    "-i",
    from,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "-1",
    "-map_metadata:s:v",
    "-1",
    "-map_metadata:s:a",
    "-1",
    "-map_chapters",
    "-1",
    "-c",
    "copy",
    ...(to.endsWith(".webm") ? [] : ["-movflags", "+faststart"]),
    to,
  ];
  await new Promise<void>((resolve, reject) => {
    execFile(ffmpeg, args, { timeout: VIDEO_TIMEOUT_MS }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
  return { width: job.width, height: job.height };
}
