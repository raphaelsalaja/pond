import { isElement } from "@pond/ui/dom";
import { capture, installInterceptor, log } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import {
  asNumber,
  asText,
  isJsonValue,
  isRecord,
  parseJsonRecord,
} from "@/utils/json";
import type { JsonRecord } from "@/utils/json";

declare global {
  interface Window {
    __pondThreadsInjected?: boolean;
  }
}

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const POST_HREF_RE = /\/(?:@[^/]+\/post|t)\/([A-Za-z0-9_-]+)/;

function looksLikeSaveLabel(label: string | null): boolean {
  if (!label) {
    return false;
  }
  const l = label.toLowerCase().trim();
  if (/unsave|unbookmark|remove/.test(l)) {
    return false;
  }
  return (
    l === "save" ||
    l === "bookmark" ||
    l === "save post" ||
    l.includes("save to collection")
  );
}

function looksLikeLikeLabel(label: string | null): boolean {
  if (!label) {
    return false;
  }
  const l = label.toLowerCase().trim();
  return l === "like";
}

function isSaveMenuText(raw: string | null): boolean {
  const t = (raw ?? "").replaceAll(/\s+/g, " ").trim().toLowerCase();
  return t === "save" || t === "bookmark" || t === "save post";
}

function postHrefFrom(href: string | null): string | null {
  if (!href) {
    return null;
  }
  const m = href.match(POST_HREF_RE);
  if (!m) {
    return null;
  }
  return href.startsWith("http") ? href : `https://www.threads.com${href}`;
}

function postUrlAround(target: EventTarget | null): string | null {
  if (!isElement(target)) {
    return null;
  }
  let cur: Element | null = target;
  let depth = 0;
  while (cur && depth < 30) {
    const link = cur.querySelector<HTMLAnchorElement>(
      'a[href*="/post/"], a[href*="/t/"]',
    );
    const href = postHrefFrom(link?.getAttribute("href") ?? null);
    if (href) {
      return href;
    }
    cur = cur.parentElement;
    depth++;
  }
  return null;
}

function postUrlFromPath(): string | null {
  return postHrefFrom(location.pathname);
}

function isSaveClick(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }

  const menuItem = target.closest(
    '[role="menuitem"], [role="menuitemradio"], [role="option"]',
  );
  if (menuItem && isSaveMenuText(menuItem.textContent)) {
    return true;
  }

  const clickable = target.closest(
    'button, [role="button"], a[role="button"], div[role="button"], [tabindex="0"]',
  );
  if (clickable) {
    const label =
      clickable.getAttribute("aria-label") ??
      clickable.querySelector("svg[aria-label]")?.getAttribute("aria-label") ??
      null;
    if (looksLikeSaveLabel(label)) {
      return true;
    }
    if (isSaveMenuText(clickable.textContent) && clickable.textContent) {
      const compact = clickable.textContent.replaceAll(/\s+/g, " ").trim();
      if (compact.length > 0 && compact.length < 24) {
        return true;
      }
    }
  }

  let cur: Element | null = target;
  let depth = 0;
  while (cur && depth < 12) {
    if (looksLikeSaveLabel(cur.getAttribute("aria-label"))) {
      return true;
    }
    const svg = cur.querySelector?.("svg[aria-label]");
    if (svg && looksLikeSaveLabel(svg.getAttribute("aria-label"))) {
      return true;
    }
    cur = cur.parentElement;
    depth++;
  }
  return false;
}

function isLikeClick(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }
  const clickable = target.closest(
    'button, [role="button"], a[role="button"], div[role="button"], [tabindex="0"]',
  );
  if (clickable) {
    const label =
      clickable.getAttribute("aria-label") ??
      clickable.querySelector("svg[aria-label]")?.getAttribute("aria-label") ??
      null;
    if (looksLikeLikeLabel(label)) {
      return true;
    }
  }
  let cur: Element | null = target;
  let depth = 0;
  while (cur && depth < 12) {
    if (looksLikeLikeLabel(cur.getAttribute("aria-label"))) {
      return true;
    }
    const svg = cur.querySelector?.("svg[aria-label]");
    if (svg && looksLikeLikeLabel(svg.getAttribute("aria-label"))) {
      return true;
    }
    cur = cur.parentElement;
    depth++;
  }
  return false;
}

