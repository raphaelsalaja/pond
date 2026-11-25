import type { BrowserValidators } from "../lib/browser-validation";
import { browserValidationSource } from "../lib/browser-validation-source";
/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageRedditNormalize } from "./normalize";

type ListHarvestFailure = Extract<ListHarvestResult, { ok: false }>;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue };

interface RedditPost {
  id?: JsonValue;
  permalink?: JsonValue;
  thumbnail?: JsonValue;
  preview?: { images?: Array<{ source?: { url?: JsonValue } }> };
  title?: JsonValue;
  selftext?: JsonValue;
  author?: JsonValue;
  created_utc?: JsonValue;
}

interface RedditListing {
  error?: JsonValue;
  reason?: JsonValue;
  data?: {
    children?: Array<{ kind?: JsonValue; data?: RedditPost } | null>;
    after?: JsonValue;
  };
}

export function redditSavedUrl(handle: string): string {
  return `https://www.reddit.com/user/${encodeURIComponent(handle)}/saved/`;
}

export function buildRedditListExpression(args: ListHarvestArgs): string {
  const normSrc = `(${inPageRedditNormalize.toString()})()`;
  const fnSrc = `(${inPageRedditList.toString()})`;
  return `(async () => {
    ${browserValidationSource}
    const validators = PondHarvestValidation.browserValidators;
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, norm, validators); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageRedditList(
  args: ListHarvestArgs,
  norm: ReturnType<typeof inPageRedditNormalize>,
  validators: BrowserValidators,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.includes("/register")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  type Entry = {
    sourceId: string;
    url: string;
    savedAt?: string;
    title?: string;
    description?: string;
    author?: string;
    mediaUrl?: string;
    mediaUrls?: Array<{ url: string; type?: MediaType; poster?: string }>;
    mediaType?: MediaType;
  };

  const asText = (value: JsonValue | undefined): string | undefined =>
    validators.text.safeParse(value).data;
  const asNumber = (value: JsonValue | undefined): number | undefined =>
    validators.number.safeParse(value).data;
  const isListing = (value: unknown): value is RedditListing =>
    validators.object.safeParse(value).success;

  const username =
    location.pathname.match(/^\/user\/([^/]+)\/saved/i)?.[1] ??
    location.pathname.match(/^\/u\/([^/]+)\/saved/i)?.[1];
  if (!username || username.toLowerCase() === "me") {
    return { ok: false, reason: "auth_required" };
  }

  const apiResult = await fetchSavedViaApi(username);
  if (apiResult) return apiResult;
  return await fallbackDomScroll();

  async function fetchSavedViaApi(
    handle: string,
  ): Promise<ListHarvestResult | null> {
    const entries: Array<Entry> = [];
    let after: string | undefined;
    const known = new Set(args.knownIds.map(String));
    const earlyStopEnabled = known.size > 0;
    let knownPageStreak = 0;
    const STOP_AFTER_KNOWN_PAGES = 2;

    function reportProgress(phase: string) {
      Object.assign(globalThis, {
        __pondHarvestStats: {
          phase,
          collected: entries.length,
          fresh: entries.filter((e) => !known.has(e.sourceId)).length,
        },
      });
    }

    reportProgress("connecting");

    for (let page = 0; page < 200; page++) {
      const params = new URLSearchParams({
        limit: "100",
        raw_json: "1",
        type: "links",
      });
      if (after) params.set("after", after);
      const url = `/user/${encodeURIComponent(handle)}/saved.json?${params}`;

      let json: RedditListing | null;
      try {
        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            accept: "application/json",
          },
        });

        if (res.status === 401 || res.status === 403) {
          return { ok: false, reason: "auth_required" };
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const n = retryAfter ? Number(retryAfter) : Number.NaN;
          const limited: ListHarvestFailure = {
            ok: false,
            reason: "rate_limited",
          };
          if (Number.isFinite(n)) limited.retryAfterSec = Math.max(0, n);
          return limited;
        }
        if (!res.ok) return null;

        const body: unknown = await res.json();
        json = isListing(body) ? body : null;
      } catch {
        return null;
      }

      if (json?.error === 403 || json?.reason === "private") {
        return { ok: false, reason: "auth_required" };
      }

      const children = json?.data?.children ?? [];
      if (children.length === 0 && page === 0) {
        return null;
      }

      let pageFresh = 0;
      for (const child of children) {
        if (child?.kind !== "t3") {
          continue;
        }
        const data: RedditPost = child.data ?? {};
        const id = asText(data.id) ?? null;
        if (!id) continue;
        const permalink = asText(data.permalink) ?? `/comments/${id}/`;
        const urlAbs = permalink.startsWith("http")
          ? permalink
          : `https://www.reddit.com${permalink}`;
        const thumbnail = asText(data.thumbnail);
        const previewUrl = asText(data.preview?.images?.[0]?.source?.url);
        const thumb = thumbnail?.startsWith("http")
          ? thumbnail
          : previewUrl?.replaceAll("&amp;", "&");
        const title = asText(data.title);
        const selftext = asText(data.selftext);
        const author = asText(data.author);
        const createdUtc = asNumber(data.created_utc);
        const entry: Entry = { sourceId: id, url: urlAbs };
        if (title !== undefined) entry.title = title;
        if (selftext) {
          entry.description =
            selftext.length > 4000 ? `${selftext.slice(0, 4000)}…` : selftext;
        }
        if (author !== undefined) entry.author = author;
        if (thumb) {
          entry.mediaUrl = thumb;
          entry.mediaUrls = [{ url: thumb, type: "image" }];
          entry.mediaType = "image";
        }
        if (createdUtc !== undefined) {
          entry.savedAt = new Date(createdUtc * 1000).toISOString();
        }
        if (!known.has(id)) pageFresh += 1;
        entries.push(entry);
      }

      reportProgress("fetching");

      if (earlyStopEnabled && children.length > 0 && pageFresh === 0) {
        knownPageStreak += 1;
        if (knownPageStreak >= STOP_AFTER_KNOWN_PAGES) {
          reportProgress("done");
          return { ok: true, entries, reachedEnd: true };
        }
      } else {
        knownPageStreak = 0;
      }

      const next = asText(json?.data?.after);
      if (!next) {
        reportProgress("done");
        return { ok: true, entries, reachedEnd: true };
      }
      after = next;
      await new Promise((r) => {
        setTimeout(r, 500);
      });
    }

    return { ok: true, entries, reachedEnd: false };
  }

  async function fallbackDomScroll(): Promise<ListHarvestResult> {
    const known = new Set(args.knownIds.map(String));
    type StubEntry = { sourceId: string; url: string };

    function collect(): Array<StubEntry> {
      const out: Array<StubEntry> = [];
      const seen = new Set<string>();
      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="/comments/"], shreddit-post a[slot="full-post-link"]',
        ),
      );
      for (const a of links) {
        const id = norm.extractPostId(a.href);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        let href = a.href;
        try {
          href = new URL(a.href, location.origin).href;
        } catch {
          /** An unparseable href keeps the anchor's own value. */
        }
        out.push({ sourceId: id, url: href });
      }
      for (const post of Array.from(
        document.querySelectorAll("shreddit-post"),
      )) {
        const id = post.getAttribute("id")?.replace(/^t3_/, "") ?? null;
        const permalink = post.getAttribute("permalink");
        if (!id || seen.has(id) || !permalink) continue;
        seen.add(id);
        out.push({
          sourceId: id,
          url: permalink.startsWith("http")
            ? permalink
            : `https://www.reddit.com${permalink}`,
        });
      }
      return out;
    }

    const hydrateDeadline = Date.now() + 12_000;
    while (Date.now() < hydrateDeadline) {
      if (
        document.querySelector("shreddit-post") ||
        document.querySelector('a[href*="/comments/"]')
      ) {
        break;
      }
      await new Promise((r) => {
        setTimeout(r, 250);
      });
    }

    const collected = new Map<string, StubEntry>();
    function ingestRows(rows: Array<StubEntry>): void {
      for (const r of rows) {
        if (!collected.has(r.sourceId)) collected.set(r.sourceId, r);
      }
    }

    ingestRows(collect());
    const earlyStopEnabled = known.size > 0;
    let knownBatchStreak = 0;
    let stable = 0;
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline && stable < 4) {
      const before = collected.size;
      window.scrollBy(0, Math.max(600, window.innerHeight * 0.9));
      await new Promise((r) => {
        setTimeout(r, 700);
      });
      const batch = collect();
      let pageFresh = 0;
      for (const row of batch) {
        if (!collected.has(row.sourceId)) {
          collected.set(row.sourceId, row);
          if (!known.has(row.sourceId)) pageFresh += 1;
        } else if (!known.has(row.sourceId)) {
          pageFresh += 1;
        }
      }
      Object.assign(globalThis, {
        __pondHarvestStats: {
          phase: "scrolling",
          collected: collected.size,
          fresh: [...collected.keys()].filter((id) => !known.has(id)).length,
        },
      });
      if (collected.size === before) stable += 1;
      else stable = 0;
      if (earlyStopEnabled && batch.length > 0 && pageFresh === 0) {
        knownBatchStreak += 1;
        if (knownBatchStreak >= 3) break;
      } else {
        knownBatchStreak = 0;
      }
    }

    return {
      ok: true,
      entries: Array.from(collected.values()),
      reachedEnd: true,
    };
  }
}
