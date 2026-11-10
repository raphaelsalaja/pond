import type { SaveFile } from "@pond/schema/db";
import type { Capture, RawJson } from "@pond/schema/raw";
import {
  isAuxiliaryKind,
  isOriginalImageKind,
  TEXT_THUMBNAIL_FILE,
  THUMBNAIL_DARK_FILE,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
} from "@shared/save-file-names";
import {
  RENDER_TEXT_COVER_VERSION,
  textBodyFromFields,
  textCoverVersionFromRawJson,
} from "@shared/text-card";
import log from "electron-log/main.js";
import { persistSave } from "../../persist-save";
import { type RenderedCard, renderTextCardPng } from "../../render-card";
import { readSave } from "./apply";

function needsTextCover(
  save: NonNullable<Awaited<ReturnType<typeof readSave>>>,
  imageFallback = false,
): boolean {
  const hasProse =
    Boolean(save.description?.trim()) || save.mediaType === "text";
  if (!hasProse) return false;
  if (!textBodyFromFields(save.description, save.title)) return false;
  const files = save.files ?? [];
  /*
   * An image save waits for its file. The generated GitHub card can miss
   * without failing ingest, and then this cover is the thumbnail.
   */
  if (
    save.mediaType === "video" ||
    (save.mediaType === "image" && !imageFallback)
  ) {
    return false;
  }
  return !files.some((f) => {
    if (isAuxiliaryKind(f.kind)) return false;
    return (
      isOriginalImageKind(f.kind) ||
      f.kind === "video" ||
      f.kind === "poster" ||
      f.mimeType?.startsWith("image/") === true ||
      f.mimeType?.startsWith("video/") === true
    );
  });
}

async function writeCover(
  saveId: string,
  kind: SaveFile["kind"],
  filename: string,
  card: RenderedCard,
): Promise<void> {
  await persistSave(
    saveId,
    {},
    {
      actorReason: `pipeline:render-text-cover:${kind}`,
      replaceFilesWithKind: kind,
      newFiles: [
        {
          kind,
          filename,
          bytes: card.bytes,
          mimeType: "image/png",
          width: card.width,
          height: card.height,
        },
      ],
    },
  );
}

function stubCapture(
  save: NonNullable<Awaited<ReturnType<typeof readSave>>>,
): Capture {
  return {
    id: save.sourceId || save.id,
    source: save.source,
    url: save.url,
    media: [],
  };
}

async function stampVersion(
  save: NonNullable<Awaited<ReturnType<typeof readSave>>>,
): Promise<void> {
  const base = save.rawJson;
  const capture = base?.capture ?? stubCapture(save);
  const rawJson: RawJson = {
    capture: { ...capture, extras: { ...capture.extras } },
    extractorId: base?.extractorId ?? "text-cover",
    extractedAt: base?.extractedAt ?? new Date().toISOString(),
    renderTextCoverVersion: RENDER_TEXT_COVER_VERSION,
  };
  if (base?.ytdlp) rawJson.ytdlp = base.ytdlp;
  await persistSave(
    save.id,
    { rawJson },
    { actorReason: "pipeline:render-text-cover:stamp" },
  );
}

export async function runRenderTextCover(
  saveId: string,
  opts: { force?: boolean; imageFallback?: boolean } = {},
): Promise<number> {
  const save = await readSave(saveId);
  if (!save) return 0;
  if (save.source === "twitter") return 0;
  if (!needsTextCover(save, opts.imageFallback === true)) return 0;

  if (
    !opts.force &&
    textCoverVersionFromRawJson(save.rawJson) >= RENDER_TEXT_COVER_VERSION
  ) {
    const hasBoth =
      (save.files ?? []).some((f) => f.kind === THUMBNAIL_KIND) &&
      (save.files ?? []).some((f) => f.kind === THUMBNAIL_DARK_KIND);
    if (hasBoth) {
      log.debug(
        "[pond pipeline:render-text-cover] up to date, skipping",
        saveId,
      );
      return 0;
    }
  }

  const body = textBodyFromFields(save.description, save.title);
  const light = await renderTextCardPng(body, "light");
  if (!light) return 0;
  const dark = await renderTextCardPng(body, "dark");
  if (!dark) return 0;

  await writeCover(saveId, THUMBNAIL_KIND, TEXT_THUMBNAIL_FILE, light);
  await writeCover(saveId, THUMBNAIL_DARK_KIND, THUMBNAIL_DARK_FILE, dark);
  await stampVersion(save);

  log.info("[pond pipeline:render-text-cover] done", { saveId });
  return 2;
}
