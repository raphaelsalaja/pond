import type { SaveFile, Source } from "@pond/schema/db";
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

/** The fields a text cover needs; the full save row satisfies it. */
export interface TextCoverSave {
  id: string;
  source: Source;
  sourceId: string | null;
  url: string;
  title: string | null;
  description: string | null;
  mediaType: string | null;
  files: readonly SaveFile[] | null;
  rawJson: RawJson | null;
}

export interface RenderTextCoverRuntime {
  readSave: (saveId: string) => Promise<TextCoverSave | null>;
  persistSave: typeof persistSave;
  renderCard: typeof renderTextCardPng;
}

const defaultRuntime: RenderTextCoverRuntime = {
  readSave,
  persistSave,
  renderCard: renderTextCardPng,
};

function needsTextCover(save: TextCoverSave, imageFallback = false): boolean {
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
  runtime: RenderTextCoverRuntime,
  saveId: string,
  kind: SaveFile["kind"],
  filename: string,
  card: RenderedCard,
): Promise<void> {
  await runtime.persistSave(
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

function stubCapture(save: TextCoverSave): Capture {
  return {
    id: save.sourceId || save.id,
    source: save.source,
    url: save.url,
    media: [],
  };
}

async function stampVersion(
  runtime: RenderTextCoverRuntime,
  save: TextCoverSave,
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
  await runtime.persistSave(
    save.id,
    { rawJson },
    { actorReason: "pipeline:render-text-cover:stamp" },
  );
}

const inFlight = new Map<string, Promise<number>>();

export function runRenderTextCover(
  saveId: string,
  opts: { force?: boolean; imageFallback?: boolean } = {},
  runtime: RenderTextCoverRuntime = defaultRuntime,
): Promise<number> {
  /** The pipeline task and the library card both ask for a cover; one render must serve both. */
  const pending = inFlight.get(saveId);
  if (pending) return pending;
  const run = renderTextCover(saveId, opts, runtime).finally(() => {
    inFlight.delete(saveId);
  });
  inFlight.set(saveId, run);
  return run;
}

async function renderTextCover(
  saveId: string,
  opts: { force?: boolean; imageFallback?: boolean },
  runtime: RenderTextCoverRuntime,
): Promise<number> {
  const save = await runtime.readSave(saveId);
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
  const light = await runtime.renderCard(body, "light");
  if (!light) return 0;
  const dark = await runtime.renderCard(body, "dark");
  if (!dark) return 0;

  await writeCover(runtime, saveId, THUMBNAIL_KIND, TEXT_THUMBNAIL_FILE, light);
  await writeCover(
    runtime,
    saveId,
    THUMBNAIL_DARK_KIND,
    THUMBNAIL_DARK_FILE,
    dark,
  );
  await stampVersion(runtime, save);

  log.info("[pond pipeline:render-text-cover] done", { saveId });
  return 2;
}
