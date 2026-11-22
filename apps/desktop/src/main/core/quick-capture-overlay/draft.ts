import type { CaptureDraft } from "@pond/schema/capture";
import type { QuickCaptureSubmit } from "../../../shared/quick-capture-contracts";
import { userError } from "../../../shared/user-error";

export interface QuickCapturePlan {
  /** Null when everything dropped is a Save already. */
  draft: CaptureDraft | null;
  /** Saves dragged out of Pond, filed instead of imported again. */
  saveIds: string[];
}

function webUrl(line: string): string | null {
  if (/\s/.test(line)) return null;
  try {
    const url = new URL(line);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** A draft with nothing typed or added is not worth restoring over a fresh clipboard. */
export function keepableDraft(
  input: QuickCaptureSubmit,
): QuickCaptureSubmit | null {
  return input.text.trim() || input.title?.trim() || input.paths.length
    ? input
    : null;
}

/**
 * Text that is only links, one per line, becomes link Saves that go through the normal URL import.
 * Anything else is kept exactly as typed in one note Save. Each file becomes its own Save.
 */
export function quickCapturePlan(
  input: QuickCaptureSubmit,
  id: string,
  saveIdFor: (path: string) => string | null,
): QuickCapturePlan {
  const items: CaptureDraft["items"] = [];
  const saveIds: string[] = [];
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const urls = lines.map(webUrl).filter((url) => url !== null);
  if (lines.length && urls.length === lines.length)
    for (const url of urls) items.push({ kind: "url", url });
  else if (input.text.trim()) items.push({ kind: "note", text: input.text });
  for (const path of input.paths) {
    const saveId = saveIdFor(path);
    if (!saveId) items.push({ kind: "file", path });
    else if (!saveIds.includes(saveId)) saveIds.push(saveId);
  }
  if (!items.length && !saveIds.length)
    throw userError("Add a link, some text, or a file.");
  if (!items.length) return { draft: null, saveIds };
  const metadata: CaptureDraft["metadata"] = {
    tags: [],
    folderIds: input.folderId ? [input.folderId] : [],
  };
  const title = input.title?.trim();
  /** Metadata titles are locked, so a link's fetched title can't replace the typed one. */
  if (title && items.length === 1 && !saveIds.length) metadata.title = title;
  return {
    draft: { id, trigger: "quick-capture", items, metadata },
    saveIds,
  };
}
