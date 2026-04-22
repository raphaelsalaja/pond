import ogs from "open-graph-scraper";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { saves } from "@pond/schema/db";
import { db } from "./db/client";

// Caps for the page-fetch step (OG scraping, FxTwitter). Kept tight to
// avoid blocking the worker.
const FETCH_TIMEOUT_MS = 8000;

// Caps for media mirroring. Lifted significantly because the whole point
// is durability — Instagram's `fbcdn.net` URLs in particular are signed
// and rot in ~24h, so if we don't pull them now we lose them. Vercel Blob
// storage at 50MB/item is roughly $0.001/save in storage cost.
const MEDIA_FETCH_TIMEOUT_MS = 60_000;
const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const VERCEL_BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i;

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  video?: string;
}

/**
 * Best-effort enrichment for a freshly-ingested save:
 *   1. If the row is missing title/description, fetch the source URL and
 *      parse OG tags.
 *   2. If we have a mediaUrl but no blobUrl, mirror it into Vercel Blob.
 *
 * Designed to fail silently — every step is wrapped so a partial result is
 * still better than nothing. Run after the ingest endpoint has responded
 * (fire-and-forget) so we don't block the extension.
 */
export async function enrichSave(id: string): Promise<void> {
  const [row] = await db.select().from(saves).where(eq(saves.id, id)).limit(1);
  if (!row) return;

  const updates: Partial<typeof saves.$inferInsert> = {};

  const needsMeta = !row.title || !row.description || !row.mediaUrl;
  const needsVideo =
    row.source === "twitter" &&
    row.mediaType === "video" &&
    !(row.rawJson as Record<string, unknown> | null)?.videoUrl;

  // Source-specific fast paths first.
  if (row.source === "arena" && needsMeta) {
    const block = await fetchArenaBlock(row.sourceId);
    if (block) {
      const data = arenaBlockToFields(block);
      if (!row.title && data.title) updates.title = data.title.slice(0, 500);
      if (!row.description && data.description)
        updates.description = data.description.slice(0, 5000);
      if (!row.author && data.author) updates.author = data.author;
      if (!row.mediaUrl && data.mediaUrl) {
        updates.mediaUrl = data.mediaUrl;
        updates.mediaType = data.mediaType;
      }
      if (data.url && data.url !== row.url) updates.url = data.url;
      // Stash the full block under raw so the UI can use it later.
      const prev = (row.rawJson as Record<string, unknown> | null) ?? {};
      updates.rawJson = { ...prev, block };
    }
  }

  if (row.source === "twitter" && (needsMeta || needsVideo)) {
    const fx = await fetchFxTweet(row.sourceId);
    if (fx) {
      if (!row.title && fx.title) updates.title = fx.title.slice(0, 500);
      if (!row.description && fx.description)
        updates.description = fx.description.slice(0, 5000);
      if (!row.author && fx.author) updates.author = fx.author;
      if (!row.mediaUrl && fx.mediaUrl) {
        updates.mediaUrl = fx.mediaUrl;
        updates.mediaType = fx.mediaType;
      }
      if (fx.url) updates.url = fx.url;
      if (fx.videoUrl) {
        const prev =
          (row.rawJson as Record<string, unknown> | null) ?? {};
        updates.rawJson = { ...prev, videoUrl: fx.videoUrl };
      }
    }
  }

  // Generic metascraper fallback if anything still missing.
  // Skip for sources that gate previews behind login/anti-bot walls or
  // serve OG tags that are worse than what we already have:
  //   - Instagram / Pinterest: anonymous fetches hit login walls
  //   - Are.na: page <title> is "<filename> | Are.na" and og:image is the
  //     1200x630 share crop, both worse than the v2 block data
  const skipOgFallback =
    row.source === "pinterest" ||
    row.source === "instagram" ||
    row.source === "arena";
  const stillNeedsMeta =
    !(row.title || updates.title) ||
    !(row.description || updates.description) ||
    !(row.mediaUrl || updates.mediaUrl) ||
    !(row.author || updates.author);
  if (stillNeedsMeta && !skipOgFallback) {
    const og = await fetchOg(updates.url ?? row.url);
    if (og) {
      if (!row.title && !updates.title && og.title)
        updates.title = og.title.slice(0, 500);
      if (!row.description && !updates.description && og.description)
        updates.description = og.description.slice(0, 5000);
      if (!row.author && !updates.author && og.author)
        updates.author = og.author.slice(0, 200);
      if (!row.mediaUrl && !updates.mediaUrl && (og.image || og.video)) {
        if (og.video) {
          updates.mediaUrl = og.image ?? og.video;
          updates.mediaType = "video";
          const prev = (row.rawJson as Record<string, unknown> | null) ?? {};
          updates.rawJson = { ...(updates.rawJson ?? prev), videoUrl: og.video };
        } else if (og.image) {
          updates.mediaUrl = og.image;
          updates.mediaType = "image";
        }
      }
    }
  }

  // ---- mirror everything we can to durable storage ----
  // Cover image.
  const candidateMedia = updates.mediaUrl ?? row.mediaUrl;
  if (candidateMedia && !row.blobUrl) {
    const blobUrl = await mirrorToBlob(candidateMedia, `media/${row.id}/cover`);
    if (blobUrl) updates.blobUrl = blobUrl;
  }

  // Video + gallery items live in rawJson. Compute the latest snapshot of
  // the row's rawJson by overlaying any pending updates so we mirror the
  // newest data (e.g. videoUrl from FxTwitter) rather than the old row.
  const baseRaw = (row.rawJson as Record<string, unknown> | null) ?? null;
  const pendingRaw =
    (updates.rawJson as Record<string, unknown> | undefined) ?? null;
  const currentRaw = pendingRaw ?? baseRaw ?? {};
  const rawWithMirrors: Record<string, unknown> = { ...currentRaw };
  let rawDirty = pendingRaw !== null;

  // Standalone video.
  const videoUrl =
    typeof currentRaw.videoUrl === "string" ? currentRaw.videoUrl : null;
  const existingVideoBlob =
    typeof currentRaw.videoBlobUrl === "string"
      ? currentRaw.videoBlobUrl
      : null;
  if (videoUrl && !existingVideoBlob) {
    const blob = await mirrorToBlob(videoUrl, `media/${row.id}/video`);
    if (blob) {
      rawWithMirrors.videoBlobUrl = blob;
      rawDirty = true;
    }
  }

  // Gallery / carousel items.
  const gallery = Array.isArray(currentRaw.gallery) ? currentRaw.gallery : null;
  if (gallery && gallery.length > 0) {
    const mirrored = await Promise.all(
      gallery.map(async (item, i) => {
        if (!item || typeof item !== "object") return item;
        const e = item as Record<string, unknown>;
        const next: Record<string, unknown> = { ...e };
        let touched = false;

        const url = typeof e.url === "string" ? e.url : null;
        const blobUrl = typeof e.blobUrl === "string" ? e.blobUrl : null;
        if (url && !blobUrl) {
          const blob = await mirrorToBlob(url, `media/${row.id}/g${i}`);
          if (blob) {
            next.blobUrl = blob;
            touched = true;
          }
        }

        const v = typeof e.videoUrl === "string" ? e.videoUrl : null;
        const vBlob =
          typeof e.videoBlobUrl === "string" ? e.videoBlobUrl : null;
        if (v && !vBlob) {
          const blob = await mirrorToBlob(v, `media/${row.id}/g${i}-v`);
          if (blob) {
            next.videoBlobUrl = blob;
            touched = true;
          }
        }

        return touched ? next : item;
      }),
    );
    const changed = mirrored.some((m, i) => m !== gallery[i]);
    if (changed) {
      rawWithMirrors.gallery = mirrored;
      rawDirty = true;
    }
  }

  if (rawDirty) {
    updates.rawJson = rawWithMirrors;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(saves).set(updates).where(eq(saves.id, row.id));
  }
}

