import { useEffect, useState } from "react";
import { pool } from "./pool";
import { normalise } from "./reconcile";
import type { Save } from "./types";

/**
 * Hook that turns a free-text query into a `Save[]` slice. Calls the
 * main-process FTS5 search (`saves.search`) with a 200ms debounce so we
 * don't hammer the executor on every keystroke. Empty query short-
 * circuits to `null` so the saves-view falls back to the pool snapshot.
 *
 * Hits the executor in the background and merges every returned row
 * back into the pool so click-through detail views stay subscribed to
 * the same `Save` instance the grid is rendering.
 */
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

/**
 * Vector k-NN around a single save. Used by the item-detail "related"
 * surface. Returns `null` while loading so callers can show a skeleton.
 */
export function useSimilarSaves(id: string | null | undefined): Save[] | null {
  const [results, setResults] = useState<Save[] | null>(null);

  useEffect(() => {
    if (!id) {
      setResults(null);
      return;
    }
    let cancelled = false;
    void window.pond
      .query("saves.similar", { id, limit: 12 })
      .then((rows) => {
        if (cancelled) return;
        const normalised = (rows as Array<Partial<Save>>)
          .map(normalise)
          .filter((r): r is Save => r !== null);
        for (const row of normalised) pool.upsert(row);
        setResults(normalised);
      })
      .catch((err) => {
        console.warn("[pond search] saves.similar failed", err);
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return results;
}
