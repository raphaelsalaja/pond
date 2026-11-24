import { setTimeout as delay } from "node:timers/promises";
import type { WatchKind } from "@pond/schema/db";
import log from "electron-log/main.js";
import { z } from "zod";
import type { WatchEntry, WatchHarvestResult } from "./types";

/**
 * Are.na watch listing via the public v3 API. No auth, no window.
 * @remarks v2 is being wound down: its user-contents endpoint 301s to a disabled route that returns 410 Gone.
 */

const API_BASE = "https://api.are.na/v3";
const REQUEST_TIMEOUT_MS = 15_000;
const PER_PAGE = 60;

const ArenaV3ItemSchema = z.object({
  id: z.union([z.number(), z.string()]).nullish().catch(null),
  base_type: z.string().nullish().catch(null),
  type: z.string().nullish().catch(null),
  created_at: z.string().nullish().catch(null),
  connection: z
    .object({ connected_at: z.string().nullish().catch(null) })
    .nullish()
    .catch(null),
});

const ArenaContentsSchema = z.object({
  data: z.array(ArenaV3ItemSchema).nullish().catch(null),
});

type ArenaContentsResponse = z.infer<typeof ArenaContentsSchema>;

type FetchResult =
  | { ok: true; value: ArenaContentsResponse }
  | { ok: false; status: number };

async function fetchContents(url: string, attempt = 0): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "omit",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    log.warn("[pond watch:arena] fetch failed", url, error);
    return { ok: false, status: 0 };
  }
  if (res.status === 429 && attempt === 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await delay(
      Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1000,
    );
    return fetchContents(url, attempt + 1);
  }
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  try {
    return { ok: true, value: ArenaContentsSchema.parse(await res.json()) };
  } catch {
    return { ok: false, status: res.status };
  }
}

function entriesFromContents(value: ArenaContentsResponse): Array<WatchEntry> {
  const withTime: Array<{ entry: WatchEntry; at: number }> = [];
  for (const item of value.data ?? []) {
    const rawId = item?.id;
    const id = rawId !== null && rawId !== undefined ? String(rawId) : null;
    if (!id) {
      continue;
    }
    const cls = (item.base_type ?? item.type ?? "").toLowerCase();
    if (cls === "channel") {
      continue;
    }
    const stamp = item.connection?.connected_at ?? item.created_at ?? null;
    withTime.push({
      entry: { url: `https://www.are.na/block/${id}`, sourceId: id },
      at: stamp ? Date.parse(stamp) : 0,
    });
  }
  withTime.sort((a, b) => b.at - a.at);
  return withTime.map((x) => x.entry);
}

function contentsUrl(kind: "channel" | "user" | "group", slug: string): string {
  const s = encodeURIComponent(slug);
  if (kind === "channel") {
    return `${API_BASE}/channels/${s}/contents?per=${PER_PAGE}&sort=position_desc`;
  }
  const path = kind === "user" ? "users" : "groups";
  return `${API_BASE}/${path}/${s}/contents?per=${PER_PAGE}&sort=created_at_desc`;
}

export async function listArenaWatch(
  handle: string,
  kind?: WatchKind,
): Promise<WatchHarvestResult> {
  const order: Array<"channel" | "user" | "group"> =
    kind === "user"
      ? ["user"]
      : kind === "group"
        ? ["group"]
        : kind === "channel"
          ? ["channel"]
          : ["channel", "user"];

  let sawRateLimit = false;
  let allNotFound = true;
  for (const k of order) {
    const res = await fetchContents(contentsUrl(k, handle));
    if (res.ok) {
      return { ok: true, entries: entriesFromContents(res.value) };
    }
    if (res.status === 429) {
      sawRateLimit = true;
    }
    if (res.status !== 404) {
      allNotFound = false;
    }
  }
  if (sawRateLimit) {
    return { ok: false, reason: "rate_limited" };
  }
  if (allNotFound) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: false, reason: "unavailable" };
}
