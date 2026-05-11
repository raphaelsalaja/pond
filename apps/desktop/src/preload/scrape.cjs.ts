import { webFrame } from "electron";

/**
 * Hidden-window preload. Installs source-specific XHR/fetch hooks in
 * the page main world that capture GraphQL response bodies for later
 * parsing in the main process.
 *
 * Two Electron-shaped constraints drive the shape of this file:
 *
 *  1. Sandboxed preloads run in an isolated world; patching
 *     `XMLHttpRequest` here has zero effect on the page's
 *     `XMLHttpRequest`. The fix is `webFrame.executeJavaScript`,
 *     which evaluates a string in the page main world.
 *
 *  2. The hook MUST be installed before the page's bundle creates
 *     its first request. Preloads run before any page script;
 *     `executeJavaScript` from the main process after `loadURL` is
 *     too late.
 *
 * Buffers (one per source) live on `globalThis`:
 *   - `__pondBookmarksCaptures` (Twitter, XHR only)
 *   - `__pondCosmosCaptures` (Cosmos, XHR + fetch — Apollo uses both)
 */

const TWITTER_HOOK = `
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

// Both XHR and fetch — Apollo (cosmos.so SPA) defaults to fetch but
// some adapters use XHR. Bodies are re-read via `clone()` for fetch
// so the page's own consumer still gets the original.
const COSMOS_HOOK = `
  (() => {
    if (globalThis.__pondCosmosHookInstalled) return;
    globalThis.__pondCosmosHookInstalled = true;
    globalThis.__pondCosmosCaptures = [];

    const isCosmosGraphqlUrl = (u) => {
      try {
        if (typeof u !== "string") return false;
        return /(^|\\.)api\\.cosmos\\.so\\/graphql/.test(u);
      } catch (e) {
        return false;
      }
    };

    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (isCosmosGraphqlUrl(url)) {
          this.addEventListener("load", () => {
            try {
              globalThis.__pondCosmosCaptures.push({
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

    const origFetch = globalThis.fetch;
    if (typeof origFetch === "function") {
      globalThis.fetch = function (input, init) {
        let url = "";
        try {
          url = typeof input === "string"
            ? input
            : (input && typeof input.url === "string" ? input.url : "");
        } catch (e) { /* ignore */ }
        const promise = origFetch.apply(this, arguments);
        if (isCosmosGraphqlUrl(url)) {
          promise.then((res) => {
            try {
              const clone = res.clone();
              clone.text().then((body) => {
                try {
                  globalThis.__pondCosmosCaptures.push({
                    url: url,
                    body: body,
                    status: res.status,
                  });
                } catch (e) { /* ignore */ }
              }).catch(() => { /* ignore */ });
            } catch (e) { /* clone failed; skip */ }
            return res;
          }).catch(() => { /* don't disturb the caller's error path */ });
        }
        return promise;
      };
    }
  })();
`;

const host =
  typeof location !== "undefined" ? location.hostname.toLowerCase() : "";
const isTwitter =
  host === "x.com" ||
  host === "twitter.com" ||
  host.endsWith(".x.com") ||
  host.endsWith(".twitter.com");
const isCosmos = host === "cosmos.so" || host.endsWith(".cosmos.so");

if (isTwitter) {
  webFrame.executeJavaScript(TWITTER_HOOK).catch(() => {
    /* hook install failures are non-fatal; the harvester falls back to
       DOM-only walking with no GraphQL enrichment. */
  });
}

if (isCosmos) {
  webFrame.executeJavaScript(COSMOS_HOOK).catch(() => {
    /* see note above */
  });
}
