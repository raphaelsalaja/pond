import { useEffect } from "react";
import { useTabStore } from "@/stores/tabs";

export function TabShortcuts() {
  useEffect(() => {
    const unsubs = [
      window.pond.onTabNew(() => useTabStore.getState().open("/")),
      window.pond.onTabClose(() => {
        const { activeId } = useTabStore.getState();
        useTabStore.getState().close(activeId);
      }),
      window.pond.onTabReopen(() => useTabStore.getState().reopenClosed()),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // Ctrl+Tab / Ctrl+Shift+Tab (tab cycling)
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (shift) {
          useTabStore.getState().activatePrev();
        } else {
          useTabStore.getState().activateNext();
        }
        return;
      }

      // Cmd+Option+Arrow for tab cycling (macOS style)
      if (meta && e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        useTabStore.getState().activateNext();
        return;
      }
      if (meta && e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        useTabStore.getState().activatePrev();
        return;
      }

      // Cmd+1 through Cmd+9 to jump to tab by index
      if (meta && !shift && !e.altKey) {
        const num = Number.parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const tabs = useTabStore.getState().tabs;
          const idx = num === 9 ? tabs.length - 1 : num - 1;
          useTabStore.getState().activateByIndex(idx);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
