import { isThumbnailKind } from "@shared/save-file-names";
import { z } from "zod";
import { statusFeed } from "@/features/downloads/status-feed";
import {
  deriveTypeKind,
  isImageFile,
  pickPrimaryFile,
  pickPrimaryUnit,
} from "@/features/saves/lib/media/units";
import {
  trashSave as applyTrash,
  untrashSave as applyUntrash,
  purgeSave,
  setSaveTags,
} from "@/features/saves/lib/mutate";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { openSaveTagPicker } from "@/features/saves/state/tag-picker";
import type { Save, SaveFile } from "@/features/saves/types";
import { mergeUniqueTags, tagClipboard } from "@/features/tags";
import { notify } from "@/shared/lib/toast";

const OkSchema = z
  .object({ ok: z.boolean().catch(false) })
  .catch({ ok: false });

const FilePathReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    path: z.string().nullish().catch(null),
  })
  .catch({ ok: false, path: null });

export function resolveFileIndex(
  save: Save,
  preferred?: number | null,
): number | null {
  if (
    preferred != null &&
    preferred >= 0 &&
    preferred < save.files.length &&
    save.files[preferred]
  ) {
    return preferred;
  }
  const primary = pickPrimaryFile(save);
  if (primary) {
    const idx = save.files.indexOf(primary);
    if (idx >= 0) return idx;
  }
  if (save.files.length === 0) return null;
  const cover = save.coverIndex ?? 0;
  if (!isThumbnailKind(save.files[cover]?.kind ?? "")) return cover;
  const original = save.files.findIndex((file) => !isThumbnailKind(file.kind));
  return original >= 0 ? original : null;
}

async function toggleTrash(save: Save): Promise<void> {
  const prev = pool.get(save.id);
  if (!prev) return;
  const wasTrashed = Boolean(prev.deletedAt);
  if (wasTrashed) await applyUntrash(save.id);
  else await applyTrash(save.id);
}

export async function trashSave(save: Save): Promise<void> {
  if (save.deletedAt) return;
  await toggleTrash(save);
}

export async function untrashSave(save: Save): Promise<void> {
  if (!save.deletedAt) return;
  await toggleTrash(save);
}

/** Pasteboard writes go through main; renderer clipboard rejects once a closing menu steals focus. */
async function writeClipboardText(text: string): Promise<void> {
  if (!text) return;
  await window.pond.query("clipboard.writeText", { text });
}

export async function copyUrl(url: string): Promise<void> {
  if (!url) return;
  await writeClipboardText(url);
  notify({
    id: "copy-url",
    title: "URL copied to clipboard",
  });
}

export async function copyId(id: string): Promise<void> {
  if (!id) return;
  await writeClipboardText(id);
  notify({
    id: "copy-id",
    title: "ID copied to clipboard",
  });
}

export async function copyValue(label: string, value: string): Promise<void> {
  if (!value) return;
  await writeClipboardText(value);
  notify({ id: "copy-value", title: `${label} copied to clipboard` });
}

export async function copyName(save: Save): Promise<void> {
  const fallback = save.files[0]?.path.split(/[/\\]/).at(-1) ?? save.id;
  await writeClipboardText(save.title?.trim() || fallback);
  notify({
    id: "copy-name",
    title: "Name copied to clipboard",
  });
}

