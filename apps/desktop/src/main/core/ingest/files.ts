import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import type { SaveFile } from "@pond/schema/db";
import type { TxSaveFile } from "@pond/schema/tx";
import { readLocalPosterToTxFile, readLocalToTxFile } from "../../lib/blob";
import { inferKindFromFilename } from "../../lib/library";
import { itemFile } from "../../paths";
import type { LocalIngestExtras } from "./types";

export async function readLocalFiles(
  inputs: LocalIngestExtras["mediaFiles"],
): Promise<TxSaveFile[]> {
  if (!inputs || inputs.length === 0) return [];
  let posterIndex = 0;
  let mediaIndex = 0;
  const results = await Promise.all(
    inputs.map((f) => {
      if (f.kind === "poster") {
        const i = posterIndex++;
        return readLocalPosterToTxFile(f.path, {
          ...(f.mimeType !== undefined ? { mimeType: f.mimeType } : {}),
          index: i,
        });
      }
      const i = mediaIndex++;
      return readLocalToTxFile(f.path, {
        ...(f.mimeType !== undefined ? { mimeType: f.mimeType } : {}),
        index: i,
      });
    }),
  );
  return results.filter((r): r is TxSaveFile => r !== null);
}

export function filesToSaveFiles(
  files: TxSaveFile[],
  coverDims?: { width: number; height: number },
): SaveFile[] {
  let coverStamped = false;
  return files.map((f) => {
    const kind = inferKindFromFilename(f.filename);
    const out: SaveFile = {
      kind,
      path: f.filename,
      sha256: sha256Bytes(f.bytes),
      size: f.bytes.byteLength,
      mimeType: f.mimeType ?? null,
    };
    if (!coverStamped && kind === "cover" && coverDims) {
      out.width = coverDims.width;
      out.height = coverDims.height;
      coverStamped = true;
    }
    return out;
  });
}

export function needsPosterBackfill(
  files: SaveFile[] | null | undefined,
): boolean {
  if (!files || files.length === 0) return false;
  const hasVideo = files.some((f) => f.kind === "video");
  if (!hasVideo) return false;
  return !files.some((f) => f.kind === "poster");
}

export async function anyFileMissing(
  id: string,
  files: SaveFile[],
): Promise<boolean> {
  for (const f of files) {
    try {
      await access(itemFile(id, f.path));
    } catch {
      return true;
    }
  }
  return false;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
