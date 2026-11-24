import { z } from "zod";
import { decodeAudioSamples } from "../../lib/ffmpeg-audio";
import { resolvePondSavePath } from "../helpers";
import { query } from "./params";
import type { QueryHandlerMap } from "./params";

export const mediaProcessingQueries = {
  "media.decodeAudio": query(
    z.object({
      src: z.string().min(1),
      maxSamples: z.number().int().min(1).max(480_000),
      offsetSeconds: z.number().finite().min(0).default(0),
    }),
    async ({ src, maxSamples, offsetSeconds }) => {
      const resolved = resolvePondSavePath(src);
      if (!resolved) {
        throw new Error("Audio analysis requires a file in the active Library");
      }
      const result = await decodeAudioSamples(
        resolved.path,
        maxSamples,
        offsetSeconds,
      );
      return { ok: true as const, ...result };
    },
  ),
} satisfies QueryHandlerMap;
