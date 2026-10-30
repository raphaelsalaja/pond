/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { browserValidationSource } from "../lib/browser-validation-source";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import { inPageMarkedNormalize } from "./normalize";

/** A signed-in page, so Clerk's middleware refreshes the minute-long `__session` cookie before the walk calls the API. */
export const MARKED_LIST_URL = "https://marked.dev/collections";

export function buildMarkedListExpression(args: ListHarvestArgs): string {
  const normSrc = `(${inPageMarkedNormalize.toString()})(validators)`;
  const fnSrc = `(${inPageMarkedLibrary.toString()})`;
  return `(async () => {
    ${browserValidationSource}
    const validators = PondHarvestValidation.browserValidators;
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/** Reads the same `listLibraryRefs` call the Collections screen makes; it returns every saved ref at once. */
async function inPageMarkedLibrary(
  args: ListHarvestArgs,
  norm: ReturnType<typeof inPageMarkedNormalize>,
): Promise<ListHarvestResult> {
  const call = (method: string): Promise<Response> =>
    fetch(`/api/data/${method}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ args: [] }),
    });
  const failure = (status: number): ListHarvestResult => {
    if (status === 401 || status === 403) {
      return { ok: false, reason: "auth_required" };
    }
    return { ok: false, reason: status === 429 ? "rate_limited" : "unknown" };
  };

  const session = await call("getSession");
  if (!session.ok) return failure(session.status);
  const signedIn: { data?: JsonValue } = await session.json();
  if (!signedIn.data) return { ok: false, reason: "auth_required" };

  const res = await call("listLibraryRefs");
  if (!res.ok) return failure(res.status);
  const body: { data?: JsonValue } = await res.json();
  const refs = norm.parseRefs(body.data ?? null);
  if (!refs) return { ok: false, reason: "unknown" };

  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const known = new Set(args.knownIds);
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  let fresh = 0;
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const entry = norm.refEntry(ref);
    const savedAt = entry.savedAt ? Date.parse(entry.savedAt) : Number.NaN;
    if (Number.isFinite(since) && Number.isFinite(savedAt) && savedAt < since) {
      continue;
    }
    if (!known.has(entry.sourceId)) fresh += 1;
    entries.push(entry);
  }
  Object.assign(globalThis, {
    __pondHarvestStats: { phase: "done", collected: entries.length, fresh },
  });
  return Number.isFinite(since)
    ? { ok: true, entries, reachedEnd: true, seen: entries.length }
    : {
        ok: true,
        entries,
        reachedEnd: true,
        seen: entries.length,
        complete: true,
      };
}