function mediaIdToShortcode(id: string): string | null {
  try {
    const mediaId = String(id).split("_", 1)[0];
    if (!mediaId) {
      return null;
    }
    let n = BigInt(mediaId);
    let s = "";
    while (n > 0n) {
      s = ALPHABET[Number(n & 63n)] + s;
      n = n >> 6n;
    }
    return s || null;
  } catch {
    return null;
  }
}

function isGraphqlUrl(url: string): boolean {
  return /\/(api\/)?graphql(\/query)?(\?|$|\/)/.test(url);
}

function isSaveRestUrl(url: string): boolean {
  if (/unsave/i.test(url)) {
    return false;
  }
  return /\/api\/v1\/(?:media\/[^/]+\/save|web\/save\/[^/]+\/save)\b/i.test(
    url,
  );
}

function isLikeRestUrl(url: string): boolean {
  if (/unlike/i.test(url)) {
    return false;
  }
  return /\/api\/v1\/(?:media\/[^/]+\/like|web\/likes\/[^/]+\/like)\b/i.test(
    url,
  );
}

function friendlyName(
  getHeader: (name: string) => string | null,
  bodyStr: string | null,
): string {
  const header = getHeader("x-fb-friendly-name") ?? "";
  if (header) {
    return header;
  }
  if (!bodyStr) {
    return "";
  }
  try {
    const params = new URLSearchParams(bodyStr);
    return params.get("fb_api_req_friendly_name") ?? "";
  } catch {
    return "";
  }
}

function isSaveMutation(
  getHeader: (name: string) => string | null,
  url: string,
  bodyStr: string | null,
): boolean {
  if (isSaveRestUrl(url)) {
    return true;
  }
  const name = friendlyName(getHeader, bodyStr);
  if (/unsave|unbookmark/i.test(name)) {
    return false;
  }
  if (/mutation/i.test(name) && /save|bookmark/i.test(name)) {
    return true;
  }
  if (!bodyStr) {
    return false;
  }
  if (bodyStr.includes("usePolarisSaveMediaSaveMutation")) {
    return true;
  }
  if (
    /xdt_api__v1__web__save__media_id__save(?!_unsave)/.test(bodyStr) &&
    !/unsave/i.test(bodyStr)
  ) {
    return true;
  }
  if (
    /use\w*(Save|Bookmark)\w*Mutation/.test(bodyStr) &&
    !/Unsave/i.test(bodyStr)
  ) {
    return true;
  }
  return false;
}

function isLikeMutation(
  getHeader: (name: string) => string | null,
  url: string,
  bodyStr: string | null,
): boolean {
  if (isLikeRestUrl(url)) {
    return true;
  }
  const name = friendlyName(getHeader, bodyStr);
  if (/unlike/i.test(name)) {
    return false;
  }
  if (
    /mutation/i.test(name) &&
    /like/i.test(name) &&
    !/save|bookmark/i.test(name)
  ) {
    return true;
  }
  if (!bodyStr) {
    return false;
  }
  if (/Unlike/i.test(bodyStr) && /usePolarisLikeMediaUnlike/.test(bodyStr)) {
    return false;
  }
  if (bodyStr.includes("usePolarisLikeMediaLikeMutation")) {
    return true;
  }
  if (
    /use\w*Like\w*Mutation/.test(bodyStr) &&
    !/Unlike/i.test(bodyStr) &&
    !/Save|Bookmark/i.test(bodyStr)
  ) {
    return true;
  }
  return false;
}

