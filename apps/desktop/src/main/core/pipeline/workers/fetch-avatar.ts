import type { RawJson } from "@pond/schema/raw";
import log from "electron-log/main.js";
import { fetchAvatarToTxFile } from "../../../lib/blob";
import { persistSave } from "../../persist-save";
import { TransientError } from "../extractors/errors";
import { readSave } from "./apply";
import type { WriteFileArgs } from "./apply";

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

  const outcome = await fetchAvatarToTxFile(avatarUrl);
  if (!("file" in outcome)) {
    if (outcome.miss === "transient") {
      throw new TransientError(`fetch-avatar: ${avatarUrl} transiently failed`);
    }
    return;
  }
  const tx = outcome.file;
  const avatarFile: WriteFileArgs = {
    kind: "avatar",
    filename: tx.filename,
    bytes: Buffer.from(tx.bytes),
    sourceUrl: avatarUrl,
  };
  if (tx.mimeType) avatarFile.mimeType = tx.mimeType;

  await persistSave(
    saveId,
    {},
    {
      actorReason: "pipeline:fetch-avatar",
      newFiles: [avatarFile],
    },
  );
  log.info("[pond pipeline:fetch-avatar] wrote", saveId);
}

function pickAvatarUrl(rawJson: RawJson | null): string | null {
  return rawJson?.capture?.author?.avatarUrl || null;
}