interface FxResult {
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "link";
  url?: string;
  videoUrl?: string;
}

async function fetchFxTweet(tweetId: string): Promise<FxResult | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      tweet?: {
        text?: string;
        url?: string;
        author?: { name?: string; screen_name?: string };
        media?: {
          photos?: { url: string }[];
          videos?: { thumbnail_url?: string; url?: string; type?: string }[];
        };
      };
    };
    const tw = json.tweet;
    if (!tw) return null;

    const out: FxResult = {};
    if (tw.text) {
      out.description = tw.text;
      out.title = tw.text.replace(/\s+/g, " ").trim().slice(0, 200);
    }
    if (tw.author?.name || tw.author?.screen_name) {
      const handle = tw.author.screen_name ? `@${tw.author.screen_name}` : null;
      out.author = [handle, tw.author.name].filter(Boolean).join(" · ") || undefined;
    }
    const photo = tw.media?.photos?.[0]?.url;
    const video = tw.media?.videos?.[0];
    if (photo) {
      out.mediaUrl = photo;
      out.mediaType = "image";
    } else if (video) {
      out.mediaUrl = video.thumbnail_url ?? video.url;
      out.mediaType = "video";
      if (video.url) out.videoUrl = video.url;
    }
    if (tw.url) out.url = tw.url;
    return out;
  } catch {
    return null;
  }
}

/**
 * Hit Are.na's public REST v2 to resolve a block by id. No auth needed
 * for public blocks; returns null for private ones (we'd need an OAuth
 * Bearer token, which we don't have on the server).
 */
interface ArenaBlock {
  id: number;
  title?: string | null;
  generated_title?: string | null;
  description?: string | null;
  source?: { url?: string | null } | null;
  image?: {
    original?: { url?: string | null } | null;
    large?: { url?: string | null } | null;
    display?: { url?: string | null } | null;
  } | null;
  embed?: { url?: string | null } | null;
  attachment?: { url?: string | null } | null;
  user?: { full_name?: string | null; username?: string | null } | null;
  class?: string | null;
}

