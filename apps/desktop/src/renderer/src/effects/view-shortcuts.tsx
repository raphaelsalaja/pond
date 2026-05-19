import { useEffect } from "react";
import { toggleInspector } from "@/lib/use-inspector";
import { toggleSidebar } from "@/lib/use-sidebar";

export function ViewShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.altKey || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isInput) return;

      if (e.key === "1" || e.code === "Digit1") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.key === "2" || e.code === "Digit2") {
        e.preventDefault();
        toggleInspector();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
