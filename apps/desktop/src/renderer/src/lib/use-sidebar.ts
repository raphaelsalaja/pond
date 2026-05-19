import { useCallback, useEffect, useState } from "react";
import { readViewPref, writeViewPref } from "@/lib/view-prefs";

const EVENT_NAME = "pond:sidebar-pref";

export function useSidebar(): {
  open: boolean;
  toggle: () => void;
  setOpen: (next: boolean) => void;
} {
  const [open, setOpenState] = useState<boolean>(() => readSidebarPref());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setOpenState(next);
    };
    window.addEventListener(EVENT_NAME, onCustom);
    return () => window.removeEventListener(EVENT_NAME, onCustom);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setSidebarOpen(next);
  }, []);

  const toggle = useCallback(() => {
    toggleSidebar();
  }, []);

  return { open, toggle, setOpen };
}

export function readSidebarPref(): boolean {
  const v = readViewPref("sidebar");
  if (v === "closed") return false;
  return true;
}

export function setSidebarOpen(next: boolean): void {
  writeViewPref("sidebar", next ? "open" : "closed");
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
}

export function toggleSidebar(): void {
  setSidebarOpen(!readSidebarPref());
}
