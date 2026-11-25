/// <reference lib="dom" />

import type { JsonObject, JsonValue } from "@pond/schema/json";
import type { SavedCapture } from "./graphql";
import type { SavedHarvestArgs, SavedHarvestResult } from "./saved-types";

interface SavedRequestTemplate {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

declare global {
  var __pondThreadsSavedRequest: SavedRequestTemplate | null | undefined;
}

interface GraphqlRequestBody {
  variables?: string | JsonObject;
}

interface GraphqlRequest {
  url: string;
  body?: string;
}

interface HarvestStats {
  seen: number;
  fresh: number;
  articles: number;
  captures: number;
  scrolls: number;
  phase: "hydrate" | "scroll" | "done";
  updatedAt: number;
}

interface SavedApiDebug {
  pages: number;
  posts: number;
  reason:
    | "auth_required"
    | "no_request"
    | "http_error"
    | "parse_error"
    | "empty"
    | "exhausted"
    | "deadline";
  firstStatus?: number;
}

export type SavedApiResult =
  | (SavedHarvestResult & { ok: true; apiDebug?: SavedApiDebug })
  | { ok: false; reason: "auth_required" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number | null }
  | { ok: false; reason: "fallback"; detail: string };

const API_DEADLINE_MS = 5 * 60_000;
const PAGE_THROTTLE_MS = 350;
const MAX_PAGES = 2000;

export function buildSavedApiExpression(args: SavedHarvestArgs): string {
  const fnSrc = `(${inPageSavedApi.toString()})`;
  const enriched = {
    ...args,
    deadlineMs: API_DEADLINE_MS,
    throttleMs: PAGE_THROTTLE_MS,
    maxPages: MAX_PAGES,
  };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'fallback', detail: 'threw:' + String(e) }; }
  })()`;
}

async function inPageSavedApi(
  args: SavedHarvestArgs & {
    deadlineMs: number;
    throttleMs: number;
    maxPages: number;
  },
): Promise<SavedApiResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.includes("/accounts/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  const sleep = (ms: number): Promise<void> =>
    new Promise((r) => setTimeout(r, ms));

  const retryAfterFromHeaders = (res: Response): number | null => {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const n = Number(retryAfter);
      if (Number.isFinite(n)) return Math.max(0, n);
      const when = Date.parse(retryAfter);
      if (Number.isFinite(when)) {
        return Math.max(0, Math.round((when - Date.now()) / 1000));
      }
    }
    return null;
  };

  const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
    value instanceof Object && !Array.isArray(value);

  const isJsonNumber = (value: JsonValue): value is number =>
    Number.isFinite(value);

  const jsonString = (value: JsonValue | undefined): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (value === true || value === false) return undefined;
    if (Array.isArray(value) || isJsonObject(value) || isJsonNumber(value)) {
      return undefined;
    }
    return value;
  };

  const getRequest = (): SavedRequestTemplate | null => {
    const req = globalThis.__pondThreadsSavedRequest;
    if (!req?.url) return null;
    return req;
  };

  const pageCursor = (json: JsonValue): string | null => {
    let found: string | null = null;
    const visit = (value: JsonValue): void => {
      if (found) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!isJsonObject(value)) return;
      const pageInfo = value.page_info;
      const endCursor = isJsonObject(pageInfo)
        ? jsonString(pageInfo.end_cursor)
        : undefined;
      if (endCursor) {
        found = endCursor;
        return;
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(json);
    return found;
  };

  const pagePostIds = (json: JsonValue): string[] => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const visit = (value: JsonValue, skip: boolean): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item, skip);
        return;
      }
      if (!isJsonObject(value)) return;
      const code = jsonString(value.code);
      if (
        !skip &&
        code &&
        !seen.has(code) &&
        (value.text_post_app_info || value.user || value.owner)
      ) {
        seen.add(code);
        ids.push(code);
      }
      for (const [key, child] of Object.entries(value)) {
        const nestedSkip =
          skip ||
          key === "share_info" ||
          key === "quoted_post" ||
          key === "reposted_post" ||
          key === "carousel_media";
        visit(child, nestedSkip);
      }
    };
    visit(json, false);
    return ids;
  };

  /** The list's own `page_info` sits beside its `edges`; other connections in the payload have their own. */
  const listHasNextPage = (json: JsonValue): boolean | undefined => {
    let found: boolean | undefined;
    const visit = (value: JsonValue): void => {
      if (found !== undefined) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!isJsonObject(value)) return;
      const pageInfo = value.page_info;
      if (Array.isArray(value.edges) && isJsonObject(pageInfo)) {
        const next = pageInfo.has_next_page;
        if (next === true || next === false) {
          found = next;
          return;
        }
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(json);
    return found;
  };

  /** Threads renders a list's first page into the HTML from its `…PageViewerQuery` preloader and only requests later pages, so read that page from the document. */
  const preloaded: SavedCapture[] = [];
  let preloadedIds: string[] = [];
  let preloadedLastPage = false;
  for (const script of Array.from(
    document.querySelectorAll('script[type="application/json"]'),
  )) {
    const body = script.textContent ?? "";
    if (
      !/adp_Barcelona(?:Saved|Liked)PageViewerQueryRelayPreloader/.test(body)
    ) {
      continue;
    }
    try {
      const json: JsonValue = JSON.parse(body);
      const ids = pagePostIds(json);
      if (ids.length === 0) continue;
      preloaded.push({ url: location.href, body, status: 200 });
      preloadedIds = preloadedIds.concat(ids);
      if (listHasNextPage(json) === false) preloadedLastPage = true;
    } catch {}
  }

  let template = getRequest();
  const waitStart = Date.now();
  const waitDeadline = waitStart + (preloadedLastPage ? 0 : 20_000);
  let lastNudge = waitStart;
  while (!template && Date.now() < waitDeadline) {
    if (Date.now() - lastNudge > 1_500) {
      lastNudge = Date.now();
      try {
        window.scrollBy({ top: 2_000, behavior: "instant" });
      } catch {}
    }
    await sleep(250);
    template = getRequest();
  }
  if (!template || preloadedLastPage) {
    if (preloaded.length === 0) {
      return { ok: false, reason: "fallback", detail: "no_request" };
    }
    return {
      ok: true,
      entries: [],
      captures: preloaded,
      reachedEnd: preloadedLastPage,
      apiDebug: {
        pages: preloaded.length,
        posts: preloadedIds.length,
        reason: preloadedLastPage ? "exhausted" : "no_request",
      },
    };
  }

  let base: URL;
  try {
    base = new URL(template.url, location.origin);
  } catch {
    return { ok: false, reason: "fallback", detail: "bad_url" };
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(template.headers ?? {})) {
    headers[k] = v;
  }
  if (!("accept" in headers)) headers.accept = "*/*";

  const parseVariables = (raw: string | null): JsonObject => {
    if (!raw) return {};
    try {
      const parsed: JsonValue = JSON.parse(raw);
      return isJsonObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const form =
    template.body && !template.body.trim().startsWith("{")
      ? new URLSearchParams(template.body)
      : null;
  let jsonBody: GraphqlRequestBody | null = null;
  if (template.body?.trim().startsWith("{")) {
    try {
      jsonBody = JSON.parse(template.body);
    } catch {
      jsonBody = null;
    }
  }

  let baseVariables: JsonObject = {};
  const urlVars = base.searchParams.get("variables");
  if (urlVars) baseVariables = parseVariables(urlVars);
  else if (form?.get("variables")) {
    baseVariables = parseVariables(form.get("variables"));
  } else if (jsonBody?.variables) {
    const rawVariables = jsonBody.variables;
    baseVariables = isJsonObject(rawVariables)
      ? rawVariables
      : parseVariables(rawVariables);
  }

  const buildRequest = (cursor: string | null): GraphqlRequest => {
    const vars = { ...baseVariables };
    if (cursor) {
      vars.after = cursor;
      vars.cursor = cursor;
    } else {
      delete vars.after;
      delete vars.cursor;
    }
    const method = (template.method || "GET").toUpperCase();
    if (method === "GET") {
      const u = new URL(base.toString());
      u.searchParams.set("variables", JSON.stringify(vars));
      return { url: u.toString() };
    }
    if (form) {
      const next = new URLSearchParams(form);
      next.set("variables", JSON.stringify(vars));
      return { url: base.toString(), body: next.toString() };
    }
    if (jsonBody) {
      const next = { ...jsonBody, variables: vars };
      return { url: base.toString(), body: JSON.stringify(next) };
    }
    return {
      url: base.toString(),
      body: JSON.stringify({ variables: vars }),
    };
  };

  const stats: HarvestStats = {
    seen: 0,
    fresh: 0,
    articles: 0,
    captures: 0,
    scrolls: 0,
    phase: "scroll",
    updatedAt: Date.now(),
  };
  Object.assign(globalThis, { __pondHarvestStats: stats });

  const captures: SavedCapture[] = [...preloaded];
  const deadline = Date.now() + args.deadlineMs;
  const known = new Set<string>((args.knownIds ?? []).map(String));
  const earlyStopEnabled = known.size > 0;
  const STOP_AFTER_KNOWN_PAGES = 2;
  let knownPageStreak = 0;
  let cursor: string | null =
    jsonString(baseVariables.after) ?? jsonString(baseVariables.cursor) ?? null;
  let prevCursor: string | null = null;
  let pages = 0;
  let postTotal = preloadedIds.length;
  let firstStatus: number | undefined;
  let reason: SavedApiDebug["reason"] = "exhausted";

  while (pages < args.maxPages && Date.now() < deadline) {
    const built = buildRequest(cursor);
    const init: RequestInit = {
      method: template.method || "POST",
      headers,
      credentials: "include",
    };
    if (built.body) init.body = built.body;
    let res: Response;
    try {
      res = await fetch(built.url, init);
    } catch {
      if (pages === 0) {
        return { ok: false, reason: "fallback", detail: "fetch_threw" };
      }
      reason = "http_error";
      break;
    }
    if (pages === 0) firstStatus = res.status;
    if (!res.ok) {
      if (res.status === 429) {
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterSec: retryAfterFromHeaders(res),
        };
      }
      if (pages === 0) {
        return {
          ok: false,
          reason: "fallback",
          detail: `http_${res.status}`,
        };
      }
      reason = "http_error";
      break;
    }

    const body = await res.text();
    let json: JsonValue;
    try {
      json = JSON.parse(body);
    } catch {
      if (pages === 0) {
        return { ok: false, reason: "fallback", detail: "parse_error" };
      }
      reason = "parse_error";
      break;
    }

    const ids = pagePostIds(json);
    const next = pageCursor(json);
    captures.push({ url: built.url, body, status: res.status });
    pages += 1;
    postTotal += ids.length;

    const freshOnPage = ids.filter((id) => !known.has(id)).length;
    stats.seen = postTotal;
    stats.fresh += freshOnPage;
    stats.captures = pages;
    stats.scrolls = pages;
    stats.updatedAt = Date.now();

    if (earlyStopEnabled && ids.length > 0) {
      if (freshOnPage === 0) {
        knownPageStreak += 1;
        if (knownPageStreak >= STOP_AFTER_KNOWN_PAGES) {
          reason = "exhausted";
          break;
        }
      } else {
        knownPageStreak = 0;
      }
    }

    if (ids.length === 0) {
      reason = pages === 1 ? "empty" : "exhausted";
      break;
    }
    if (!next || next === cursor || next === prevCursor) {
      reason = "exhausted";
      break;
    }
    prevCursor = cursor;
    cursor = next;
    await sleep(args.throttleMs + Math.random() * 150);
  }

  if (Date.now() >= deadline) reason = "deadline";

  if (pages === 1 && postTotal === 0) {
    return { ok: false, reason: "fallback", detail: "empty_first_page" };
  }

  stats.phase = "done";
  return {
    ok: true,
    entries: [],
    captures,
    reachedEnd: reason === "exhausted" || reason === "empty",
    apiDebug: { pages, posts: postTotal, reason, firstStatus },
  };
}
