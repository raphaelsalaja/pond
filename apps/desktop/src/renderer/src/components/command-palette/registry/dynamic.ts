import { useEffect, useState } from "react";
import { useSearchResults } from "@/pool/search";
import type { Save } from "@/pool/types";
import type { Command } from "./types";

interface TagRow {
  id: string;
  name: string;
  usageCount: number;
}

export function useTagCommands(open: boolean): Command[] {
  const [tags, setTags] = useState<TagRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.pond
      .query("tags.list", {})
      .then((rows) => {
        if (cancelled) return;
        const list = (rows as TagRow[]).slice().sort((a, b) => {
          const u = (b.usageCount ?? 0) - (a.usageCount ?? 0);
          if (u !== 0) return u;
          return a.name.localeCompare(b.name);
        });
        setTags(list);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return tags.map<Command>((tag) => ({
    id: `tag.${tag.id}`,
    label: `Filter by #${tag.name}`,
    group: "Tags",
    scope: "tags",
    keywords: [tag.name, "tag", "filter"],
    perform: ({ navigate, close }) => {
      navigate(`/?tag=${encodeURIComponent(tag.name)}`, {
        viewTransition: true,
      });
      close();
    },
  }));
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
