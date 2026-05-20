import { useCallback, useEffect, useState } from "react";
import {
  readViewPref,
  type ViewPrefKey,
  writeViewPref,
} from "@/lib/view-prefs";

export interface PanePref {
  open: boolean;
  toggle: () => void;
  setOpen: (next: boolean) => void;
}

export interface PanePrefStore {
  eventName: string;
  read: () => boolean;
  set: (next: boolean) => void;
  toggle: () => void;
}

export function createPanePrefStore(
  key: Extract<ViewPrefKey, "inspector" | "sidebar">,
  options: { defaultOpen: boolean },
): PanePrefStore {
  const eventName = `pond:${key}-pref`;

  function read(): boolean {
    const v = readViewPref(key);
    if (v === "closed") return false;
    if (v === "open") return true;
    return options.defaultOpen;
  }

  function set(next: boolean): void {
    writeViewPref(key, next ? "open" : "closed");
    window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
  }

  function toggle(): void {
    set(!read());
  }

  return { eventName, read, set, toggle };
}

export function usePanePref(store: PanePrefStore): PanePref {
  const [open, setOpenState] = useState<boolean>(() => store.read());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setOpenState(next);
    };
    window.addEventListener(store.eventName, onCustom);
    return () => window.removeEventListener(store.eventName, onCustom);
  }, [store.eventName]);

  const setOpen = useCallback((next: boolean) => store.set(next), [store]);
  const toggle = useCallback(() => store.toggle(), [store]);

  return { open, toggle, setOpen };
}
