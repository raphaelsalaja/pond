import { readFile, writeFile } from "node:fs/promises";
import { saves } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import { ClipboardItem, clipboard, dialog, nativeImage } from "electron";
import type { NativeImage } from "electron";
import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import type { OkFailure } from "../../../shared/query-contracts-shared";
import { persistSaveThumbnail } from "../../core/save-thumbnail";
import { ensureVideoPreviewProxy } from "../../core/video-preview-proxy";
import { getDb } from "../../db";
import { extractFrameAt, extractSampledFrames } from "../../lib/ffmpeg-frame";
import { saveFile } from "../../paths";
import { resolvePondSavePath } from "../helpers";
import { toWireSave } from "../wire";
import { NumberParam, query, StringParam } from "./params";
import type { QueryHandlerMap } from "./params";

async function frameImage(
  resolved: { path: string } | null,
  timeSec: number,
): Promise<NativeImage | null> {
  if (!resolved) return null;
  const frame = await extractFrameAt(resolved.path, timeSec);
  if (!frame) return null;
  try {
    const img = nativeImage.createFromBuffer(await readFile(frame.path));
    return img.isEmpty() ? null : img;
  } finally {
    await frame.cleanup();
  }
}

const FrameParams = z.object({ src: StringParam, timeSec: NumberParam });
const SampleFramesParams = z.object({
  src: StringParam,
  maxFrames: z.number().int().min(3).max(32),
  strategy: z.enum(["spread", "embedding"]).optional(),
});

const FRAME_UNAVAILABLE: OkFailure = {
  ok: false,
  error: "Couldn't read this video frame.",
};
const FILE_NOT_FOUND: OkFailure = {
  ok: false,
  error: "This Save has no video file.",
};

export const videoQueries = {
  "video.preparePreview": query(
    z.object({ src: StringParam }),
    async ({ src }) => ensureVideoPreviewProxy(src),
  ),

  "video.sampleFrames": query(
    SampleFramesParams,
    async (params): Promise<QueryResult<"video.sampleFrames">> => {
      const resolved = resolvePondSavePath(params.src);
      if (!resolved) return FILE_NOT_FOUND;
      const sampled = await extractSampledFrames(
        resolved.path,
        params.maxFrames,
        params.strategy,
      );
      if (!sampled) return FRAME_UNAVAILABLE;
      try {
        const frames = await Promise.all(
          sampled.frames.map(async (frame, index) => ({
            bytes: Uint8Array.from(await readFile(frame.path)),
            mimeType: frame.mimeType,
            timestamp: sampled.timestamps[index] ?? 0,
          })),
        );
        return { ok: true, duration: sampled.durationSec, frames };
      } finally {
        await sampled.cleanup();
      }
    },
  ),

  "video.copyFrame": query(
    FrameParams,
    async (params): Promise<QueryResult<"video.copyFrame">> => {
      const img = await frameImage(
        resolvePondSavePath(params.src),
        params.timeSec,
      );
      if (!img) return FRAME_UNAVAILABLE;
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([Uint8Array.from(img.toPNG())], {
            type: "image/png",
          }),
        }),
      ]);
      return { ok: true };
    },
  ),

  "video.saveFrame": query(
    FrameParams,
    async (params): Promise<QueryResult<"video.saveFrame">> => {
      const resolved = resolvePondSavePath(params.src);
      if (!resolved) return FILE_NOT_FOUND;
      const result = await dialog.showSaveDialog({
        defaultPath: `frame-${Date.now()}.png`,
        filters: [{ name: "Images", extensions: ["png"] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, reason: "cancelled" };
      }
      const img = await frameImage(resolved, params.timeSec);
      if (!img) return FRAME_UNAVAILABLE;
      await writeFile(result.filePath, img.toPNG());
      return { ok: true, path: result.filePath };
    },
  ),

  "video.setThumbnail": query(
    FrameParams.extend({ saveId: StringParam }),
    async (params): Promise<QueryResult<"video.setThumbnail">> => {
      const saveId = params.saveId;
      if (!saveId) return FILE_NOT_FOUND;
      const resolved = resolvePondSavePath(params.src);
      if (!resolved || resolved.saveId.toLowerCase() !== saveId.toLowerCase()) {
        return FILE_NOT_FOUND;
      }
      const img = await frameImage(resolved, params.timeSec);
      if (!img) return FRAME_UNAVAILABLE;
      const ok = await persistSaveThumbnail(
        saveId,
        img.toPNG(),
        "user:set-video-thumbnail",
      );
      return ok
        ? { ok: true }
        : { ok: false, error: "Couldn't set the thumbnail. Try again." };
    },
  ),

  "video.copyFilePath": query(
    z.object({ saveId: StringParam }),
    async (params): Promise<QueryResult<"video.copyFilePath">> => {
      const db = await getDb();
      const saveId = params.saveId;
      if (!saveId) return FILE_NOT_FOUND;
      const rows = await db.select().from(saves).where(eq(saves.id, saveId));
      const save = rows[0];
      if (!save) return FILE_NOT_FOUND;
      const wire = toWireSave(save);
      const f = wire.files[0];
      if (!f) return FILE_NOT_FOUND;
      await clipboard.writeText(saveFile(saveId, f.path));
      return { ok: true };
    },
  ),
} satisfies QueryHandlerMap;
