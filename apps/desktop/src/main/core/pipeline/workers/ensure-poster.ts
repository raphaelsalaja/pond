import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import log from "electron-log/main.js";
import { extractFirstFrame } from "../../../lib/ffmpeg-frame";
import { itemDir } from "../../../paths";
import { applySavePatch, readSave } from "./apply";

export async function runEnsurePoster(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  const files = save.files ?? [];
  const video = files.find((f) => f.kind === "video");
  if (!video) return;

  if (files.some((f) => f.kind === "poster" || f.kind === "cover")) {
    log.debug(
      "[pond pipeline:ensure-poster] poster/cover already present, skipping",
      saveId,
    );
    return;
  }

  const videoPath = join(itemDir(saveId), video.path);
  const frame = await extractFirstFrame(videoPath);
  if (!frame) {
    log.info(
      "[pond pipeline:ensure-poster] no frame produced",
      saveId,
      videoPath,
    );
    return;
  }
  try {
    const buf = await readFile(frame.path);
    if (buf.byteLength === 0) return;
    const ext = extname(frame.path).toLowerCase() || ".jpg";
    await applySavePatch(
      saveId,
      {},
      {
        actorReason: "pipeline:ensure-poster",
        newFiles: [
          {
            kind: "poster",
            filename: `poster${ext}`,
            bytes: buf,
            mimeType: frame.mimeType,
          },
        ],
      },
    );
    log.info("[pond pipeline:ensure-poster] wrote poster", saveId);
  } finally {
    await frame.cleanup();
  }
}
