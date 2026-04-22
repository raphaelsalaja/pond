// Instagram capture. Two signals:
//
//   (1) DOM click on the bookmark button — walks up to find the post
//       container, scrapes media/author/caption, emits immediately.
//   (2) GraphQL hook on `POST /graphql/query` filtered to the actual save
//       mutation (x-fb-friendly-name: usePolarisSaveMediaSaveMutation /
//       x-root-field-name ending in __save). This is the authoritative
//       confirmation — it fires only when IG actually persists the save —
//       and it gives us an unambiguous media_id which we convert to the
//       canonical shortcode.
//
// Both signals emit the same {source: "instagram", sourceId: shortcode}
// payload. The ingest endpoint dedups on (source, sourceId), so duplicate
// events from the same save are harmless. Unsave mutations are ignored.
//
// This script is loaded TWICE on instagram.com: once as a manifest MAIN-world
// content script at document_start (so our fetch/XHR hooks attach BEFORE
// IG's bundle caches references), and once dynamically by the isolated-world
// bridge for backwards compatibility. The guard below makes the second load
// a no-op.
(function () {
  if (window.__pondInstagramInjected) return;
  window.__pondInstagramInjected = true;

  const POND_EVENT = "pond:capture";
  const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  // Aria-labels that indicate "the user is about to ADD this to their saves".
  // We deliberately do NOT accept "Saved", "Unsave", or "Remove" — those mean
  // the icon is currently in the saved state and the click will unsave.
  function looksLikeSaveLabel(label) {
    if (!label) return false;
    const l = label.toLowerCase().trim();
    return (
      l === "save" ||
      l === "bookmark" ||
      l.includes("save to collection") ||
      l.includes("add to collection")
    );
  }

  function emit(message) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function capture(payload) {
    emit({ kind: "capture", payload });
  }
  function log(level, message, data) {
    emit({ kind: "log", level, message, data });
  }

  function shortcodeFromHref(href) {
    if (!href) return null;
    const m = String(href).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function kindFromHref(href) {
    if (!href) return "p";
    if (href.includes("/reel/")) return "reel";
    if (href.includes("/tv/")) return "tv";
    return "p";
  }

  function pickLargestSrcset(srcset) {
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

  // Distinguish profile pics from post images. Size alone is unreliable
  // (Explore tiles are 640x640) — the real signal is the CDN path
  // `t51.82787-19/` and the `profile_pic` marker inside the base64-encoded
  // `efg` URL parameter (IG embeds `{"vencode_tag":"profile_pic..."}` there
  // for any avatar).
  function looksLikeAvatar(url) {
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

  // A real post permalink anchor wraps the post's <img> or <video>. We use
  // that as the discriminator between "this is a post" and "this is a
  // sidebar suggestion / unrelated link". The `<img>` inside must not be a
  // profile-pic-sized thumbnail.
  function isPostMediaLink(link) {
    if (!link) return false;
    const video = link.querySelector("video");
    if (video) return true;
    const img = link.querySelector("img");
    if (!img) return false;
    const src = img.currentSrc || img.src || "";
    if (looksLikeAvatar(src)) return false;
    return true;
  }

  // Climb the tree from the save click looking for the smallest ancestor
  // that "looks like one post". Strategy:
  //   1. First pass: prefer an ancestor containing a permalink anchor that
  //      literally wraps media (rare in modern feeds; common on profile
  //      grids and Explore).
  //   2. Second pass: fall back to the smallest ancestor that contains
  //      BOTH a /p/|/reel/|/tv/ permalink AND a non-avatar image. This
  //      matches modern feed posts where the timestamp link is the only
  //      permalink and the media is in a sibling <div>. Avatars-only
  //      ancestors (sidebar suggestions, navigation) are rejected because
  //      `looksLikeAvatar` filters them out.
  function findPostContainer(target) {
    if (!(target instanceof Element)) return null;

    let cur = target;
    let depth = 0;
    while (cur && depth < 30) {
      if (cur.querySelector) {
        const links = cur.querySelectorAll(
          'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
        );
        for (const link of links) {
          if (isPostMediaLink(link)) return { container: cur, link };
        }
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
            const url = pickImageUrl(img);
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

  // Aria-labels and visible strings that come from IG chrome (sidebar, header,
  // suggestions, footer) — never a post caption.
  const UI_NOISE_RE = /^(instagram|suggested for you|see all|switch|posts|reels|tagged|saved|view profile|message|follow|following|log in|sign up|search|more|home|notifications|create|profile|meta|about|jobs|api|privacy|terms|english|verified|los angeles, california|english \(uk\))$/i;

  // Find the username handle for the post. Strategy: collect /<handle>/
  // anchors inside the container, prefer ones that appear BEFORE the post
  // media link (that's the post header), then fall back to first match.
  function findAuthor(container, mediaLink) {
    const anchors = Array.from(container.querySelectorAll('a[href^="/"]'));
    const idx = mediaLink ? anchors.indexOf(mediaLink) : -1;

    function harvest(start, end) {
      for (let i = start; i < end; i++) {
        const a = anchors[i];
        const path = (a.getAttribute("href") || "").split("?")[0];
        const m = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
        if (m && !RESERVED_PATHS.has(m[1])) return `@${m[1]}`;
      }
      return null;
    }

    // Preferred: handle anchors before the media link (the post header).
    if (idx > 0) {
      const before = harvest(0, idx);
      if (before) return before;
    }
    // Fallback: anywhere in container.
    return harvest(0, anchors.length);
  }

  // Pull caption text out of the post container. Prefer <h1> (IG renders
  // the caption inside <h1> on detail pages), then the longest
  // <span dir="auto"> that isn't UI noise or just the username.
  function findCaption(container, author) {
    const handle = author ? author.replace(/^@/, "") : null;

    function clean(txt) {
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
      // Skip strings that look like concatenated UI labels (e.g. the
      // sidebar dump "Suggested for youLos Angeles, California…").
      if (/Suggested for you/i.test(c)) continue;
      if (c.length > best.length) best = c;
    }
    return best || null;
  }

  function pickImageUrl(img) {
    if (!img) return null;
    const fromSet = img.srcset ? pickLargestSrcset(img.srcset) : null;
    return fromSet || img.currentSrc || img.src || null;
  }

  function findMedia(container, mediaLink) {
    // 1. Prefer the media literally wrapped by the post permalink anchor.
    if (mediaLink) {
      const v = mediaLink.querySelector("video");
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
      const i = mediaLink.querySelector("img");
      if (i) {
        const url = pickImageUrl(i);
        if (url && !looksLikeAvatar(url)) {
          return { mediaUrl: url, mediaType: "image", videoUrl: null };
        }
      }
    }

    // 2. Fall back to scanning the container for non-avatar media.
    const video = container.querySelector("video");
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
    const imgs = Array.from(container.querySelectorAll("img"));
    for (const img of imgs) {
      const url = pickImageUrl(img);
      if (!url) continue;
      if (looksLikeAvatar(url)) continue;
      return { mediaUrl: url, mediaType: "image", videoUrl: null };
    }
    return null;
  }

  function findSaveElementFromTarget(target) {
    if (!(target instanceof Element)) return null;
    let cur = target;
    let depth = 0;
    while (cur && depth < 8) {
      const lbl = cur.getAttribute && cur.getAttribute("aria-label");
      if (lbl && looksLikeSaveLabel(lbl)) return cur;
      cur = cur.parentElement;
      depth++;
    }
    // Some surfaces put aria-label only on the inner <svg>, not the wrapping
    // button. Look down from the closest button-like ancestor for a
    // save-labelled svg child.
    const button =
      target.closest &&
      target.closest(
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

  function buildContext(found) {
    const { container, link } = found;
    const href = link.getAttribute("href") || link.href || "";
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

  // Last-resort context: if we couldn't find a permalink in the DOM but the
  // user is sitting on a /p/<x>/ detail page, use the URL.
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

  function emitCapture(ctx, via) {
    const raw = { via, capturedAt: new Date().toISOString() };
    if (ctx.videoUrl) raw.videoUrl = ctx.videoUrl;
    if (ctx.mediaId) raw.mediaId = String(ctx.mediaId);

    const cached = lookupCachedPost(ctx.shortcode, ctx.mediaId);
    if (cached) {
      if (cached.imageUrl) ctx.mediaUrl = cached.imageUrl;
      if (cached.videoUrl) raw.videoUrl = cached.videoUrl;
      if (cached.mediaType) ctx.mediaType = cached.mediaType;
      if (cached.gallery && cached.gallery.length > 1) {
        raw.gallery = cached.gallery;
      }
      if (cached.caption) {
        ctx.description = cached.caption;
        ctx.title = cached.caption.replace(/\s+/g, " ").slice(0, 200);
      }
      if (cached.author && !ctx.author) ctx.author = cached.author;
    }

    // Drop unusable blob: URLs IG sometimes assigns to <video src>.
    if (raw.videoUrl && /^blob:/i.test(raw.videoUrl)) delete raw.videoUrl;
    if (ctx.mediaUrl && /^blob:/i.test(ctx.mediaUrl)) {
      ctx.mediaUrl = cached?.imageUrl ?? null;
    }

    capture({
      source: "instagram",
      sourceId: ctx.shortcode,
      url: ctx.url,
      title: ctx.title,
      description: ctx.description,
      author: ctx.author,
      mediaUrl: ctx.mediaUrl,
      mediaType: ctx.mediaType || (ctx.mediaUrl ? "image" : "link"),
      raw,
    });
  }

  // ---------- GraphQL response harvest (post media + carousels) ----------
  //
  // IG's web feed loads post data via various GraphQL queries. The responses
  // contain a stable shape per media: `{ pk, code, media_type,
  // image_versions2.candidates[], video_versions[], carousel_media[] }`.
  // We walk every response we see and cache by `code` (shortcode) and `pk`
  // (numeric media id) so that when the user clicks save we can hand the
  // ingest endpoint the real image/video URLs and the full carousel
  // children, instead of the (often `blob:` or thumbnail-sized) URLs the
  // DOM exposes.
  const POST_CACHE = new Map();
  const POST_CACHE_LIMIT = 500;

  function cachePut(key, value) {
    if (!key) return;
    if (POST_CACHE.size >= POST_CACHE_LIMIT) {
      const first = POST_CACHE.keys().next().value;
      if (first !== undefined) POST_CACHE.delete(first);
    }
    POST_CACHE.set(String(key), value);
  }

  function lookupCachedPost(shortcode, mediaId) {
    if (shortcode && POST_CACHE.has(shortcode)) {
      return POST_CACHE.get(shortcode);
    }
    if (mediaId) {
      const pk = String(mediaId).split("_")[0];
      if (POST_CACHE.has(pk)) return POST_CACHE.get(pk);
    }
    return null;
  }

  function pickBestImage(iv2) {
    if (!iv2) return null;
    const cands = iv2.candidates || [];
    let best = null;
    for (const c of cands) {
      if (typeof c?.url !== "string") continue;
      const w = Number(c.width) || 0;
      if (!best || w > best.w) best = { url: c.url, w };
    }
    return best?.url ?? null;
  }

  function pickBestVideo(versions) {
    if (!Array.isArray(versions)) return null;
    // IG sorts by quality; type 101 is usually best. Just pick the first
    // entry that has a usable URL.
    for (const v of versions) {
      if (typeof v?.url === "string") return v.url;
    }
    return null;
  }

  function captionFrom(node) {
    const c = node?.caption;
    if (c && typeof c.text === "string") return c.text;
    if (typeof c === "string") return c;
    return null;
  }

  function authorFrom(node) {
    const u = node?.user || node?.owner;
    if (u && typeof u.username === "string") return `@${u.username}`;
    return null;
  }

  function carouselItem(child) {
    if (!child || typeof child !== "object") return null;
    if (child.media_type === 2) {
      const v = pickBestVideo(child.video_versions);
      const img = pickBestImage(child.image_versions2);
      if (!v && !img) return null;
      return { type: "video", url: img || v, videoUrl: v };
    }
    const img = pickBestImage(child.image_versions2);
    if (!img) return null;
    return { type: "image", url: img };
  }

  function normalizeMedia(node) {
    if (!node || typeof node !== "object") return null;
    const code = typeof node.code === "string" ? node.code : null;
    const pk = node.pk != null ? String(node.pk) : null;
    if (!code && !pk) return null;

    const out = { code, pk };
    out.author = authorFrom(node);
    out.caption = captionFrom(node);

    if (node.media_type === 8 && Array.isArray(node.carousel_media)) {
      out.gallery = node.carousel_media
        .map(carouselItem)
        .filter(Boolean);
      const first = out.gallery[0];
      out.imageUrl = first?.url ?? null;
      out.videoUrl = first?.videoUrl ?? null;
      out.mediaType = first?.type === "video" ? "video" : "image";
    } else if (
      node.media_type === 2 &&
      Array.isArray(node.video_versions)
    ) {
      out.mediaType = "video";
      out.videoUrl = pickBestVideo(node.video_versions);
      out.imageUrl = pickBestImage(node.image_versions2);
    } else {
      out.mediaType = "image";
      out.imageUrl = pickBestImage(node.image_versions2);
    }

    return out;
  }

  // Walk an arbitrary GraphQL response payload looking for IG media nodes.
  function harvestPosts(obj, depth) {
    if (obj == null || depth > 12) return;
    if (Array.isArray(obj)) {
      for (const x of obj) harvestPosts(x, depth + 1);
      return;
    }
    if (typeof obj !== "object") return;

    // A node "looks like" a post when it has a media identifier AND at
    // least one of the media payloads attached. The sub-objects are walked
    // separately so nested carousel children are also indexed.
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

  function harvestText(text) {
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
    function (ev) {
      try {
        const saveEl = findSaveElementFromTarget(ev.target);
        if (!saveEl) return;

        const found = findPostContainer(saveEl);
        let ctx = found ? buildContext(found) : null;
        if (!ctx) ctx = locationContext();

        if (!ctx) {
          // Don't bail loudly — the GraphQL hook will still catch this save
          // and we'll backfill the shortcode from media_id.
          log("info", "instagram: save click without post context (graphql will retry)", {
            ariaLabel: saveEl.getAttribute("aria-label"),
          });
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

  function mediaIdToShortcode(id) {
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

  function headerValue(h, name) {
    if (!h) return null;
    const lc = name.toLowerCase();
    if (typeof Headers !== "undefined" && h instanceof Headers) {
      return h.get(lc);
    }
    if (Array.isArray(h)) {
      for (const entry of h) {
        if (Array.isArray(entry) && entry[0] && entry[0].toLowerCase() === lc) {
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

  function bodyToString(body) {
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

  function isSaveMutation(headers, bodyStr) {
    const friendly = headerValue(headers, "x-fb-friendly-name");
    if (friendly && friendly === "usePolarisSaveMediaSaveMutation") return true;
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

  function extractMediaIdFromBody(bodyStr) {
    if (!bodyStr) return null;
    try {
      const params = new URLSearchParams(bodyStr);
      const variablesRaw = params.get("variables");
      if (!variablesRaw) return null;
      let vars;
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

  // Find a non-avatar image (or video) near a known permalink anchor.
  // Stops at the smallest ancestor that contains a real post image — this
  // keeps the container tight so caption/author scraping doesn't bleed into
  // the page's nav header.
  function findContainerForLink(link) {
    let cur = link.parentElement;
    let depth = 0;
    while (cur && depth < 12) {
      if (cur.querySelector) {
        if (cur.querySelector("video")) return cur;
        const imgs = cur.querySelectorAll("img");
        for (const img of imgs) {
          const url = pickImageUrl(img);
          if (url && !looksLikeAvatar(url)) return cur;
        }
      }
      cur = cur.parentElement;
      depth++;
    }
    return null;
  }

  // For a known shortcode, find the most useful anchor in the DOM. Prefer
  // anchors that wrap real post media (the `<a href="/p/X/"><img/></a>`
  // wrapper). Fall back to any matching anchor (e.g. timestamp link).
  function findLinkForShortcode(shortcode) {
    const links = document.querySelectorAll(
      `a[href*="/p/${shortcode}/"], a[href*="/reel/${shortcode}/"], a[href*="/tv/${shortcode}/"]`,
    );
    for (const a of links) {
      if (isPostMediaLink(a)) return a;
    }
    return links[0] ?? null;
  }

  // Backstop fetch: hit IG's own private web API for the media. Same-origin
  // request includes the user's session cookies, and the `x-ig-app-id` is
  // the public IG web app id (not a secret). Response shape matches what
  // the in-page GraphQL queries return, so harvestPosts can populate the
  // cache straight from it.
  const inflightFetches = new Map();
  async function fetchMediaInfo(mediaId) {
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

  async function captureFromMediaId(mediaId, via) {
    const shortcode = mediaIdToShortcode(mediaId);
    if (!shortcode) {
      log("warn", "instagram graphql: could not derive shortcode", {
        mediaId: String(mediaId),
      });
      return;
    }

    // If we don't already have the post in the harvest cache, pull it
    // synchronously from IG's private web API before emitting. This
    // guarantees the save row gets the real video URL + carousel children
    // even when the post never went through our fetch hook.
    if (!lookupCachedPost(shortcode, mediaId)) {
      await fetchMediaInfo(mediaId);
    }

    let ctx = null;
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
      ctx = { ...ctx, shortcode, url: `https://www.instagram.com/p/${shortcode}/` };
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

  function isGraphqlUrl(url) {
    return typeof url === "string" && /\/graphql\/query\b/.test(url);
  }

  function maybeHandleSaveRequest(headers, body) {
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

  // fetch wrapper.
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
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
        .then((res) => {
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

  // Prototype-level XHR patch. Patching the prototype methods (rather than
  // wrapping the constructor) means even if IG cached `XMLHttpRequest` at
  // bundle load before our inject script ran, all calls to
  // .open/.setRequestHeader/.send on every XHR instance still hit our hooks.
  const xp = XMLHttpRequest.prototype;
  const origOpen = xp.open;
  const origSetHeader = xp.setRequestHeader;
  const origSend = xp.send;
  xp.open = function (method, url) {
    this.__pondMethod = String(method ?? "GET").toUpperCase();
    this.__pondUrl = String(url ?? "");
    this.__pondHeaders = {};
    return origOpen.apply(this, arguments);
  };
  xp.setRequestHeader = function (name, value) {
    if (this.__pondHeaders) {
      try {
        this.__pondHeaders[String(name)] = String(value);
      } catch {
        /* ignore */
      }
    }
    return origSetHeader.apply(this, arguments);
  };
  xp.send = function (body) {
    const isGql = isGraphqlUrl(this.__pondUrl);
    if (this.__pondMethod === "POST" && isGql) {
      maybeHandleSaveRequest(this.__pondHeaders || {}, body);
    }
    if (isGql && !this.__pondHarvestBound) {
      this.__pondHarvestBound = true;
      this.addEventListener(
        "load",
        function () {
          try {
            if (this.status !== 200) return;
            const rt = this.responseType;
            if (rt && rt !== "" && rt !== "text") return;
            harvestText(this.responseText);
          } catch {
            /* ignore */
          }
        },
        { once: true },
      );
    }
    return origSend.apply(this, arguments);
  };

  log("info", "instagram inject ready (dom + graphql save hook)");
})();