function parseVariables(bodyStr: string | null): JsonRecord | null {
  if (!bodyStr) {
    return null;
  }
  try {
    const raw = new URLSearchParams(bodyStr).get("variables");
    if (raw) {
      const variables: unknown = JSON.parse(raw);
      return isJsonValue(variables) && isRecord(variables) ? variables : null;
    }
  } catch {
    return variablesFromJson(bodyStr);
  }
  return variablesFromJson(bodyStr);
}

function variablesFromJson(bodyStr: string): JsonRecord | null {
  const json = parseJsonRecord(bodyStr);
  if (!json) {
    return null;
  }
  return isRecord(json.variables) ? json.variables : json;
}

function firstString(
  vars: JsonRecord,
  keys: ReadonlyArray<string>,
): string | null {
  for (const key of keys) {
    const value = vars[key];
    const text = asText(value);
    if (text !== undefined && text.length > 0) {
      return text;
    }
    const numeric = asNumber(value);
    if (numeric !== undefined) {
      return String(numeric);
    }
    if (Array.isArray(value)) {
      const first = asText(value[0]);
      if (first !== undefined) {
        return first;
      }
    }
  }
  return null;
}

function mediaIdFromRestUrl(url: string): string | null {
  const m = url.match(/\/(?:media|save|likes)\/(\d+)(?:\/(?:save|like))?\b/i);
  return m?.[1] ?? null;
}

function postUrlFromSaveRequest(
  url: string,
  bodyStr: string | null,
): string | null {
  const vars = parseVariables(bodyStr) ?? {};
  const code = firstString(vars, ["code", "shortcode"]);
  if (code && /^[A-Za-z0-9_-]+$/.test(code)) {
    return `https://www.threads.com/t/${code}`;
  }
  const mediaId =
    firstString(vars, ["media_id", "mediaId", "post_id", "postId", "pk"]) ??
    mediaIdFromRestUrl(url);
  if (!mediaId) {
    return null;
  }
  if (/^[A-Za-z0-9_-]+$/.test(mediaId) && /[A-Za-z]/.test(mediaId)) {
    return `https://www.threads.com/t/${mediaId}`;
  }
  const shortcode = mediaIdToShortcode(mediaId);
  return shortcode ? `https://www.threads.com/t/${shortcode}` : null;
}

export function inject(): void {
  if (window.__pondThreadsInjected) {
    return;
  }
  window.__pondThreadsInjected = true;

  /** Save is a portaled menu item; keep the permalink from the last click that was still inside the post. */
  let pendingPostUrl: string | null = null;

  document.addEventListener(
    "click",
    (ev) => {
      try {
        const nearby = postUrlAround(ev.target);
        if (nearby) {
          pendingPostUrl = nearby;
        }
        if (isSaveClick(ev.target)) {
          const url = nearby ?? pendingPostUrl ?? postUrlFromPath();
          if (url) {
            capture(url, "threads:save");
          }
          return;
        }
        if (!isLikeClick(ev.target)) {
          return;
        }
        const url = nearby ?? pendingPostUrl ?? postUrlFromPath();
        if (url) {
          capture(url, "threads:like");
        }
      } catch (error) {
        log("warn", "threads dom-click hook error", String(error));
      }
    },
    true,
  );

  installInterceptor({
    id: "threads",
    match: (req: RequestLens) =>
      req.method === "POST" &&
      (isGraphqlUrl(req.url) ||
        isSaveRestUrl(req.url) ||
        isLikeRestUrl(req.url)),
    async onResponse(req, res) {
      if (!res.ok) {
        return;
      }
      const bodyStr = await req.readBody();
      if (isLikeMutation(req.getHeader, req.url, bodyStr)) {
        const url = postUrlFromSaveRequest(req.url, bodyStr) ?? pendingPostUrl;
        if (url) {
          capture(url, "threads:like");
        }
        return;
      }
      if (!isSaveMutation(req.getHeader, req.url, bodyStr)) {
        return;
      }
      const url = postUrlFromSaveRequest(req.url, bodyStr) ?? pendingPostUrl;
      if (url) {
        capture(url, "threads:graphql-save");
      }
    },
  });
}
