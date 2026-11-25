import { open, stat } from "node:fs/promises";
import { saves } from "@pond/schema/db";
import type { SaveFile } from "@pond/schema/db";
import {
  classifyLibraryFileFromHeader,
  libraryFilename,
} from "@shared/file-format";
import type { OkResult } from "@shared/query-contracts-shared";
import { isAuxiliaryKind } from "@shared/save-file-names";
import { eq } from "drizzle-orm";
import mime from "mime-types";
import { getDb } from "../db";
import { persistSave } from "./persist-save";

export function replacementKind(
  files: ReadonlyArray<Pick<SaveFile, "kind" | "path">>,
): string | null {
  return files.find((file) => !isAuxiliaryKind(file.kind))?.kind ?? null;
}

export async function replaceSaveFile(input: {
  id: string;
  sourcePath: string;
}): Promise<OkResult> {
  const db = await getDb();
  const row = db.select().from(saves).where(eq(saves.id, input.id)).all()[0];
  const kind = replacementKind(row?.files ?? []);
  if (!kind) return { ok: false, error: "This save has no file to replace." };
  const info = await stat(input.sourcePath).catch(() => null);
  if (!info?.isFile() || info.size === 0) {
    return { ok: false, error: "Choose a non-empty file." };
  }
  const format = classifyLibraryFileFromHeader(
    input.sourcePath,
    mime.lookup(input.sourcePath) || null,
    await readFilePrefix(input.sourcePath, Math.min(info.size, 188 * 3)),
  );
  const updated = await persistSave(
    input.id,
    { mediaType: format.mediaType },
    {
      actorReason: "user:replace-file",
      replaceFilesWithKind: kind,
      newFiles: [
        {
          kind,
          filename: libraryFilename(input.sourcePath, "original"),
          sourcePath: input.sourcePath,
          mimeType: format.mimeType,
        },
      ],
    },
  );
  return updated
    ? { ok: true }
    : { ok: false, error: "Couldn't replace this file." };
}

async function readFilePrefix(path: string, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
