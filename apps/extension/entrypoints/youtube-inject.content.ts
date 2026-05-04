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
    // Cache `playerResponse.captions` and `chapters` per videoId so the
    // emit step can attach them to `raw.youtube` even when the active
    // ytInitialPlayerResponse has rotated past the saved video.
    const captionsCache = new Map<string, unknown[]>();
    const chaptersCache = new Map<
      string,
      Array<{ title: string; startSec: number }>
    >();

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
      // Caption tracks: `playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks`.
      const tracks =
        obj?.playerCaptionsTracklistRenderer?.captionTracks ??
        (obj?.captionTracks &&
        Array.isArray(obj.captionTracks) &&
        obj.captionTracks.length > 0 &&
        obj.captionTracks[0]?.languageCode
          ? obj.captionTracks
          : null);
      if (Array.isArray(tracks) && obj?.videoId) {
        captionsCache.set(String(obj.videoId), tracks);
      }
      // Chapter markers can live under
      // `playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer
      // .decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer
      // .markersMap[*].value.chapters[*]`. Easier to walk for the shape.
      if (
        Array.isArray(obj.chapters) &&
        obj.chapters[0]?.chapterRenderer?.title
      ) {
        const list = obj.chapters
          .map((ch: any) => {
            const r = ch?.chapterRenderer;
            if (!r) return null;
            const t = r?.title?.simpleText ?? r?.title?.runs?.[0]?.text ?? null;
            const ms = r?.timeRangeStartMillis;
            if (typeof t !== "string" || typeof ms !== "number") return null;
            return { title: t, startSec: Math.round(ms / 1000) };
          })
          .filter(Boolean) as Array<{ title: string; startSec: number }>;
        if (list.length > 0) {
          // Find a videoId on the closest enclosing object — fall back
          // to scanning the parent for one. We cache against any video
          // id we've already seen so we don't have to thread parent
          // refs through; the next save for that id picks them up.
          for (const [vid] of videoCache) {
            if (!chaptersCache.has(vid)) chaptersCache.set(vid, list);
          }
        }
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

      // Per-source typed bag — mirrors `RawYoutube` on the desktop side.
      const youtube: Record<string, unknown> = { kind };
      if (typeof details?.lengthSeconds === "string") {
        const n = Number.parseInt(details.lengthSeconds, 10);
        if (Number.isFinite(n)) youtube.durationSec = n;
      } else if (typeof details?.lengthSeconds === "number") {
        youtube.durationSec = details.lengthSeconds;
      }
      if (typeof details?.channelId === "string") {
        youtube.channelId = details.channelId;
        youtube.channelUrl = `https://www.youtube.com/channel/${details.channelId}`;
      }
      if (typeof author === "string") youtube.channelName = author;
      if (typeof details?.shortDescription === "string") {
        youtube.shortDescription = details.shortDescription;
      }
      if (Array.isArray(details?.keywords)) {
        youtube.keywords = details.keywords as string[];
      }
      const metrics: Record<string, number> = {};
      if (typeof details?.viewCount === "string") {
        const n = Number.parseInt(details.viewCount, 10);
        if (Number.isFinite(n)) metrics.views = n;
      } else if (typeof details?.viewCount === "number") {
        metrics.views = details.viewCount;
      }
      if (Object.keys(metrics).length > 0) youtube.metrics = metrics;
      const captions = captionsCache.get(String(videoId));
      if (Array.isArray(captions) && captions.length > 0) {
        youtube.captions = captions
          .map((c: any) => ({
            lang: typeof c?.languageCode === "string" ? c.languageCode : "",
            name: c?.name?.simpleText ?? c?.name?.runs?.[0]?.text ?? undefined,
            vssId: typeof c?.vssId === "string" ? c.vssId : undefined,
          }))
          .filter((c: any) => c.lang);
      }
      const chapters = chaptersCache.get(String(videoId));
      if (chapters && chapters.length > 0) youtube.chapters = chapters;

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
          youtube,
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
     * Pull every videoId out of a `playlistEditResults` array in the
     * response body. The shape we look for is:
     *
     *   playlistEditResults: [
     *     { playlistEditVideoAddedResultData: { videoId, setVideoId } }
     *   ]
     *
     * Recursively because YouTube occasionally nests the results under
     * `frameworkUpdates` or other wrapper objects.
     */
    function collectEditedVideoIds(node: unknown, out: Set<string>): void {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) collectEditedVideoIds(x, out);
        return;
      }
      const obj = node as Record<string, unknown>;
      const added = obj.playlistEditVideoAddedResultData as
        | Record<string, unknown>
        | undefined;
      if (added && typeof added.videoId === "string") {
        out.add(added.videoId);
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object") collectEditedVideoIds(v, out);
      }
    }

    /**
     * Pull every playlist target out of a response body — specifically
     * the `refreshPlaylistCommand.listId` and `playlistId` fields YouTube
     * stamps onto post-mutation actions. Used to detect a save-to-WL
     * even when the request body was opaque.
     */
    function collectAffectedPlaylistIds(node: unknown, out: Set<string>): void {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) collectAffectedPlaylistIds(x, out);
        return;
      }
      const obj = node as Record<string, unknown>;
      const refresh = obj.refreshPlaylistCommand as
        | Record<string, unknown>
        | undefined;
      if (refresh && typeof refresh.listId === "string") {
        out.add(refresh.listId);
      }
      if (typeof obj.playlistId === "string") out.add(obj.playlistId);
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object") collectAffectedPlaylistIds(v, out);
      }
    }

    /**
     * Inspect a /youtubei/v1/ POST and decide whether it represents a
     * save-worthy action. URL is used only as a label/hint — request +
     * response body shape is authoritative so future YouTube reshuffles
     * don't break us.
     *
     * The response body is the most reliable source: regardless of how
     * the request was encoded (JSON, protobuf, opaque blob), the
     * response for a successful playlist mutation always carries
     * `playlistEditResults[*].playlistEditVideoAddedResultData.videoId`
     * plus an `actions[*].refreshPlaylistCommand.listId` telling us
     * which playlist was touched (literally "WL" for Watch Later).
     *
     * sendBeacon callers pass `responseBody=null` because the browser
     * gives us no response object — for those we fall back to request
     * body parsing only.
     */
    function classifyYoutubeiPost(
      url: string,
      requestBody: string | null,
      responseBody: string | null,
    ): {
      saves: Array<{ videoId: string; kind: string }>;
      summary: Record<string, unknown>;
    } {
      const reqJson = readJson(requestBody);
      const resJson = readJson(responseBody);

      // Request-body signals (some clients still send these legibly).
      const reqVideoIds = new Set<string>();
      collectAddedVideoIds(reqJson, reqVideoIds);
      const reqPlaylistIds = new Set<string>();
      findPlaylistIds(reqJson, reqPlaylistIds);
      const hasAddVideoAction = anyStringMatches(
        reqJson,
        (s) => s === "ACTION_ADD_VIDEO" || s === "addToPlaylistCommand",
      );

      // Response-body signals — the canonical "what actually happened".
      const resVideoIds = new Set<string>();
      collectEditedVideoIds(resJson, resVideoIds);
      const resPlaylistIds = new Set<string>();
      collectAffectedPlaylistIds(resJson, resPlaylistIds);

      const allVideoIds = new Set<string>([...reqVideoIds, ...resVideoIds]);
      const allPlaylistIds = new Set<string>([
        ...reqPlaylistIds,
        ...resPlaylistIds,
      ]);
      const isWatchLater = [...allPlaylistIds].some(
        (p) => p.toUpperCase() === WATCH_LATER_PLAYLIST_ID,
      );
      const looksLikePlaylistEdit = PLAYLIST_EDIT_HINT_RE.test(url);

      const summary: Record<string, unknown> = {
        url,
        playlistIds: [...allPlaylistIds],
        videoIds: [...allVideoIds],
        isWatchLater,
        hasAddVideoAction,
        urlHint: looksLikePlaylistEdit,
        // Body-source telemetry. Lets us tell at a glance whether a
        // future "unmatched" log is missing the request, the response,
        // or both.
        bytes: {
          req: requestBody?.length ?? 0,
          res: responseBody?.length ?? 0,
        },
      };

      if (allVideoIds.size === 0) return { saves: [], summary };

      const saves: Array<{ videoId: string; kind: string }> = [];
      // The response confirms the edit succeeded; if `resVideoIds` is
      // populated at all, treat every entry as a real save (YouTube
      // doesn't list videos in `playlistEditVideoAddedResultData`
      // unless the add actually went through).
      const targets =
        resVideoIds.size > 0
          ? resVideoIds
          : hasAddVideoAction || looksLikePlaylistEdit
            ? allVideoIds
            : new Set<string>();
      for (const id of targets) {
        saves.push({
          videoId: id,
          kind: isWatchLater ? "watch-later" : "playlist",
        });
      }
      return { saves, summary };
    }

    /**
     * Common handler for both fetch and XHR. Routes every /youtubei/v1/
     * POST through `classifyYoutubeiPost` and emits one save per video
     * id found. Logs every POST (matched or not) so the page console
     * shows exactly which YouTube endpoints fired when the user clicked
     * — invaluable for diagnosing future YouTube refactors.
     *
     * `responseBody` is the second-stage signal — see classifier comment.
     * sendBeacon callers pass `null` because the browser doesn't surface
     * a response.
     */
    async function handleYoutubeiPost(
      url: string,
      requestBody: string | null,
      responseBody: string | null,
      via: "fetch" | "xhr" | "beacon",
    ) {
      const { saves, summary } = classifyYoutubeiPost(
        url,
        requestBody,
        responseBody,
      );
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
            // We clone the response and feed both request + response
            // bodies into the classifier — the response is the most
            // reliable source for "what video got added to which
            // playlist" since modern YouTube sends opaque request
            // bodies but always returns canonical
            // `playlistEditResults` arrays.
            let responseText: string | null = null;
            try {
              responseText = await res.clone().text();
            } catch {
              /* response stream consumed elsewhere; fall back to req-body only */
            }
            await handleYoutubeiPost(
              url,
              await bodyPromise,
              responseText,
              "fetch",
            );
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
              await handleYoutubeiPost(u, body, null, "beacon");
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
            // `xhr.responseText` is empty for non-text responseTypes
            // (arraybuffer / blob), in which case we just pass null and
            // the classifier falls back to request-body parsing only.
            const responseText =
              xhr.responseType === "" || xhr.responseType === "text"
                ? xhr.responseText
                : null;
            if (LIKE_RE.test(_url)) {
              void handleLike(_url, _body);
            } else if (YOUTUBEI_RE.test(_url)) {
              void handleYoutubeiPost(_url, _body, responseText, "xhr");
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
