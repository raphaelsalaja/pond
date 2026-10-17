/// <reference lib="dom" />

import { webFrame } from "electron";

const TWITTER_HOOK = `
  (() => {
    if (globalThis.__pondBookmarksHookInstalled) return;
    globalThis.__pondBookmarksHookInstalled = true;
    globalThis.__pondBookmarksCaptures = [];
    globalThis.__pondLikesCaptures = [];
    globalThis.__pondBookmarkFoldersCaptures = [];
    /** Capture the page's first Bookmarks/Likes request verbatim; X validates auth via bearer + csrf + per-request transaction id, so cloning its headers beats rebuilding them. */
    globalThis.__pondBookmarksRequest = null;
    globalThis.__pondLikesRequest = null;
    globalThis.__pondBookmarkFolderRequest = null;

    const twitterListOp = (u) => {
      try {
        if (typeof u !== "string") return null;
        const m = u.match(/\\/i\\/api\\/graphql\\/[^\\/]+\\/(Bookmarks|Likes|BookmarkFolderTimeline|BookmarkFoldersSlice)(?:\\?|$)/);
        return m ? m[1] : null;
      } catch (e) {
        return null;
      }
    };

    const requestKey = (op) =>
      op === "Likes"
        ? "__pondLikesRequest"
        : op === "BookmarkFolderTimeline"
          ? "__pondBookmarkFolderRequest"
          : op === "BookmarkFoldersSlice"
            ? "__pondBookmarkFoldersRequest"
            : "__pondBookmarksRequest";
    const capturesKey = (op) =>
      op === "Likes"
        ? "__pondLikesCaptures"
        : op === "BookmarkFoldersSlice"
          ? "__pondBookmarkFoldersCaptures"
          : "__pondBookmarksCaptures";

    const captureRequest = (op, url, method, headers) => {
      try {
        const key = requestKey(op);
        if (globalThis[key]) return;
        globalThis[key] = {
          url: url,
          method: method || "GET",
          headers: headers || {},
        };
      } catch (e) {
        /* never block the request */
      }
    };

    const pushCapture = (op, url, body, status) => {
      try {
        const key = capturesKey(op);
        if (!Array.isArray(globalThis[key])) globalThis[key] = [];
        globalThis[key].push({ url: url, body: body, status: status });
      } catch (e) {
        /* response body not readable; skip */
      }
    };

    const xhrOpen = XMLHttpRequest.prototype.open;
    const xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        const op = twitterListOp(url);
        if (op) {
          this.__pondTwitterListOp = op;
          this.__pondMethod = method;
          this.__pondUrl = url;
          this.__pondHeaders = {};
          this.addEventListener("load", () => {
            try {
              captureRequest(op, url, method, this.__pondHeaders);
              pushCapture(op, url, this.responseText, this.status);
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
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try {
        if (this.__pondTwitterListOp && this.__pondHeaders) {
          this.__pondHeaders[String(name).toLowerCase()] = String(value);
        }
      } catch (e) {
        /* ignore */
      }
      return xhrSetHeader.apply(this, arguments);
    };

    const readHeaders = (input, init) => {
      const out = {};
      try {
        if (input && typeof input !== "string" && input.headers) {
          input.headers.forEach((v, k) => {
            out[String(k).toLowerCase()] = String(v);
          });
        }
      } catch (e) {
        /* ignore */
      }
      try {
        if (init && init.headers) {
          new Headers(init.headers).forEach((v, k) => {
            out[String(k).toLowerCase()] = String(v);
          });
        }
      } catch (e) {
        /* ignore */
      }
      return out;
    };

    const origFetch = globalThis.fetch;
    if (typeof origFetch === "function") {
      globalThis.fetch = function (input, init) {
        let url = "";
        try {
          url =
            typeof input === "string"
              ? input
              : input && typeof input.url === "string"
                ? input.url
                : "";
        } catch (e) {
          /* ignore */
        }
        const promise = origFetch.apply(this, arguments);
        const op = twitterListOp(url);
        if (op) {
          try {
            const method =
              (init && init.method) ||
              (input && typeof input !== "string" && input.method) ||
              "GET";
            captureRequest(op, url, method, readHeaders(input, init));
          } catch (e) {
            /* ignore */
          }
          promise
            .then((res) => {
              try {
                const clone = res.clone();
                clone
                  .text()
                  .then((body) => {
                    try {
                      pushCapture(op, url, body, res.status);
                    } catch (e) {
                      /* ignore */
                    }
                  })
                  .catch(() => {});
              } catch (e) {
                /* clone failed; skip */
              }
              return res;
            })
            .catch(() => {
              /* don't disturb the caller's error path */
            });
        }
        return promise;
      };
    }
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
        /** Matches bare hosts and full URLs ("https://api.cosmos.so/graphql"). */
        return /(^|[./])api\\.cosmos\\.so\\/graphql/.test(u);
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

const THREADS_HOOK = `
  (() => {
    if (globalThis.__pondThreadsSavedHookInstalled) return;
    globalThis.__pondThreadsSavedHookInstalled = true;
    globalThis.__pondThreadsSavedCaptures = [];
    globalThis.__pondThreadsSavedRequest = null;

    const isGraphqlUrl = (u) => {
      try {
        return (
          typeof u === "string" &&
          /\\/(api\\/)?graphql(\\/query)?(\\?|$|\\/)/.test(u)
        );
      } catch (e) {
        return false;
      }
    };

    const looksNamedSaved = (url, body, headers) => {
      try {
        const friendly =
          (headers && headers["x-fb-friendly-name"]) || "";
        const blob = String(url || "") + "\\n" + String(body || "") + "\\n" + String(friendly);
        return /saved|bookmark|favorit|liked|activity/i.test(blob) || /BarcelonaSaved|BarcelonaLike/i.test(blob);
      } catch (e) {
        return false;
      }
    };

    const onSavedPage = () => {
      try {
        return /\\/(saved|liked|activity)/i.test((typeof location !== "undefined" && location.pathname) || "");
      } catch (e) {
        return false;
      }
    };

    const captureRequest = (url, method, headers, body) => {
      try {
        const named = looksNamedSaved(url, body, headers);
        const existing = globalThis.__pondThreadsSavedRequest;
        if (existing) {
          if (!named) return;
          const existingNamed = looksNamedSaved(
            existing.url,
            existing.body,
            existing.headers,
          );
          if (existingNamed) return;
        } else if (!named && !onSavedPage()) {
          return;
        }
        globalThis.__pondThreadsSavedRequest = {
          url: url,
          method: method || "POST",
          headers: headers || {},
          body: typeof body === "string" ? body : "",
        };
      } catch (e) {
        /* never block the request */
      }
    };

    const xhrOpen = XMLHttpRequest.prototype.open;
    const xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (isGraphqlUrl(url)) {
          this.__pondIsThreadsGraphql = true;
          this.__pondMethod = method;
          this.__pondUrl = url;
          this.__pondHeaders = {};
        }
      } catch (e) {
        /* URL match threw; never block the request */
      }
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try {
        if (this.__pondIsThreadsGraphql && this.__pondHeaders) {
          this.__pondHeaders[String(name).toLowerCase()] = String(value);
        }
      } catch (e) {
        /* ignore */
      }
      return xhrSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (this.__pondIsThreadsGraphql) {
          const bodyText = typeof body === "string" ? body : "";
          this.addEventListener("load", () => {
            try {
              captureRequest(
                this.__pondUrl,
                this.__pondMethod,
                this.__pondHeaders,
                bodyText,
              );
              globalThis.__pondThreadsSavedCaptures.push({
                url: this.__pondUrl,
                body: this.responseText,
                status: this.status,
              });
            } catch (e) {
              /* response body not readable; skip */
            }
          });
        }
      } catch (e) {
        /* ignore */
      }
      return xhrSend.apply(this, arguments);
    };

    const readHeaders = (input, init) => {
      const out = {};
      try {
        if (input && typeof input !== "string" && input.headers) {
          input.headers.forEach((v, k) => {
            out[String(k).toLowerCase()] = String(v);
          });
        }
      } catch (e) {
        /* ignore */
      }
      try {
        if (init && init.headers) {
          new Headers(init.headers).forEach((v, k) => {
            out[String(k).toLowerCase()] = String(v);
          });
        }
      } catch (e) {
        /* ignore */
      }
      return out;
    };

    const readBody = (input, init) => {
      const raw =
        (init && init.body) ||
        (input && typeof input !== "string" && input.body);
      if (typeof raw === "string") return raw;
      try {
        if (raw && typeof raw.entries === "function") {
          return new URLSearchParams(Array.from(raw.entries())).toString();
        }
      } catch (e) {
        /* ignore */
      }
      try {
        if (raw && typeof raw.toString === "function") {
          const s = String(raw);
          if (
            s &&
            s !== "[object FormData]" &&
            s !== "[object URLSearchParams]"
          ) {
            return s;
          }
        }
      } catch (e) {
        /* ignore */
      }
      return "";
    };

    const origFetch = globalThis.fetch;
    if (typeof origFetch === "function") {
      globalThis.fetch = function (input, init) {
        let url = "";
        try {
          url =
            typeof input === "string"
              ? input
              : input && typeof input.url === "string"
                ? input.url
                : "";
        } catch (e) {
          /* ignore */
        }
        const promise = origFetch.apply(this, arguments);
        if (isGraphqlUrl(url)) {
          try {
            const method =
              (init && init.method) ||
              (input && typeof input !== "string" && input.method) ||
              "POST";
            const headers = readHeaders(input, init);
            const body = readBody(input, init);
            captureRequest(url, method, headers, body);
          } catch (e) {
            /* ignore */
          }
          promise
            .then((res) => {
              try {
                const clone = res.clone();
                clone
                  .text()
                  .then((body) => {
                    try {
                      globalThis.__pondThreadsSavedCaptures.push({
                        url: url,
                        body: body,
                        status: res.status,
                      });
                    } catch (e) {
                      /* ignore */
                    }
                  })
                  .catch(() => {});
              } catch (e) {
                /* clone failed; skip */
              }
              return res;
            })
            .catch(() => {
              /* don't disturb the caller's error path */
            });
        }
        return promise;
      };
    }
  })();
