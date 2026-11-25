/** Maps a media URL to the card thumbnail decoded from that same file, so the viewer never paints a cover that shows other media. */
const LIMIT = 512;
const thumbnails = new Map<string, string>();

export function rememberCardThumbnail(original: string, shown: string): void {
  thumbnails.delete(original);
  thumbnails.set(original, shown);
  if (thumbnails.size <= LIMIT) return;
  const oldest = thumbnails.keys().next();
  if (!oldest.done) thumbnails.delete(oldest.value);
}

export function cardThumbnailFor(original: string): string | null {
  return thumbnails.get(original) ?? null;
}
