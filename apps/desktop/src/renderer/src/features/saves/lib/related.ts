import type { QueryResult } from "@shared/query-contracts";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";

export type RelatedItem = QueryResult<"saves.related">["items"][number];

/** Short-lived, so a library change shows up the next time the tab opens. */
const TTL_MS = 30_000;
const LIMIT = 12;
const MAX_ENTRIES = 32;

const pending = new Map<string, Promise<Array<RelatedItem>>>();
const settled = new Map<string, { items: Array<RelatedItem>; at: number }>();

export function peekRelated(id: string): Array<RelatedItem> | null {
  const entry = settled.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    settled.delete(id);
    return null;
  }
  return entry.items;
}

export function loadRelated(
  id: string,
  fresh = false,
): Promise<Array<RelatedItem>> {
  const cached = fresh ? null : peekRelated(id);
  if (cached) return Promise.resolve(cached);
  const inflight = pending.get(id);
  if (inflight && !fresh) return inflight;
  const request = window.pond
    .query("saves.related", { id, limit: LIMIT })
    .then(async (result) => {
      await ensureSaves(result.items.map((item) => item.id));
      settled.delete(id);
      settled.set(id, { items: result.items, at: Date.now() });
      if (settled.size > MAX_ENTRIES) {
        const oldest = settled.keys().next().value;
        if (oldest !== undefined) settled.delete(oldest);
      }
      return result.items;
    })
    .finally(() => {
      if (pending.get(id) === request) pending.delete(id);
    });
  pending.set(id, request);
  return request;
}
