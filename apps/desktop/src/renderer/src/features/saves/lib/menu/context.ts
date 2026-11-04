import { isAuxiliaryKind } from "@shared/save-file-names";
import { isWebPageSave } from "@shared/web-page-save";
import { resolveFileIndex } from "@/features/saves/lib/actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { deriveTypeKind } from "@/features/saves/lib/media/units";
import {
  hasVideoFile,
  needsVideoDownload,
} from "@/features/saves/lib/media/video-download";
import { isHttpUrl } from "@/features/saves/lib/url-list";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import type { Save, SaveFile } from "@/features/saves/types";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import type { BuildSaveMenuOptions, SaveMenuContext } from "./types";

function canRemoveVideo(save: Save): boolean {
  return save.source !== "local" && hasVideoFile(save);
}

export function contextMenuSaves(clicked: Save): Save[] {
  if (selection.has(clicked.id) && selection.size() > 1) {
    const out: Save[] = [];
    for (const id of selection.snapshot()) {
      const save = pool.get(id);
      if (save) out.push(save);
    }
    if (out.length > 1) return out;
  }
  return [clicked];
}

export function createSaveMenuContext(
  saveOrSaves: Save | readonly Save[],
  {
    clipboardEmpty,
    fileIndex = null,
    openWithApps = [],
    opened = false,
    folderId,
    pinnedIds,
    coverSaveId,
    fontActivated = false,
  }: BuildSaveMenuOptions,
): SaveMenuContext | null {
  const saves = Array.isArray(saveOrSaves) ? saveOrSaves : [saveOrSaves];
  const save = saves[0];
  if (!save) return null;
  const ids =
    selection.has(save.id) && selection.size() > saves.length
      ? [...selection.snapshot()]
      : saves.map((item) => item.id);
  const batch = ids.length > 1;
  const nav = saveLibraryBridge.getNav();
  const resolvedFolderId =
    folderId !== undefined ? folderId : nav.kind === "folder" ? nav.id : null;
  const folderView = resolvedFolderId
    ? getPrefsSnapshot()?.folderViews[resolvedFolderId]
    : undefined;
  const resolvedPinned = pinnedIds ?? folderView?.pinnedIds ?? [];
  const resolvedCover =
    coverSaveId !== undefined ? coverSaveId : (folderView?.coverSaveId ?? null);
  const incomplete = ids.length > saves.length;
  const hasFiles =
    incomplete || saves.some((item) => resolveFileIndex(item) != null);
  const targetIndex = resolveFileIndex(save, fileIndex);
  const targetFile =
    targetIndex != null ? (save.files[targetIndex] ?? null) : null;
  const isGif =
    !batch &&
    (targetFile?.mimeType === "image/gif" ||
      /\.gif(?:$|[?#])/i.test(targetFile?.path ?? ""));
  const isWebp =
    !batch &&
    (targetFile?.mimeType === "image/webp" ||
      /\.webp(?:$|[?#])/i.test(targetFile?.path ?? ""));
  const isVideo = !batch && deriveTypeKind(targetFile, save) === "video";
  const canResetThumbnail =
    !batch && save.files.some((file: SaveFile) => !isAuxiliaryKind(file.kind));

  return {
    saves,
    save,
    ids,
    batch,
    incomplete,
    clipboardEmpty,
    fileIndex,
    openWithApps,
    opened,
    resolvedFolderId,
    resolvedPinned,
    resolvedCover,
    inFolder: Boolean(resolvedFolderId),
    isPinned: !batch && resolvedPinned.includes(save.id),
    isCover: !batch && resolvedCover === save.id,
    hasFiles,
    hasTags: incomplete || saves.some((item) => item.tags.length > 0),
    allTrashed: saves.every((item) => Boolean(item.deletedAt)),
    hasUrl: incomplete || saves.some((item) => Boolean(item.url)),
    hasHttpUrl: incomplete || saves.some((item) => isHttpUrl(item.url)),
    targetFile,
    isGif,
    isWebp,
    isVideo,
    canDownloadVideo: incomplete || saves.some(needsVideoDownload),
    canRemoveVideo: incomplete || saves.some(canRemoveVideo),
    copyLabel: isVideo ? "Copy Video" : "Copy",
    archivable:
      incomplete ||
      saves.some(
        (item) => Boolean(item.url) && isWebPageSave(item) && !item.deletedAt,
      ),
    canResetThumbnail,
    canRename: !batch && save.source === "local",
    fontActivated,
  };
}
