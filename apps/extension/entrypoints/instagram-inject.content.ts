export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main() {
    if ((window as any).__pondInstagramInjected) return;
    (window as any).__pondInstagramInjected = true;

    const POND_EVENT = "pond:capture";
    const ALPHABET =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function looksLikeSaveLabel(label: string | null) {
      if (!label) return false;
      const l = label.toLowerCase().trim();
      return (
        l === "save" ||
        l === "bookmark" ||
        l.includes("save to collection") ||
        l.includes("add to collection")
      );
    }

    function emit(message: unknown) {
      window.postMessage({ type: POND_EVENT, message }, "*");
    }
    function capture(payload: unknown) {
      emit({ kind: "capture", payload });
    }
    function log(level: string, message: string, data?: unknown) {
      emit({ kind: "log", level, message, data });
    }

    function shortcodeFromHref(href: string | null) {
      if (!href) return null;
      const m = String(href).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    }

    function kindFromHref(href: string | null) {
      if (!href) return "p";
      if (href.includes("/reel/")) return "reel";
      if (href.includes("/tv/")) return "tv";
      return "p";
    }

    function pickLargestSrcset(srcset: string | null) {
      if (!srcset) return null;
      const parts = srcset
        .split(",")
        .map((p) => p.trim())
        .map((p) => {
          const [u, sz] = p.split(/\s+/);
          return { u, w: sz ? parseInt(sz, 10) : 0 };
        })
        .filter((p) => p.u);
      if (!parts.length) return null;
      parts.sort((a, b) => b.w - a.w);
      return parts[0].u;
    }

    function looksLikeAvatar(url: string | null) {
      if (!url) return true;
      if (/\/t51\.82787-19\//.test(url)) return true;
      if (/profile_pic/i.test(url)) return true;
      try {
        const u = new URL(url, location.origin);
        const efg = u.searchParams.get("efg");
        if (efg) {
          try {
            if (/profile_pic/i.test(atob(efg))) return true;
          } catch {
            /* not valid base64 */
          }
        }
      } catch {
        /* not a parseable URL */
      }
      return false;
    }

    function isPostMediaLink(link: Element | null) {
      if (!link) return false;
      const video = link.querySelector("video");
      if (video) return true;
      const img = link.querySelector("img") as HTMLImageElement | null;
      if (!img) return false;
      const src = img.currentSrc || img.src || "";
      if (looksLikeAvatar(src)) return false;
      return true;
    }

    function findPostContainer(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;

      let cur: Element | null = target;
      let depth = 0;
      while (cur && depth < 30) {
        const links = cur.querySelectorAll(
          'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
        );
        for (const link of links) {
          if (isPostMediaLink(link)) return { container: cur, link };
        }
        cur = cur.parentElement;
        depth++;
      }

      cur = target;
      depth = 0;
      while (cur && depth < 30) {
        if (cur.querySelector) {
          const link = cur.querySelector(
            'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
          );
          if (link && shortcodeFromHref(link.getAttribute("href") || "")) {
            const imgs = cur.querySelectorAll("img");
            for (const img of imgs) {
              const url = pickImageUrl(img as HTMLImageElement);
              if (url && !looksLikeAvatar(url)) {
                return { container: cur, link };
              }
            }
            if (cur.querySelector("video")) {
              return { container: cur, link };
            }
          }
        }
        cur = cur.parentElement;
        depth++;
      }
      return null;
    }

    const RESERVED_PATHS = new Set([
      "p",
      "reel",
      "tv",
      "explore",
      "stories",
      "direct",
      "accounts",
      "about",
      "developer",
      "legal",
      "press",
      "api",
      "jobs",
      "privacy",
      "terms",
      "blog",
      "help",
    ]);

    const UI_NOISE_RE =
      /^(instagram|suggested for you|see all|switch|posts|reels|tagged|saved|view profile|message|follow|following|log in|sign up|search|more|home|notifications|create|profile|meta|about|jobs|api|privacy|terms|english|verified|los angeles, california|english \(uk\))$/i;

    function findAuthor(container: Element, mediaLink: Element | null) {
      const anchors = Array.from(container.querySelectorAll('a[href^="/"]'));
      const idx = mediaLink ? anchors.indexOf(mediaLink) : -1;

      function harvest(start: number, end: number) {
        for (let i = start; i < end; i++) {
          const a = anchors[i];
          const path = (a.getAttribute("href") || "").split("?")[0];
          const m = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
          if (m && !RESERVED_PATHS.has(m[1])) return `@${m[1]}`;
        }
        return null;
      }

      if (idx > 0) {
        const before = harvest(0, idx);
        if (before) return before;
      }
      return harvest(0, anchors.length);
    }

    function findCaption(container: Element, author: string | null) {
      const handle = author ? author.replace(/^@/, "") : null;

      function clean(txt: string | null) {
        if (!txt) return null;
        const t = txt.trim();
        if (t.length < 3) return null;
        if (UI_NOISE_RE.test(t)) return null;
        if (handle && t === handle) return null;
        return t;
      }

      const h1 = container.querySelector("h1");
      if (h1) {
        const c = clean(h1.textContent);
        if (c) return c;
      }

      let best = "";
      const spans = container.querySelectorAll('span[dir="auto"]');
      for (const s of spans) {
        const c = clean(s.textContent);
        if (!c) continue;
        if (/Suggested for you/i.test(c)) continue;
        if (c.length > best.length) best = c;
      }
      return best || null;
    }

    function pickImageUrl(img: HTMLImageElement | null) {
      if (!img) return null;
      const fromSet = img.srcset ? pickLargestSrcset(img.srcset) : null;
      return fromSet || img.currentSrc || img.src || null;
    }

    function findMedia(container: Element, mediaLink: Element | null) {
      if (mediaLink) {
        const v = mediaLink.querySelector("video") as HTMLVideoElement | null;
        if (v) {
          const src = v.currentSrc || v.src;
          if (src) {
            return {
              mediaUrl: v.poster || src,
              mediaType: "video",
              videoUrl: src,
            };
          }
        }
        const i = mediaLink.querySelector("img") as HTMLImageElement | null;
        if (i) {
          const url = pickImageUrl(i);
          if (url && !looksLikeAvatar(url)) {
            return { mediaUrl: url, mediaType: "image", videoUrl: null };
          }
        }
      }

      const video = container.querySelector("video") as HTMLVideoElement | null;
      if (video) {
        const src = video.currentSrc || video.src;
        if (src) {
          return {
            mediaUrl: video.poster || src,
            mediaType: "video",
            videoUrl: src,
          };
        }
      }
      const imgs = Array.from(
        container.querySelectorAll("img"),
      ) as HTMLImageElement[];
      for (const img of imgs) {
        const url = pickImageUrl(img);
        if (!url) continue;
        if (looksLikeAvatar(url)) continue;
        return { mediaUrl: url, mediaType: "image", videoUrl: null };
      }
      return null;
    }

    function findSaveElementFromTarget(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;
      let cur: Element | null = target;
      let depth = 0;
      while (cur && depth < 8) {
        const lbl = cur.getAttribute?.("aria-label");
        if (lbl && looksLikeSaveLabel(lbl)) return cur;
        cur = cur.parentElement;
        depth++;
      }
      const button = target.closest?.(
        'button, [role="button"], a[role="button"], div[role="button"]',
      );
      if (button) {
        const inner = button.querySelector
          ? button.querySelector("svg[aria-label]")
          : null;
        if (inner) {
          const lbl = inner.getAttribute("aria-label");
          if (lbl && looksLikeSaveLabel(lbl)) return inner;
        }
      }
      return null;
    }

    function buildContext(found: { container: Element; link: Element }) {
      const { container, link } = found;
      const href =
        link.getAttribute("href") || (link as HTMLAnchorElement).href || "";
      const shortcode = shortcodeFromHref(href);
      if (!shortcode) return null;
      const kind = kindFromHref(href);
      const canonicalUrl = `https://www.instagram.com/${kind}/${shortcode}/`;

      const author = findAuthor(container, link);
      const caption = findCaption(container, author);
      const media = findMedia(container, link);

      return {
        shortcode,
        url: canonicalUrl,
        author,
        title: caption ? caption.replace(/\s+/g, " ").slice(0, 200) : null,
        description: caption,
        mediaUrl: media?.mediaUrl ?? null,
        mediaType: media?.mediaType ?? null,
        videoUrl: media?.videoUrl ?? null,
      };
    }

    function locationContext() {
      const sc = shortcodeFromHref(location.pathname);
      if (!sc) return null;
      const kind = kindFromHref(location.pathname);
      return {
        shortcode: sc,
        url: `https://www.instagram.com/${kind}/${sc}/`,
        author: null,
        title: null,
        description: null,
        mediaUrl: null,
        mediaType: null,
        videoUrl: null,
      };
    }

    function emitCapture(ctx: any, via: string) {
      const raw: any = { via, capturedAt: new Date().toISOString() };
      // Per-source typed bag — ingest namespaces by `payload.source` so
      // anything we put under `raw.instagram` lands as `RawInstagram` on
      // the save without a schema migration.
      const ig: Record<string, unknown> = {};
      if (ctx.videoUrl) raw.videoUrl = ctx.videoUrl;
      if (ctx.mediaId) raw.mediaId = String(ctx.mediaId);

      const cached = lookupCachedPost(ctx.shortcode, ctx.mediaId);
      if (cached) {
        if (cached.imageUrl) ctx.mediaUrl = cached.imageUrl;
        if (cached.videoUrl) raw.videoUrl = cached.videoUrl;
        if (cached.mediaType) ctx.mediaType = cached.mediaType;
        if (cached.gallery && cached.gallery.length > 1) {
          raw.gallery = cached.gallery;
          ig.media = cached.gallery;
        }
        if (cached.caption) {
          ctx.description = cached.caption;
          ctx.title = cached.caption.replace(/\s+/g, " ").slice(0, 200);
        }
        if (cached.author && !ctx.author) ctx.author = cached.author;

        const ex = cached.extras ?? {};
        if (ex.fullName) ig.authorName = ex.fullName;
        if (ex.profilePicUrl) ig.authorAvatar = ex.profilePicUrl;
        if (typeof ex.isVerified === "boolean") ig.verified = ex.isVerified;
        if (ex.metrics && Object.keys(ex.metrics).length > 0) {
          ig.metrics = ex.metrics;
        }
        if (typeof ex.isPaidPartnership === "boolean") {
          ig.isPaidPartnership = ex.isPaidPartnership;
        }
        if (ex.location) ig.location = ex.location;
        if (ex.takenAtIso) ig.publishedAt = ex.takenAtIso;
      }

      if (raw.videoUrl && /^blob:/i.test(raw.videoUrl)) delete raw.videoUrl;
      if (ctx.mediaUrl && /^blob:/i.test(ctx.mediaUrl)) {
        ctx.mediaUrl = cached?.imageUrl ?? null;
      }

      // Author URL is always derivable from the handle.
      const handle = ctx.author ? String(ctx.author).replace(/^@/, "") : null;
      if (handle) ig.authorUrl = `https://www.instagram.com/${handle}/`;
      // Page language from `<html lang>` — best-effort, cheap.
      const htmlLang = document.documentElement?.lang?.trim();
      if (htmlLang) ig.lang = htmlLang;
      if (Object.keys(ig).length > 0) raw.instagram = ig;

      // Build the ordered media list for the server. Prefer the cached
      // gallery (carousel) when present; fall back to the single cover.
      const mediaUrls: Array<{
        url: string;
        type?: "image" | "video";
        poster?: string;
      }> = [];
      const seen = new Set<string>();
      const push = (
        url: string | null | undefined,
        type: "image" | "video",
      ) => {
        if (!url) return;
        if (/^blob:/i.test(url)) return;
        if (seen.has(url)) return;
        seen.add(url);
        mediaUrls.push({ url, type });
      };
      if (cached?.gallery && cached.gallery.length > 1) {
        for (const g of cached.gallery) {
          push(g.url, g.type === "video" ? "video" : "image");
          if (g.videoUrl) push(g.videoUrl, "video");
        }
      } else {
        push(ctx.mediaUrl, ctx.mediaType === "video" ? "video" : "image");
        if (raw.videoUrl) push(raw.videoUrl, "video");
      }

      capture({
        source: "instagram",
        sourceId: ctx.shortcode,
        url: ctx.url,
        title: ctx.title,
        description: ctx.description,
        author: ctx.author,
        mediaUrl: ctx.mediaUrl,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        mediaType: ctx.mediaType || (ctx.mediaUrl ? "image" : "link"),
        raw,
      });
    }

    // ---------- GraphQL response harvest (post media + carousels) ----------
    const POST_CACHE = new Map<string, any>();
    const POST_CACHE_LIMIT = 500;

    function cachePut(key: string | null, value: any) {
      if (!key) return;
      if (POST_CACHE.size >= POST_CACHE_LIMIT) {
        const first = POST_CACHE.keys().next().value;
        if (first !== undefined) POST_CACHE.delete(first);
      }
      POST_CACHE.set(String(key), value);
    }

    function lookupCachedPost(
      shortcode: string | null,
      mediaId?: string | null,
    ) {
      if (shortcode && POST_CACHE.has(shortcode)) {
        return POST_CACHE.get(shortcode);
      }
      if (mediaId) {
        const pk = String(mediaId).split("_")[0];
        if (POST_CACHE.has(pk)) return POST_CACHE.get(pk);
      }
      return null;
    }

    function pickBestImage(iv2: any) {
      if (!iv2) return null;
      const cands = iv2.candidates || [];
      let best: { url: string; w: number } | null = null;
      for (const c of cands) {
        if (typeof c?.url !== "string") continue;
        const w = Number(c.width) || 0;
        if (!best || w > best.w) best = { url: c.url, w };
      }
      return best?.url ?? null;
    }

    function pickBestVideo(versions: any) {
      if (!Array.isArray(versions)) return null;
      for (const v of versions) {
        if (typeof v?.url === "string") return v.url;
      }
      return null;
    }

    function captionFrom(node: any) {
      const c = node?.caption;
      if (c && typeof c.text === "string") return c.text;
      if (typeof c === "string") return c;
      return null;
    }

    function authorFrom(node: any) {
      const u = node?.user || node?.owner;
      if (u && typeof u.username === "string") return `@${u.username}`;
      return null;
    }

    function carouselItem(child: any) {
      if (!child || typeof child !== "object") return null;
      const altText =
        typeof child.accessibility_caption === "string"
          ? child.accessibility_caption
          : undefined;
      const dur =
        typeof child.video_duration === "number"
          ? Math.round(child.video_duration)
          : undefined;
      if (child.media_type === 2) {
        const v = pickBestVideo(child.video_versions);
        const img = pickBestImage(child.image_versions2);
        if (!v && !img) return null;
        return {
          type: "video",
          url: img || v,
          videoUrl: v,
          ...(altText ? { altText } : {}),
          ...(dur ? { durationSec: dur } : {}),
        };
      }
      const img = pickBestImage(child.image_versions2);
      if (!img) return null;
      return {
        type: "image",
        url: img,
        ...(altText ? { altText } : {}),
      };
    }

    // Pick the richer fields off a node we recognise as a single post or
    // a single carousel child. Lands on `raw.instagram.{...}` via the
    // emit step — additive, never breaking older saves.
    function nodeExtras(node: any) {
      const u = node?.user ?? node?.owner ?? null;
      const extras: any = {};
      if (u && typeof u.full_name === "string") extras.fullName = u.full_name;
      if (u && typeof u.profile_pic_url === "string") {
        extras.profilePicUrl = u.profile_pic_url;
      }
      if (u && typeof u.is_verified === "boolean") {
        extras.isVerified = u.is_verified;
      }
      const metrics: Record<string, number> = {};
      if (typeof node?.like_count === "number") metrics.likes = node.like_count;
      if (typeof node?.comment_count === "number") {
        metrics.comments = node.comment_count;
      }
      if (typeof node?.play_count === "number") metrics.plays = node.play_count;
      if (Object.keys(metrics).length > 0) extras.metrics = metrics;
      if (typeof node?.is_paid_partnership === "boolean") {
        extras.isPaidPartnership = node.is_paid_partnership;
      }
      const loc = node?.location;
      if (loc && typeof loc.name === "string") extras.location = loc.name;
      if (typeof node?.taken_at === "number") {
        // IG `taken_at` is unix seconds.
        extras.takenAtIso = new Date(node.taken_at * 1000).toISOString();
      }
      if (typeof node?.accessibility_caption === "string") {
        extras.accessibilityCaption = node.accessibility_caption;
      }
      if (typeof node?.video_duration === "number") {
        extras.videoDurationSec = Math.round(node.video_duration);
      }
      return extras;
    }

    function normalizeMedia(node: any) {
      if (!node || typeof node !== "object") return null;
      const code = typeof node.code === "string" ? node.code : null;
      const pk = node.pk != null ? String(node.pk) : null;
      if (!code && !pk) return null;

      const out: any = { code, pk };
      out.author = authorFrom(node);
      out.caption = captionFrom(node);
      out.extras = nodeExtras(node);

      if (node.media_type === 8 && Array.isArray(node.carousel_media)) {
        out.gallery = node.carousel_media.map(carouselItem).filter(Boolean);
        const first = out.gallery[0];
        out.imageUrl = first?.url ?? null;
        out.videoUrl = first?.videoUrl ?? null;
        out.mediaType = first?.type === "video" ? "video" : "image";
      } else if (node.media_type === 2 && Array.isArray(node.video_versions)) {
        out.mediaType = "video";
        out.videoUrl = pickBestVideo(node.video_versions);
        out.imageUrl = pickBestImage(node.image_versions2);
      } else {
        out.mediaType = "image";
        out.imageUrl = pickBestImage(node.image_versions2);
      }

      return out;
    }

    function harvestPosts(obj: any, depth: number) {
      if (obj == null || depth > 12) return;
      if (Array.isArray(obj)) {
        for (const x of obj) harvestPosts(x, depth + 1);
        return;
      }
      if (typeof obj !== "object") return;

      const looksLikePost =
        (obj.code || obj.pk) &&
        (obj.image_versions2 || obj.video_versions || obj.carousel_media);
      if (looksLikePost) {
        const norm = normalizeMedia(obj);
        if (norm) {
          if (norm.code) cachePut(norm.code, norm);
          if (norm.pk) cachePut(norm.pk, norm);
        }
      }

      for (const k of Object.keys(obj)) {
        harvestPosts(obj[k], depth + 1);
      }
    }

    function harvestText(text: string | null) {
      if (!text || typeof text !== "string") return;
      if (text[0] !== "{" && text[0] !== "[") return;
      try {
        harvestPosts(JSON.parse(text), 0);
      } catch {
        /* not JSON */
      }
    }

    document.addEventListener(
      "click",
      (ev) => {
        try {
          const saveEl = findSaveElementFromTarget(ev.target);
          if (!saveEl) return;

          const found = findPostContainer(saveEl);
          let ctx = found ? buildContext(found) : null;
          if (!ctx) ctx = locationContext();

          if (!ctx) {
            log(
              "info",
              "instagram: save click without post context (graphql will retry)",
              {
                ariaLabel: saveEl.getAttribute("aria-label"),
              },
            );
            return;
          }

          emitCapture(ctx, "dom-click");

          log("info", "instagram saved (dom)", {
            shortcode: ctx.shortcode,
            author: ctx.author,
            hasMedia: !!ctx.mediaUrl,
            mediaType: ctx.mediaType,
          });
        } catch (e) {
          log("warn", "instagram dom-click hook error", String(e));
        }
      },
      true,
    );

    // ---------- (2) GraphQL save-mutation hook ----------

    function mediaIdToShortcode(id: string) {
      try {
        let n = BigInt(String(id).split("_")[0]);
        let s = "";
        while (n > 0n) {
          s = ALPHABET[Number(n & 63n)] + s;
          n = n >> 6n;
        }
        return s || null;
      } catch {
        return null;
      }
    }

    function headerValue(h: any, name: string) {
      if (!h) return null;
      const lc = name.toLowerCase();
      if (typeof Headers !== "undefined" && h instanceof Headers) {
        return h.get(lc);
      }
      if (Array.isArray(h)) {
        for (const entry of h) {
          if (
            Array.isArray(entry) &&
            entry[0] &&
            entry[0].toLowerCase() === lc
          ) {
            return entry[1];
          }
        }
        return null;
      }
      if (typeof h === "object") {
        for (const k of Object.keys(h)) {
          if (k.toLowerCase() === lc) return h[k];
        }
      }
      return null;
    }

    function bodyToString(body: any) {
      if (body == null) return null;
      if (typeof body === "string") return body;
      if (body instanceof URLSearchParams) return body.toString();
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        const out = new URLSearchParams();
        body.forEach((v, k) => {
          out.append(k, String(v));
        });
        return out.toString();
      }
      return null;
    }

    function isSaveMutation(headers: any, bodyStr: string | null) {
      const friendly = headerValue(headers, "x-fb-friendly-name");
      if (friendly && friendly === "usePolarisSaveMediaSaveMutation")
        return true;
      const root = headerValue(headers, "x-root-field-name");
      if (root && /__save$/.test(root) && !/unsave/i.test(root)) return true;
      if (bodyStr) {
        if (bodyStr.includes("usePolarisSaveMediaSaveMutation")) return true;
        if (
          /xdt_api__v1__web__save__media_id__save(?!_unsave)/.test(bodyStr) &&
          !/unsave/i.test(bodyStr)
        ) {
          return true;
        }
      }
      return false;
    }

    function extractMediaIdFromBody(bodyStr: string | null) {
      if (!bodyStr) return null;
      try {
        const params = new URLSearchParams(bodyStr);
        const variablesRaw = params.get("variables");
        if (!variablesRaw) return null;
        let vars: any;
        try {
          vars = JSON.parse(variablesRaw);
        } catch {
          return null;
        }
        const candidate =
          vars.media_id ?? vars.mediaId ?? vars.media?.id ?? null;
        if (candidate == null) return null;
        return String(candidate);
      } catch {
        return null;
      }
    }

    function findContainerForLink(link: Element) {
      let cur = link.parentElement;
      let depth = 0;
      while (cur && depth < 12) {
        if (cur.querySelector) {
          if (cur.querySelector("video")) return cur;
          const imgs = cur.querySelectorAll("img");
          for (const img of imgs) {
            const url = pickImageUrl(img as HTMLImageElement);
            if (url && !looksLikeAvatar(url)) return cur;
          }
        }
        cur = cur.parentElement;
        depth++;
      }
      return null;
    }

    function findLinkForShortcode(shortcode: string) {
      const links = document.querySelectorAll(
        `a[href*="/p/${shortcode}/"], a[href*="/reel/${shortcode}/"], a[href*="/tv/${shortcode}/"]`,
      );
      for (const a of links) {
        if (isPostMediaLink(a)) return a;
      }
      return links[0] ?? null;
    }

    const inflightFetches = new Map<string, Promise<any>>();
    async function fetchMediaInfo(mediaId: string) {
      const pk = String(mediaId).split("_")[0];
      if (!pk) return null;
      if (inflightFetches.has(pk)) return inflightFetches.get(pk);
      const p = (async () => {
        try {
          const res = await fetch(`/api/v1/media/${pk}/info/`, {
            method: "GET",
            credentials: "include",
            headers: {
              "x-ig-app-id": "936619743392459",
              "x-asbd-id": "129477",
              "x-requested-with": "XMLHttpRequest",
              accept: "*/*",
            },
          });
          if (!res.ok) {
            log("warn", "instagram media-info fetch failed", {
              pk,
              status: res.status,
            });
            return null;
          }
          const json = await res.json();
          harvestPosts(json, 0);
          return lookupCachedPost(null, mediaId);
        } catch (e) {
          log("warn", "instagram media-info fetch error", String(e));
          return null;
        }
      })();
      inflightFetches.set(pk, p);
      p.finally(() => inflightFetches.delete(pk));
      return p;
    }

    async function captureFromMediaId(mediaId: string, via: string) {
      const shortcode = mediaIdToShortcode(mediaId);
      if (!shortcode) {
        log("warn", "instagram graphql: could not derive shortcode", {
          mediaId: String(mediaId),
        });
        return;
      }

      if (!lookupCachedPost(shortcode, mediaId)) {
        await fetchMediaInfo(mediaId);
      }

      let ctx: any = null;
      const link = findLinkForShortcode(shortcode);
      if (link) {
        const container = findContainerForLink(link);
        if (container) ctx = buildContext({ container, link });
      }
      if (!ctx) ctx = locationContext();
      if (!ctx) {
        ctx = {
          shortcode,
          url: `https://www.instagram.com/p/${shortcode}/`,
          author: null,
          title: null,
          description: null,
          mediaUrl: null,
          mediaType: null,
          videoUrl: null,
        };
      } else if (ctx.shortcode !== shortcode) {
        ctx = {
          ...ctx,
          shortcode,
          url: `https://www.instagram.com/p/${shortcode}/`,
        };
      }
      ctx.mediaId = mediaId;

      emitCapture(ctx, via);
      log("info", "instagram saved (graphql)", {
        shortcode,
        mediaId: String(mediaId),
        hasMedia: !!ctx.mediaUrl,
        cached: !!lookupCachedPost(shortcode, mediaId),
      });
    }

    function isGraphqlUrl(url: string) {
      return typeof url === "string" && /\/graphql\/query\b/.test(url);
    }

    function maybeHandleSaveRequest(headers: any, body: any) {
      try {
        const bodyStr = bodyToString(body);
        if (!isSaveMutation(headers, bodyStr)) return;
        const mediaId = extractMediaIdFromBody(bodyStr);
        if (!mediaId) {
          log("warn", "instagram graphql: save mutation but no media_id");
          return;
        }
        captureFromMediaId(mediaId, "graphql");
      } catch (e) {
        log("warn", "instagram graphql sniff error", String(e));
      }
    }

    const origFetch = window.fetch;
    (window as any).fetch = function (input: any, init: any) {
      let url = "";
      let method = "GET";
      let headers = null;
      let body = null;

      if (typeof input === "string" || input instanceof URL) {
        url = String(input);
        method = (init?.method || "GET").toUpperCase();
        headers = init?.headers ?? null;
        body = init?.body ?? null;
      } else if (typeof Request !== "undefined" && input instanceof Request) {
        url = input.url;
        method = (init?.method || input.method || "GET").toUpperCase();
        headers = init?.headers ?? input.headers;
        body = init?.body ?? null;
      }

      if (method === "POST" && isGraphqlUrl(url)) {
        maybeHandleSaveRequest(headers, body);
      }

      const promise = origFetch.call(this, input, init);
      if (isGraphqlUrl(url)) {
        promise
          .then((res: Response) => {
            try {
              const ct = res.headers.get("content-type") || "";
              if (!/json/i.test(ct)) return;
              res
                .clone()
                .text()
                .then(harvestText)
                .catch(() => {});
            } catch {
              /* ignore */
            }
          })
          .catch(() => {});
      }
      return promise;
    };

    const xp = XMLHttpRequest.prototype;
    const origOpen = xp.open;
    const origSetHeader = xp.setRequestHeader;
    const origSend = xp.send;
    xp.open = function (method: string, url: string | URL) {
      (this as any).__pondMethod = String(method ?? "GET").toUpperCase();
      (this as any).__pondUrl = String(url ?? "");
      (this as any).__pondHeaders = {};
      return origOpen.apply(this, arguments as any);
    };
    xp.setRequestHeader = function (name: string, value: string) {
      if ((this as any).__pondHeaders) {
        try {
          (this as any).__pondHeaders[String(name)] = String(value);
        } catch {
          /* ignore */
        }
      }
      return origSetHeader.apply(this, arguments as any);
    };
    xp.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const isGql = isGraphqlUrl((this as any).__pondUrl);
      if ((this as any).__pondMethod === "POST" && isGql) {
        maybeHandleSaveRequest((this as any).__pondHeaders || {}, body);
      }
      if (isGql && !(this as any).__pondHarvestBound) {
        (this as any).__pondHarvestBound = true;
        this.addEventListener(
          "load",
          function (this: XMLHttpRequest) {
            try {
              if (this.status !== 200) return;
              const rt = this.responseType;
              if (rt && rt !== "text") return;
              harvestText(this.responseText);
            } catch {
              /* ignore */
            }
          },
          { once: true },
        );
      }
      return origSend.apply(this, arguments as any);
    };

    log("info", "instagram inject ready (dom + graphql save hook)");
  },
});
