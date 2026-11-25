import type { LibraryQueryRequest } from "@shared/library-query";
import log from "electron-log/renderer";
import { useEffect, useMemo, useState } from "react";
import { useSemanticQuery, useVisualProbe } from "@/features/library";
import type { VisualProbe } from "@/features/library";
import { ensureSaves, pool } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { retrieveSaveIds } from "@/features/search/lib/retrieve-client";
import { usePrefs } from "@/shared/state/prefs";

const LIMIT = 500;
const SCOPE_CAP = 10_000;

function visualInput(probe: VisualProbe) {
  return probe.kind === "saveId"
    ? { kind: "saveId" as const, id: probe.id }
    : {
        kind: "vector" as const,
        model: probe.model,
        values: probe.values,
      };
}

/**
 * Retrieval depends on which Saves are in scope, not on their contents, so it runs again only
 * when that ID list changes. Ranked IDs map to current rows at render, so an edit to a ranked
 * Save still shows without another retrieval.
 */
export function useRetrievalOverlay(
  saves: ReadonlyArray<Save>,
  libraryQuery?: LibraryQueryRequest,
): ReadonlyArray<Save> {
  const [ai] = usePrefs("ai");
  const semanticQuery = useSemanticQuery();
  const visualProbe = useVisualProbe();
  const semantic = ai?.semanticSearch === true ? semanticQuery : null;
  const visual = ai?.enableClip === true ? visualProbe : null;
  const active = Boolean(semantic || visual);
  const scopeKey = useMemo(
    () => (active ? saves.map((save) => save.id).join("\n") : ""),
    [active, saves],
  );
  const [rankedIds, setRankedIds] = useState<Array<string> | null>(null);
  const [inputs, setInputs] = useState({
    semantic,
    visual,
    scopeKey,
    libraryQuery,
  });

  if (
    inputs.semantic !== semantic ||
    inputs.visual !== visual ||
    inputs.scopeKey !== scopeKey ||
    inputs.libraryQuery !== libraryQuery
  ) {
    setInputs({ semantic, visual, scopeKey, libraryQuery });
    if (!active) setRankedIds(null);
  }

  useEffect(() => {
    if (!semantic && !visual) {
      return;
    }
    const scoped = scopeKey ? scopeKey.split("\n").slice(0, SCOPE_CAP) : [];
    let cancelled = false;
    void (async () => {
      try {
        const ids = await retrieveSaveIds({
          query: semantic ?? undefined,
          visual: visual ? visualInput(visual) : undefined,
          saveIds: libraryQuery ? undefined : scoped,
          libraryQuery,
          limit: LIMIT,
        });
        if (cancelled) return;
        await ensureSaves(ids);
        if (cancelled) return;
        setRankedIds(ids);
      } catch (error) {
        if (!cancelled) {
          log.warn("[pond overlay] retrieval failed", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [semantic, visual, scopeKey, libraryQuery]);

  const ranked = useMemo(() => {
    if (rankedIds === null) return null;
    const byId = new Map(
      saves.slice(0, SCOPE_CAP).map((save) => [save.id, save] as const),
    );
    return rankedIds.flatMap((id) => {
      const save = libraryQuery ? pool.get(id) : byId.get(id);
      return save ? [save] : [];
    });
  }, [rankedIds, saves, libraryQuery]);

  if (!active || ranked === null) {
    return saves;
  }
  return ranked;
}
