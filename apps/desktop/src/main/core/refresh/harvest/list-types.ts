import type { Source } from "@pond/schema/db";

/**
 * Lowest-common-denominator inputs every list-harvester accepts.
 *
 * `knownIds` is the set of `<source>:<sourceId>` ids the local DB
 * already has — incremental mode bails the moment one shows up in
 * the scroll. `maxItems` is a hard ceiling per run so a runaway
 * page can't pin the harvester forever.
 *
 * Mirrors the shape of `BookmarksHarvestArgs` in `twitter-bookmarks.ts`.
 * Phase 4's `harvestProfile<Source>` abstraction will lift this and
 * the result type into a typed interface; for now each per-source
 * harvester re-derives its own.
 */
export interface ListHarvestArgs {
  knownIds: string[];
  mode: "incremental" | "backfill";
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
