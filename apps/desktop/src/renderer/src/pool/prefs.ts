import type { Prefs } from "@pond/schema/db";
import { useEffect, useState } from "react";

/**
 * Tiny shared cache + subscriber set for the section-keyed prefs blob.
 *
 * The blob lives in main on the `settings` singleton row; we round-trip
 * through `settings.getPrefs` / `settings.setPrefs` IPCs. Every page
 * that calls `usePrefs(...)` shares the same in-memory copy so a Switch
 * flip on the Notifications page is visible on the Save Behavior page
 * before its IPC handler returns.
 *
 * No dependency on Zustand / Jotai on purpose — this is one tree of
 * pure data and a Set of listeners. Pulling in a store library would
 * add API surface for almost no gain.
 */

let cache: Prefs | null = null;
let inflight: Promise<Prefs> | null = null;
const listeners = new Set<(p: Prefs) => void>();

async function load(): Promise<Prefs> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const next = (await window.pond.query("settings.getPrefs", {})) as Prefs;
    cache = next;
    inflight = null;
    return next;
  })();
  return inflight;
}

function emit(next: Prefs) {
  cache = next;
  for (const fn of listeners) fn(next);
}

/**
 * Read + patch a single section. Returns `[value, patch, ready]` —
 * the patch fn deep-merges its argument onto the section without
 * touching siblings, mirroring `setPrefs` in main.
 */
export function usePrefs<K extends keyof Prefs>(
  section: K,
): [Prefs[K], (patch: Partial<Prefs[K]>) => void, boolean] {
  const [value, setValue] = useState<Prefs[K] | null>(
    cache ? cache[section] : null,
  );

  useEffect(() => {
    let active = true;
    const update = (next: Prefs) => {
      if (!active) return;
      setValue(next[section]);
    };
    listeners.add(update);
    void load().then(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, [section]);

  const patch = (delta: Partial<Prefs[K]>) => {
    if (!cache) return;
    const merged: Prefs = {
      ...cache,
      [section]: { ...cache[section], ...delta },
    };
    emit(merged);
    void window.pond
      .query("settings.setPrefs", { [section]: delta } as Partial<Prefs>)
      .catch(() => {
        // Roll back on failure so the UI stops lying.
        if (cache) emit(cache);
      });
  };

  return [value ?? ({} as Prefs[K]), patch, value !== null];
}

/**
 * Snapshot accessor for non-React callers (e.g. ToastProvider's gate
 * for individual notification kinds). Returns `null` until the first
 * load completes — caller falls back to "always show".
 */
export function getPrefsSnapshot(): Prefs | null {
  return cache;
}

/** Force a reload, e.g. after a "Reset preferences" call in main. */
export async function reloadPrefs(): Promise<Prefs> {
  cache = null;
  inflight = null;
  const next = await load();
  emit(next);
  return next;
}
