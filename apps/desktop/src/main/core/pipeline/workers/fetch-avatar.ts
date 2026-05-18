import log from "electron-log/main.js";
import { fetchAvatarToTxFile } from "../../../lib/blob";
import { applySavePatch, readSave } from "./apply";

export async function runFetchAvatar(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  const files = save.files ?? [];
  if (files.some((f) => f.kind === "avatar")) {
    log.debug(
      "[pond pipeline:fetch-avatar] avatar already on disk, skipping",
      saveId,
    );
    return;
  }

  const avatarUrl = pickAvatarUrl(save.rawJson);
  if (!avatarUrl) return;

  const tx = await fetchAvatarToTxFile(avatarUrl);
  if (!tx) return;

  await applySavePatch(
    saveId,
    {},
    {
      actorReason: "pipeline:fetch-avatar",
      newFiles: [
        {
          kind: "avatar",
          filename: tx.filename,
          bytes: Buffer.from(tx.bytes),
          ...(tx.mimeType ? { mimeType: tx.mimeType } : {}),
        },
      ],
    },
  );
  log.info("[pond pipeline:fetch-avatar] wrote", saveId);
}

function pickAvatarUrl(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const v = rawJson as { capture?: { author?: { avatarUrl?: string } } };
  const url = v.capture?.author?.avatarUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}
