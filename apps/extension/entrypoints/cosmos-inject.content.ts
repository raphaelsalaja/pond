export default defineContentScript({
  matches: ["https://www.cosmos.so/*", "https://cosmos.so/*"],
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main() {
    if ((window as any).__pondCosmosInjected) return;
    (window as any).__pondCosmosInjected = true;

    const POND_EVENT = "pond:capture";
    const GRAPHQL_HOST_RE = /(^|\.)api\.cosmos\.so$/i;
    const SAVE_OP = "EditElementsConnectionsToClusters";

    const elementCache = new Map();
    // Cluster id -> { id, title } cache. Cosmos GraphQL responses
    // sprinkle cluster nodes (`__typename: "Cluster"` or similar)
    // through unrelated queries; we cache them so a save mutation
    // that only sees cluster ids in `clusterIdsToConnect` can still
    // surface a human-readable title via `raw.cosmos.clusters`.
    const clusterCache = new Map<string, { id: string; title?: string }>();
    let lastAuthHeader: string | null = null;
    const recent = new Map();

    function emit(message: any) {
      window.postMessage({ type: POND_EVENT, message }, "*");
    }
    function capture(payload: any) {
      emit({ kind: "capture", payload });
    }
    function log(level: string, message: string, data?: any) {
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

    /**
     * Walk a JSON tree and collect any node that looks like an Element. Cosmos
     * returns Apollo-style objects with `__typename` set, so we can match
     * cheaply. Also harvests clusters (boards) for `raw.cosmos.clusters`.
     */
    function harvestElements(node: any, out: Map<string, any>) {
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
      // Cluster nodes show up as `__typename: "Cluster"` (or similar).
      // Cache id -> title so save mutations can join titles by id.
      if (
        typeof t === "string" &&
        /cluster/i.test(t) &&
        (typeof id === "string" || typeof id === "number")
      ) {
        const sid = String(id);
        const title =
          typeof node.title === "string"
            ? node.title
            : typeof node.name === "string"
              ? node.name
              : undefined;
        const existing = clusterCache.get(sid);
        clusterCache.set(sid, {
          id: sid,
          ...(title || existing?.title
            ? { title: title ?? existing?.title }
            : {}),
        });
      }
      for (const key of Object.keys(node)) {
        const v = node[key];
        if (v && typeof v === "object") harvestElements(v, out);
      }
    }

    function urlLooksVideo(url: any) {
      return (
        typeof url === "string" && /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url)
      );
    }

    /**
     * Pull a single image/video URL pair out of an arbitrary cosmos node.
     * Used for both the cover image and individual gallery items.
     */
    function extractMediaPair(node: any) {
      if (!node || typeof node !== "object")
        return { url: null, videoUrl: null };
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
    function pickGallery(el: any) {
      if (!el || typeof el !== "object") return null;
      const content = el.content ?? el.media ?? el.asset ?? null;

      const candidates = [
        el.multipleMedia,
        el.gallery,
        el.galleryItems,
        el.images,
        el.assets,
        el.items,
        el.children,
        el.carousel,
        el.media,
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

      const items: any[] = [];
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

    function pickMedia(el: any) {
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

    function pickAuthor(el: any) {
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
    function pickSourceUrl(el: any, elementId: string) {
      return (
        el?.shareUrl ?? el?.permalink ?? `https://www.cosmos.so/e/${elementId}`
      );
    }

    function pickUpstreamUrl(el: any) {
      return el?.source?.url ?? el?.sourceUrl ?? el?.url ?? el?.link ?? null;
    }

    function emitElement(elementId: string, raw: any, clusterIds?: string[]) {
      const now = Date.now();
      const last = recent.get(elementId) ?? 0;
      if (now - last < 5_000) return;
      recent.set(elementId, now);

      const el = raw ?? elementCache.get(String(elementId)) ?? {};
      const media = pickMedia(el);
      const gallery = pickGallery(el);

      const coverUrl = media.url ?? gallery?.[0]?.url ?? null;
      const coverIsVideo =
        media.type === "video" || (gallery && gallery[0]?.type === "video");

      // Build the ordered media list. Cosmos gives us an explicit gallery
      // for carousels; fall back to the single cover when the element is
      // just one image/video.
      const mediaUrls: Array<{
        url: string;
        type?: "image" | "video";
        poster?: string;
      }> = [];
      const seen = new Set<string>();
      if (gallery) {
        for (const g of gallery) {
          if (!g.url || seen.has(g.url)) continue;
          seen.add(g.url);
          mediaUrls.push({
            url: g.url,
            type: g.type === "video" ? "video" : "image",
          });
        }
      } else if (coverUrl) {
        seen.add(coverUrl);
        mediaUrls.push({
          url: coverUrl,
          type: coverIsVideo ? "video" : "image",
        });
      }
      if (media.videoUrl && !seen.has(media.videoUrl)) {
        mediaUrls.push({ url: media.videoUrl, type: "video" });
      }

      // Per-source typed bag — `RawCosmos`-shaped. Clusters land here
      // so the renderer can render board chips without re-querying.
      const cosmos: Record<string, unknown> = {};
      const author = pickAuthor(el);
      if (author) cosmos.authorName = author;
      const upstream = pickUpstreamUrl(el);
      if (upstream) cosmos.upstreamUrl = upstream;
      if (clusterIds && clusterIds.length > 0) {
        cosmos.clusters = clusterIds.map((id) => {
          const cached = clusterCache.get(id);
          return cached ? { ...cached } : { id };
        });
      }

      capture({
        source: "cosmos",
        sourceId: String(elementId),
        url: pickSourceUrl(el, elementId),
        title: el?.title ?? el?.name ?? null,
        description: el?.description ?? el?.caption ?? el?.note ?? null,
        author,
        mediaUrl: coverUrl,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        mediaType: coverUrl ? (coverIsVideo ? "video" : "image") : "link",
        raw: {
          ...(media.videoUrl ? { videoUrl: media.videoUrl } : {}),
          ...(gallery ? { gallery } : {}),
          ...(upstream ? { upstreamUrl: upstream } : {}),
          element: el,
          ...(Object.keys(cosmos).length > 0 ? { cosmos } : {}),
        },
      });
    }

    /**
     * Last-resort: if we got a save mutation for an element we've never seen
     * in any response, query cosmos's GraphQL ourselves for it.
     * We don't know cosmos's exact field set, so we ask for `__typename` and
     * `id` plus a generic `... on Element { ... }` set covering what we know.
     */
    async function fetchElement(elementId: string) {
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

    async function handleSaveMutation(reqBody: any) {
      const variables = reqBody?.variables ?? {};
      const ids = Array.isArray(variables.elementIds)
        ? variables.elementIds
        : [];
      const adding = Array.isArray(variables.clusterIdsToConnect)
        ? variables.clusterIdsToConnect
        : [];
      if (ids.length === 0 || adding.length === 0) {
        return;
      }
      const clusterIds = adding.map((c: unknown) => String(c));
      for (const id of ids) {
        const sid = String(id);
        let el = elementCache.get(sid);
        if (!el) el = await fetchElement(sid);
        if (!el) {
          log("warn", "cosmos save with no element data", { elementId: sid });
          emitElement(sid, null, clusterIds);
          continue;
        }
        emitElement(sid, el, clusterIds);
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

    function captureAuthHeader(headers: any) {
      if (!headers) return;
      try {
        let auth: string | null = null;
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

    const origFetch = window.fetch;
    (window as any).fetch = async function (input: any, init: any) {
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

    const Xhr = window.XMLHttpRequest;
    const origOpen = Xhr.prototype.open;
    const origSend = Xhr.prototype.send;
    const origSetHeader = Xhr.prototype.setRequestHeader;
    Xhr.prototype.open = function (method: string, url: string | URL) {
      (this as any).__pondMethod = String(method ?? "GET").toUpperCase();
      (this as any).__pondUrl = String(url ?? "");
      (this as any).__pondCosmos = isCosmosGraphql((this as any).__pondUrl);
      (this as any).__pondHeaders = {};
      return origOpen.apply(this, arguments as any);
    };
    Xhr.prototype.setRequestHeader = function (name: string, value: string) {
      if (
        (this as any).__pondCosmos &&
        name &&
        name.toLowerCase() === "authorization"
      ) {
        lastAuthHeader = String(value);
      }
      return origSetHeader.apply(this, arguments as any);
    };
    Xhr.prototype.send = function (
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const reqBodyText = typeof body === "string" ? body : null;
      if ((this as any).__pondCosmos) {
        this.addEventListener("load", async () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            const json = readJson(this.responseText);
            if (!json) return;
            harvestElements(json, elementCache);
            if ((this as any).__pondMethod !== "POST") return;
            const op = getOpFromUrl((this as any).__pondUrl);
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
      return origSend.apply(this, arguments as any);
    };

    log("info", "cosmos inject ready");
  },
});
