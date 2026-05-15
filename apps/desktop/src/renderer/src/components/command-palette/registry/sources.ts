import { SOURCES, type Source } from "@pond/schema/db";
import { getSourceLabel } from "@/components/source-badge";
import type { Command } from "./types";

export const SOURCE_COMMANDS: Command[] = SOURCES.flatMap(
  (source: Source): Command[] => {
    const label = getSourceLabel(source);
    return [
      {
        id: `source.filter.${source}`,
        label: `Filter by ${label}`,
        group: "Sources",
        scope: "sources",
        keywords: [source, "source", "filter"],
        perform: ({ navigate, close }) => {
          navigate(`/source/${source}`, { viewTransition: true });
          close();
        },
      },
      {
        id: `source.sync.${source}`,
        label: `Sync ${label} now`,
        group: "Sources",
        scope: "sources",
        keywords: [source, "sync", "refresh", "fetch"],
        perform: async ({ pond, toast, close }) => {
          close();
          const result = await pond.syncRunNow(source);
          if (result.ok) toast.success(`${label} sync started`);
          else toast.warn(`${label}: ${result.reason.replace("_", " ")}`);
        },
      },
    ];
  },
);