export function focusPaneTitle(): void {
  let tries = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>("[data-pane-title]");
    if (el) {
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }
    if (tries++ < 4) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function selectedSaveIds(): readonly string[] {
  const ids = selection.snapshot();
  if (ids.length > 0) return ids;
  const primary = primarySelection.get();
  return primary ? [primary] : [];
}

/**
 * A context-menu click closes that menu and moves focus. Opening in the same
 * turn makes the picker treat the move as a dismissal.
 */
function menuIsOpen(): boolean {
  return document.querySelector("[role='menu'][data-open]") != null;
}

function openAfterMenuCloses(open: () => void): void {
  const started = performance.now();
  const attempt = () => {
    if (!menuIsOpen() || performance.now() - started > 400) {
      requestAnimationFrame(open);
      return;
    }
    requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

export function openTagPicker(): void {
  const ids = selectedSaveIds();
  if (ids.length === 0) return;
  const primary = primarySelection.get();
  const anchorId =
    primary && ids.includes(primary) ? primary : (ids[0] ?? null);
  const open = () => openSaveTagPicker(ids, anchorId);
  if (menuIsOpen()) {
    openAfterMenuCloses(open);
    return;
  }
  open();
}

export async function purgeForever(save: Save): Promise<void> {
  await purgeSave(save.id);
}

export async function openDefaultApp(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = OkSchema.parse(
    await window.pond.openSaveFile(save.id, fileIndex),
  );
  if (!result.ok) statusFeed.error("Open", "Couldn't open this file.");
}

export async function revealFile(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = OkSchema.parse(
    await window.pond.revealSave(save.id, fileIndex),
  );
  if (!result.ok) {
    statusFeed.error("Reveal", "Couldn't find this file on disk.");
  }
}

export async function copyFilePath(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = FilePathReplySchema.parse(
    await window.pond.query("saves.filePath", { id: save.id, fileIndex }),
  );
  if (!result.ok || !result.path) return;
  await writeClipboardText(result.path);
  notify({
    id: "copy-path",
    title: "Path copied to clipboard",
  });
}

async function copyFile(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = OkSchema.parse(
    await window.pond.query("saves.copyFile", { id: save.id, fileIndex }),
  );
  if (!result.ok) return;
  const file = save.files[fileIndex];
  const title =
    file && deriveTypeKind(file, save) === "video"
      ? "Video copied to clipboard"
      : "File copied to clipboard";
  notify({ id: "copy-media", title });
}

export async function openInBrowser(save: Save): Promise<void> {
  if (!save.url) return;
  try {
    const parsed = new URL(save.url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      await window.pond.openExternal(parsed.toString());
    }
  } catch {}
}

export async function refreshSaveMetadata(save: Save): Promise<void> {
  if (!save.url) return;
  notify({
    id: "refresh-details",
    title: "Refreshing from source",
  });
  await window.pond.refreshSave(save.id);
}

export function copyableImageIndex(
  save: Save,
  preferredIndex?: number | null,
): number | null {
  if (preferredIndex != null) {
    const file = save.files[preferredIndex];
    return file && isCopyableImageFile(file) ? preferredIndex : null;
  }
  if (pickPrimaryUnit(save)?.isVideo) return null;
  const primary = pickPrimaryFile(save);
  if (primary && isCopyableImageFile(primary)) {
    return save.files.indexOf(primary);
  }
  return null;
}

function isCopyableImageFile(file: SaveFile): boolean {
  if (!isImageFile(file)) return false;
  return (
    file.kind !== "poster" &&
    file.kind !== "avatar" &&
    file.kind !== "source_icon"
  );
}

async function copyImage(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = copyableImageIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = OkSchema.parse(
    await window.pond.query("saves.copyImage", { id: save.id, fileIndex }),
  );
  if (!result.ok) return;
  notify({
    id: "copy-media",
    title: "Image copied to clipboard",
  });
}

export async function copyPrimaryMedia(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  if (copyableImageIndex(save, preferredIndex) != null) {
    await copyImage(save, preferredIndex);
    return;
  }
  await copyFile(save, preferredIndex);
}

export async function copyThumbnail(save: Save): Promise<void> {
  const result = OkSchema.parse(
    await window.pond.query("saves.copyThumbnail", { id: save.id }),
  );
  if (!result.ok) return;
  notify({
    id: "copy-thumbnail",
    title: "Thumbnail copied to clipboard",
  });
}

export async function copyBase64(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = OkSchema.parse(
    await window.pond.query("saves.copyBase64", {
      id: save.id,
      fileIndex,
    }),
  );
  if (!result.ok) return;
  notify({
    id: "copy-base64",
    title: "Base64 copied to clipboard",
  });
}

export function copyTags(save: Save): void {
  if (save.tags.length === 0) return;
  tagClipboard.set(save.tags);
  notify({ id: "copy-tags", title: "Tags copied" });
}

export async function pasteTags(save: Save): Promise<void> {
  const buf = tagClipboard.get();
  if (buf.length === 0) return;
  const next = mergeUniqueTags(save.tags, buf);
  const added = next.length - save.tags.length;
  if (added === 0) return;
  await setSaveTags(save.id, next);
}

export async function exportFile(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = FilePathReplySchema.parse(
    await window.pond.query("saves.exportFile", { id: save.id, fileIndex }),
  );
  if (!result.ok) return;
  notify({
    id: "export-file",
    title: "Exported",
  });
}
