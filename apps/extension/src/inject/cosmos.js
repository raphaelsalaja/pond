// Cosmos save capture.
//
// Save flow on cosmos.so:
//   1. User clicks "save" / drags an element into a cluster
//   2. The page POSTs `https://api.cosmos.so/graphql?q=EditElementsConnectionsToClusters`
//      mutation EditElementsConnectionsToClusters(
//        $userId: UserId!,
//        $elementIds: [ElementId!]!,
//        $clusterIdsToConnect: [ClusterId!]!,
//        $clusterIdsToDisconnect: [ClusterId!]!
//      )
//      Response is just `{ success: true }` — no element payload, so we
//      must look up element data we already saw flow through the page.
//
// Strategy:
//   * MAIN-world hook on fetch + XHR (must run before page bundle caches refs)
//   * On every GraphQL response from api.cosmos.so, walk the JSON tree and
//     stash any `{__typename: "Element", id, ...}` we see, keyed by id.
//   * On EditElementsConnectionsToClusters, pull elementIds from variables
//     and emit a capture per element using the harvested data.
//   * Fallback: if an element isn't in cache, re-issue the same GraphQL
//     query the page uses to fetch elements, reusing the Authorization
//     header captured from the save mutation.
(function () {
  if (window.__pondCosmosInjected) return;
  window.__pondCosmosInjected = true;

  const POND_EVENT = "pond:capture";
  const GRAPHQL_HOST_RE = /(^|\.)api\.cosmos\.so$/i;
  const SAVE_OP = "EditElementsConnectionsToClusters";

  // Element id -> normalized element data (harvested from any GraphQL response)
  const elementCache = new Map();
  // Captured Authorization header (Bearer …) from any cosmos GraphQL request
  let lastAuthHeader = null;
  // Dedupe: elementId -> last emit timestamp
  const recent = new Map();

  function emit(message) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function capture(payload) {
    emit({ kind: "capture", payload });
  }
  function log(level, message, data) {
    emit({ kind: "log", level, message, data });
  }

  function isCosmosGraphql(url) {
    if (!url) return false;
    try {
      const u = new URL(url, location.href);
      return GRAPHQL_HOST_RE.test(u.hostname) && u.pathname === "/graphql";
    } catch {
      return false;
    }
  }

  function readJson(text) {
    if (!text || typeof text !== "string") return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Walk a JSON tree and collect any node that looks like an Element. Cosmos
   * returns Apollo-style objects with `__typename` set, so we can match
   * cheaply.
   */
  function harvestElements(node, out) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) harvestElements(item, out);
      return;
    }
    const t = node.__typename;
    const id = node.id ?? node.elementId;
    if (
      typeof t === "string" &&
      /element/i.test(t) &&
      (typeof id === "string" || typeof id === "number")
    ) {
      out.set(String(id), node);
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === "object") harvestElements(v, out);
    }
  }

  function urlLooksVideo(url) {
    return typeof url === "string" && /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url);
  }

  /**
   * Pull a single image/video URL pair out of an arbitrary cosmos node.
   * Used for both the cover image and individual gallery items.
   */
  function extractMediaPair(node) {
    if (!node || typeof node !== "object") return { url: null, videoUrl: null };
    if (typeof node === "string") {
      return urlLooksVideo(node)
        ? { url: null, videoUrl: node }
        : { url: node, videoUrl: null };
    }
    const url =
      node.url ??
      node.imageUrl ??
      node.image_url ??
      node.thumbnailUrl ??
      node.thumbnail_url ??
      node.coverUrl ??
      node.cover_url ??
      node.previewUrl ??
      node.preview_url ??
      node.src ??
      node.original?.url ??
      node.large?.url ??
      node.medium?.url ??
      node.small?.url ??
      node.image?.url ??
      (typeof node.image === "string" ? node.image : null) ??
      null;
    const videoUrl =
      node.videoUrl ??
      node.video_url ??
      node.mp4Url ??
      node.mp4_url ??
      node.video?.url ??
      null;
    return { url, videoUrl };
  }

  /**
   * Cosmos elements imported from Instagram carousels (or that are native
   * cosmos collections) expose multiple media items. We don't know the
   * exact field name, so probe the most likely arrays and any array-valued
   * field whose entries quack like media.
   */
  function pickGallery(el) {
    if (!el || typeof el !== "object") return null;
    const content = el.content ?? el.media ?? el.asset ?? null;

    const candidates = [
      el.multipleMedia, // cosmos: MediaElementTile carousel field
      el.gallery,
      el.galleryItems,
      el.images,
      el.assets,
      el.items,
      el.children,
      el.carousel,
      el.media, // when media is an array
      content?.multipleMedia,
      content?.gallery,
      content?.images,
      content?.assets,
      content?.items,
      content?.children,
      content?.carousel,
    ];

    let arr = null;
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 1) {
        arr = c;
        break;
      }
    }
    if (!arr) return null;

    const items = [];
    for (const entry of arr) {
      const { url, videoUrl } = extractMediaPair(entry);
      const finalUrl = url ?? videoUrl;
      if (!finalUrl) continue;
      const isVideo = !!videoUrl || urlLooksVideo(url);
      items.push({
        type: isVideo ? "video" : "image",
        url: finalUrl,
        ...(videoUrl ? { videoUrl } : {}),
      });
    }
    return items.length > 1 ? items : null;
  }

  function pickMedia(el) {
    // Try a bunch of likely cosmos shapes. Cosmos elements can be images,
    // videos, links, gifs — wrapped in a `content` or `media` field.
    const content = el?.content ?? el?.media ?? el?.asset ?? null;
    const direct = extractMediaPair(el);
    const nested = extractMediaPair(content);
    const url = direct.url ?? nested.url ?? null;
    const videoUrl = direct.videoUrl ?? nested.videoUrl ?? null;
    const looksVideo = !!videoUrl || urlLooksVideo(url);
    return {
      url,
      videoUrl,
      type: looksVideo ? "video" : url ? "image" : "link",
    };
  }

  function pickAuthor(el) {
    const u =
      el?.user ?? el?.author ?? el?.creator ?? el?.source?.author ?? null;
    return (
      u?.displayName ??
      u?.name ??
      u?.fullName ??
      u?.username ??
      u?.handle ??
      null
    );
  }

  /**
   * The "primary" URL we save as the canonical link. Always prefer cosmos's
   * own permalink so reopening the saved item bounces back to cosmos (not
   * the upstream Instagram/Twitter source — which we keep in raw.sourceUrl
   * for reference).
   */
  function pickSourceUrl(el, elementId) {
    return (
      el?.shareUrl ??
      el?.permalink ??
      `https://www.cosmos.so/e/${elementId}`
    );
  }

  function pickUpstreamUrl(el) {
    return (
      el?.source?.url ??
      el?.sourceUrl ??
      el?.url ??
      el?.link ??
      null
    );
  }

  function emitElement(elementId, raw) {
    const now = Date.now();
    const last = recent.get(elementId) ?? 0;
    if (now - last < 5_000) return;
    recent.set(elementId, now);

    const el = raw ?? elementCache.get(String(elementId)) ?? {};
    const media = pickMedia(el);
    const gallery = pickGallery(el);

    // For carousels, fall back to the first gallery item as the cover when
    // the element doesn't expose a separate cover field.
    const coverUrl = media.url ?? gallery?.[0]?.url ?? null;
    const coverIsVideo =
      media.type === "video" || (gallery && gallery[0]?.type === "video");

    capture({
      source: "cosmos",
      sourceId: String(elementId),
      url: pickSourceUrl(el, elementId),
      title: el?.title ?? el?.name ?? null,
      description: el?.description ?? el?.caption ?? el?.note ?? null,
      author: pickAuthor(el),
      mediaUrl: coverUrl,
      mediaType: coverUrl ? (coverIsVideo ? "video" : "image") : "link",
      raw: {
        ...(media.videoUrl ? { videoUrl: media.videoUrl } : {}),
        ...(gallery ? { gallery } : {}),
        ...(pickUpstreamUrl(el) ? { upstreamUrl: pickUpstreamUrl(el) } : {}),
        element: el,
      },
    });
  }

  /**
   * Last-resort: if we got a save mutation for an element we've never seen
   * in any response, query cosmos's GraphQL ourselves for it.
   * We don't know cosmos's exact field set, so we ask for `__typename` and
   * `id` plus a generic `... on Element { ... }` set covering what we know.
   */
  async function fetchElement(elementId) {
    if (!lastAuthHeader) return null;
    try {
      const res = await fetch(
        `https://api.cosmos.so/graphql?q=PondGetElement`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: lastAuthHeader,
          },
          body: JSON.stringify({
            operationName: "PondGetElement",
            variables: { id: elementId },
            query: `
              query PondGetElement($id: ElementId!) {
                element {
                  getElement(id: $id) {
                    __typename
                    id
                    title
                    description
                    sourceUrl
                    url
                    user { __typename id username displayName }
                    content {
                      __typename
                      url
                      imageUrl
                      videoUrl
                      thumbnailUrl
                    }
                  }
                }
              }
            `.trim(),
          }),
        },
      );
      if (!res.ok) return null;
      const json = await res.json();
      const cache = new Map();
      harvestElements(json, cache);
      const found = cache.get(String(elementId));
      if (found) elementCache.set(String(elementId), found);
      return found ?? null;
    } catch (err) {
      log("warn", "cosmos element fetch failed", String(err));
      return null;
    }
  }

  async function handleSaveMutation(reqBody) {
    const variables = reqBody?.variables ?? {};
    const ids = Array.isArray(variables.elementIds) ? variables.elementIds : [];
    const adding = Array.isArray(variables.clusterIdsToConnect)
      ? variables.clusterIdsToConnect
      : [];
    if (ids.length === 0 || adding.length === 0) {
      // Pure disconnect (removing from a cluster) — not a save, ignore.
      return;
    }
    for (const id of ids) {
      const sid = String(id);
      let el = elementCache.get(sid);
      if (!el) el = await fetchElement(sid);
      if (!el) {
        log("warn", "cosmos save with no element data", { elementId: sid });
        emitElement(sid, null);
        continue;
      }
      emitElement(sid, el);
    }
  }

  function getOpFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.searchParams.get("q");
    } catch {
      return null;
    }
  }

  function captureAuthHeader(headers) {
    if (!headers) return;
    try {
      // Headers can be: plain object, Headers instance, or array of tuples.
      let auth = null;
      if (headers instanceof Headers) {
        auth = headers.get("authorization") ?? headers.get("Authorization");
      } else if (Array.isArray(headers)) {
        for (const [k, v] of headers) {
          if (k && k.toLowerCase() === "authorization") {
            auth = v;
            break;
          }
        }
      } else if (typeof headers === "object") {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === "authorization") {
            auth = headers[k];
            break;
          }
        }
      }
      if (typeof auth === "string" && auth) lastAuthHeader = auth;
    } catch {
      /* swallow */
    }
  }

  // ---- fetch hook -----------------------------------------------------------
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const method = String(
      init?.method ?? (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    const isCosmos = isCosmosGraphql(url);

    if (isCosmos) {
      if (init?.headers) captureAuthHeader(init.headers);
      else if (input instanceof Request) captureAuthHeader(input.headers);
    }

    const res = await origFetch.call(this, input, init);

    if (!isCosmos) return res;

    try {
      const cloned = res.clone();
      const text = await cloned.text();
      const json = readJson(text);
      if (json) {
        harvestElements(json, elementCache);

        if (method === "POST") {
          const op = getOpFromUrl(url);
          let reqBody = null;
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
            await handleSaveMutation(reqBody);
          }
        }
      }
    } catch (err) {
      log("warn", "cosmos fetch hook error", String(err));
    }
    return res;
  };

  // ---- XHR hook -------------------------------------------------------------
  const Xhr = window.XMLHttpRequest;
  const origOpen = Xhr.prototype.open;
  const origSend = Xhr.prototype.send;
  const origSetHeader = Xhr.prototype.setRequestHeader;
  Xhr.prototype.open = function (method, url) {
    this.__pondMethod = String(method ?? "GET").toUpperCase();
    this.__pondUrl = String(url ?? "");
    this.__pondCosmos = isCosmosGraphql(this.__pondUrl);
    this.__pondHeaders = {};
    return origOpen.apply(this, arguments);
  };
  Xhr.prototype.setRequestHeader = function (name, value) {
    if (this.__pondCosmos && name && name.toLowerCase() === "authorization") {
      lastAuthHeader = String(value);
    }
    return origSetHeader.apply(this, arguments);
  };
  Xhr.prototype.send = function (body) {
    const reqBodyText = typeof body === "string" ? body : null;
    if (this.__pondCosmos) {
      this.addEventListener("load", async () => {
        try {
          if (this.status < 200 || this.status >= 300) return;
          const json = readJson(this.responseText);
          if (!json) return;
          harvestElements(json, elementCache);
          if (this.__pondMethod !== "POST") return;
          const op = getOpFromUrl(this.__pondUrl);
          const reqBody = readJson(reqBodyText);
          const opName = op ?? reqBody?.operationName;
          if (
            opName === SAVE_OP &&
            json?.data?.element?.editElementsConnectionsToClusters?.success
          ) {
            await handleSaveMutation(reqBody);
          }
        } catch (err) {
          log("warn", "cosmos xhr hook error", String(err));
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  log("info", "cosmos inject ready");
})();
