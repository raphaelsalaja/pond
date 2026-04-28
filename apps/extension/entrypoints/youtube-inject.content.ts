export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main() {
    if ((window as any).__pondYoutubeInjected) return;
    (window as any).__pondYoutubeInjected = true;

    const POND_EVENT = "pond:capture";
    const EDIT_PLAYLIST_RE = /\/youtubei\/v1\/browse\/edit_playlist\b/i;
    const LIKE_RE = /\/youtubei\/v1\/like\/like\b/i;
    const PLAYER_RE = /\/youtubei\/v1\/(player|next)\b/i;

    const videoCache = new Map<string, any>();

    function emit(message: unknown) {
      window.postMessage({ type: POND_EVENT, message }, "*");
    }
    function capture(payload: unknown) {
      emit({ kind: "capture", payload });
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

    function extractAddVideoIds(body: string | null) {
      const json = readJson(body);
      if (!json) return [];
      const out: string[] = [];
      const actions = json?.actions;
      if (Array.isArray(actions)) {
        for (const a of actions) {
          if (
            (a?.action === "ACTION_ADD_VIDEO" ||
              a?.type === "ACTION_ADD_VIDEO") &&
            a?.addedVideoId
          ) {
            out.push(String(a.addedVideoId));
          }
        }
      }
      return out;
    }

    function extractLikeVideoId(body: string | null) {
      const json = readJson(body);
      const id =
        json?.target?.videoId ?? json?.videoId ?? json?.params?.videoId ?? null;
      return id ? String(id) : null;
    }

    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : (input as Request)?.url;
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const body =
        init?.body && typeof init.body === "string" ? init.body : null;

      const res = await origFetch.call(this, input, init);

      try {
        if (typeof url === "string" && res.ok) {
          if (method === "POST" && EDIT_PLAYLIST_RE.test(url)) {
            const ids = extractAddVideoIds(body);
            log("info", "youtube edit_playlist", { ids });
            for (const id of ids) void emitSave(id, "playlist");
          } else if (method === "POST" && LIKE_RE.test(url)) {
            const id = extractLikeVideoId(body);
            log("info", "youtube like", { id });
            if (id) void emitSave(id, "like");
          } else if (PLAYER_RE.test(url)) {
            const clone = res.clone();
            clone
              .text()
              .then((t) => harvestVideoDetails(readJson(t)))
              .catch(() => {});
          }
        }
      } catch (err) {
        log("warn", "youtube fetch hook", { err: String(err) });
      }
      return res;
    };

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

    log("info", "youtube inject loaded", { href: location.href });
  },
});
