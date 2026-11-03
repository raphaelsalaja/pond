import { z } from "zod";
import { statusFeed } from "@/features/downloads/status-feed";
import { resolveFileIndex } from "@/features/saves/lib/actions";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import {
  bulkMutation,
  purgeSaves,
  trashSaves,
  untrashSaves,
} from "@/features/saves/lib/mutate";
import { REVERSE_SEARCH_ENGINES } from "@/features/saves/lib/reverse-image-search";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { mergeUniqueTags, tagClipboard } from "@/features/tags";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

const OkSchema = z
  .object({ ok: z.boolean().catch(false) })
  .catch({ ok: false });

const RetryReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    requeued: z.number().catch(0),
  })
  .catch({ ok: false, requeued: 0 });

const FilePathReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    path: z.string().nullish().catch(null),
  })
  .catch({ ok: false, path: null });

const ExportReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    exported: z.number().catch(0),
    count: z.number().catch(0),
    reason: z.string().nullish().catch(null),
  })
  .catch({ ok: false, exported: 0, count: 0, reason: null });

const PublicUrlReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    url: z.string().nullish().catch(null),
  })
  .catch({ ok: false, url: null });

export interface SelectionActionResult {
  ok: boolean;
  message: string;
}

async function resolve(ids: readonly string[]): Promise<Save[]> {
  await ensureSaves(ids);
  const out: Save[] = [];
  for (const id of new Set(ids)) {
    const save = pool.get(id);
    if (!save)
      throw new Error(
        "A selected Save is no longer available. Refresh the selection.",
      );
    out.push(save);
  }
  return out;
}

async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    const result = OkSchema.parse(
      await window.pond.query("clipboard.writeText", { text }),
    );
    return result.ok;
  } catch {
    return false;
  }
}

export function failedIdsIn(ids: readonly string[]): string[] {
  return ids.filter((id) => pool.get(id)?.status === "failed");
}

export async function retryFailedSelection(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const result = RetryReplySchema.parse(
    await window.pond.query("saves.retryFailed", { ids: [...ids] }),
  );
  if (!result.ok) {
    statusFeed.error("Retry failed items", "Couldn't retry failed items.");
  }
}

export async function trashSelection(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await trashSaves([...ids]);
  selection.clear();
}

export async function restoreSelection(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await untrashSaves([...ids]);
  selection.clear();
}

export async function deleteSelectionForever(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await purgeSaves([...ids]);
  selection.clear();
}

export async function addTagsToSelection(
  ids: readonly string[],
  tags: readonly string[],
): Promise<void> {
  const clean = tags.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return;
  await bulkMutation(ids, { kind: "tags", tags: clean });
}

export async function clearTagsForSelection(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await bulkMutation(ids, { kind: "tags", tags: [], mode: "replace" });
}

export async function copyIdsForSelection(
  ids: readonly string[],
): Promise<SelectionActionResult> {
  if (ids.length === 0) {
    return { ok: false, message: "Nothing selected" };
  }
  const ok = await writeClipboard(ids.join("\n"));
  return ok
    ? {
        ok: true,
        message: `Copied ${formatPlural(ids.length, { one: "ID", other: "IDs" })}`,
      }
    : { ok: false, message: "Couldn't copy" };
}

export async function copyNamesForSelection(
  ids: readonly string[],
): Promise<SelectionActionResult> {
  const saves = await resolve(ids);
  const names = saves.map(
    (save) =>
      save.title?.trim() ||
      save.files[0]?.path.split(/[/\\]/).at(-1) ||
      save.id,
  );
  const ok = await writeClipboard(names.join("\n"));
  return ok
    ? {
        ok: true,
        message: `Copied ${formatPlural(names.length, { one: "name", other: "names" })}`,
      }
    : { ok: false, message: "Couldn't copy" };
}

export async function copyUrlsForSelection(
  ids: readonly string[],
): Promise<SelectionActionResult> {
  const urls = (await resolve(ids))
    .map((s) => s.url)
    .filter((u): u is string => Boolean(u));
  if (urls.length === 0) {
    return { ok: false, message: "No links in selection" };
  }
  const ok = await writeClipboard(urls.join("\n"));
  return ok
    ? {
        ok: true,
        message: `Copied ${formatPlural(urls.length, { one: "link", other: "links" })}`,
      }
    : { ok: false, message: "Couldn't copy" };
}

export async function copyFilePathsForSelection(
  ids: readonly string[],
): Promise<SelectionActionResult> {
  const saves = (await resolve(ids)).filter(
    (save) => resolveFileIndex(save) != null,
  );
  const replies = await Promise.all(
    saves.map(async (save) =>
      FilePathReplySchema.parse(
        await window.pond.query("saves.filePath", {
          id: save.id,
          fileIndex: resolveFileIndex(save) ?? 0,
        }),
      ),
    ),
  );
  const paths = replies.flatMap((result) =>
    result.ok && result.path ? [result.path] : [],
  );
  if (paths.length === 0) {
    return { ok: false, message: "No files in selection" };
  }
  const ok = await writeClipboard(paths.join("\n"));
  return ok
    ? {
        ok: true,
        message: `Copied ${formatPlural(paths.length, {
          one: "file path",
          other: "file paths",
        })}`,
      }
    : { ok: false, message: "Couldn't copy" };
}

