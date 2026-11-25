import type { SaveFile } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";

/**
 * The downloaded copy of each post image and video poster, keyed by its link and
 * found by its place in the post: `media-2.jpg` for the second item, `poster-2.jpg`
 * for its poster. Older downloads have no source URL, and signed CDN links
 * (Threads, Instagram) expire.
 */
export function mediaFilesByUrl(
  capture: Capture,
  files: readonly SaveFile[],
): Map<string, SaveFile> {
  const out = new Map<string, SaveFile>();
  (capture.media ?? []).forEach((m, i) => {
    if (m.type !== "image" && m.type !== "video") return;
    const video = m.type === "video";
    const url = video ? m.posterUrl : m.url;
    if (!url) return;
    const kind = video ? "poster" : "image";
    const stem = `${video ? "poster" : "media"}-${i + 1}.`;
    const file = files.find((f) => f.kind === kind && f.path.startsWith(stem));
    if (file) out.set(url, file);
  });
  return out;
}
