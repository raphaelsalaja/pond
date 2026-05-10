import type { Source } from "@pond/schema/db";

/**
 * Lowest-common-denominator inputs every list-harvester accepts.
 *
 * Sync has exactly one mode: walk the user's full list and surface
 * every entry not in `knownIds`. `knownIds` lets the harvester keep
 * its dedupe set warm so a virtualised re-render doesn't double-emit
 * the same row. `maxItems` is a per-run safety ceiling so a runaway
 * page can't pin the harvester forever.
 *
 * Mirrors the shape of `BookmarksHarvestArgs` in `twitter-bookmarks.ts`.
 * Phase 4's `harvestProfile<Source>` abstraction will lift this and
 * the result type into a typed interface; for now each per-source
 * harvester re-derives its own.
 */
export interface ListHarvestArgs {
  knownIds: string[];
  maxItems: number;
}

/** One row a list harvester produces — fed back through `harvestUrl` to enrich. */
export interface ListEntry {
  sourceId: string;
  url: string;
  /** ISO timestamp the user actually saved this, when the source exposes it. */
  savedAt?: string;
}

export type ListHarvestResult =
  | { ok: true; entries: ListEntry[]; reachedEnd: boolean }
  | { ok: false; reason: "auth_required" | "no_match" | "timeout" };

/**
 * Compile-time guard: every `Source` we wire into the sync orchestrator
 * should eventually implement a list-harvester. Sources that genuinely
 * have no list (e.g. `article`) stay unhandled and the orchestrator's
 * dispatch falls back to "unsupported".
 */
export type ListSource = Exclude<Source, "article">;
