import type { Save } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import {
  isOriginalImageKind,
  isTextCardThumbnailPath,
  isThumbnailKind,
  primaryOriginalPath,
  TEXT_THUMBNAIL_WEBP_FILE,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
  thumbnailFilename,
} from "@shared/save-file-names";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import sharp from "sharp";
import { getDb } from "../db";
import { saveFile } from "../paths";
import { persistSave } from "./persist-save";
import type { WriteFileArgs } from "./pipeline/workers/apply";
import {
  planThumbnailRepair,
  renderThumbnail,
  thumbnailLooksLikeSource,
  thumbnailSource,
  thumbnailToRender,
} from "./save-thumbnail-file";
import { readLibraryMedia } from "./storage/library-media-storage";

export { renderThumbnail };

function thumbnailWriteArgs(
  files: ReadonlyArray<{ kind: string; path: string }>,
  bytes: Buffer,
  width?: number,
  height?: number,
  custom = false,
): WriteFileArgs {
  /** A refreshed web save lists its new image after the archive files. */
  const primary =
    files.find((file) => isOriginalImageKind(file.kind))?.path ??
    primaryOriginalPath(files);
  const write: WriteFileArgs = {
    kind: THUMBNAIL_KIND,
    filename: primary ? thumbnailFilename(primary) : TEXT_THUMBNAIL_WEBP_FILE,
    bytes,
    mimeType: "image/webp",
  };
  if (width) write.width = width;
  if (height) write.height = height;
  if (custom) write.custom = true;
  return write;
}

/** Cards prefer `thumbnail_dark` in dark mode, so any new thumbnail has to replace both. */
export const THUMBNAIL_REPLACE_KINDS = [THUMBNAIL_KIND, THUMBNAIL_DARK_KIND];

export async function persistSaveThumbnail(
  saveId: string,
  bytes: Buffer,
  actorReason: string,
): Promise<boolean> {
  const db = await getDb();
  const row = db.select().from(saves).where(eq(saves.id, saveId)).all()[0];
  if (!row) return false;
  const meta = await sharp(bytes)
    .metadata()
    .catch(() => null);
  const updated = await persistSave(
    saveId,
    {},
    {
      actorReason,
      replaceFilesWithKind: THUMBNAIL_REPLACE_KINDS,
      newFiles: [
        thumbnailWriteArgs(
          row.files ?? [],
          bytes,
          meta?.width ?? undefined,
          meta?.height ?? undefined,
          true,
        ),
      ],
    },
  );
  return Boolean(updated);
}

/** Rebuilds a thumbnail that shows another image, including when the media is already on disk. */
export async function repairMismatchedThumbnail(
  saveId: string,
  save?: Pick<Save, "files"> | null,
): Promise<void> {
  const files = save?.files ?? [];
  const source = thumbnailSource(files);
  const comparable = files.filter(
    (file) =>
      isThumbnailKind(file.kind) &&
      file.custom !== true &&
      !isTextCardThumbnailPath(file.path),
  );
  let matches: boolean | null = null;
  if (source && comparable.length > 0) {
    const sourceBytes = await readLibraryMedia(
      saveFile(saveId, source.path),
    ).catch(() => null);
    if (sourceBytes) {
      const compared = await Promise.all(
        comparable.map(async (file) => {
          const thumbnail = await readLibraryMedia(
            saveFile(saveId, file.path),
          ).catch(() => null);
          if (!thumbnail) return null;
          return thumbnailLooksLikeSource(thumbnail, sourceBytes);
        }),
      );
      matches = compared.some((match) => match === false)
        ? false
        : compared.every((match) => match === true)
          ? true
          : null;
    }
  }
  const plan = planThumbnailRepair(files, matches);
  if (plan === "keep") return;
  await ensureSaveThumbnail(saveId, save, { force: plan === "rebuild" });
}

export async function ensureSaveThumbnail(
  saveId: string,
  save?: Pick<Save, "files"> | null,
  options: { force?: boolean } = {},
): Promise<void> {
  const files = save?.files;
  if (!files?.length) return;
  const primary = thumbnailToRender(files, options.force === true);
  if (!primary) return;
  const thumbnail = await renderThumbnail(saveFile(saveId, primary.path));
  if (!thumbnail) return;
  const meta = await sharp(thumbnail)
    .metadata()
    .catch(() => null);
  try {
    await persistSave(
      saveId,
      {},
      {
        actorReason: "pipeline:ensure-thumbnail",
        replaceFilesWithKind: THUMBNAIL_REPLACE_KINDS,
        newFiles: [
          thumbnailWriteArgs(
            files,
            thumbnail,
            meta?.width ?? undefined,
            meta?.height ?? undefined,
          ),
        ],
      },
    );
  } catch (err) {
    log.warn("[pond thumbnail] could not write sidecar", saveId, err);
  }
}
