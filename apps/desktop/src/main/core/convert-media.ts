import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import sharp, { type Sharp } from "sharp";
import type { ConversionPreset } from "../../shared/conversion-contracts";
import { killProcessTree, trackChildProcess } from "../lib/process-tree";
import { requireConversionCapability } from "./conversion-capabilities";
import { copyExportFile, writeExportFile } from "./export-files";
import { binariesAvailable } from "./refresh/binaries";

export async function convertMedia(input: {
  source: string;
  directory: string;
  preset: ConversionPreset;
  signal: AbortSignal;
  ffmpegPath?: string;
  onProgress?: (progress: number) => void;
}): Promise<string> {
  const { source, directory, preset, signal } = input;
  signal.throwIfAborted();
  const ffmpegPath =
    input.ffmpegPath ?? binariesAvailable().ffmpeg ?? undefined;
  const capability = await requireConversionCapability(
    preset.format,
    ffmpegPath,
  );
  if (preset.lossless && !capability.supportsLossless)
    throw new Error(`${preset.format} does not support lossless conversion.`);
  const stem = basename(source, extname(source));
  if (capability.adapter === "ffmpeg")
    return convertWithFfmpeg({
      ...input,
      ffmpegPath,
      stem,
      extension: capability.extension,
    });

  const image = sharp(source, { limitInputPixels: 100_000_000 }).rotate();
  const abort = () => image.destroy(new Error("Conversion canceled."));
  signal.addEventListener("abort", abort, { once: true });
  try {
    input.onProgress?.(0.05);
    if (preset.width || preset.height)
      image.resize({
        width: preset.width ?? undefined,
        height: preset.height ?? undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    encodeSharp(image, preset);
    const bytes = await image.toBuffer();
    input.onProgress?.(0.9);
    signal.throwIfAborted();
    const output = await writeExportFile(
      directory,
      `${stem}.${capability.extension}`,
      bytes,
    );
    input.onProgress?.(1);
    return output;
  } finally {
    signal.removeEventListener("abort", abort);
    image.destroy();
  }
}

function encodeSharp(image: Sharp, preset: ConversionPreset): void {
  switch (preset.format) {
    case "jpeg":
      image.jpeg({ quality: preset.quality, mozjpeg: true });
      return;
    case "png":
      image.png({ compressionLevel: 9 });
      return;
    case "webp":
      image.webp({ quality: preset.quality, lossless: preset.lossless });
      return;
    case "avif":
      image.avif({ quality: preset.quality, lossless: preset.lossless });
      return;
    case "tiff":
      image.tiff({
        quality: preset.quality,
        compression: preset.lossless ? "lzw" : "jpeg",
      });
      return;
    case "jxl":
      image.jxl({ quality: preset.quality, lossless: preset.lossless });
      return;
    case "heic":
    case "heif":
      image.heif({
        quality: preset.quality,
        lossless: preset.lossless,
        compression: "hevc",
      });
      return;
    default:
      throw new Error(`${preset.format} requires FFmpeg.`);
  }
}

async function convertWithFfmpeg(
  input: Parameters<typeof convertMedia>[0] & {
    stem: string;
    extension: string;
  },
): Promise<string> {
  const ffmpeg = input.ffmpegPath;
  if (!ffmpeg) throw new Error("FFmpeg is required for this conversion.");
  const temporary = await mkdtemp(join(tmpdir(), "pond-convert-"));
  try {
    const output = join(temporary, `converted.${input.extension}`);
    const args = buildFfmpegConversionArguments(
      input.preset,
      input.source,
      output,
    );
    await runFfmpeg({
      path: ffmpeg,
      args,
      signal: input.signal,
      duration: input.preset.duration,
      onProgress: input.onProgress,
    });
    input.signal.throwIfAborted();
    const exported = await copyExportFile(
      output,
      input.directory,
      `${input.stem}.${input.extension}`,
    );
    input.onProgress?.(1);
    return exported;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function buildFfmpegConversionArguments(
  preset: ConversionPreset,
  source: string,
  output: string,
): string[] {
  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-ss",
    String(preset.start),
    "-t",
    String(preset.duration),
    "-i",
    source,
  ];
  const scale =
    preset.width || preset.height
      ? `scale=${preset.width ?? -1}:${preset.height ?? -1}:force_original_aspect_ratio=decrease:flags=lanczos`
      : null;
  const quality = Math.round(51 - (preset.quality / 100) * 47);
  switch (preset.format) {
    case "jxl": {
      if (scale) args.push("-vf", scale);
      const distance = preset.lossless
        ? "0"
        : Math.max(0.1, ((100 - preset.quality) / 100) * 15).toFixed(2);
      args.push("-frames:v", "1", "-c:v", "libjxl", "-distance", distance);
      break;
    }
    case "exr":
    case "hdr":
    case "tga":
    case "bmp": {
      if (scale) args.push("-vf", scale);
      const encoder = {
        exr: "exr",
        hdr: "hdr",
        tga: "targa",
        bmp: "bmp",
      }[preset.format];
      args.push("-frames:v", "1", "-c:v", encoder);
      break;
    }
    case "ico":
      if (scale) args.push("-vf", scale);
      args.push("-frames:v", "1", "-c:v", "png", "-f", "ico");
      break;
    case "gif": {
      const base = [`fps=${preset.fps}`, scale].filter(Boolean).join(",");
      const colors = Math.max(2, Math.round((preset.quality / 100) * 254) + 2);
      args.push(
        "-filter_complex",
        `${base},split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse`,
        "-loop",
        "0",
      );
      break;
    }
    case "apng":
      args.push(
        "-vf",
        [`fps=${preset.fps}`, scale].filter(Boolean).join(","),
        "-plays",
        "0",
        "-f",
        "apng",
      );
      break;
    case "animated-webp":
      args.push(
        "-vf",
        [`fps=${preset.fps}`, scale].filter(Boolean).join(","),
        "-c:v",
        "libwebp_anim",
        "-quality",
        String(preset.quality),
        "-lossless",
        preset.lossless ? "1" : "0",
        "-loop",
        "0",
        "-an",
      );
      break;
    case "mp4":
      if (scale) args.push("-vf", scale);
      args.push(
        "-c:v",
        "libx264",
        "-crf",
        String(quality),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
      );
      break;
    case "webm":
      if (scale) args.push("-vf", scale);
      args.push(
        "-c:v",
        "libvpx-vp9",
        "-crf",
        String(quality),
        "-b:v",
        "0",
        "-c:a",
        "libopus",
      );
      break;
    default:
      throw new Error(`${preset.format} does not use FFmpeg.`);
  }
  args.push("-y", output);
  return args;
}

async function runFfmpeg(input: {
  path: string;
  args: string[];
  signal: AbortSignal;
  duration: number;
  onProgress?: (progress: number) => void;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(input.path, input.args, {
      signal: input.signal,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    trackChildProcess(process);
    let error = "";
    let progress = "";
    process.stdout.on("data", (chunk: Buffer) => {
      progress += chunk.toString();
      const lines = progress.split("\n");
      progress = lines.pop() ?? "";
      for (const line of lines) {
        const [key, raw] = line.trim().split("=", 2);
        if (key !== "out_time_us" || !raw) continue;
        const elapsed = Number(raw) / 1_000_000;
        if (Number.isFinite(elapsed))
          input.onProgress?.(Math.min(0.99, elapsed / input.duration));
      }
    });
    process.stderr.on("data", (chunk: Buffer) => {
      error = `${error}${chunk.toString()}`.slice(-4000);
    });
    const timeout = Math.min(
      2 * 60 * 60_000,
      Math.max(120_000, input.duration * 4_000),
    );
    const timer = setTimeout(
      () => killProcessTree(process, "SIGKILL"),
      timeout,
    );
    process.once("error", (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
    process.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(error || "FFmpeg conversion failed."));
    });
  });
}
