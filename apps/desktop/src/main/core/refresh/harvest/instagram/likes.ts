/// <reference lib="dom" />

import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";

export const INSTAGRAM_LIKES_URL =
  "https://www.instagram.com/your_activity/interactions/likes/";

interface LikesRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

declare global {
  var __pondIgBloksCaptures: Array<string> | undefined;
  var __pondIgLikesRequest: LikesRequest | undefined;
  var __pondHarvestPartial:
    | Array<{ sourceId: string; url: string }>
    | undefined;
}

interface LikesArgs extends ListHarvestArgs {
  deadlineMs: number;
  pageDelayMs: number;
  maxPages: number;
}

/** No cursor survives a run, so a backfill has to reach the end of the history in one pass. */
const BACKFILL_DEADLINE_MS = 25 * 60_000;
const INCREMENTAL_DEADLINE_MS = 3 * 60_000;
const PAGE_DELAY_MS = 2500;
const MAX_PAGES = 800;

export const INSTAGRAM_LIKES_TIMEOUT_MS = BACKFILL_DEADLINE_MS + 60_000;

export function buildInstagramLikesExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageInstagramLikes.toString()})`;
  const enriched: LikesArgs = {
    ...args,
    deadlineMs: args.earlyStop ? INCREMENTAL_DEADLINE_MS : BACKFILL_DEADLINE_MS,
    pageDelayMs: PAGE_DELAY_MS,
    maxPages: MAX_PAGES,
  };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'page_error', error: String(e) }; }
  })()`;
}

/**
 * `/api/v1/feed/liked/` rejects web sessions with "useragent mismatch", so this reads the Bloks activity screen.
 * @remarks Pane-scroll paging dead-ends at the bottom, so each payload's next-page arguments are replayed.
 */
async function inPageInstagramLikes(
  args: LikesArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/accounts/login") ||
    location.pathname.startsWith("/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  /** Bloks action names are minified per release (`bk.action.array.Make` ships as `dkc`), so only the tuple shape is matched. */
  const ITEM_RE =
    /\([\w.$]+,\s*\\?"\d{6,25}_\d+\\?",\s*\\?"([A-Za-z0-9_-]{5,20})\\?",\s*\\?"([a-z_]+)\\?",\s*\([\w.$]+,\s*(\d+)\)/g;
  const NEXT_APP_ID = "com.instagram.privacy.activity_center.liked_next";
  /** Trailing three arguments of that action: cursor, container id, element id. */
  const NEXT_RE =
    /\\?"([A-Za-z0-9+/=_-]{20,})\\?",\s*\\?"(\d{6,})\\?",\s*\\?"(\d{6,})\\?"\)\)/;

  interface NextPage {
    cursor: string;
    container_id: string;
    element_id: string;
  }

  const entries: Array<ListEntry> = [];
  const seen = new Set<string>();
  const known = new Set(args.knownIds.map(String));
  const earlyStopEnabled = args.earlyStop ?? known.size > 0;
  let knownPageStreak = 0;

  const sleep = (ms: number) =>
    new Promise((r) => {
      setTimeout(r, ms);
    });

  function collect(text: string) {
    let added = 0;
    let fresh = 0;
    for (const match of text.matchAll(ITEM_RE)) {
      const code = match[1];
      const productType = match[2] ?? "";
      if (!code || productType === "ad" || seen.has(code)) {
        continue;
      }
      seen.add(code);
      added += 1;
      if (!known.has(code)) {
        fresh += 1;
      }
      const isVideo = productType === "clips" || match[3] === "2";
      entries.push({
        sourceId: code,
        url: `https://www.instagram.com/${isVideo ? "reel" : "p"}/${code}/`,
        mediaType: isVideo ? "video" : "image",
      });
    }
    const at = text.indexOf(NEXT_APP_ID);
    const found = at === -1 ? null : NEXT_RE.exec(text.slice(at));
    const next =
      found?.[1] && found[2] && found[3]
        ? { cursor: found[1], container_id: found[2], element_id: found[3] }
        : null;
    return { added, fresh, next };
  }

  function drain(): NextPage | null {
    const buf = globalThis.__pondIgBloksCaptures;
    if (!Array.isArray(buf)) {
      return null;
    }
    let next: NextPage | null = null;
    for (const text of buf.splice(0)) {
      next = collect(text).next ?? next;
    }
    return next;
  }

  function publish(): void {
    globalThis.__pondHarvestPartial = entries.map((e) => ({
      sourceId: e.sourceId,
      url: e.url,
    }));
  }

  function pageRequest(
    template: LikesRequest,
    page: NextPage,
  ): RequestInit | null {
    const form = new URLSearchParams(template.body);
    const params = form.get("params");
    if (!params) {
      return null;
    }
    form.set("params", JSON.stringify({ ...JSON.parse(params), ...page }));
    return {
      method: "POST",
      body: form.toString(),
      credentials: "include",
      /** Without the form content type the endpoint ignores `__a=1` and returns the HTML shell. */
      headers: {
        ...template.headers,
        "content-type": "application/x-www-form-urlencoded",
        "x-fb-lsd": form.get("lsd") ?? "",
        "x-requested-with": "XMLHttpRequest",
      },
    };
  }

  /** The list lives in an inner pane; scrolling the document fetches nothing. */
  function findPane(): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>("div")) {
      if (
        el.scrollHeight > el.clientHeight + 40 &&
        /auto|scroll/.test(getComputedStyle(el).overflowY)
      ) {
        return el;
      }
    }
    return null;
  }

  let pane: HTMLElement | null = null;
  let next: NextPage | null = null;
  const hydrateDeadline = Date.now() + 30_000;
  while (Date.now() < hydrateDeadline) {
    next = drain() ?? next;
    if (globalThis.__pondIgLikesRequest && next) {
      break;
    }
    pane ??= findPane();
    if (pane) {
      pane.scrollTop = pane.scrollHeight;
    }
    await sleep(600);
  }
  publish();

  const done = (reachedEnd: boolean): ListHarvestResult => ({
    ok: true,
    entries,
    reachedEnd,
    seen: entries.length,
  });

  const template = globalThis.__pondIgLikesRequest;
  if (!template || !next) {
    return done(entries.length === 0);
  }

  const deadline = Date.now() + args.deadlineMs;
  for (let attempt = 0; attempt < args.maxPages; attempt++) {
    if (Date.now() > deadline || globalThis.__pondHarvestAbort) {
      return done(false);
    }
    const init = pageRequest(template, next);
    if (!init) {
      break;
    }
    await sleep(args.pageDelayMs);
    const res = await fetch(template.url, init);
    if (!res.ok) {
      if (entries.length > 0) {
        return done(false);
      }
      return {
        ok: false,
        reason: res.status === 429 ? "rate_limited" : "no_match",
      };
    }
    const page = collect(await res.text());
    globalThis.__pondIgBloksCaptures?.splice(0);
    publish();
    if (page.added === 0 || !page.next || page.next.cursor === next.cursor) {
      break;
    }
    next = page.next;
    if (!earlyStopEnabled) {
      continue;
    }
    knownPageStreak = page.fresh === 0 ? knownPageStreak + 1 : 0;
    if (knownPageStreak >= 3) {
      break;
    }
  }
  /** A next-page marker means likes exist; reading none means the payload format moved. */
  if (entries.length === 0) {
    return { ok: false, reason: "no_match" };
  }
  return done(true);
}
