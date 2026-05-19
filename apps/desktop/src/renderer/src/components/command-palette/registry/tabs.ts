import { useMemo } from "react";
import { labelForPath } from "@/components/tab-bar/labels";
import { useTabStore } from "@/stores/tabs";
import type { Command } from "./types";

export function useTabCommands(): Command[] {
  const tabs = useTabStore((s) => s.tabs);
  const activeId = useTabStore((s) => s.activeId);

  return useMemo<Command[]>(
    () =>
      tabs
        .filter((t) => t.id !== activeId)
        .map((tab) => {
          const label = labelForPath(tab.path);
          return {
            id: `tab:${tab.id}`,
            label,
            description: tab.path === "/" ? undefined : tab.path,
            group: "Tabs" as const,
            scope: "tabs" as const,
            keywords: [label, tab.path, "tab"],
            perform: () => {
              useTabStore.getState().activate(tab.id);
            },
          };
        }),
    [tabs, activeId],
  );
}
