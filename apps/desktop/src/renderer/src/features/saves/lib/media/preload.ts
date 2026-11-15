import {
  buildViewerItems,
  type ViewerItem,
} from "@/features/saves/lib/media/viewer-item";
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

export function viewerImageUrl(
  save: Save,
  theme: ResolvedTheme,
): string | null {
  return preloadableImageUrl(buildViewerItems(save, { theme })[0]);
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

export function heldImageUrls(): string[] {
  return [...held.keys()];
}
