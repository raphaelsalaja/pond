import { useEffect, useMemo, useState } from "react";
import { useSaves } from "@/pool/hooks";
import { useSearchResults } from "@/pool/search";
import type { Save } from "@/pool/types";
import type { Command } from "./types";

interface TagRow {
  id: string;
  name: string;
}

export function useTagCommands(open: boolean): Command[] {
  const [tags, setTags] = useState<TagRow[]>([]);
  const saves = useSaves();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.pond
      .query("tags.list", {})
      .then((rows) => {
        if (cancelled) return;
        setTags(rows as TagRow[]);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const countsByLower = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      for (const t of s.tags) {
        const key = t.toLowerCase();
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [saves]);

  return useMemo(
    () =>
      tags
        .slice()
        .sort((a, b) => {
          const ca = countsByLower.get(a.name.toLowerCase()) ?? 0;
          const cb = countsByLower.get(b.name.toLowerCase()) ?? 0;
          if (ca !== cb) return cb - ca;
          return a.name.localeCompare(b.name);
        })
        .map<Command>((tag) => ({
          id: `tag.${tag.id}`,
          label: `Filter by #${tag.name}`,
          group: "Tags",
          scope: "tags",
          keywords: [tag.name, "tag", "filter", "label"],
          perform: ({ navigate, close }) => {
            navigate(`/?tag=${encodeURIComponent(tag.name)}`, {
              viewTransition: true,
            });
            close();
          },
        })),
    [tags, countsByLower],
  );
}

export function useSaveCommands(query: string): Command[] {
  const { results } = useSearchResults(query);
  if (!results) return [];
  return results.slice(0, 50).map<Command>((save: Save) => ({
    id: `save.open.${save.id}`,
    label: save.title?.trim() || save.url,
    description: hostname(save.url),
    group: "Saves",
    scope: "saves",
    keywords: [save.url, save.source, ...save.tags],
    perform: ({ navigate, close }) => {
      navigate(`/save/${save.id}`, { viewTransition: true });
      close();
    },
  }));
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
