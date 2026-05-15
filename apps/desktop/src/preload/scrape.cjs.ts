/// <reference lib="dom" />

import { webFrame } from "electron";

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
