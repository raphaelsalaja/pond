import { useEffect, useState } from "react";
import { ensureSaves } from "@/features/saves/pool";
import { searchFtsScores } from "@/features/search/lib/fts-client";
import { retrieveSaveIds } from "@/features/search/lib/retrieve-client";

const KEYWORD_LIMIT = 8;
const TOTAL_LIMIT = 10;
const KEYWORD_DELAY_MS = 60;
const SEMANTIC_DELAY_MS = 250;
const CACHE_SIZE = 32;

export interface SaveHit {
  id: string;
  via: "keyword" | "semantic";
}

export interface SaveLookup {
  query: string;
  hits: readonly SaveHit[];
  searching: boolean;
}

interface LookupState extends SaveLookup {
  key: string;
}

const cache = new Map<string, readonly SaveHit[]>();

function remember(key: string, hits: readonly SaveHit[]): void {
  cache.delete(key);
  cache.set(key, hits);
  const oldest = cache.keys().next().value;
  if (cache.size > CACHE_SIZE && oldest !== undefined) cache.delete(oldest);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function lookup(
  query: string,
  retrieve: boolean,
  signal: AbortSignal,
  publish: (hits: readonly SaveHit[], done: boolean) => void,
): Promise<void> {
  await wait(KEYWORD_DELAY_MS, signal);
  const keywordIds = [
    ...(await searchFtsScores(query, "all", { limit: KEYWORD_LIMIT })).keys(),
  ];
  signal.throwIfAborted();
  await ensureSaves(keywordIds);
  signal.throwIfAborted();
  const hits: SaveHit[] = keywordIds.map((id) => ({ id, via: "keyword" }));
  if (!retrieve) {
    publish(hits, true);
    return;
  }
  publish(hits, false);

  await wait(SEMANTIC_DELAY_MS, signal);
  const seen = new Set(keywordIds);
  const extra = (await retrieveSaveIds({ query, limit: TOTAL_LIMIT }))
    .filter((id) => !seen.has(id))
    .slice(0, Math.max(0, TOTAL_LIMIT - hits.length));
  signal.throwIfAborted();
  await ensureSaves(extra);
  signal.throwIfAborted();
  publish(
    [...hits, ...extra.map((id) => ({ id, via: "semantic" as const }))],
    true,
  );
}

/** A few top save ids for a query, keyword hits first and semantic hits appended, with its own cache. */
export function useSaveLookup(
  query: string,
  options: { retrieve: boolean },
): SaveLookup {
  const trimmed = query.trim();
  const { retrieve } = options;
  const key = `${retrieve ? "semantic" : "keyword"}:${trimmed}`;
  const [state, setState] = useState<LookupState | null>(null);

  useEffect(() => {
    if (!trimmed || cache.has(key)) return;
    const controller = new AbortController();
    lookup(trimmed, retrieve, controller.signal, (hits, done) => {
      if (done) remember(key, hits);
      setState({ key, query: trimmed, hits, searching: !done });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      console.warn("[pond search] save lookup failed", error);
      setState({ key, query: trimmed, hits: [], searching: false });
    });
    return () => controller.abort();
  }, [key, trimmed, retrieve]);

  if (!trimmed) return { query: "", hits: [], searching: false };
  if (state?.key === key) return state;
  const cached = cache.get(key);
  if (cached) return { query: trimmed, hits: cached, searching: false };
  return {
    query: trimmed,
    hits: state && refines(trimmed, state.query) ? state.hits : [],
    searching: true,
  };
}

/** Hold the last hits while one query extends the other, so saves don't blink out between keystrokes. */
function refines(next: string, previous: string): boolean {
  return next.startsWith(previous) || previous.startsWith(next);
}
