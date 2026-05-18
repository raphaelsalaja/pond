export function inject() {
  if ((window as any).__pondArenaInjected) return;
  (window as any).__pondArenaInjected = true;

  const POND_EVENT = "pond:capture";
  const GRAPHQL_RE = /\/graphql(?:\?|$)/i;
  const CONN_RE = /\/v2\/channels\/[^/]+\/connections(?:\?|$|\/)/;
  const BLOCK_RE = /\/v2\/channels\/[^/]+\/blocks(?:\?|$|\/)/;

  const SAVE_OPERATIONS = new Set([
    "ConnectCreateConnectionMutation",
    "CreateConnectionMutation",
    "ConnectableCreateConnectionMutation",
    "BlockCreateMutation",
    "CreateBlockMutation",
  ]);

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function parseJson(body: any) {
    if (typeof body !== "string" || !body) return null;
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  function asOps(json: any): any[] {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    return [json];
  }

  function pickSaveOpFromRequest(body: any) {
    const ops = asOps(parseJson(body));
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      const name = op.operationName;
      if (name && SAVE_OPERATIONS.has(name)) return op;
      const vars = op.variables;
      if (vars && typeof vars === "object" && vars.connectableId) return op;
    }
    return null;
  }

  function pickSaveOpFromResponse(json: any) {
    const ops = asOps(json);
    for (const op of ops) {
      const cc = op?.data?.create_connection;
      if (cc?.connectable?.id) return op;
    }
    return null;
  }

  const emitted = new Set<string>();
  function emitBlock(blockId: string) {
    if (!blockId || emitted.has(blockId)) return;
    emitted.add(blockId);
    send(`https://www.are.na/block/${blockId}`, "arena:save");
  }

  function emitFromGraphql({
    requestOp,
    responseOp,
  }: {
    requestOp: any;
    responseOp: any;
  }) {
    const conn = responseOp?.data?.create_connection;
    const blockId = String(
      conn?.connectable?.id ?? requestOp?.variables?.connectableId ?? "",
    );
    if (blockId) emitBlock(blockId);
  }

  function emitFromRestResponse(json: any) {
    if (!json || typeof json !== "object") return;
    const block = json.block ?? json.connectable ?? (json.id ? json : null);
    if (block?.id) emitBlock(String(block.id));
  }

  function handleResponse(
    url: string,
    method: string,
    body: string | null,
    status: number,
    text: string,
  ) {
    if (status < 200 || status >= 300) return;
    if (method === "POST" && GRAPHQL_RE.test(url)) {
      const requestOp = pickSaveOpFromRequest(body);
      const responseJson = parseJson(text);
      const responseOp = pickSaveOpFromResponse(responseJson);
      if (requestOp || responseOp) emitFromGraphql({ requestOp, responseOp });
      return;
    }
    if (method === "POST" && (CONN_RE.test(url) || BLOCK_RE.test(url))) {
      emitFromRestResponse(parseJson(text));
    }
  }

  const origFetch = window.fetch;
  (window as any).fetch = async function (input: any, init?: any) {
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
    const res = await origFetch.call(this, input, init);
    try {
      const interesting =
        method === "POST" &&
        (GRAPHQL_RE.test(url) || CONN_RE.test(url) || BLOCK_RE.test(url));
      if (interesting && res.ok) {
        const cloned = res.clone();
        const text = await cloned.text();
        const bodyStr = typeof body === "string" ? body : null;
        handleResponse(url, method, bodyStr, res.status, text);
      }
    } catch (e) {
      log("warn", "arena fetch hook error", String(e));
    }
    return res;
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
    const url = (this as any).__pondUrl ?? "";
    const method = (this as any).__pondMethod ?? "GET";
    const interesting =
      method === "POST" &&
      (GRAPHQL_RE.test(url) || CONN_RE.test(url) || BLOCK_RE.test(url));
    if (interesting) {
      const bodyStr = typeof body === "string" ? body : null;
      this.addEventListener(
        "load",
        function (this: XMLHttpRequest) {
          try {
            handleResponse(
              url,
              method,
              bodyStr,
              this.status,
              this.responseText,
            );
          } catch (e) {
            log("warn", "arena xhr hook error", String(e));
          }
        },
        { once: true },
      );
    }
    return origSend.apply(this, arguments as any);
  };

  log("info", "arena inject ready");
}
