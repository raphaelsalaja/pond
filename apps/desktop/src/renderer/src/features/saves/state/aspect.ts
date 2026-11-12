import { debounce } from "@tanstack/pacer";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { z } from "zod";
import { orientAspectRatio } from "@/features/saves/lib/image-orientation";
import {
  type MediaPickOptions,
  type MediaUnit,
  pickCardUnit,
} from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";
import { libraryScopedKey } from "@/shared/lib/library-scope";
import { clamp } from "@/shared/lib/math";

const MIN_RATIO = 0.4;
const MAX_RATIO = 2.5;
const MAX_MEASURED = 5000;
const BURST_DEBOUNCE_MS = 120;
const BURST_WINDOW_MS = 50;
const SOFT_MIN_DELTA = 0.03;
const HARD_MIN_DELTA = 0.001;

const MASONRY_ASPECT_CACHE_KEY = libraryScopedKey("pond:aspects:v4");
const PERSIST_DEBOUNCE_MS = 800;

const measuredAspects = new Map<string, number>();
const fallbackCache = new WeakMap<Save, Map<string, number>>();
const coverKeyCache = new WeakMap<Save, Map<string, string>>();

export function clampRatio(w: number, h: number): number {
  return clamp(w / h, MIN_RATIO, MAX_RATIO);
}

export function aspectCoverKey(unit: MediaUnit | null): string {
  if (!unit) return "";
  return unit.isVideo ? (unit.posterKey ?? unit.key) : unit.key;
}

function optsCacheKey(opts: MediaPickOptions): string {
  return `${opts.theme ?? ""}:${opts.tweetCover ?? ""}`;
}

function coverKeyForSave(save: Save, opts: MediaPickOptions): string {
  let byOpts = coverKeyCache.get(save);
  if (!byOpts) {
    byOpts = new Map();
    coverKeyCache.set(save, byOpts);
  }
  const fingerprint = optsCacheKey(opts);
  const cached = byOpts.get(fingerprint);
  if (cached !== undefined) return cached;
  const coverKey = aspectCoverKey(pickCardUnit(save, opts));
  byOpts.set(fingerprint, coverKey);
  return coverKey;
}

function measuredKey(saveId: string, coverKey: string): string {
  return coverKey ? `${saveId}:${coverKey}` : saveId;
}

/**
 * Video cards use stream/save dims only so a mismatched platform thumb cannot reshape the masonry.
 * @remarks YouTube Shorts thumbs are often 16:9 while the video is 9:16.
 */
export function aspectDimsFor(
  save: Save,
  opts: MediaPickOptions = {},
  unit = pickCardUnit(save, opts),
): { w: number | null; h: number | null } {
  const files = save.files ?? [];
  const primary = unit
    ? (files.find((f) => f.path === unit.key) ?? null)
    : null;
  if (unit?.isVideo) {
    const dims =
      dimPair(primary?.width, primary?.height) ??
      dimPair(save.width, save.height);
    return dims ?? { w: null, h: null };
  }
  const dims =
    dimPair(primary?.width, primary?.height) ??
    dimPair(save.width, save.height);
  return dims ?? { w: null, h: null };
}

function dimPair(
  w: number | null | undefined,
  h: number | null | undefined,
): { w: number; h: number } | null {
  if (
    w == null ||
    h == null ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return null;
  }
  return { w, h };
}

function touchMeasured(key: string, ratio: number): void {
  if (measuredAspects.has(key)) measuredAspects.delete(key);
  measuredAspects.set(key, ratio);
  while (measuredAspects.size > MAX_MEASURED) {
    const oldest = measuredAspects.keys().next().value;
    if (oldest === undefined) return;
    measuredAspects.delete(oldest);
  }
}

const StoredAspectsSchema = z.record(
  z.string(),
  z
    .number()
    .refine((n) => Number.isFinite(n) && n > 0)
    .nullable()
    .catch(null),
);

function hydrateFromStorage(): void {
  if (!("localStorage" in globalThis)) return;
  try {
    const raw = localStorage.getItem(MASONRY_ASPECT_CACHE_KEY);
    if (!raw) return;
    const parsed = StoredAspectsSchema.parse(JSON.parse(raw));
    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, number] => entry[1] !== null,
    );
    const start = Math.max(0, entries.length - MAX_MEASURED);
    for (const [id, value] of entries.slice(start)) {
      measuredAspects.set(id, value);
    }
  } catch {}
}

const persistSoon = debounce(
  () => {
    if (!("localStorage" in globalThis)) return;
    try {
      const obj: Record<string, number> = {};
      for (const [id, ratio] of measuredAspects) obj[id] = ratio;
      localStorage.setItem(MASONRY_ASPECT_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  },
  { wait: PERSIST_DEBOUNCE_MS },
);

hydrateFromStorage();

/** Aspect of the tile after `rotate`, so a quarter turn no longer uses the pixel box. */
export function layoutAspectFor(
  save: Save,
  opts: MediaPickOptions = {},
): number {
  return orientAspectRatio(aspectFor(save, opts), save.rotate);
}

export function aspectFor(save: Save, opts: MediaPickOptions = {}): number {
  const coverKey = coverKeyForSave(save, opts);
  const key = measuredKey(save.id, coverKey);
  const measured = measuredAspects.get(key);
  if (measured !== undefined) return measured;
  let byCover = fallbackCache.get(save);
  if (!byCover) {
    byCover = new Map();
    fallbackCache.set(save, byCover);
  }
  const cached = byCover.get(coverKey);
  if (cached !== undefined) return cached;
  const unit = pickCardUnit(save, opts);
  const { w, h } = aspectDimsFor(save, opts, unit);
  const ratio = w && h ? clampRatio(w, h) : 1;
  byCover.set(coverKey, ratio);
  return ratio;
}

const versionStore = new Store(0);
let rafScheduled = 0;
let burstTimer: ReturnType<typeof setTimeout> | 0 = 0;
let lastRecordAt = 0;

function flush() {
  rafScheduled = 0;
  if (burstTimer !== 0) {
    clearTimeout(burstTimer);
    burstTimer = 0;
  }
  versionStore.setState((v) => v + 1);
}

function schedule() {
  const now = "performance" in globalThis ? performance.now() : Date.now();
  const gap = now - lastRecordAt;
  lastRecordAt = now;

  if (gap < BURST_WINDOW_MS) {
    if (rafScheduled !== 0) {
      cancelAnimationFrame(rafScheduled);
      rafScheduled = 0;
    }
    if (burstTimer !== 0) clearTimeout(burstTimer);
    burstTimer = setTimeout(flush, BURST_DEBOUNCE_MS);
    return;
  }

  if (burstTimer !== 0) return;
  if (rafScheduled !== 0) return;
  if (!("requestAnimationFrame" in globalThis)) {
    flush();
    return;
  }
  rafScheduled = requestAnimationFrame(flush);
}

export function recordAspect(
  saveId: string,
  w: number,
  h: number,
  opts: { soft?: boolean; coverKey?: string } = {},
): void {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
  const ratio = clampRatio(w, h);
  const key = measuredKey(saveId, opts.coverKey ?? "");
  const prev = measuredAspects.get(key);
  const minDelta = opts.soft ? SOFT_MIN_DELTA : HARD_MIN_DELTA;
  if (prev !== undefined && Math.abs(prev - ratio) < minDelta) return;
  touchMeasured(key, ratio);
  persistSoon();
  schedule();
}

export function useAspectVersion(enabled = true): number {
  return useSelector(versionStore, (version) => (enabled ? version : 0));
}
