import type { RawJson } from "@pond/schema/raw";

/** YouTube Shorts are at most three minutes. Longer videos keep the landscape poster. */
const YOUTUBE_SHORT_MAX_DURATION_SEC = 180;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

interface YoutubeShortPosterPlan {
  fallbackUrl: string;
  attempts: string[];
}

/**
 * Poster URLs to try for a Short, highest quality first.
 *
 * `oar2.jpg` is the large original-aspect frame. Ordinary landscape videos
 * have it too, as a landscape file, and `oardefault.jpg` is missing for some
 * Shorts. The caller keeps a file only when the pixels are taller than they
 * are wide, then uses `fallbackUrl`. `frame0.jpg` is the small upright frame
 * that remains when the other two are missing.
 */
export function youtubeShortPosterPlan(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
): YoutubeShortPosterPlan | null {
  const urls = collectUrls(rawJson, fallbackUrl);
  const videoId = urls
    .map(youtubeVideoIdFromUrl)
    .find((id): id is string => id != null);
  if (!videoId || !isShortCandidate(urls, durationOf(rawJson))) return null;
  const fallback =
    fallbackUrl && fallbackUrl.length > 0
      ? fallbackUrl
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return {
    fallbackUrl: fallback,
    attempts: dedupe([
      `https://i.ytimg.com/vi/${videoId}/oar2.jpg`,
      `https://i.ytimg.com/vi/${videoId}/oardefault.jpg`,
      fallback,
      `https://i.ytimg.com/vi/${videoId}/frame0.jpg`,
    ]),
  };
}

function youtubeVideoIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id && VIDEO_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;
    const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(
      parsed.pathname,
    );
    if (shorts?.[1]) return shorts[1];
  }
  if (host === "ytimg.com" || host.endsWith(".ytimg.com")) {
    const thumb = /\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//.exec(parsed.pathname);
    if (thumb?.[1]) return thumb[1];
  }
  return null;
}

function isShortCandidate(urls: string[], durationSec: number | null): boolean {
  if (urls.some(isYoutubeShortsUrl)) return true;
  return (
    durationSec != null &&
    durationSec > 0 &&
    durationSec <= YOUTUBE_SHORT_MAX_DURATION_SEC
  );
}

function isYoutubeShortsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      (host === "youtube.com" || host.endsWith(".youtube.com")) &&
      parsed.pathname.startsWith("/shorts/")
    );
  } catch {
    return false;
  }
}

function durationOf(rawJson: RawJson | null | undefined): number | null {
  const capture = rawJson?.capture?.duration;
  if (capture != null && Number.isFinite(capture)) return capture;
  const downloaded = rawJson?.ytdlp?.duration;
  if (downloaded != null && Number.isFinite(downloaded)) return downloaded;
  return null;
}

function collectUrls(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
): string[] {
  const urls = [
    fallbackUrl,
    rawJson?.capture?.url,
    rawJson?.ytdlp?.webpage_url,
    rawJson?.ytdlp?.original_url,
    rawJson?.ytdlp?.thumbnail,
  ];
  for (const media of rawJson?.capture?.media ?? []) {
    urls.push(media.url, media.posterUrl);
  }
  return urls.filter((url): url is string => Boolean(url));
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
