/// <reference lib="dom" />

export function inPageInstagramNormalize() {
  const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function pkToShortcode(pk: string): string | null {
    try {
      const raw = pk.split("_")[0] ?? pk;
      let n = BigInt(raw);
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

  function shortcodeToPk(code: string): string {
    let n = 0n;
    for (const ch of code) {
      n = n * 64n + BigInt(ALPHABET.indexOf(ch));
    }
    return n.toString();
  }

  function pickBestImage(iv2: any): string | null {
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

  function pickBestVideo(versions: any): string | null {
    if (!Array.isArray(versions)) return null;
    for (const v of versions) {
      if (typeof v?.url === "string") return v.url;
    }
    return null;
  }

  function normalizeMediaNode(
    node: any,
    opts?: { savedTimestamp?: number },
  ): Record<string, unknown> | null {
    const pk = node.pk != null ? String(node.pk) : null;
    const code =
      typeof node.code === "string" ? node.code : pk ? pkToShortcode(pk) : null;
    if (!code) return null;

    const kind = node.media_type === 2 ? "reel" : "p";
    const out: Record<string, unknown> = {
      sourceId: code,
      url: `https://www.instagram.com/${kind}/${code}/`,
    };

    if (opts?.savedTimestamp != null) {
      out.savedAt = new Date(opts.savedTimestamp * 1000).toISOString();
    }

    const meta: Record<string, unknown> = {};

    const user = node.user ?? node.owner;
    if (user?.username) {
      out.author = `@${user.username}`;
      meta.authorUrl = `https://www.instagram.com/${user.username}/`;
      if (user.full_name) meta.authorName = user.full_name;
      if (user.profile_pic_url) meta.authorAvatar = user.profile_pic_url;
      if (typeof user.is_verified === "boolean")
        meta.verified = user.is_verified;
    }

    if (typeof node.taken_at === "number") {
      meta.publishedAt = new Date(node.taken_at * 1000).toISOString();
    }

    const htmlLang =
      typeof document !== "undefined"
        ? document.documentElement.lang?.trim()
        : null;
    if (htmlLang) meta.lang = htmlLang;

    const metrics: Record<string, number> = {};
    if (typeof node.like_count === "number") metrics.likes = node.like_count;
    if (typeof node.comment_count === "number")
      metrics.comments = node.comment_count;
    if (typeof node.play_count === "number") metrics.plays = node.play_count;
    if (Object.keys(metrics).length > 0) meta.metrics = metrics;

    if (typeof node.is_paid_partnership === "boolean")
      meta.isPaidPartnership = node.is_paid_partnership;
    if (node.location?.name) meta.location = node.location.name;
    if (typeof node.accessibility_caption === "string")
      meta.accessibilityCaption = node.accessibility_caption;
    if (typeof node.video_duration === "number")
      meta.videoDurationSec = Math.round(node.video_duration);

    const caption = node.caption;
    const text =
      caption?.text ?? (typeof caption === "string" ? caption : null);
    if (text) {
      out.description = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
      const firstLine = text.split(/\n+/)[0]?.trim() ?? text;
      out.title =
        firstLine.length <= 90
          ? firstLine
          : `${firstLine.slice(0, 89).trimEnd()}…`;
    }

    const media: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const push = (
      url: string | null,
      type: string,
      extra?: Record<string, unknown>,
    ) => {
      if (!url || /^blob:/i.test(url) || seen.has(url)) return;
      seen.add(url);
      media.push({ url, type, ...extra });
    };

    if (node.media_type === 8 && Array.isArray(node.carousel_media)) {
      for (const child of node.carousel_media) {
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
          push(v || img, "video", {
            ...(img ? { poster: img } : {}),
            ...(altText ? { altText } : {}),
            ...(dur ? { durationSec: dur } : {}),
          });
        } else {
          const img = pickBestImage(child.image_versions2);
          push(img, "image", altText ? { altText } : {});
        }
      }
    } else if (node.media_type === 2) {
      const v = pickBestVideo(node.video_versions);
      const img = pickBestImage(node.image_versions2);
      push(v || img, "video", img ? { poster: img } : {});
    } else {
      const img = pickBestImage(node.image_versions2);
      push(img, "image");
    }

    if (media.length > 0) {
      out.mediaUrls = media;
      out.mediaUrl = (media[0] as Record<string, unknown>).url;
      out.mediaType = (media[0] as Record<string, unknown>).type ?? "image";
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return {
    pickBestImage,
    pickBestVideo,
    pkToShortcode,
    shortcodeToPk,
    normalizeMediaNode,
  };
}
