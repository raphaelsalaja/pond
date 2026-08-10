import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import log from "electron-log/main.js";
import { extractFirstFrame } from "../../../lib/ffmpeg-frame";
import { itemDir } from "../../../paths";
import { persistSave } from "../../persist-save";
import { TransientError } from "../extractors/errors";
import { readSave } from "./apply";

const posterInflight = new Map<string, Promise<void>>();

export function runEnsurePoster(saveId: string): Promise<void> {
  const existing = posterInflight.get(saveId);
  if (existing) return existing;
  const task = ensurePoster(saveId).finally(() =>
    posterInflight.delete(saveId),
  );
  posterInflight.set(saveId, task);
  return task;
}

async function ensurePoster(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  const files = save.files ?? [];
  const videos = files.filter((f) => f.kind === "video");
  if (videos.length === 0) return;

  const posters = files.filter((f) => f.kind === "poster");
  const hasCover = files.some((f) => f.kind === "cover");
  if (
    posters.length >= videos.length ||
    (videos.length === 1 && (posters.length > 0 || hasCover))
  ) {
    log.debug(
      "[pond pipeline:ensure-poster] every video already has a resting poster",
      saveId,
    );
    return;
  }

  let written = 0;
  for (let index = posters.length; index < videos.length; index += 1) {
    const video = videos[index];
    if (!video) continue;
    const videoPath = join(itemDir(saveId), video.path);
    const frame = await extractFirstFrame(videoPath);
    if (!frame) {
      /** ffmpeg can flake; retry as transient. A poster is non-fatal, so giving up afterwards won't fail the save. */
      throw new TransientError(
        `ensure-poster: no frame produced for ${saveId}/${video.path}`,
      );
    }
    try {
      const buf = await readFile(frame.path);
      if (buf.byteLength === 0) {
        throw new TransientError(
          `ensure-poster: empty frame for ${saveId}/${video.path}`,
        );
      }
      const ext = extname(frame.path).toLowerCase() || ".jpg";
      await persistSave(
        saveId,
        {},
        {
          actorReason: "pipeline:ensure-poster",
          newFiles: [
            {
              kind: "poster",
              filename: index === 0 ? `poster${ext}` : `poster-${index}${ext}`,
              bytes: buf,
              mimeType: frame.mimeType,
            },
          ],
        },
      );
      written += 1;
    } finally {
      await frame.cleanup();
    }
  }
  log.info("[pond pipeline:ensure-poster] wrote posters", saveId, written);
}
