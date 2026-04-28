export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main() {
    if ((window as any).__pondYoutubeInjected) return;
    (window as any).__pondYoutubeInjected = true;

    const POND_EVENT = "pond:capture";
    // Any /youtubei/v1/ POST gets sniffed — we used to match a hand-coded
    // list of paths but YouTube ships at least a half-dozen variants of
    // "save to playlist" (player Save, tile clock icon, share-panel
    // checkbox, mobile bottom-sheet, etc.) and they rotate the URL set
    // every few months. Routing every POST through a single classifier
    // keeps us future-proof; the body shape is the real signal.
    const YOUTUBEI_RE = /\/youtubei\/v1\//i;
    // Sub-classifiers (URL hints — used to decide which handler to run).
    // None of these are *required* — the body shape is authoritative —
    // but matching the URL lets us pick the right log label and skip
    // body parsing for endpoints we know we don't care about.
    const PLAYLIST_EDIT_HINT_RE =
      /(edit_playlist|add_to_watch_later|playlist\/(add|create|edit)|share\/get_share_panel)/i;
    const LIKE_RE = /\/youtubei\/v1\/like\/like\b/i;
    const PLAYER_RE = /\/youtubei\/v1\/(player|next|browse|guide)\b/i;
    const VIDEO_ID_RE = /^[\w-]{11}$/;
    // YouTube's Watch Later playlist is hard-coded as "WL". Used by the
    // body sniffer below to detect a save-to-WL even when the URL is
    // some new variant we haven't seen before.
    const WATCH_LATER_PLAYLIST_ID = "WL";

    const videoCache = new Map<string, any>();

    function emit(message: unknown) {
      window.postMessage({ type: POND_EVENT, message }, "*");
    }
    function capture(payload: unknown) {
      emit({ kind: "capture", payload });
    }
    function log(level: string, message: string, data?: unknown) {
      emit({ kind: "log", level, message, data });
      // Also surface in the page's DevTools console so you can verify the
      // hook fired without having to open the extension service-worker.
      const fn =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : console.info;
      fn("[pond youtube]", message, data ?? "");
    }

    function readJson(text: string | null) {
      if (!text || typeof text !== "string") return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    /**
     * Pull the request body out of a `fetch(input, init)` call as a string,
     * regardless of how the caller built it. YouTube uses every shape under
     * the sun:
     *  - `fetch(url, { body: '{"context":...}' })` — plain string
     *  - `fetch(new Request(url, { body: ... }))` — body lives on the Request
     *  - URLSearchParams / Blob / typed array — older code paths
     */
    async function readBody(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<string | null> {
      try {
        const b = init?.body;
        if (typeof b === "string") return b;
        if (b instanceof URLSearchParams) return b.toString();
        if (b instanceof Blob) return await b.text();
        if (b instanceof ArrayBuffer) return new TextDecoder().decode(b);
        if (ArrayBuffer.isView(b)) {
          return new TextDecoder().decode(b as Uint8Array);
        }
        if (b instanceof FormData) {
          const obj: Record<string, string> = {};
          b.forEach((v, k) => {
            obj[k] = typeof v === "string" ? v : "[file]";
          });
          return JSON.stringify(obj);
        }
        if (input instanceof Request) {
          // Request bodies are streams — clone before consuming so we don't
          // break the actual outgoing request.
          return await input.clone().text();
        }
      } catch (err) {
        log("warn", "readBody failed", { err: String(err) });
      }
      return null;
    }

    function harvestVideoDetails(obj: any) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const x of obj) harvestVideoDetails(x);
        return;
      }
      if (obj.videoId && (obj.title || obj.lengthSeconds || obj.author)) {
        videoCache.set(String(obj.videoId), obj);
      }
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === "object") harvestVideoDetails(v);
      }
    }

    function pickThumbnail(details: any) {
      const thumbs = details?.thumbnail?.thumbnails;
      if (Array.isArray(thumbs) && thumbs.length > 0) {
        return thumbs[thumbs.length - 1]?.url ?? null;
      }
      return null;
    }

    async function fetchOembed(id: string) {
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${id}`,
          )}&format=json`,
          { credentials: "omit" },
        );
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }

    async function emitSave(videoId: string, kind: string) {
      if (!videoId) return;
      const details = videoCache.get(String(videoId));
      let title = details?.title ?? null;
      if (typeof title === "object") {
        title = title?.simpleText ?? title?.runs?.[0]?.text ?? null;
      }
      let author = details?.author ?? null;
      if (typeof author === "object") {
        author = author?.simpleText ?? author?.runs?.[0]?.text ?? null;
      }
      let thumb = pickThumbnail(details);

      if (!title || !thumb) {
        const oembed = await fetchOembed(videoId);
        title = title ?? oembed?.title ?? null;
        author = author ?? oembed?.author_name ?? null;
        thumb = thumb ?? oembed?.thumbnail_url ?? null;
      }

      capture({
        source: "youtube",
        sourceId: String(videoId),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        description: details?.shortDescription ?? null,
        author,
        mediaUrl: thumb,
        mediaType: "video",
        raw: {
          capturedAt: new Date().toISOString(),
          kind,
          ...(details ? { videoDetails: details } : {}),
        },
      });
    }

    /**
     * Walk the parsed body recursively and collect every plausible
     * `addedVideoId` / `videoId` we find. Permissive on purpose — YouTube
     * has shipped at least four different action shapes for "add to
     * playlist" over the years (`ACTION_ADD_VIDEO`, `addToPlaylistRequest`,
     * nested actions inside `playlistEditPostHandlerActions`, etc.).
     */
    function collectAddedVideoIds(node: unknown, out: Set<string>): void {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) collectAddedVideoIds(x, out);
        return;
      }
      const obj = node as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (
          (k === "addedVideoId" || k === "videoId") &&
          typeof v === "string" &&
          VIDEO_ID_RE.test(v)
        ) {
          out.add(v);
        } else if (v && typeof v === "object") {
          collectAddedVideoIds(v, out);
        }
      }
    }

    function extractLikeVideoId(body: string | null): string | null {
      const json = readJson(body);
      const id =
        json?.target?.videoId ?? json?.videoId ?? json?.params?.videoId ?? null;
      return id && VIDEO_ID_RE.test(String(id)) ? String(id) : null;
    }

    /**
     * Walk the parsed body recursively and find the playlist id under
     * any nested `playlistId` key. Used by the body sniffer to spot
     * "save to Watch Later" even when YouTube buries it 5 levels deep
     * under e.g. `actions[0].addToPlaylistCommand.params.playlistId`.
     */
    function findPlaylistIds(node: unknown, out: Set<string>): void {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) findPlaylistIds(x, out);
        return;
      }
      const obj = node as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (k === "playlistId" && typeof v === "string" && v.length > 0) {
          out.add(v);
        } else if (v && typeof v === "object") {
          findPlaylistIds(v, out);
        }
      }
    }

    /**
     * True if any string value in the parsed body matches `predicate`.
     * Cheap recursive walk for spotting `"action": "ACTION_ADD_VIDEO"`
     * regardless of where YouTube nests it (different surfaces use
     * different action wrappers).
     */
    function anyStringMatches(
      node: unknown,
      predicate: (s: string) => boolean,
    ): boolean {
      if (typeof node === "string") return predicate(node);
      if (!node || typeof node !== "object") return false;
      if (Array.isArray(node)) {
        for (const x of node) if (anyStringMatches(x, predicate)) return true;
        return false;
      }
      for (const v of Object.values(node)) {
        if (anyStringMatches(v, predicate)) return true;
      }
      return false;
    }

    /**
     * Inspect a /youtubei/v1/ POST body and decide whether it represents
     * a save-worthy action. URL is used only as a label/hint — body
     * shape is authoritative so future YouTube reshuffles don't break
     * us. Returns the saves to emit (id + reason) plus a one-line
     * summary suitable for logging.
     *
     * Matches:
     *   - Any body whose `playlistId` includes "WL" (Watch Later)
     *   - Any body containing `ACTION_ADD_VIDEO` action with addedVideoId
     *   - Any URL hint matching the playlist-edit family + at least one
     *     addedVideoId/videoId in the body
     */
    function classifyYoutubeiPost(
      url: string,
      body: string | null,
    ): {
      saves: Array<{ videoId: string; kind: string }>;
      summary: Record<string, unknown>;
    } {
      const json = readJson(body);
      const ids = new Set<string>();
      collectAddedVideoIds(json, ids);
      const playlistIds = new Set<string>();
      findPlaylistIds(json, playlistIds);

      const isWatchLater = [...playlistIds].some(
        (p) => p.toUpperCase() === WATCH_LATER_PLAYLIST_ID,
      );
      const hasAddVideoAction = anyStringMatches(
        json,
        (s) => s === "ACTION_ADD_VIDEO" || s === "addToPlaylistCommand",
      );
      const looksLikePlaylistEdit = PLAYLIST_EDIT_HINT_RE.test(url);

      const summary: Record<string, unknown> = {
        url,
        playlistIds: [...playlistIds],
        videoIds: [...ids],
        isWatchLater,
        hasAddVideoAction,
        urlHint: looksLikePlaylistEdit,
      };

      if (ids.size === 0) return { saves: [], summary };

      const saves: Array<{ videoId: string; kind: string }> = [];
      if (isWatchLater) {
        for (const id of ids) saves.push({ videoId: id, kind: "watch-later" });
      } else if (hasAddVideoAction || looksLikePlaylistEdit) {
        for (const id of ids) saves.push({ videoId: id, kind: "playlist" });
      }
      return { saves, summary };
    }

    /**
     * Common handler for both fetch and XHR. Routes every /youtubei/v1/
     * POST through `classifyYoutubeiPost` and emits one save per video
     * id found. Logs every POST (matched or not) so the page console
     * shows exactly which YouTube endpoints fired when the user clicked
     * — invaluable for diagnosing future YouTube refactors.
     */
    async function handleYoutubeiPost(
      url: string,
      body: string | null,
      via: "fetch" | "xhr",
    ) {
      const { saves, summary } = classifyYoutubeiPost(url, body);
      if (saves.length > 0) {
        log("info", "youtube save matched", {
          via,
          count: saves.length,
          ...summary,
        });
        for (const s of saves) void emitSave(s.videoId, s.kind);
      } else {
        // Quiet by default: only log unmatched POSTs that *look* like
        // they should have matched. Endpoints like /log_event fire
        // every few seconds and would drown the console otherwise.
        if (
          PLAYLIST_EDIT_HINT_RE.test(url) ||
          (summary.videoIds as string[]).length > 0
        ) {
          log("info", "youtube post unmatched", { via, ...summary });
        }
      }
    }

    async function handleLike(url: string, body: string | null) {
      const id = extractLikeVideoId(body);
      log("info", "youtube like", { url, id });
      if (id) void emitSave(id, "like");
    }

    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : (input as Request)?.url;
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      // Read the body BEFORE awaiting fetch — for Request inputs we need to
      // clone, and for streams we need to peek before they're consumed.
      const bodyPromise =
        method === "POST" && typeof url === "string"
          ? readBody(input, init)
          : Promise.resolve<string | null>(null);

      const res = await origFetch.call(this, input, init);

      try {
        if (typeof url === "string" && res.ok) {
          if (method === "POST" && LIKE_RE.test(url)) {
            await handleLike(url, await bodyPromise);
          } else if (method === "POST" && YOUTUBEI_RE.test(url)) {
            // Route every InnerTube POST through the body-shape sniffer.
            // Save endpoints are picked out there; non-saves are dropped.
            await handleYoutubeiPost(url, await bodyPromise, "fetch");
          }
          if (PLAYER_RE.test(url)) {
            // Snapshot player/browse responses so we have title/thumb cached
            // by the time the user adds to a playlist.
            const clone = res.clone();
            clone
              .text()
              .then((t) => {
                harvestVideoDetails(readJson(t));
              })
              .catch(() => {});
          }
        }
      } catch (err) {
        log("warn", "youtube fetch hook", { err: String(err) });
      }
      return res;
    };

    // navigator.sendBeacon is increasingly used by YouTube for
    // fire-and-forget actions (analytics historically, but also some
    // playlist mutations on the modern polymer client). The browser
    // never gives us a Response, so we just sniff the outgoing body
    // and emit synchronously — same classifier as fetch/XHR.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (
        url: string | URL,
        data?: BodyInit | null,
      ): boolean => {
        const result = origBeacon(url, data);
        try {
          const u = typeof url === "string" ? url : url.toString();
          if (YOUTUBEI_RE.test(u)) {
            void (async () => {
              let body: string | null = null;
              try {
                if (typeof data === "string") body = data;
                else if (data instanceof Blob) body = await data.text();
                else if (data instanceof ArrayBuffer) {
                  body = new TextDecoder().decode(data);
                } else if (data && ArrayBuffer.isView(data)) {
                  body = new TextDecoder().decode(data as Uint8Array);
                } else if (data instanceof URLSearchParams) {
                  body = data.toString();
                } else if (data instanceof FormData) {
                  const obj: Record<string, string> = {};
                  data.forEach((v, k) => {
                    obj[k] = typeof v === "string" ? v : "[file]";
                  });
                  body = JSON.stringify(obj);
                }
              } catch {
                /* body unreadable, fall through with null */
              }
              await handleYoutubeiPost(u, body, "fetch");
            })();
          }
        } catch (err) {
          log("warn", "youtube beacon hook", { err: String(err) });
        }
        return result;
      };
      log("info", "youtube sendBeacon patched");
    }

    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR(this: XMLHttpRequest) {
      const xhr = new OrigXHR();
      let _url = "";
      let _method = "GET";
      let _body: string | null = null;
      const origOpen = xhr.open;
      const origSend = xhr.send;
      xhr.open = function (method: string, url: string) {
        _method = String(method ?? "GET").toUpperCase();
        _url = String(url ?? "");
        return origOpen.apply(xhr, arguments as any);
      };
      xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
        _body = typeof body === "string" ? body : null;
        xhr.addEventListener("load", () => {
          try {
            if (_method !== "POST") return;
            if (xhr.status < 200 || xhr.status >= 300) return;
            if (LIKE_RE.test(_url)) {
              void handleLike(_url, _body);
            } else if (YOUTUBEI_RE.test(_url)) {
              void handleYoutubeiPost(_url, _body, "xhr");
            }
            if (PLAYER_RE.test(_url)) {
              harvestVideoDetails(readJson(xhr.responseText));
            }
          } catch (err) {
            log("warn", "youtube xhr hook", { err: String(err) });
          }
        });
        return origSend.apply(xhr, arguments as any);
      };
      return xhr;
    }
    PatchedXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;

    function harvestGlobals() {
      try {
        const keys = ["ytInitialPlayerResponse", "ytInitialData"];
        for (const k of keys) {
          const v = (window as any)[k];
          if (v) harvestVideoDetails(v);
        }
      } catch {}
    }
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", harvestGlobals, {
        once: true,
      });
    } else {
      harvestGlobals();
    }

    // Loud, single, visually-distinct boot line so you can instantly tell
    // — from any page console on youtube.com — whether the inject took
    // effect. If you don't see this line on a fresh tab, the extension
    // hasn't reloaded; reload at chrome://extensions and hard-refresh.
    try {
      console.log(
        "%c[pond youtube]%c hooks installed → fetch + XHR + sendBeacon",
        "background:#1f9d55;color:white;padding:2px 4px;border-radius:3px;font-weight:bold",
        "color:#1f9d55",
      );
    } catch {
      /* fallback handled by log() below */
    }
    log("info", "youtube inject loaded", { href: location.href });
  },
});