export async function exportSelectionFiles(
  ids: readonly string[],
): Promise<SelectionActionResult> {
  if (ids.length === 0) return { ok: false, message: "Nothing selected" };
  const job = statusFeed.start("Exporting files");
  const result = ExportReplySchema.parse(
    await window.pond.query("saves.exportFiles", { ids: [...ids] }),
  );
  if (!result.ok) {
    if (result.reason === "cancelled") {
      statusFeed.dismiss(job);
      return { ok: true, message: "Export canceled" };
    }
    statusFeed.fail(job, "Export failed.");
    return { ok: false, message: "Export failed" };
  }
  const message = `Exported ${formatPlural(result.exported, { one: "file", other: "files" })}`;
  statusFeed.done(job, message);
  return { ok: true, message };
}

export async function exportSelectionCsv(
  ids: readonly string[],
): Promise<SelectionActionResult> {
  if (ids.length === 0) return { ok: false, message: "Nothing selected" };
  const job = statusFeed.start("Exporting CSV");
  const result = ExportReplySchema.parse(
    await window.pond.query("saves.exportCsv", { ids: [...ids] }),
  );
  if (!result.ok) {
    if (result.reason === "cancelled") {
      statusFeed.dismiss(job);
      return { ok: true, message: "Export canceled" };
    }
    statusFeed.fail(job, "Export failed.");
    return { ok: false, message: "Export failed" };
  }
  const message = `Exported ${formatPlural(result.count, { one: "row", other: "rows" })} to CSV`;
  statusFeed.done(job, message);
  return { ok: true, message };
}

export async function copyFilesForSelection(
  ids: readonly string[],
): Promise<void> {
  const files: Array<{ id: string; fileIndex: number }> = [];
  for (const save of await resolve(ids)) {
    const fileIndex = resolveFileIndex(save);
    if (fileIndex == null) continue;
    files.push({ id: save.id, fileIndex });
  }
  if (files.length === 0) return;
  const result = OkSchema.parse(
    await window.pond.query("saves.copyFiles", { files }),
  );
  if (!result.ok) return;
  notify({
    id: "copy-media",
    title:
      files.length === 1
        ? "File copied to clipboard"
        : "Files copied to clipboard",
  });
}

export async function copyTagsForSelection(
  ids: readonly string[],
): Promise<void> {
  let tags: string[] = [];
  for (const save of await resolve(ids)) {
    tags = mergeUniqueTags(tags, save.tags);
  }
  if (tags.length === 0) return;
  tagClipboard.set(tags);
  notify({ id: "copy-tags", title: "Tags copied" });
}

export async function pasteTagsForSelection(
  ids: readonly string[],
): Promise<void> {
  const buf = tagClipboard.get();
  if (buf.length === 0) return;
  await addTagsToSelection(ids, buf);
}

export async function openDefaultAppForSelection(
  ids: readonly string[],
): Promise<void> {
  let attempted = 0;
  let failed = 0;
  for (const save of await resolve(ids)) {
    const fileIndex = resolveFileIndex(save);
    if (fileIndex == null) continue;
    attempted += 1;
    const result = OkSchema.parse(
      await window.pond.openSaveFile(save.id, fileIndex),
    );
    if (!result.ok) failed += 1;
  }
  if (attempted === 0 || failed === 0) return;
  statusFeed.error(
    "Open",
    failed === attempted
      ? "Couldn't open these files."
      : "Couldn't open some files.",
  );
}

export async function revealFilesForSelection(
  ids: readonly string[],
): Promise<void> {
  let attempted = 0;
  let failed = 0;
  for (const save of await resolve(ids)) {
    const fileIndex = resolveFileIndex(save);
    if (fileIndex == null) continue;
    attempted += 1;
    const result = OkSchema.parse(
      await window.pond.revealSave(save.id, fileIndex),
    );
    if (!result.ok) failed += 1;
  }
  if (attempted === 0 || failed === 0) return;
  statusFeed.error(
    "Reveal",
    failed === attempted
      ? "Couldn't find these files on disk."
      : "Couldn't find some files on disk.",
  );
}

export async function openInBrowserForSelection(
  ids: readonly string[],
): Promise<void> {
  for (const save of await resolve(ids)) {
    const url = save.url;
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        await window.pond.openExternal(parsed.toString());
      }
    } catch {}
  }
}

export async function reverseImageSearchForSelection(
  ids: readonly string[],
  engineKey: string,
): Promise<void> {
  const engine = REVERSE_SEARCH_ENGINES.find((e) => e.key === engineKey);
  if (!engine) return;
  if ("usesImageUrl" in engine && !engine.usesImageUrl) {
    await window.pond.openExternal(engine.url(""));
    return;
  }
  let opened = 0;
  for (const save of await resolve(ids)) {
    const result = PublicUrlReplySchema.parse(
      await window.pond.query("saves.publicImageUrl", { id: save.id }),
    );
    if (!result.ok || !result.url) continue;
    await window.pond.openExternal(engine.url(encodeURIComponent(result.url)));
    opened += 1;
  }
  if (opened === 0) {
    statusFeed.error(
      "Reverse Image Search",
      "No public image URL is available.",
    );
  }
}

export async function refreshDetailsForSelection(
  ids: readonly string[],
): Promise<void> {
  for (const save of await resolve(ids)) {
    if (!save.url) continue;
    await window.pond.refreshSave(save.id);
  }
}

export async function archiveSitesForSelection(
  ids: readonly string[],
): Promise<void> {
  for (const save of await resolve(ids)) {
    if (!save.url || save.source !== "web" || save.deletedAt) continue;
    await window.pond.archiveSite(save.id);
  }
}
