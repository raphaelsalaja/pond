import type { Save } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import type { TxSaveFile } from "@pond/schema/tx";
import log from "electron-log/main.js";
import { z } from "zod";
import { fetchSourceIconToTxFile, isReadableImage } from "../../../lib/blob";
import { saveFile } from "../../../paths";
import { persistSave } from "../../persist-save";
import { readLibraryMedia } from "../../storage/library-media-storage";
import type { WriteFileArgs } from "./apply";

const SOURCE_ICON_KIND = "source_icon";

const FaviconUrlSchema = z.string().min(1).optional().catch(undefined);

export function hasSourceIcon(files: Save["files"]): boolean {
  return (files ?? []).some((f) => f.kind === SOURCE_ICON_KIND);
}

export async function hasReadableSourceIcon(
  saveId: string,
  files: Save["files"],
): Promise<boolean> {
  const icon = (files ?? []).find((f) => f.kind === SOURCE_ICON_KIND);
  if (!icon) {
    return false;
  }
  try {
    return await isReadableImage(
      await readLibraryMedia(saveFile(saveId, icon.path)),
    );
  } catch {
    return false;
  }
}

/** `replace` drops the stored icon even without a new one, since the backfill only replaces unreadable icons. */
export async function fetchSourceIcon(
  saveId: string,
  save: Save,
  { replace = false }: { replace?: boolean } = {},
): Promise<boolean> {
  if (!replace && hasSourceIcon(save.files)) {
    return false;
  }

  const fetched = await fetchFirstIcon(faviconUrls(save));
  if (!fetched && !replace) {
    return false;
  }

  const newFiles: Array<WriteFileArgs> = [];
  if (fetched) {
    const { iconUrl, file: tx } = fetched;
    const iconFile: WriteFileArgs = {
      kind: SOURCE_ICON_KIND,
      filename: tx.filename,
      bytes: Buffer.from(tx.bytes),
      sourceUrl: iconUrl,
    };
    if (tx.mimeType) {
      iconFile.mimeType = tx.mimeType;
    }
    newFiles.push(iconFile);
  }

  await persistSave(
    saveId,
    {},
    {
      actorReason: "pipeline:source-icon",
      newFiles,
      replaceFilesWithKind: replace ? SOURCE_ICON_KIND : undefined,
    },
  );
  log.info(
    `[pond pipeline:source-icon] ${fetched ? "wrote" : "removed unreadable"}`,
    saveId,
  );
  return fetched !== null;
}

async function fetchFirstIcon(
  urls: Array<string>,
): Promise<{ iconUrl: string; file: TxSaveFile } | null> {
  for (const iconUrl of urls) {
    const outcome = await fetchSourceIconToTxFile(iconUrl);
    if ("file" in outcome) {
      return { iconUrl, file: outcome.file };
    }
  }
  return null;
}

function faviconUrls(save: Save): Array<string> {
  const urls = [
    scrapedFaviconUrl(save.rawJson),
    fallbackFaviconUrl(save.url),
  ].filter((url): url is string => url !== null);
  return [...new Set(urls)];
}

function scrapedFaviconUrl(rawJson: RawJson | null): string | null {
  return FaviconUrlSchema.parse(rawJson?.capture?.extras?.faviconUrl) ?? null;
}

function fallbackFaviconUrl(saveUrl: string): string | null {
  try {
    const host = new URL(saveUrl).hostname;
    if (!host) {
      return null;
    }
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}
