import {
  onDeviceModelVersion,
  TRANSCRIPTION_MODEL,
} from "@shared/on-device-models";
import { inferTranscribe } from "./inference-client";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

/** decodeAudioData on a large video has aborted the renderer (Chromium exit 5). */
export const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;

export function whisperModelVersion(): string {
  return onDeviceModelVersion(TRANSCRIPTION_MODEL, 2);
}

export interface DecodeMono16kOptions {
  maxSamples?: number;
}

export async function decodeMono16k(
  url: string,
  options: DecodeMono16kOptions = {},
): Promise<Float32Array> {
  if (options.maxSamples !== undefined) {
    const result = await window.pond.query("media.decodeAudio", {
      src: url,
      maxSamples: options.maxSamples,
    });
    return result.audio;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio fetch failed (${response.status})`);
  if (!response.body) throw new Error("Audio response has no body");
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TRANSCRIPT_BYTES) {
        await reader.cancel();
        throw new Error("Audio exceeds the transcription byte budget");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) {
    throw new Error("No AudioContext available");
  }
  const context = new Ctx({ sampleRate: 16_000 });
  try {
    const buffer = await context.decodeAudioData(bytes.buffer);
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < mono.length; index += 1) {
        mono[index] =
          (mono[index] ?? 0) + (data[index] ?? 0) / buffer.numberOfChannels;
      }
    }
    return mono;
  } finally {
    await context.close();
  }
}

export async function transcribeAudio(url: string): Promise<string> {
  const audio = await decodeMono16k(url);
  return inferTranscribe(audio);
}
