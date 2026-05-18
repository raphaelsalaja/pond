export function inject() {
  if ((window as any).__pondPinterestInjected) return;
  (window as any).__pondPinterestInjected = true;

  const POND_EVENT = "pond:capture";
  const SAVE_RE =
    /\/resource\/(?:Repin|RepinSave|BoardPickerSave|UserPin|Pin)Resource\/create\/?(?:\?|$)/i;

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function decodeDataParam(encoded: string) {
    try {
      return JSON.parse(decodeURIComponent(encoded));
    } catch {
      try {
        return JSON.parse(encoded);
      } catch {
        return null;
      }
    }
  }

  function pinIdFromBody(body: string | null) {
    if (!body || typeof body !== "string") return null;
    let json: any = null;
    if (body.startsWith("data=")) {
      json = decodeDataParam(body.slice(5).split("&")[0]);
    } else if (body.includes("&data=")) {
      const m = body.match(/(?:^|&)data=([^&]+)/);
      if (m) json = decodeDataParam(m[1]);
    } else if (body.startsWith("{")) {
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
    }
    if (!json) return null;
    const opts = json.options ?? json;
    const id =
      opts?.pin_id ?? opts?.id ?? opts?.source_pin_id ?? opts?.sourceId ?? null;
    return id ? String(id) : null;
  }

  const emitted = new Set<string>();
  function handleSave(pinId: string) {
    if (emitted.has(pinId)) return;
    emitted.add(pinId);
    send(`https://www.pinterest.com/pin/${pinId}/`, "pinterest:save");
  }

  function isSaveUrl(url: string) {
    return typeof url === "string" && SAVE_RE.test(url);
  }

  const origFetch = window.fetch;
  (window as any).fetch = function (input: any, init?: any) {
    let url = "";
    let method = "GET";
    let body: any = null;
    if (typeof input === "string" || input instanceof URL) {
      url = String(input);
      method = (init?.method || "GET").toUpperCase();
      body = init?.body ?? null;
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      url = input.url;
      method = (init?.method || input.method || "GET").toUpperCase();
      body = init?.body ?? null;
    }
    const promise = origFetch.call(this, input, init);
    if (method === "POST" && isSaveUrl(url)) {
      promise
        .then((res: Response) => {
          if (!res.ok) return;
          const bodyStr = typeof body === "string" ? body : null;
          const id = pinIdFromBody(bodyStr);
          if (id) handleSave(id);
        })
        .catch(() => {});
    }
    return promise;
  };

  const xp = XMLHttpRequest.prototype;
  const origOpen = xp.open;
  const origSend = xp.send;
  (xp as any).open = function (method: string, url: string) {
    (this as any).__pondMethod = String(method ?? "GET").toUpperCase();
    (this as any).__pondUrl = String(url ?? "");
    return origOpen.apply(this, arguments as any);
  };
  (xp as any).send = function (body: any) {
    if (
      (this as any).__pondMethod === "POST" &&
      isSaveUrl((this as any).__pondUrl)
    ) {
      const bodyStr = typeof body === "string" ? body : null;
      this.addEventListener(
        "load",
        function (this: XMLHttpRequest) {
          try {
            if (this.status < 200 || this.status >= 300) return;
            const id = pinIdFromBody(bodyStr);
            if (id) handleSave(id);
          } catch {
            /* ignore */
          }
        },
        { once: true },
      );
    }
    return origSend.apply(this, arguments as any);
  };

  log("info", "pinterest inject ready");
}
