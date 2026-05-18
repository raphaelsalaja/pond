export function inject() {
  if ((window as any).__pondTiktokInjected) return;
  (window as any).__pondTiktokInjected = true;

  const POND_EVENT = "pond:capture";
  const FAVORITE_RE = /\/api\/aweme\/favorite\/?/i;
  const usernameByAwemeId = new Map<string, string>();

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function readJson(text: string | null) {
    if (!text || typeof text !== "string") return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function walkForAweme(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const x of obj) walkForAweme(x);
      return;
    }
    const id = obj.aweme_id ?? obj.awemeId ?? obj.id;
    if (id && obj.author) {
      const username =
        obj.author.unique_id ??
        obj.author.uniqueId ??
        obj.author.handle ??
        null;
      if (typeof username === "string" && username.length > 0) {
        usernameByAwemeId.set(String(id), username);
      }
    }
    for (const k of Object.keys(obj)) {
      try {
        walkForAweme(obj[k]);
      } catch {
        /* ignore */
      }
    }
  }

  function awemeIdFromUrl(url: string) {
    try {
      const u = new URL(url, location.href);
      return (
        u.searchParams.get("aweme_id") ??
        u.searchParams.get("awemeId") ??
        u.searchParams.get("item_id") ??
        null
      );
    } catch {
      return null;
    }
  }

  function isFavoriteType(url: string) {
    try {
      const u = new URL(url, location.href);
      const t = u.searchParams.get("type");
      return t === "1" || t === null;
    } catch {
      return true;
    }
  }

  const emitted = new Set<string>();
  function emitFavorite(id: string) {
    if (!id || emitted.has(id)) return;
    emitted.add(id);
    const username = usernameByAwemeId.get(id);
    const url = username
      ? `https://www.tiktok.com/@${username}/video/${id}`
      : `https://www.tiktok.com/video/${id}`;
    send(url, "tiktok:favorite");
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input as Request)?.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const res = await origFetch.call(this, input, init);
    try {
      if (typeof url === "string") {
        if (FAVORITE_RE.test(url) && isFavoriteType(url) && res.ok) {
          const id = awemeIdFromUrl(url);
          if (id) emitFavorite(id);
        } else if (
          method === "GET" &&
          /\/api\/(aweme|item|feed|post)/i.test(url) &&
          res.ok
        ) {
          const clone = res.clone();
          clone
            .text()
            .then((t) => walkForAweme(readJson(t)))
            .catch(() => {});
        }
      }
    } catch (err) {
      log("warn", "tiktok fetch hook", { err: String(err) });
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method: string, url: string) {
    (this as any).__pondMeta = { method, url };
    return origOpen.apply(this, arguments as any);
  };
  XMLHttpRequest.prototype.send = function () {
    const meta = (this as any).__pondMeta ?? {};
    this.addEventListener("load", () => {
      try {
        if (this.status < 200 || this.status >= 300) return;
        const url = meta.url;
        if (typeof url !== "string") return;
        if (FAVORITE_RE.test(url) && isFavoriteType(url)) {
          const id = awemeIdFromUrl(url);
          if (id) emitFavorite(id);
        } else if (/\/api\/(aweme|item|feed|post)/i.test(url)) {
          walkForAweme(readJson(this.responseText));
        }
      } catch (err) {
        log("warn", "tiktok xhr hook", { err: String(err) });
      }
    });
    return origSend.apply(this, arguments as any);
  };

  log("info", "tiktok inject ready");
}