`;

const INSTAGRAM_HOOK = `
  (() => {
    if (globalThis.__pondIgBloksHookInstalled) return;
    globalThis.__pondIgBloksHookInstalled = true;
    globalThis.__pondIgBloksCaptures = [];

    const isBloksUrl = (u) => {
      try {
        return typeof u === "string" && u.indexOf("/async/wbloks/fetch/") !== -1;
      } catch (e) {
        return false;
      }
    };

    const push = (text) => {
      try {
        const buf = globalThis.__pondIgBloksCaptures;
        if (!Array.isArray(buf)) return;
        if (buf.length > 60) buf.shift();
        buf.push(text);
      } catch (e) {
        /* buffer unavailable; skip */
      }
    };

    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (isBloksUrl(url)) {
          this.addEventListener("load", () => {
            try {
              push(this.responseText);
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

    /** Keep the likes screen's paging request so the harvest can replay it with later cursors. */
    const rememberTemplate = (url, init) => {
      if (url.indexOf("activity_center.liked_next") === -1) return;
      try {
        const body = init && init.body;
        let form = "";
        if (typeof body === "string") form = body;
        else if (body && typeof body.entries === "function") {
          const parts = [];
          for (const [k, v] of body.entries()) {
            parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
          }
          form = parts.join("&");
        }
        if (!form) return;
        const headers = {};
        const raw = init && init.headers;
        if (raw && typeof raw.forEach === "function") raw.forEach((v, k) => { headers[k] = String(v); });
        else if (raw && typeof raw === "object") for (const k of Object.keys(raw)) headers[k] = String(raw[k]);
        globalThis.__pondIgLikesRequest = { url: url, body: form, headers: headers };
      } catch (e) {
        /* template unreadable; the harvest reports what it managed to read */
      }
    };

    const origFetch = globalThis.fetch;
    if (typeof origFetch === "function") {
      globalThis.fetch = function (input, init) {
        let url = "";
        try {
          url = typeof input === "string" ? input : (input && input.url) || "";
        } catch (e) {
          /* opaque request; leave url empty */
        }
        rememberTemplate(url, init);
        const promise = origFetch.apply(this, arguments);
        if (isBloksUrl(url)) {
          promise
            .then((res) => {
              try {
                res.clone().text().then(push).catch(() => {});
              } catch (e) {
                /* body already consumed; skip */
              }
              return res;
            })
            .catch(() => {
              /* don't disturb the caller's error path */
            });
        }
        return promise;
      };
    }
  })();
`;

const host = globalThis.location?.hostname.toLowerCase() ?? "";
const isTwitter =
  host === "x.com" ||
  host === "twitter.com" ||
  host.endsWith(".x.com") ||
  host.endsWith(".twitter.com");
const isCosmos = host === "cosmos.so" || host.endsWith(".cosmos.so");
const isInstagram = host === "instagram.com" || host.endsWith(".instagram.com");
const isThreads =
  host === "threads.com" ||
  host === "threads.net" ||
  host.endsWith(".threads.com") ||
  host.endsWith(".threads.net");

function installHook(name: string, source: string): void {
  webFrame
    .executeJavaScript(source)
    .catch((err) =>
      console.error(`[pond preload] ${name} capture hook failed`, host, err),
    );
}

if (isTwitter) installHook("twitter", TWITTER_HOOK);
if (isCosmos) installHook("cosmos", COSMOS_HOOK);
if (isInstagram) installHook("instagram", INSTAGRAM_HOOK);
if (isThreads) installHook("threads", THREADS_HOOK);
