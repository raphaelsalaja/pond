export function inject() {
  if ((window as any).__pondInstagramInjected) return;
  (window as any).__pondInstagramInjected = true;

  const POND_EVENT = "pond:capture";
  const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function looksLikeSaveLabel(label: string | null) {
    if (!label) return false;
    const l = label.toLowerCase().trim();
    return (
      l === "save" ||
      l === "bookmark" ||
      l.includes("save to collection") ||
      l.includes("add to collection")
    );
  }

  function shortcodeFromHref(href: string | null) {
    if (!href) return null;
    const m = String(href).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function kindFromHref(href: string | null) {
    if (!href) return "p";
    if (href.includes("/reel/")) return "reel";
    if (href.includes("/tv/")) return "tv";
    return "p";
  }

  function findShortcodeAroundClick(target: EventTarget | null): {
    shortcode: string;
    kind: string;
  } | null {
    if (!(target instanceof Element)) return null;
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

  function findSaveElementFromTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    let cur: Element | null = target;
    let depth = 0;
    while (cur && depth < 8) {
      const lbl = cur.getAttribute?.("aria-label");
      if (lbl && looksLikeSaveLabel(lbl)) return cur;
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
        if (lbl && looksLikeSaveLabel(lbl)) return inner;
      }
    }
    return null;
  }

  document.addEventListener(
    "click",
    (ev) => {
      try {
        if (!findSaveElementFromTarget(ev.target)) return;
        const ctx = findShortcodeAroundClick(ev.target);
        if (!ctx) return;
        send(
          `https://www.instagram.com/${ctx.kind}/${ctx.shortcode}/`,
          "instagram:save",
        );
      } catch (e) {
        log("warn", "instagram dom-click hook error", String(e));
      }
    },
    true,
  );

  function mediaIdToShortcode(id: string) {
    try {
      let n = BigInt(String(id).split("_")[0]);
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

  function headerValue(h: any, name: string) {
    if (!h) return null;
    const lc = name.toLowerCase();
    if (typeof Headers !== "undefined" && h instanceof Headers) {
      return h.get(lc);
    }
    if (Array.isArray(h)) {
      for (const entry of h) {
        if (Array.isArray(entry) && entry[0]?.toLowerCase() === lc) {
          return entry[1];
        }
      }
      return null;
    }
    if (typeof h === "object") {
      for (const k of Object.keys(h)) {
        if (k.toLowerCase() === lc) return h[k];
      }
    }
    return null;
  }

  function bodyToString(body: any) {
    if (body == null) return null;
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const out = new URLSearchParams();
      body.forEach((v, k) => {
        out.append(k, String(v));
      });
      return out.toString();
    }
    return null;
  }

  function isSaveMutation(headers: any, bodyStr: string | null) {
    const friendly = headerValue(headers, "x-fb-friendly-name");
    if (friendly === "usePolarisSaveMediaSaveMutation") return true;
    const root = headerValue(headers, "x-root-field-name");
    if (root && /__save$/.test(root) && !/unsave/i.test(root)) return true;
    if (bodyStr) {
      if (bodyStr.includes("usePolarisSaveMediaSaveMutation")) return true;
      if (
        /xdt_api__v1__web__save__media_id__save(?!_unsave)/.test(bodyStr) &&
        !/unsave/i.test(bodyStr)
      ) {
        return true;
      }
    }
    return false;
  }

  function extractMediaIdFromBody(bodyStr: string | null) {
    if (!bodyStr) return null;
    try {
      const params = new URLSearchParams(bodyStr);
      const variablesRaw = params.get("variables");
      if (!variablesRaw) return null;
      const vars = JSON.parse(variablesRaw);
      const candidate = vars.media_id ?? vars.mediaId ?? vars.media?.id ?? null;
      return candidate == null ? null : String(candidate);
    } catch {
      return null;
    }
  }

  function isGraphqlUrl(url: string) {
    return typeof url === "string" && /\/graphql\/query\b/.test(url);
  }

  function maybeHandleSaveRequest(headers: any, body: any) {
    try {
      const bodyStr = bodyToString(body);
      if (!isSaveMutation(headers, bodyStr)) return;
      const mediaId = extractMediaIdFromBody(bodyStr);
      if (!mediaId) return;
      const shortcode = mediaIdToShortcode(mediaId);
      if (!shortcode) return;
      send(
        `https://www.instagram.com/p/${shortcode}/`,
        "instagram:graphql-save",
      );
    } catch (e) {
      log("warn", "instagram graphql sniff error", String(e));
    }
  }

  const origFetch = window.fetch;
  (window as any).fetch = function (input: any, init: any) {
    let url = "";
    let method = "GET";
    let headers: any = null;
    let body: any = null;
    if (typeof input === "string" || input instanceof URL) {
      url = String(input);
      method = (init?.method || "GET").toUpperCase();
      headers = init?.headers ?? null;
      body = init?.body ?? null;
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      url = input.url;
      method = (init?.method || input.method || "GET").toUpperCase();
      headers = init?.headers ?? input.headers;
      body = init?.body ?? null;
    }
    if (method === "POST" && isGraphqlUrl(url)) {
      maybeHandleSaveRequest(headers, body);
    }
    return origFetch.call(this, input, init);
  };

  const xp = XMLHttpRequest.prototype;
  const origOpen = xp.open;
  const origSetHeader = xp.setRequestHeader;
  const origSend = xp.send;
  xp.open = function (method: string, url: string | URL) {
    (this as any).__pondMethod = String(method ?? "GET").toUpperCase();
    (this as any).__pondUrl = String(url ?? "");
    (this as any).__pondHeaders = {};
    return origOpen.apply(this, arguments as any);
  };
  xp.setRequestHeader = function (name: string, value: string) {
    if ((this as any).__pondHeaders) {
      try {
        (this as any).__pondHeaders[String(name)] = String(value);
      } catch {
        /* ignore */
      }
    }
    return origSetHeader.apply(this, arguments as any);
  };
  xp.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const isGql = isGraphqlUrl((this as any).__pondUrl);
    if ((this as any).__pondMethod === "POST" && isGql) {
      maybeHandleSaveRequest((this as any).__pondHeaders || {}, body);
    }
    return origSend.apply(this, arguments as any);
  };

  log("info", "instagram inject ready");
}
