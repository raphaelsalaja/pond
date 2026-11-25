import { isElement } from "@pond/ui/dom";
import { capture, installInterceptor, log } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import {
  extractMediaIdFromBody,
  isLikeMutation,
  isLikeRestUrl,
  isSaveMutation,
  mediaIdFromLikeUrl,
  mediaIdToShortcode,
} from "./requests";

declare global {
  interface Window {
    __pondInstagramInjected?: boolean;
  }
}

function looksLikeSaveLabel(label: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase().trim();
  return (
    l === "save" ||
    l === "bookmark" ||
    l.includes("save to collection") ||
    l.includes("add to collection")
  );
}

function looksLikeLikeLabel(label: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase().trim();
  return l === "like";
}

function shortcodeFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = String(href).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

function kindFromHref(href: string | null): string {
  if (!href) return "p";
  if (href.includes("/reel/")) return "reel";
  if (href.includes("/tv/")) return "tv";
  return "p";
}

function findShortcodeAroundClick(
  target: EventTarget | null,
): { shortcode: string; kind: string } | null {
  if (!isElement(target)) {
    return null;
  }
  let cur: Element | null = target;
  let depth = 0;
  while (cur && depth < 30) {
    const link = cur.querySelector(
      'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
    );
    const href = link?.getAttribute("href") ?? null;
    const sc = shortcodeFromHref(href);
    if (sc) return { shortcode: sc, kind: kindFromHref(href) };
    cur = cur.parentElement;
    depth++;
  }
  const path = location.pathname;
  const sc = shortcodeFromHref(path);
  if (sc) return { shortcode: sc, kind: kindFromHref(path) };
  return null;
}

function findLabeledElementFromTarget(
  target: EventTarget | null,
  looksLike: (label: string | null) => boolean,
): Element | null {
  if (!isElement(target)) {
    return null;
  }
  let cur: Element | null = target;
  let depth = 0;
  while (cur && depth < 8) {
    const lbl = cur.getAttribute?.("aria-label");
    if (lbl && looksLike(lbl)) return cur;
    cur = cur.parentElement;
    depth++;
  }
  const button = target.closest?.(
    'button, [role="button"], a[role="button"], div[role="button"]',
  );
  if (button) {
    const inner = button.querySelector?.("svg[aria-label]");
    if (inner) {
      const lbl = inner.getAttribute("aria-label");
      if (lbl && looksLike(lbl)) return inner;
    }
  }
  return null;
}

function findSaveElementFromTarget(target: EventTarget | null): Element | null {
  return findLabeledElementFromTarget(target, looksLikeSaveLabel);
}

function findLikeElementFromTarget(target: EventTarget | null): Element | null {
  return findLabeledElementFromTarget(target, looksLikeLikeLabel);
}

function isGraphqlUrl(url: string): boolean {
  return /\/graphql\/query\b/.test(url);
}

export function inject(): void {
  if (window.__pondInstagramInjected) return;
  window.__pondInstagramInjected = true;

  document.addEventListener(
    "click",
    (ev) => {
      try {
        const save = findSaveElementFromTarget(ev.target);
        const like = save ? null : findLikeElementFromTarget(ev.target);
        if (!save && !like) return;
        const ctx = findShortcodeAroundClick(ev.target);
        if (!ctx) return;
        capture(
          `https://www.instagram.com/${ctx.kind}/${ctx.shortcode}/`,
          save ? "instagram:save" : "instagram:like",
        );
      } catch (error) {
        log("warn", "instagram dom-click hook error", String(error));
      }
    },
    true,
  );

  installInterceptor({
    id: "instagram",
    match: (req: RequestLens) =>
      req.method === "POST" &&
      (isGraphqlUrl(req.url) || isLikeRestUrl(req.url)),
    async onResponse(req) {
      const bodyStr = await req.readBody();
      if (isLikeMutation(req.getHeader, req.url, bodyStr)) {
        const mediaId =
          extractMediaIdFromBody(bodyStr) ?? mediaIdFromLikeUrl(req.url);
        if (!mediaId) return;
        const shortcode = mediaIdToShortcode(mediaId);
        if (!shortcode) return;
        capture(`https://www.instagram.com/p/${shortcode}/`, "instagram:like");
        return;
      }
      if (!isSaveMutation(req.getHeader, bodyStr)) return;
      const mediaId = extractMediaIdFromBody(bodyStr);
      if (!mediaId) return;
      const shortcode = mediaIdToShortcode(mediaId);
      if (!shortcode) return;
      capture(
        `https://www.instagram.com/p/${shortcode}/`,
        "instagram:graphql-save",
      );
    },
  });
}
