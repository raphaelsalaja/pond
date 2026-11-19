import type { CaptureDraft } from "@pond/schema/capture";
import type { QuickCaptureSubmit } from "../../../shared/quick-capture-contracts";

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

/**
 * Text that is only links, one per line, becomes link Saves that go through the normal URL import.
 * Anything else is kept exactly as typed in one note Save. Each file becomes its own Save.
 */
export function quickCaptureDraft(
  input: QuickCaptureSubmit,
  id: string,
): CaptureDraft {
  const items: CaptureDraft["items"] = [];
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const urls = lines.map(webUrl);
  if (lines.length && urls.every((url) => url !== null))
    for (const url of urls) items.push({ kind: "url", url: url as string });
  else if (input.text.trim()) items.push({ kind: "note", text: input.text });
  for (const path of input.paths) items.push({ kind: "file", path });
  if (!items.length) throw new Error("Add a link, some text, or a file.");
  const title = input.title?.trim();
  const first = items[0];
  if (title && items.length === 1 && first) first.title = title;
  const notes = input.notes?.trim();
  return {
    id,
    trigger: "quick-capture",
    items,
    metadata: {
      tags: [],
      folderIds: input.folderId ? [input.folderId] : [],
      ...(notes ? { notes } : {}),
    },
  };
}
