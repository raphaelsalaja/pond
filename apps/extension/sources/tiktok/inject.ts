export function inject() {
  if ((window as any).__pondTiktokInjected) return;
  (window as any).__pondTiktokInjected = true;

  const POND_EVENT = "pond:capture";
  const FAVORITE_RE = /\/api\/aweme\/favorite\/?/i;
  const awemeCache = new Map<string, any>();

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

  function walkForAweme(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const x of obj) walkForAweme(x);
      return;
    }
    const id = obj.aweme_id ?? obj.awemeId ?? obj.id;
    if (id && (obj.author || obj.video || obj.cover || obj.music)) {
      awemeCache.set(String(id), obj);
    }
    for (const k of Object.keys(obj)) {
      try {
        walkForAweme(obj[k]);
      } catch {}
    }
  }

  function awemeIdFromUrl(url: string) {
    try {
      const u = new URL(url, location.href);
      return (
        u.searchParams.get("aweme_id") ??
        u.searchParams.get("awemeId") ??
        u.searchParams.get("item_id") ??
        null
      );
    } catch {
      return null;
    }
  }

  function isFavoriteType(url: string) {
    try {
      const u = new URL(url, location.href);
      const t = u.searchParams.get("type");
      return t === "1" || t === null;
    } catch {
      return true;
    }
  }

  async function fetchOembed(id: string, username: string | null) {
    const video =
      username && id
        ? `https://www.tiktok.com/@${username}/video/${id}`
        : `https://www.tiktok.com/video/${id}`;
    try {
      const res = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(video)}`,
        { credentials: "omit" },
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function pickCover(aweme: any) {
    const v = aweme?.video;
    return (
      v?.cover?.url_list?.[0] ??
      v?.origin_cover?.url_list?.[0] ??
      v?.dynamic_cover?.url_list?.[0] ??
      aweme?.cover ??
      null
    );
  }

  function pickVideoUrl(aweme: any) {
    const v = aweme?.video;
    return (
      v?.play_addr?.url_list?.[0] ??
      v?.download_addr?.url_list?.[0] ??
      v?.playAddr ??
      null
    );
  }

  async function emitFavorite(id: string, authorUsernameHint?: string | null) {
    if (!id) return;
    const aweme = awemeCache.get(String(id));
    const author = aweme?.author ?? null;
    const username =
      author?.unique_id ??
      author?.uniqueId ??
      author?.handle ??
      authorUsernameHint ??
      null;
    const url = username
      ? `https://www.tiktok.com/@${username}/video/${id}`
      : `https://www.tiktok.com/video/${id}`;

    let title = aweme?.desc ?? aweme?.description ?? null;
    let thumb = pickCover(aweme);
    let displayAuthor =
      author?.nickname ?? author?.displayName ?? author?.unique_id ?? null;

    if (!title || !thumb) {
      const oembed = await fetchOembed(id, username);
      title = title ?? oembed?.title ?? null;
      thumb = thumb ?? oembed?.thumbnail_url ?? null;
      displayAuthor = displayAuthor ?? oembed?.author_name ?? null;
    }

    const videoUrl = pickVideoUrl(aweme);

    const tiktok: Record<string, unknown> = {};
    if (displayAuthor) tiktok.authorName = displayAuthor;
    if (typeof username === "string") tiktok.authorHandle = username;
    const avatar =
      author?.avatar_thumb?.url_list?.[0] ??
      author?.avatar_medium?.url_list?.[0] ??
      author?.avatar_larger?.url_list?.[0] ??
      null;
    if (typeof avatar === "string") tiktok.authorAvatar = avatar;
    if (typeof aweme?.create_time === "number") {
      tiktok.publishedAt = new Date(aweme.create_time * 1000).toISOString();
    }
    if (typeof aweme?.video?.duration === "number") {
      tiktok.durationSec = Math.round(aweme.video.duration / 1000);
    }
    const stats = aweme?.statistics ?? {};
    const metrics: Record<string, number> = {};
    if (typeof stats.play_count === "number") metrics.plays = stats.play_count;
    if (typeof stats.digg_count === "number") metrics.likes = stats.digg_count;
    if (typeof stats.comment_count === "number") {
      metrics.comments = stats.comment_count;
    }
    if (typeof stats.share_count === "number") {
      metrics.shares = stats.share_count;
    }
    if (typeof stats.download_count === "number") {
      metrics.downloads = stats.download_count;
    }
    if (Object.keys(metrics).length > 0) tiktok.metrics = metrics;
    const music = aweme?.music ?? null;
    if (music && typeof music === "object") {
      const m: Record<string, unknown> = {};
      if (typeof music.title === "string") m.title = music.title;
      if (typeof music.author === "string") m.author = music.author;
      if (music.id != null) m.id = String(music.id);
      if (Object.keys(m).length > 0) tiktok.music = m;
    }

    capture({
      source: "tiktok",
      sourceId: String(id),
      url,
      title,
      description: typeof aweme?.desc === "string" ? aweme.desc : null,
      author: displayAuthor,
      mediaUrl: thumb,
      mediaType: videoUrl ? "video" : thumb ? "image" : "link",
      raw: {
        capturedAt: new Date().toISOString(),
        ...(videoUrl ? { videoUrl } : {}),
        ...(aweme ? { aweme } : {}),
        ...(Object.keys(tiktok).length > 0 ? { tiktok } : {}),
      },
    });
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input as Request)?.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const res = await origFetch.call(this, input, init);

    try {
      if (typeof url === "string") {
        if (FAVORITE_RE.test(url) && isFavoriteType(url) && res.ok) {
          const id = awemeIdFromUrl(url);
          log("info", "tiktok favorite", { url, id });
          if (id) void emitFavorite(id);
        } else if (
          method === "GET" &&
          /\/api\/(aweme|item|feed|post)/i.test(url) &&
          res.ok
        ) {
          const clone = res.clone();
          clone
            .text()
            .then((t) => walkForAweme(readJson(t)))
            .catch(() => {});
        }
      }
    } catch (err) {
      log("warn", "tiktok fetch hook", { err: String(err) });
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method: string, url: string) {
    (this as any).__pondMeta = { method, url };
    return origOpen.apply(this, arguments as any);
  };
  XMLHttpRequest.prototype.send = function () {
    const meta = (this as any).__pondMeta ?? {};
    this.addEventListener("load", () => {
      try {
        if (this.status < 200 || this.status >= 300) return;
        const url = meta.url;
        if (typeof url !== "string") return;
        if (FAVORITE_RE.test(url) && isFavoriteType(url)) {
          const id = awemeIdFromUrl(url);
          if (id) void emitFavorite(id);
        } else if (/\/api\/(aweme|item|feed|post)/i.test(url)) {
          walkForAweme(readJson(this.responseText));
        }
      } catch (err) {
        log("warn", "tiktok xhr hook", { err: String(err) });
      }
    });
    return origSend.apply(this, arguments as any);
  };

  log("info", "tiktok inject loaded", { href: location.href });
}
