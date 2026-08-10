import {
  deriveTypeKind,
  isImageFile,
  pickPrimaryFile,
  pickPrimaryUnit,
} from "@/lib/media/units";
import {
  trashSave as applyTrash,
  untrashSave as applyUntrash,
  purgeSave,
  setSaveTags,
} from "@/lib/save/mutate";
import type { Save, SaveFile } from "@/lib/types";
import { notify } from "@/lib/ui/toast";
import { activity } from "@/stores/activity";
import { pool } from "@/stores/pool";
import { mergeUniqueTags, tagClipboard } from "@/stores/tag-clipboard";

/** Prefer an explicit slide index, else the primary visual, else the cover slot. */
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
  return save.files[cover] ? cover : 0;
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
  notify({ id: "copy-url", title: "URL copied to clipboard" });
}

export async function copyId(id: string): Promise<void> {
  if (!id) return;
  await writeClipboardText(id);
  notify({ id: "copy-id", title: "ID copied to clipboard" });
}

export function focusPaneTitle(): void {
  /** Drawer is already open; wait a couple of frames for the title to mount before giving up. */
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

export function openTagPicker(): void {
  let tries = 0;
  const tick = () => {
    const el = document.querySelector<HTMLButtonElement>("[data-tag-add]");
    if (el) {
      el.click();
      return;
    }
    if (tries++ < 4) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  const result = (await window.pond.openSaveFile(save.id, fileIndex)) as {
    ok: boolean;
  };
  if (!result?.ok) activity.error("Open", "Couldn't open this file.");
}

export async function revealFile(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = (await window.pond.revealSave(save.id, fileIndex)) as {
    ok: boolean;
  };
  if (!result?.ok) {
    activity.error("Reveal", "Couldn't find this file on disk.");
  }
}

export async function copyFilePath(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = (await window.pond.query("saves.filePath", {
    id: save.id,
    fileIndex,
  })) as { ok: true; path: string } | { ok: false; reason: string };
  if (!result.ok) return;
  await writeClipboardText(result.path);
  notify({ id: "copy-path", title: "Path copied to clipboard" });
}

export async function copyFile(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  await window.pond.query("saves.copyFile", {
    id: save.id,
    fileIndex,
  });
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
  } catch {
    /** Malformed URL; drop silently. */
  }
}

export async function refreshSaveMetadata(save: Save): Promise<void> {
  if (!save.url) return;
  notify({ id: "refresh-details", title: "Refreshing details" });
  await window.pond.refreshSave(save.id);
}

/** Index of the file "Copy Image" targets; null for videos (use Copy Current Frame), posters, docs, and link-only saves. */
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

export async function copyImage(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = copyableImageIndex(save, preferredIndex);
  if (fileIndex == null) return;
  await window.pond.query("saves.copyImage", { id: save.id, fileIndex });
  notify({ id: "copy-media", title: "Image copied to clipboard" });
}

/** Copies raster image data when available; otherwise copies the primary file (e.g. video). */
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
  notify({ id: "paste-tags", title: "Tags pasted" });
}

export async function exportFile(
  save: Save,
  preferredIndex?: number | null,
): Promise<void> {
  const fileIndex = resolveFileIndex(save, preferredIndex);
  if (fileIndex == null) return;
  const result = (await window.pond.query("saves.exportFile", {
    id: save.id,
    fileIndex,
  })) as { ok: true; path: string } | { ok: false; reason: string };
  if (!result.ok) return;
  notify({ id: "export-file", title: "Exported" });
}