async function fetchArenaBlock(id: string): Promise<ArenaBlock | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `https://api.are.na/v2/blocks/${encodeURIComponent(id)}`,
      {
        signal: ac.signal,
        headers: { accept: "application/json", "user-agent": BROWSER_UA },
      },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as ArenaBlock;
  } catch (err) {
    console.warn("[pond enrich] arena block fetch failed", id, err);
    return null;
  }
}

interface ArenaFields {
  title: string | null;
  description: string | null;
  author: string | null;
  mediaUrl: string | null;
  mediaType: "image" | "video" | "link";
  url: string | null;
}

function arenaBlockToFields(block: ArenaBlock): ArenaFields {
  const img =
    block.image?.original?.url ??
    block.image?.large?.url ??
    block.image?.display?.url ??
    null;

  let mediaUrl: string | null = img ?? null;
  let mediaType: "image" | "video" | "link" = "link";
  if (block.class === "Media" && block.embed?.url) {
    mediaType = "video";
  } else if (img) {
    mediaType = "image";
  } else if (block.attachment?.url) {
    mediaUrl = block.attachment.url;
    mediaType = "link";
  }

  const title =
    block.title?.trim() || block.generated_title?.trim() || null;

  return {
    title,
    description: block.description?.trim() || null,
    author: block.user?.full_name ?? block.user?.username ?? null,
    mediaUrl,
    mediaType,
    url: block.source?.url ?? `https://www.are.na/block/${block.id}`,
  };
}

async function fetchOg(url: string): Promise<OgData | null> {
  try {
    const result = await ogs({
      url,
      timeout: FETCH_TIMEOUT_MS,
      fetchOptions: {
        headers: {
          // Pose as a real browser; many sites (Instagram especially) gate
          // the preview HTML on UA/accept headers.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      },
    });
    if (result.error) {
      console.warn("[pond enrich] og scrape failed", url, result.result);
      return null;
    }
    const og = result.result;
    const image =
      og.ogImage?.[0]?.url ?? og.twitterImage?.[0]?.url ?? undefined;
    const video = og.ogVideo?.[0]?.url ?? undefined;
    return {
      title: og.ogTitle ?? og.twitterTitle ?? undefined,
      description: og.ogDescription ?? og.twitterDescription ?? undefined,
      image,
      author:
        og.articleAuthor ??
        (og.twitterCreator ? `@${og.twitterCreator.replace(/^@/, "")}` : undefined),
      video,
    };
  } catch (err) {
    console.warn("[pond enrich] fetchOg threw", url, err);
    return null;
  }
}

/**
 * Pull a remote media URL into Vercel Blob and return the new public URL.
 * Returns null on any failure (no token, network error, oversize, blob:
 * URLs, etc). Skips URLs that already point to our blob storage so reruns
 * are safe and idempotent.
 */
async function mirrorToBlob(
  mediaUrl: string,
  keyBase: string,
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("blob:") || mediaUrl.startsWith("data:")) return null;

  try {
    const parsed = new URL(mediaUrl);
    if (VERCEL_BLOB_HOST_RE.test(parsed.hostname)) return mediaUrl;
  } catch {
    return null;
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), MEDIA_FETCH_TIMEOUT_MS);
    const res = await fetch(mediaUrl, {
      signal: ac.signal,
      redirect: "follow",
      // Twimg, fbcdn etc. reject empty user-agents with 403.
      // Origin/Referer left unset on purpose for the same reason.
      headers: { "user-agent": BROWSER_UA, accept: "*/*" },
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn("[pond enrich] mirror fetch failed", {
        url: mediaUrl,
        status: res.status,
      });
      return null;
    }

    const ctype = res.headers.get("content-type") ?? "application/octet-stream";
    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > MEDIA_MAX_BYTES) {
      console.warn("[pond enrich] mirror skipped (over cap)", {
        url: mediaUrl,
        bytes: Number(lenHeader),
      });
      return null;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MEDIA_MAX_BYTES) {
      console.warn("[pond enrich] mirror skipped (body over cap)", {
        url: mediaUrl,
        bytes: buf.byteLength,
      });
      return null;
    }

    const ext = guessExt(ctype, mediaUrl);
    const blob = await put(`${keyBase}${ext}`, buf, {
      access: "public",
      contentType: ctype,
      addRandomSuffix: true,
    });
    return blob.url;
  } catch (err) {
    console.warn("[pond enrich] mirror error", { url: mediaUrl, err });
    return null;
  }
}

function guessExt(contentType: string, url: string): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("avif")) return ".avif";
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("quicktime")) return ".mov";
  if (contentType.includes("webm")) return ".webm";
  const m = url.match(
    /\.(png|gif|webp|avif|mp4|mov|webm|jpg|jpeg)(?:\?|$|#)/i,
  );
  if (m && m[1]) return `.${m[1].toLowerCase()}`;
  if (contentType.startsWith("video/")) return ".mp4";
  return ".jpg";
}
