import type { Prefs } from "@pond/schema/db";
import { useEffect, useState } from "react";

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

export function getPrefsSnapshot(): Prefs | null {
  return cache;
}

export async function reloadPrefs(): Promise<Prefs> {
  cache = null;
  inflight = null;
  const next = await load();
  emit(next);
  return next;
}
