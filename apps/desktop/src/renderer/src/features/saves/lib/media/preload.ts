import {
  detailsPreviewUrl,
  pickCardUnit,
} from "@/features/saves/lib/media/units";
import { buildViewerItems } from "@/features/saves/lib/media/viewer-item";
import type { ViewerItem } from "@/features/saves/lib/media/viewer-item";
import type { Save } from "@/features/saves/types";
import type { ResolvedTheme } from "@/shared/hooks/use-resolved-theme";

/** Arrow-key sweeps settle before decoding, so only the item you stop on pays for its original. */
export const PRELOAD_SETTLE_MS = 80;

/** Holding the element keeps Chromium's decoded bitmap alive until the viewer asks for it. */
const HELD_LIMIT = 3;
const held = new Map<string, HTMLImageElement>();

export function preloadableImageUrl(
  item: ViewerItem | undefined,
): string | null {
  if (!item) return null;
  const { capability } = item;
  return capability.surface === "raster" && capability.source === "original"
    ? item.url
    : null;
}

/**
 * Images the viewer and Details show first for a Save, without duplicates.
 * @remarks Video metadata is left to the player, since a second media element would fetch the file twice.
 */
export function saveImageUrls(
  save: Save,
  theme: ResolvedTheme,
  options: { details: boolean },
): Array<string> {
  const urls = new Set<string>();
  const first = buildViewerItems(save, { theme })[0];
  const original = preloadableImageUrl(first);
  if (original) urls.add(original);
  if (first?.capability.surface === "temporal" && first.posterUrl) {
    urls.add(first.posterUrl);
  }
  if (options.details) {
    const preview = detailsPreviewUrl(pickCardUnit(save));
    if (preview) urls.add(preview);
  }
  return [...urls];
}

export function preloadImage(url: string): void {
  const existing = held.get(url);
  if (existing) {
    held.delete(url);
    held.set(url, existing);
    return;
  }
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  held.set(url, image);
  image.decode().catch(() => {
    if (held.get(url) === image) held.delete(url);
  });
  for (const [key, stale] of held) {
    if (held.size <= HELD_LIMIT) break;
    held.delete(key);
    if (!stale.complete) stale.src = "";
  }
}

/** Stops a preload that has not finished, so leaving a Save frees its bandwidth for the next one. */
export function cancelPreload(url: string): void {
  const image = held.get(url);
  if (!image || image.complete) return;
  held.delete(url);
  image.src = "";
}

export function heldImageUrls(): Array<string> {
  return [...held.keys()];
}
