export default defineContentScript({
  matches: ["https://www.pinterest.com/*", "https://*.pinterest.com/*"],
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main() {
    if ((window as any).__pondPinterestInjected) return;
    (window as any).__pondPinterestInjected = true;

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

    // ---------- save-mutation detection ----------

    const SAVE_RE =
      /\/resource\/(?:Repin|RepinSave|BoardPickerSave|UserPin|Pin)Resource\/create\/?(?:\?|$)/i;

    function decodeDataParam(encoded: string) {
      try {
        return JSON.parse(decodeURIComponent(encoded));
      } catch {
        try {
          return JSON.parse(encoded);
        } catch {
          return null;
        }
      }
    }

    function pinIdFromBody(body: string | null) {
      if (!body) return null;
      if (typeof body !== "string") return null;
      let json: any = null;
      if (body.startsWith("data=")) {
        json = decodeDataParam(body.slice(5).split("&")[0]);
      } else if (body.includes("&data=")) {
        const m = body.match(/(?:^|&)data=([^&]+)/);
        if (m) json = decodeDataParam(m[1]);
      } else if (body.startsWith("{")) {
        try {
          json = JSON.parse(body);
        } catch {
          json = null;
        }
      }
      if (!json) return null;
      const opts = json.options ?? json;
      const id =
        opts?.pin_id ??
        opts?.id ??
        opts?.source_pin_id ??
        opts?.sourceId ??
        null;
      return id ? { pinId: String(id), raw: json } : null;
    }

    // ---------- pin lookups ----------

    function getCookie(name: string) {
      const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
      return m ? decodeURIComponent(m[1]) : null;
    }

    async function fetchPidgets(pinId: string) {
      try {
        const res = await fetch(
          `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${pinId}`,
          { credentials: "omit" },
        );
        if (!res.ok) {
          log("warn", "pinterest pidgets failed", {
            pinId,
            status: res.status,
          });
          return null;
        }
        const json = await res.json();
        const item = json?.data?.[0];
        return item ?? null;
      } catch (e) {
        log("warn", "pinterest pidgets error", String(e));
        return null;
      }
    }

    async function fetchPinResource(pinId: string) {
      const data = JSON.stringify({
        options: { id: pinId, field_set_key: "unauth_react_main_pin" },
        context: {},
      });
      const sourceUrl = `/pin/${pinId}/`;
      const url =
        `/resource/PinResource/get/?source_url=${encodeURIComponent(sourceUrl)}` +
        `&data=${encodeURIComponent(data)}`;
      const headers: Record<string, string> = {
        accept: "application/json, text/javascript, */*, q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "x-pinterest-appstate": "active",
        "x-pinterest-source-url": sourceUrl,
        "x-pinterest-pws-handler": "www/pin/[id].js",
      };
      const csrf = getCookie("csrftoken");
      if (csrf) headers["x-csrftoken"] = csrf;
      try {
        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers,
        });
        if (!res.ok) {
          log("warn", "pinterest resource failed", {
            pinId,
            status: res.status,
          });
          return null;
        }
        const json = await res.json();
        const status = json?.resource_response?.status;
        if (status && status !== "success") {
          log("warn", "pinterest resource non-success", {
            pinId,
            status,
            message: json?.resource_response?.error?.message,
          });
          return null;
        }
        return json?.resource_response?.data ?? null;
      } catch (e) {
        log("warn", "pinterest resource error", String(e));
        return null;
      }
    }

    const inflight = new Map();
    function fetchPin(pinId: string) {
      if (inflight.has(pinId)) return inflight.get(pinId);
      const p = Promise.allSettled([
        fetchPidgets(pinId),
        fetchPinResource(pinId),
      ]).then(([a, b]) => ({
        pidgets: a.status === "fulfilled" ? a.value : null,
        resource: b.status === "fulfilled" ? b.value : null,
      }));
      inflight.set(pinId, p);
      p.finally(() => inflight.delete(pinId));
      return p;
    }

    // ---------- payload normalisation ----------

    function pickLargestImage(images: any) {
      if (!images || typeof images !== "object") return null;
      const order = [
        "orig",
        "originals",
        "1200x",
        "736x",
        "564x",
        "474x",
        "236x",
      ];
      for (const k of order) {
        const v = images[k];
        if (v && typeof v.url === "string") return v.url;
      }
      let best: { url: string; w: number } | null = null;
      for (const k of Object.keys(images)) {
        const v = images[k];
        if (v && typeof v.url === "string") {
          const w = Number(v.width) || 0;
          if (!best || w > best.w) best = { url: v.url, w };
        }
      }
      return best?.url ?? null;
    }

    function pickBestVideo(videoList: any) {
      if (!videoList || typeof videoList !== "object") return null;
      const order = ["V_HEVC_MP4_T1_V2", "V_720P", "V_HLSV4", "V_DASH_HEVC"];
      for (const k of order) {
        const v = videoList[k];
        if (v && typeof v.url === "string" && /\.mp4(\?|$)/i.test(v.url))
          return v.url;
      }
      for (const k of order) {
        const v = videoList[k];
        if (v && typeof v.url === "string") return v.url;
      }
      for (const k of Object.keys(videoList)) {
        const v = videoList[k];
        if (v && typeof v.url === "string" && /\.mp4(\?|$)/i.test(v.url))
          return v.url;
      }
      return null;
    }

    function normalizeStoryPin(storyPinData: any) {
      const gallery: any[] = [];
      const pages = storyPinData?.pages ?? [];
      for (const page of pages) {
        const blocks = page?.blocks ?? [];
        for (const b of blocks) {
          if (b?.type === "story_pin_image_block" || b?.block_type === 1) {
            const url = pickLargestImage(b?.image?.images);
            if (url) gallery.push({ type: "image", url });
          } else if (
            b?.type === "story_pin_video_block" ||
            b?.block_type === 3
          ) {
            const v = pickBestVideo(b?.video?.video_list);
            const poster = pickLargestImage(b?.video?.image?.images);
            if (v)
              gallery.push({ type: "video", url: poster || v, videoUrl: v });
          }
        }
      }
      return gallery;
    }

    function normalizePidgets(item: any) {
      if (!item) return null;
      const id = item.id ? String(item.id) : null;
      const out: any = {
        url: id ? `https://www.pinterest.com/pin/${id}/` : null,
        title: null,
        description:
          typeof item.description === "string" && item.description.trim()
            ? item.description.trim()
            : null,
        author:
          item.pinner && typeof item.pinner.username === "string"
            ? `@${item.pinner.username}`
            : null,
        mediaUrl: null,
        mediaType: null,
      };
      if (item.grid_title && typeof item.grid_title === "string") {
        out.title = item.grid_title.trim();
      } else if (item.rich_metadata?.title) {
        out.title = String(item.rich_metadata.title).trim();
      }
      const img =
        item.images?.orig?.url ??
        item.images?.["736x"]?.url ??
        item.image_large_url ??
        item.image_square_url ??
        null;
      const embed = item.embed;
      if (embed && embed.type === "gif" && typeof embed.src === "string") {
        out.mediaUrl = img ?? embed.src;
        out.mediaType = "video";
        out.videoUrl = embed.src;
      } else if (img) {
        out.mediaUrl = img;
        out.mediaType = "image";
      }
      return out;
    }

    function mergeContext(base: any, extra: any) {
      if (!base) return extra;
      if (!extra) return base;
      const out: any = { ...base };
      for (const k of [
        "title",
        "description",
        "author",
        "mediaUrl",
        "videoUrl",
      ]) {
        if (!out[k] && extra[k]) out[k] = extra[k];
      }
      if (
        !out.mediaType ||
        (out.mediaType === "image" && extra.mediaType === "video")
      ) {
        out.mediaType = extra.mediaType ?? out.mediaType;
      }
      if (!out.gallery && extra.gallery) out.gallery = extra.gallery;
      if (!out.url && extra.url) out.url = extra.url;
      return out;
    }

    function normalizePin(pinData: any) {
      if (!pinData) return null;

      const id = pinData.id ? String(pinData.id) : null;
      const url = id ? `https://www.pinterest.com/pin/${id}/` : null;

      let title = null;
      if (typeof pinData.title === "string" && pinData.title.trim()) {
        title = pinData.title.trim();
      } else if (
        typeof pinData.grid_title === "string" &&
        pinData.grid_title.trim()
      ) {
        title = pinData.grid_title.trim();
      } else if (typeof pinData.rich_summary?.display_name === "string") {
        title = pinData.rich_summary.display_name.trim();
      }

      let description = null;
      if (
        typeof pinData.description === "string" &&
        pinData.description.trim()
      ) {
        description = pinData.description.trim();
      } else if (
        typeof pinData.closeup_unified_description === "string" &&
        pinData.closeup_unified_description.trim()
      ) {
        description = pinData.closeup_unified_description.trim();
      } else if (
        typeof pinData.auto_alt_text === "string" &&
        pinData.auto_alt_text.trim()
      ) {
        description = pinData.auto_alt_text.trim();
      }

      let author = null;
      const u = pinData.pinner ?? pinData.native_creator;
      if (u && typeof u.username === "string") author = `@${u.username}`;

      const out: any = {
        url,
        title,
        description,
        author,
        mediaUrl: null,
        mediaType: null,
      };

      if (pinData.story_pin_data) {
        const gallery = normalizeStoryPin(pinData.story_pin_data);
        if (gallery.length > 0) {
          out.gallery = gallery;
          out.mediaUrl = gallery[0].url;
          out.mediaType = gallery[0].type;
          if (gallery[0].videoUrl) out.videoUrl = gallery[0].videoUrl;
          return out;
        }
      }

      const videoList =
        pinData.videos?.video_list ?? pinData.story_pin_data?.video_list;
      if (videoList) {
        const v = pickBestVideo(videoList);
        const poster = pickLargestImage(pinData.images);
        if (v) {
          out.mediaUrl = poster || v;
          out.mediaType = "video";
          out.videoUrl = v;
          return out;
        }
      }

      const img = pickLargestImage(pinData.images);
      if (img) {
        out.mediaUrl = img;
        out.mediaType = "image";
        return out;
      }

      return out;
    }

    // ---------- emit ----------

    const emitted = new Set();

    async function handleSave(pinId: string, raw: any) {
      if (emitted.has(pinId)) return;
      emitted.add(pinId);

      const { pidgets, resource } = await fetchPin(pinId);
      const fromResource = resource ? normalizePin(resource) : null;
      const fromPidgets = pidgets ? normalizePidgets(pidgets) : null;
      const ctx = mergeContext(fromResource, fromPidgets);

      const via = fromResource
        ? fromPidgets
          ? "pin-resource+pidgets"
          : "pin-resource"
        : fromPidgets
          ? "pidgets"
          : "save-mutation-only";

      const fallbackUrl = `https://www.pinterest.com/pin/${pinId}/`;
      const payload: any = {
        source: "pinterest",
        sourceId: pinId,
        url: ctx?.url ?? fallbackUrl,
        title: ctx?.title ?? null,
        description: ctx?.description ?? null,
        author: ctx?.author ?? null,
        mediaUrl: ctx?.mediaUrl ?? null,
        mediaType: ctx?.mediaType ?? (ctx?.mediaUrl ? "image" : "link"),
        raw: {
          via,
          capturedAt: new Date().toISOString(),
          save: raw,
        },
      };
      if (ctx?.videoUrl) payload.raw.videoUrl = ctx.videoUrl;
      if (ctx?.gallery && ctx.gallery.length > 1) {
        payload.raw.gallery = ctx.gallery;
      }

      capture(payload);

      log("info", "pinterest saved", {
        pinId,
        via,
        hasMedia: !!payload.mediaUrl,
        mediaType: payload.mediaType,
        gallery: payload.raw.gallery?.length ?? 0,
      });
    }

    // ---------- network hooks ----------

    function isSaveUrl(url: string) {
      return typeof url === "string" && SAVE_RE.test(url);
    }

    const origFetch = window.fetch;
    (window as any).fetch = function (input: any, init?: any) {
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

      const promise = origFetch.call(this, input, init);

      if (method === "POST" && isSaveUrl(url)) {
        promise
          .then((res: Response) => {
            if (!res.ok) return;
            const bodyStr = typeof body === "string" ? body : null;
            const found = pinIdFromBody(bodyStr);
            if (found) handleSave(found.pinId, found.raw);
          })
          .catch(() => {});
      }
      return promise;
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
      if (
        (this as any).__pondMethod === "POST" &&
        isSaveUrl((this as any).__pondUrl)
      ) {
        const bodyStr = typeof body === "string" ? body : null;
        this.addEventListener(
          "load",
          function (this: XMLHttpRequest) {
            try {
              if (this.status < 200 || this.status >= 300) return;
              const found = pinIdFromBody(bodyStr);
              if (found) handleSave(found.pinId, found.raw);
            } catch {
              /* ignore */
            }
          },
          { once: true },
        );
      }
      return origSend.apply(this, arguments as any);
    };

    log("info", "pinterest inject ready (pidgets + PinResource enrichment)");
  },
});
