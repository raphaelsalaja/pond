import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ImageMetadata } from "./image-metadata";
import { binariesAvailable } from "./refresh/binaries";

const execFileAsync = promisify(execFile);
const ProcessErrorSchema = z.object({ stderr: z.string() });

export function parseFfmpegMetadata(output: string): ImageMetadata {
  const container = /Input #0,\s*([^,\s]+)/.exec(output)?.[1];
  const bitrate = /bitrate:\s*(\d+)\s*kb\/s/i.exec(output)?.[1];
  const videoCodec = /Video:\s*([^,\s]+)/i.exec(output)?.[1];
  const audioCodec = /Audio:\s*([^,\s]+)/i.exec(output)?.[1];
  const colorSpace =
    /\b(bt(?:601|709|2020)[a-z0-9-]*|smpte[a-z0-9-]+|iec61966[a-z0-9-]*)\b/i.exec(
      output,
    )?.[1];
  return {
    container,
    videoCodec,
    audioCodec,
    bitrate: bitrate ? Number(bitrate) * 1000 : undefined,
    colorSpace,
  };
}

export async function extractMediaMetadata(
  path: string,
): Promise<ImageMetadata> {
  const ffmpeg = binariesAvailable().ffmpeg;
  if (!ffmpeg) return {};
  try {
    await execFileAsync(ffmpeg, ["-hide_banner", "-i", path], {
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return {};
  } catch (error) {
    const parsed = ProcessErrorSchema.safeParse(error);
    const output = parsed.success ? parsed.data.stderr : "";
    return parseFfmpegMetadata(output);
  }
}
