import { spawn } from "node:child_process";
import { binariesAvailable } from "../core/refresh/binaries";
import { killProcessTree } from "./process-tree";

const SAMPLE_RATE = 16_000;

export function decodeAudioSamples(
  file: string,
  maxSamples: number,
  offsetSeconds: number,
  sampleRate = SAMPLE_RATE,
): Promise<{ audio: Float32Array; hasMore: boolean }> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    return Promise.reject(
      new Error("FFmpeg is unavailable for audio analysis"),
    );
  }
  return new Promise((resolve, reject) => {
    const byteLimit = (maxSamples + 1) * Float32Array.BYTES_PER_ELEMENT;
    const chunks: Array<Buffer> = [];
    let bytes = 0;
    let stderr = "";
    let settled = false;
    const child = spawn(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "1",
        "-ss",
        String(offsetSeconds),
        "-i",
        file,
        "-t",
        String((maxSamples + 1) / sampleRate),
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        killProcessTree(child, "SIGKILL");
      } catch {
        /* The child may already have exited. */
      }
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new Error("Audio analysis timed out")),
      30_000,
    );
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > byteLimit) {
        fail(new Error("Audio decoder exceeded its output budget"));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0 || bytes % Float32Array.BYTES_PER_ELEMENT !== 0) {
        reject(new Error(`Audio decoding failed (${code}): ${stderr}`));
        return;
      }
      const samples = new Float32Array(
        Uint8Array.from(Buffer.concat(chunks, bytes)).buffer,
      );
      resolve({
        audio: samples.slice(0, maxSamples),
        hasMore: samples.length > maxSamples,
      });
    });
  });
}
