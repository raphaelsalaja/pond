import { useEffect, useState } from "react";
import { pool } from "./pool";
import { normalise } from "./reconcile";
import type { Save } from "./types";

export function useSearchResults(query: string): {
  results: Save[] | null;
  searching: boolean;
} {
  const [results, setResults] = useState<Save[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const rows = (await window.pond.query("saves.search", {
          q: trimmed,
          limit: 500,
        })) as Array<Partial<Save>>;
        if (cancelled) return;
        const normalised = rows
          .map(normalise)
          .filter((r): r is Save => r !== null);
        // Keep the pool warm so click-through detail still resolves.
        for (const row of normalised) pool.upsert(row);
        setResults(normalised);
      } catch (err) {
        console.warn("[pond search] saves.search failed", err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return { results, searching };
}
