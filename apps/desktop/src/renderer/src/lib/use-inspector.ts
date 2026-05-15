import { useCallback, useEffect, useState } from "react";
import { readViewPref, writeViewPref } from "@/lib/view-prefs";

const EVENT_NAME = "pond:inspector-pref";

export function useInspector(): {
  open: boolean;
  toggle: () => void;
  setOpen: (next: boolean) => void;
} {
  const [open, setOpenState] = useState<boolean>(() => readPref());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setOpenState(next);
    };
    window.addEventListener(EVENT_NAME, onCustom);
    return () => window.removeEventListener(EVENT_NAME, onCustom);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    writeViewPref("inspector", next ? "open" : "closed");
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, []);

  const toggle = useCallback(() => {
    setOpen(!readPref());
  }, [setOpen]);

  return { open, toggle, setOpen };
}

function readPref(): boolean {
  // Inspector defaults to open — the whole point of this layout is that
  // users see the metadata without having to ask for it.
  const v = readViewPref("inspector");
  if (v === "closed") return false;
  return true;
}
