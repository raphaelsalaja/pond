import { webFrame } from "electron";

/**
 * Hidden-window preload. Installs a single XHR-prototype hook in the
 * page main world that captures every Twitter Bookmarks GraphQL
 * response body for later parsing in the main process.
 *
 * The hook is the prinsss-twitter-web-exporter technique adapted for
 * Electron: replace `XMLHttpRequest.prototype.open` with a wrapper
 * that registers a `load` listener for matching URLs, then forwards
 * to the original `open`. By the time `load` fires, `responseText`
 * holds the full GraphQL payload — full text, media, metrics, quote
 * tweets — that the rendered DOM card flattens into snippet form.
 *
 * Two Electron-shaped constraints drive the shape of this file:
 *
 *  1. Sandboxed preloads run in an isolated world. Patching
 *     `XMLHttpRequest` in the preload's own world has zero effect on
 *     the page's `XMLHttpRequest`, which is a different object. The
 *     fix is `webFrame.executeJavaScript`, which evaluates a string
 *     in the page main world.
 *
 *  2. The hook MUST be installed before Twitter's bundle creates its
 *     first XHR. Preloads run before any page script, which is why we
 *     use a preload at all (a post-`loadURL` `executeJavaScript` from
 *     the main process is too late — the bundle has already
 *     initialised).
 *
 * Captures are buffered on `globalThis.__pondBookmarksCaptures`; the
 * harvester drains the buffer between scroll ticks and ships the
 * bodies back to the main process for parsing.
 */

const HOOK_SOURCE = `
  (() => {
    if (globalThis.__pondBookmarksHookInstalled) return;
    globalThis.__pondBookmarksHookInstalled = true;
    globalThis.__pondBookmarksCaptures = [];
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (
          typeof url === "string" &&
          /\\/i\\/api\\/graphql\\/[^\\/]+\\/Bookmarks/.test(url)
        ) {
          this.addEventListener("load", () => {
            try {
              globalThis.__pondBookmarksCaptures.push({
                url: url,
                body: this.responseText,
                status: this.status,
              });
            } catch (e) {
              /* response body not readable; skip */
            }
          });
        }
      } catch (e) {
        /* URL match threw; never block the request */
      }
      return xhrOpen.apply(this, arguments);
    };
  })();
`;

// Same preload is loaded into both the hidden scrape window and the
// sign-in popup. The XHR hook is only useful on x.com / twitter.com
// (the only place a Bookmarks GraphQL response fires), and skipping
// it on OAuth handoffs (Google, Apple, hCaptcha) keeps us out of any
// XHR side-effects those flows might rely on.
const host =
  typeof location !== "undefined" ? location.hostname.toLowerCase() : "";
const isTwitter =
  host === "x.com" ||
  host === "twitter.com" ||
  host.endsWith(".x.com") ||
  host.endsWith(".twitter.com");

if (isTwitter) {
  webFrame.executeJavaScript(HOOK_SOURCE).catch(() => {
    /* hook install failures are non-fatal; the harvester falls back to
       DOM-only walking with no GraphQL enrichment. */
  });
}
