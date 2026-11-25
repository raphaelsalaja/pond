import type { ListKind } from "@pond/schema/db";
import type { ThreadsListKind } from "../refresh/harvest/threads/list";
import type {
  SavedEntry,
  SavedHarvestArgs,
  SavedHarvestResult,
} from "../refresh/harvest/threads/saved-types";
import { mergeEntryListKinds, stampListKind, unionById } from "./harvest-union";
import type { ListHarvestPlan } from "./import-scope";

type HarvestFailure = Extract<SavedHarvestResult, { ok: false }>;

export type ThreadsListHarvester = (
  kind: ThreadsListKind,
  args: SavedHarvestArgs,
) => Promise<SavedHarvestResult>;

export interface ThreadsListGap {
  kind: ThreadsListKind;
  reason: HarvestFailure["reason"];
}

export type ThreadsListsResult =
  | {
      ok: true;
      entries: Array<SavedEntry & { listKinds: Array<ListKind> }>;
      gaps: Array<ThreadsListGap>;
    }
  | (HarvestFailure & { kind: ThreadsListKind });

export function threadsListKinds(
  plan: Pick<ListHarvestPlan, "primary" | "liked">,
): Array<ThreadsListKind> {
  const kinds: Array<ThreadsListKind> = [];
  if (plan.primary) {
    kinds.push("saved");
  }
  if (plan.liked) {
    kinds.push("liked");
  }
  return kinds;
}

/** The first list you import decides whether the run fails; a later list that fails only leaves a gap. */
export async function harvestThreadsLists(
  kinds: ReadonlyArray<ThreadsListKind>,
  args: SavedHarvestArgs,
  harvest: ThreadsListHarvester,
  signal: AbortSignal,
): Promise<ThreadsListsResult> {
  let entries: Array<SavedEntry & { listKinds: Array<ListKind> }> = [];
  const gaps: Array<ThreadsListGap> = [];
  for (const [index, kind] of kinds.entries()) {
    if (signal.aborted) break;
    const result = await harvest(kind, args);
    if (!result.ok) {
      if (index === 0) return { ...result, kind };
      gaps.push({ kind, reason: result.reason });
      continue;
    }
    entries = unionById(
      entries,
      stampListKind(result.entries, kind),
      (entry) => entry.postId,
      mergeEntryListKinds,
    );
  }
  return { ok: true, entries, gaps };
}
