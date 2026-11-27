import type { SharePageKind, SharePageSave } from "@pond/schema/share-page";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function savesCount(count: number): string {
  return count === 1 ? "1 Save" : `${count.toLocaleString()} Saves`;
}

export const KIND_LABELS = {
  save: "Save",
  selection: "Saves",
  folder: "Folder",
} as const satisfies Record<SharePageKind, string>;

/** What to call a Save that has no title of its own. */
export function saveLabel(save: SharePageSave): string {
  return (
    save.title ||
    save.author?.name ||
    (save.author?.handle ? `@${save.author.handle}` : undefined) ||
    save.card?.title ||
    save.source
  );
}

export function authorLabel(save: SharePageSave): string | undefined {
  const author = save.author;
  if (!author) return undefined;
  return author.name || (author.handle ? `@${author.handle}` : undefined);
}

/** Post text often repeats the title, which harvest takes from the text's first line. */
export function bodyText(save: SharePageSave): string | undefined {
  const text = save.text?.trim();
  if (!text) return undefined;
  const title = save.title?.trim().replace(/[…\s]+$/u, "");
  if (title && text.startsWith(title) && text.length <= title.length + 1) {
    return undefined;
  }
  return text;
}
