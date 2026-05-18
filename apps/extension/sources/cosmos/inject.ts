export function inject() {
  if ((window as any).__pondCosmosInjected) return;
  (window as any).__pondCosmosInjected = true;

  const POND_EVENT = "pond:capture";
  const GRAPHQL_HOST_RE = /(^|\.)api\.cosmos\.so$/i;
  const SAVE_OP = "EditElementsConnectionsToClusters";

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function isCosmosGraphql(url: string | undefined | null) {
    if (!url) return false;
    try {
      const u = new URL(url, location.href);
      return GRAPHQL_HOST_RE.test(u.hostname) && u.pathname === "/graphql";
    } catch {
      return false;
    }
  }

  function readJson(text: any) {
    if (!text || typeof text !== "string") return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function getOpFromUrl(url: string) {
    try {
      const u = new URL(url, location.href);
      return u.searchParams.get("q");
    } catch {
      return null;
    }
  }

  const emitted = new Set<string>();
  function emitElement(id: string) {
    if (!id || emitted.has(id)) return;
    emitted.add(id);
    send(`https://www.cosmos.so/e/${id}`, "cosmos:save");
  }

  function handleSaveMutation(reqBody: any) {
    const variables = reqBody?.variables ?? {};
    const ids = Array.isArray(variables.elementIds) ? variables.elementIds : [];
    const adding = Array.isArray(variables.clusterIdsToConnect)
      ? variables.clusterIdsToConnect
      : [];
    if (ids.length === 0 || adding.length === 0) return;
    for (const id of ids) emitElement(String(id));
  }

  const origFetch = window.fetch;
  (window as any).fetch = async function (input: any, init: any) {
    const url = typeof input === "string" ? input : input?.url;
    const method = String(
      init?.method ?? (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    const isCosmos = isCosmosGraphql(url);
    const res = await origFetch.call(this, input, init);
    if (!isCosmos) return res;
    try {
      const cloned = res.clone();
      const text = await cloned.text();
      const json = readJson(text);
      if (json && method === "POST") {
        const op = getOpFromUrl(url);
        let reqBody: any = null;
        if (init?.body && typeof init.body === "string") {
          reqBody = readJson(init.body);
        } else if (input instanceof Request) {
          try {
            const reqClone = input.clone();
            const t = await reqClone.text();
            reqBody = readJson(t);
          } catch {
            /* ignore */
          }
        }
        const opName = op ?? reqBody?.operationName;
        if (
          opName === SAVE_OP &&
          json?.data?.element?.editElementsConnectionsToClusters?.success
        ) {
          handleSaveMutation(reqBody);
        }
      }
    } catch (err) {
      log("warn", "cosmos fetch hook error", String(err));
    }
    return res;
  };

  const Xhr = window.XMLHttpRequest;
  const origOpen = Xhr.prototype.open;
  const origSend = Xhr.prototype.send;
  Xhr.prototype.open = function (method: string, url: string | URL) {
    (this as any).__pondMethod = String(method ?? "GET").toUpperCase();
    (this as any).__pondUrl = String(url ?? "");
    (this as any).__pondCosmos = isCosmosGraphql((this as any).__pondUrl);
    return origOpen.apply(this, arguments as any);
  };
  Xhr.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const reqBodyText = typeof body === "string" ? body : null;
    if ((this as any).__pondCosmos) {
      this.addEventListener("load", () => {
        try {
          if (this.status < 200 || this.status >= 300) return;
          const json = readJson(this.responseText);
          if (!json) return;
          if ((this as any).__pondMethod !== "POST") return;
          const op = getOpFromUrl((this as any).__pondUrl);
          const reqBody = readJson(reqBodyText);
          const opName = op ?? reqBody?.operationName;
          if (
            opName === SAVE_OP &&
            json?.data?.element?.editElementsConnectionsToClusters?.success
          ) {
            handleSaveMutation(reqBody);
          }
        } catch (err) {
          log("warn", "cosmos xhr hook error", String(err));
        }
      });
    }
    return origSend.apply(this, arguments as any);
  };

  log("info", "cosmos inject ready");
}
