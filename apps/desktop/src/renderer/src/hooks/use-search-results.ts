import { useEffect, useState } from "react";
import { ensureSaves } from "@/lib/save/ensure-saves";
import { searchFtsScores } from "@/lib/search/fts-client";
import type { Save } from "@/lib/types";
import { pool } from "@/stores/pool";
import { useSaves } from "./use-saves";

const MAX_RESULTS = 500;
const DEBOUNCE_MS = 100;

/** Survives LibraryView unmount (save detail) so remounting with the same query never falls back to the full library. */
let lastHits: { query: string; deletedOnly: boolean; ids: string[] } | null =
  null;

function resolveHits(query: string, deletedOnly: boolean): Save[] | null {
  const trimmed = query.trim();
  if (!trimmed || !lastHits) return null;
  if (lastHits.query !== trimmed || lastHits.deletedOnly !== deletedOnly) {
    return null;
  }
  const out: Save[] = [];
  for (const id of lastHits.ids) {
    const save = pool.get(id);
    if (!save) continue;
    if (deletedOnly ? !save.deletedAt : save.deletedAt) continue;
    out.push(save);
  }
  return out;
}

function commitHits(query: string, deletedOnly: boolean, saves: Save[]): void {
  lastHits = {
    query,
    deletedOnly,
    ids: saves.map((s) => s.id),
  };
}

/** Ranks by SQLite FTS5 (same index Ask keyword ranking uses). */
export function useSearchResults(
  query: string,
  opts?: { deletedOnly?: boolean },
): {
  results: Save[] | null;
  searching: boolean;
} {
  const _saves = useSaves();
  const deletedOnly = opts?.deletedOnly ?? false;
  const [results, setResults] = useState<Save[] | null>(() =>
    resolveHits(query, deletedOnly),
  );
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      lastHits = null;
      setResults(null);
      setSearching(false);
      return;
    }
    /** Never show the full library (or hits from the previous query) while this query is in flight. */
    setResults(resolveHits(trimmed, deletedOnly) ?? []);
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const scores = await searchFtsScores(trimmed, "all", {
            deletedOnly,
          });
          if (cancelled) return;
          if (scores.size === 0) {
            commitHits(trimmed, deletedOnly, []);
            setResults([]);
            return;
          }
          await ensureSaves([...scores.keys()]);
          if (cancelled) return;
          const scored: Array<{ save: Save; score: number }> = [];
          for (const [id, score] of scores) {
            const save = pool.get(id);
            if (!save) continue;
            if (deletedOnly ? !save.deletedAt : save.deletedAt) continue;
            scored.push({ save, score });
          }
          scored.sort((a, b) => b.score - a.score);
          const next = scored.slice(0, MAX_RESULTS).map((row) => row.save);
          commitHits(trimmed, deletedOnly, next);
          setResults(next);
        } catch (error) {
          if (!cancelled)
            console.warn("[pond search] keyword search failed", error);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, deletedOnly]);

  return { results, searching };
}
