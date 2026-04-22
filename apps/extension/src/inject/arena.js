// Are.na capture.
//
// The "Connect to channel" flow on www.are.na (and the Connect dialog on
// any block / image page) goes through the GraphQL API:
//
//   POST https://api.are.na/graphql
//   {
//     operationName: "ConnectCreateConnectionMutation",
//     variables: { connectableId, connectableType, channelId },
//     query: "mutation ConnectCreateConnectionMutation(...){ ... }"
//   }
//
// The response only echoes the connectable ID + __typename + href, so we
// turn around and fetch the full block via the public REST API
// (api.are.na/v2/blocks/{id}) which gives us image/title/description/source.
//
// The legacy v2 REST endpoints (used by older pages and by the bookmarklet)
// are still detected as a fallback so we don't regress.
//
// Loaded as a manifest MAIN-world content_script at document_start so the
// fetch/XHR hooks are in place before Are.na's bundle caches references.
(function () {
  if (window.__pondArenaInjected) return;
  window.__pondArenaInjected = true;

  const POND_EVENT = "pond:capture";

  function emit(message) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function capture(payload) {
    emit({ kind: "capture", payload });
  }
  function log(level, message, data) {
    emit({ kind: "log", level, message, data });
  }

  // ---------- detection ----------

  const GRAPHQL_RE = /\/graphql(?:\?|$)/i;
  const CONN_RE = /\/v2\/channels\/[^/]+\/connections(?:\?|$|\/)/;
  const BLOCK_RE = /\/v2\/channels\/[^/]+\/blocks(?:\?|$|\/)/;

  // Mutations we treat as "user just saved a block". Are.na uses a few
  // depending on entry point — direct connect, channel picker, or new
  // block creation from a URL.
  const SAVE_OPERATIONS = new Set([
    "ConnectCreateConnectionMutation",
    "CreateConnectionMutation",
    "ConnectableCreateConnectionMutation",
    "BlockCreateMutation",
    "CreateBlockMutation",
  ]);

  function parseJson(body) {
    if (typeof body !== "string" || !body) return null;
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  // GraphQL bodies can be a single op object or an array (Apollo batches).
  function asOps(json) {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    return [json];
  }

  function pickSaveOpFromRequest(body) {
    const ops = asOps(parseJson(body));
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      const name = op.operationName;
      if (name && SAVE_OPERATIONS.has(name)) return op;
      // Fallback: any mutation whose variables include connectableId.
      const vars = op.variables;
      if (vars && typeof vars === "object" && vars.connectableId) return op;
    }
    return null;
  }

  function pickSaveOpFromResponse(json) {
    const ops = asOps(json);
    for (const op of ops) {
      const cc = op?.data?.create_connection;
      if (cc?.connectable?.id) return op;
    }
    return null;
  }

  // ---------- block enrichment ----------

  // We hit the public REST API which doesn't need an auth header for
  // public blocks. We deliberately do NOT pass credentials: "include" —
  // api.are.na returns `Access-Control-Allow-Origin: *` and the browser
  // refuses to attach credentials to wildcard-CORS responses, which would
  // make every request fail. Private blocks would need a Bearer token, not
  // a cookie, so credentials wouldn't help anyway.
  const blockCache = new Map();
  async function fetchBlock(blockId) {
    if (blockCache.has(blockId)) return blockCache.get(blockId);
    const p = (async () => {
      try {
        const res = await fetch(
          `https://api.are.na/v2/blocks/${encodeURIComponent(blockId)}`,
          {
            credentials: "omit",
            headers: { accept: "application/json" },
          },
        );
        if (!res.ok) {
          log("warn", "arena block fetch failed", {
            blockId,
            status: res.status,
          });
          return null;
        }
        return await res.json();
      } catch (e) {
        log("warn", "arena block fetch error", String(e));
        return null;
      }
    })();
    blockCache.set(blockId, p);
    p.finally(() => {
      // Drop after a minute so re-saves of the same block re-fetch fresh
      // metadata.
      setTimeout(() => blockCache.delete(blockId), 60_000);
    });
    return p;
  }

  function pickMedia(block) {
    const img =
      block?.image?.original?.url ??
      block?.image?.large?.url ??
      block?.image?.display?.url ??
      null;

    const cls = block?.class ?? "";

    if (cls === "Media" && block?.embed?.url) {
      // Media blocks are video/audio embeds. Use the image as a poster.
      return { url: img, type: "video", videoEmbed: block.embed.url };
    }
    if (img) return { url: img, type: "image" };

    if (block?.attachment?.url) {
      return { url: null, type: "link", attachment: block.attachment.url };
    }
    if (block?.source?.url) return { url: null, type: "link" };
    return { url: null, type: "link" };
  }

  // ---------- emit ----------

  // Same block can be added to multiple channels back-to-back; the
  // ingest server upserts on (source, sourceId), so re-emitting is fine
  // but unnecessary. Dedupe within a 5s window.
  const recent = new Map();
  function isDuplicate(key) {
    const now = Date.now();
    const last = recent.get(key);
    recent.set(key, now);
    if (last && now - last < 5_000) return true;
    return false;
  }

  function channelsFromResponse(op) {
    const list = op?.data?.create_connection?.channels;
    if (!Array.isArray(list)) return [];
    return list
      .map((c) =>
        c
          ? {
              id: c.id != null ? String(c.id) : null,
              title: typeof c.title === "string" ? c.title : null,
              href: typeof c.href === "string" ? c.href : null,
            }
          : null,
      )
      .filter(Boolean);
  }

  function channelsFromVariables(op) {
    const v = op?.variables;
    if (!v || typeof v !== "object") return [];
    if (v.channelId) return [{ id: String(v.channelId) }];
    if (Array.isArray(v.channelIds))
      return v.channelIds.map((id) => ({ id: String(id) }));
    return [];
  }

  async function emitFromGraphql({ requestOp, responseOp }) {
    const conn = responseOp?.data?.create_connection;
    const blockId = String(
      conn?.connectable?.id ?? requestOp?.variables?.connectableId ?? "",
    );
    if (!blockId) return;
    if (isDuplicate(`gql:${blockId}`)) return;

    const channels =
      channelsFromResponse(responseOp).length > 0
        ? channelsFromResponse(responseOp)
        : channelsFromVariables(requestOp);

    const block = await fetchBlock(blockId);
    if (!block) {
      // Fall back to a minimal payload so the save still lands.
      capture({
        source: "arena",
        sourceId: blockId,
        url: `https://www.are.na/block/${blockId}`,
        title: null,
        description: null,
        author: null,
        mediaUrl: null,
        mediaType: "link",
        raw: {
          via: "graphql-only",
          channels,
          connectable: conn?.connectable ?? null,
          mutation: requestOp?.operationName ?? null,
        },
      });
      return;
    }

    const media = pickMedia(block);
    const url =
      block?.source?.url ??
      `https://www.are.na/block/${block.id ?? blockId}`;

    const raw = {
      via: "graphql+v2-block",
      channels,
      mutation: requestOp?.operationName ?? null,
      block,
    };
    if (media.videoEmbed) raw.videoEmbed = media.videoEmbed;
    if (media.attachment) raw.attachment = media.attachment;

    capture({
      source: "arena",
      sourceId: String(block.id ?? blockId),
      url,
      title: block.title ?? block.generated_title ?? null,
      description: block.description ?? null,
      author: block?.user?.full_name ?? block?.user?.username ?? null,
      mediaUrl: media.url,
      mediaType: media.type,
      raw,
    });

    log("info", "arena saved", {
      blockId,
      class: block.class,
      mediaType: media.type,
      hasMedia: !!media.url,
      channels: channels.map((c) => c.title ?? c.id),
    });
  }

  // Legacy: REST v2 connection/block create — still used by some flows.
  async function emitFromRestBlock(block) {
    if (!block?.id) return;
    if (isDuplicate(`rest:${block.id}`)) return;

    const media = pickMedia(block);
    const url =
      block?.source?.url ??
      `https://www.are.na/block/${block.id}`;

    capture({
      source: "arena",
      sourceId: String(block.id),
      url,
      title: block.title ?? block.generated_title ?? null,
      description: block.description ?? null,
      author: block?.user?.full_name ?? block?.user?.username ?? null,
      mediaUrl: media.url,
      mediaType: media.type,
      raw: { via: "v2-rest", block },
    });
  }

  function emitFromRestResponse(json) {
    if (!json || typeof json !== "object") return;
    // /connections returns the connection wrapping the block, /blocks
    // returns the block directly.
    const block =
      json.block ?? json.connectable ?? (json.id ? json : null);
    if (block) emitFromRestBlock(block);
  }

  // ---------- network hooks ----------

  function handleResponse(url, method, body, status, text) {
    if (status < 200 || status >= 300) return;

    if (method === "POST" && GRAPHQL_RE.test(url)) {
      const requestOp = pickSaveOpFromRequest(body);
      const responseJson = parseJson(text);
      const responseOp = pickSaveOpFromResponse(responseJson);
      if (requestOp || responseOp) {
        emitFromGraphql({ requestOp, responseOp }).catch(() => {});
      }
      return;
    }

    if (method === "POST" && (CONN_RE.test(url) || BLOCK_RE.test(url))) {
      emitFromRestResponse(parseJson(text));
    }
  }

  // fetch wrapper.
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = "";
    let method = "GET";
    let body = null;

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

  // Prototype-level XHR patch — survives `const X = window.XMLHttpRequest`
  // captures inside Are.na's bundle.
  const xp = XMLHttpRequest.prototype;
  const origOpen = xp.open;
  const origSend = xp.send;
  xp.open = function (method, url) {
    this.__pondMethod = String(method ?? "GET").toUpperCase();
    this.__pondUrl = String(url ?? "");
    return origOpen.apply(this, arguments);
  };
  xp.send = function (body) {
    const url = this.__pondUrl ?? "";
    const method = this.__pondMethod ?? "GET";
    const interesting =
      method === "POST" &&
      (GRAPHQL_RE.test(url) || CONN_RE.test(url) || BLOCK_RE.test(url));
    if (interesting) {
      const bodyStr = typeof body === "string" ? body : null;
      this.addEventListener(
        "load",
        function () {
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
    return origSend.apply(this, arguments);
  };

  log("info", "arena inject ready (graphql + v2-rest)");
})();
