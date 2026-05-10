import { useSyncExternalStore } from "react";
import { isTextOnlyTweet } from "@/components/card-thumb/tweet";
import type { Save } from "@/pool/types";

/**
 * Aspect-ratio resolution for save covers.
 *
 * Most rows in the pool reach the renderer without `width`/`height`
 * populated — the harvesters store the cover bytes but skip extracting
 * intrinsic dimensions, and the older twitter rows often have an empty
 * `files[]` altogether. Without dims the packer can't size cards, so
 * the masonry collapses to a uniform grid.
 *
 * To recover dims without a data-layer backfill, the card thumbnails
 * report each image's `naturalWidth/Height` (and each video's
 * `videoWidth/Height`) as they load. Reports are funneled through
 * `recordAspect()` here, which:
 *
 *   1. Stores the clamped ratio in a module-level Map keyed by save id
 *      (Map, not WeakMap — save references churn when the pool emits
 *      patches, so we want the measurement to outlive a single ref).
 *   2. Bumps a version counter on the next animation frame, batching
 *      a burst of image loads into a single re-pack.
 *
 * The waterfall packer hooks the version via `useAspectVersion()` and
 * re-runs `aspectFor()` for every save on each pack pass. Already-
 * measured cards return the same ratio, so positions for those rows
 * stay stable — only freshly-measured cards (and the cards below them
 * in the same column) shift.
 */

const MIN_RATIO = 0.4;
const MAX_RATIO = 2.5;

const measuredAspects = new Map<string, number>();
const fallbackCache = new WeakMap<Save, number>();

/* Aspect ratios persist across sessions so the masonry doesn't shift
 * the second time you scroll through a card. Without this, every fresh
 * launch re-measures dim-less covers as their `<img>` lazy-loads,
 * triggering a re-pack cascade that's especially visible during fast
 * scrolling. The serialized blob is small (~30 bytes per save) and
 * tolerant of stale entries — if the cover changes, the next image
 * load updates the map and persists the corrected value. */
const STORAGE_KEY = "pond:aspects:v1";
const PERSIST_DEBOUNCE_MS = 800;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistDirty = false;

function clampRatio(w: number, h: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h));
}

function hydrateFromStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        measuredAspects.set(id, value);
      }
    }
  } catch {
    // Storage corrupt / unavailable — start with an empty cache.
  }
}

function persistSoon(): void {
  persistDirty = true;
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!persistDirty) return;
    persistDirty = false;
    if (typeof localStorage === "undefined") return;
    try {
      const obj: Record<string, number> = {};
      for (const [id, ratio] of measuredAspects) obj[id] = ratio;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Storage full / private browsing — drop the persistence pass.
    }
  }, PERSIST_DEBOUNCE_MS);
}

hydrateFromStorage();

export function aspectFor(save: Save): number {
  const measured = measuredAspects.get(save.id);
  if (measured !== undefined) return measured;
  const cached = fallbackCache.get(save);
  if (cached !== undefined) return cached;
  const cover = save.files[save.coverIndex ?? 0];
  const w = cover?.width ?? save.width ?? null;
  const h = cover?.height ?? save.height ?? null;
  // Text-only tweets have no measurable cover. <Card.Tweet> renders a
  // landscape text card, so report 4/3 here so the waterfall/justified
  // packers reserve a matching slot.
  const ratio = w && h ? clampRatio(w, h) : isTextOnlyTweet(save) ? 4 / 3 : 1;
  fallbackCache.set(save, ratio);
  return ratio;
}

let scheduled = 0;
let version = 0;
const subs = new Set<() => void>();

function flush() {
  scheduled = 0;
  version++;
  for (const cb of subs) cb();
}

function schedule() {
  if (scheduled !== 0) return;
  if (typeof requestAnimationFrame === "undefined") {
    flush();
    return;
  }
  scheduled = requestAnimationFrame(flush);
}

export function recordAspect(saveId: string, w: number, h: number): void {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
  const ratio = clampRatio(w, h);
  const prev = measuredAspects.get(saveId);
  if (prev !== undefined && Math.abs(prev - ratio) < 0.001) return;
  measuredAspects.set(saveId, ratio);
  persistSoon();
  schedule();
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

function getVersion(): number {
  return version;
}

export function useAspectVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
