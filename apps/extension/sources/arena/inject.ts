export function inject() {
  if ((window as any).__pondArenaInjected) return;
  (window as any).__pondArenaInjected = true;

  const POND_EVENT = "pond:capture";

  function emit(message: any) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function capture(payload: any) {
    emit({ kind: "capture", payload });
  }
  function log(level: string, message: string, data?: any) {
    emit({ kind: "log", level, message, data });
  }

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

  function parseJson(body: any) {
    if (typeof body !== "string" || !body) return null;
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  function asOps(json: any) {
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

  const blockCache = new Map();
  async function fetchBlock(blockId: string) {
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
      setTimeout(() => blockCache.delete(blockId), 60_000);
    });
    return p;
  }

  function pickMedia(block: any) {
    const img =
      block?.image?.original?.url ??
      block?.image?.large?.url ??
      block?.image?.display?.url ??
      null;

    const cls = block?.class ?? "";

    if (cls === "Media" && block?.embed?.url) {
      return { url: img, type: "video", videoEmbed: block.embed.url };
    }
    if (img) return { url: img, type: "image" };

    if (block?.attachment?.url) {
      return { url: null, type: "link", attachment: block.attachment.url };
    }
    if (block?.source?.url) return { url: null, type: "link" };
    return { url: null, type: "link" };
  }

  const recent = new Map();
  function isDuplicate(key: string) {
    const now = Date.now();
    const last = recent.get(key);
    recent.set(key, now);
    if (last && now - last < 5_000) return true;
    return false;
  }

  function channelsFromResponse(op: any) {
    const list = op?.data?.create_connection?.channels;
    if (!Array.isArray(list)) return [];
    return list
      .map((c: any) =>
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

  function channelsFromVariables(op: any) {
    const v = op?.variables;
    if (!v || typeof v !== "object") return [];
    if (v.channelId) return [{ id: String(v.channelId) }];
    if (Array.isArray(v.channelIds))
      return v.channelIds.map((id: any) => ({ id: String(id) }));
    return [];
  }

  function arenaExtras(block: any, channels: any[]) {
    const arena: Record<string, unknown> = {};
    if (typeof block?.class === "string") arena.blockClass = block.class;
    if (typeof block?.created_at === "string") {
      arena.publishedAt = block.created_at;
    }
    const u = block?.user ?? {};
    if (typeof u.full_name === "string") arena.authorName = u.full_name;
    if (typeof u.slug === "string") {
      arena.authorSlug = u.slug;
      arena.authorUrl = `https://www.are.na/${u.slug}`;
    }
    const avatar =
      u?.avatar_image?.thumb ?? u?.avatar_image?.display ?? u?.avatar ?? null;
    if (typeof avatar === "string") arena.authorAvatar = avatar;
    const metrics: Record<string, number> = {};
    if (typeof block?.connections?.count === "number") {
      metrics.connections = block.connections.count;
    } else if (typeof block?.connections_count === "number") {
      metrics.connections = block.connections_count;
    }
    if (typeof block?.comment_count === "number") {
      metrics.comments = block.comment_count;
    }
    if (Object.keys(metrics).length > 0) arena.metrics = metrics;
    if (channels.length > 0) {
      arena.channels = channels.map((c) => ({
        id: c.id ?? undefined,
        title: c.title ?? undefined,
        slug: c.slug ?? undefined,
        href: c.href ?? undefined,
      }));
    }
    return arena;
  }

  async function emitFromGraphql({ requestOp, responseOp }: any) {
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
          arena: { channels: arenaExtras(null, channels).channels },
        },
      });
      return;
    }

    const media = pickMedia(block);
    const url =
      block?.source?.url ?? `https://www.are.na/block/${block.id ?? blockId}`;

    const arenaBag = arenaExtras(block, channels);
    const raw: any = {
      via: "graphql+v2-block",
      channels,
      mutation: requestOp?.operationName ?? null,
      block,
      ...(Object.keys(arenaBag).length > 0 ? { arena: arenaBag } : {}),
    };
    if (media.videoEmbed) raw.videoEmbed = media.videoEmbed;
    if ((media as any).attachment) raw.attachment = (media as any).attachment;

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
      channels: channels.map((c: any) => c.title ?? c.id),
    });
  }

  async function emitFromRestBlock(block: any) {
    if (!block?.id) return;
    if (isDuplicate(`rest:${block.id}`)) return;

    const media = pickMedia(block);
    const url = block?.source?.url ?? `https://www.are.na/block/${block.id}`;

    const arenaBag = arenaExtras(block, []);
    capture({
      source: "arena",
      sourceId: String(block.id),
      url,
      title: block.title ?? block.generated_title ?? null,
      description: block.description ?? null,
      author: block?.user?.full_name ?? block?.user?.username ?? null,
      mediaUrl: media.url,
      mediaType: media.type,
      raw: {
        via: "v2-rest",
        block,
        ...(Object.keys(arenaBag).length > 0 ? { arena: arenaBag } : {}),
      },
    });
  }

  function emitFromRestResponse(json: any) {
    if (!json || typeof json !== "object") return;
    const block = json.block ?? json.connectable ?? (json.id ? json : null);
    if (block) emitFromRestBlock(block);
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
      if (requestOp || responseOp) {
        emitFromGraphql({ requestOp, responseOp }).catch(() => {});
      }
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

  log("info", "arena inject ready (graphql + v2-rest)");
}
