import type { RawJson } from "@pond/schema/raw";

/** YouTube Shorts are at most three minutes. Longer videos keep the landscape poster. */
const YOUTUBE_SHORT_MAX_DURATION_SEC = 180;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

interface YoutubeShortPosterPlan {
  fallbackUrl: string;
  attempts: Array<string>;
}

/** Files YouTube picks from the video on its own. Shorts usually have `oar2.jpg` even when a cover was chosen. */
const AUTOMATIC_FRAME =
  /^(?:oar\d|frame\d|hq[1-3]|mq[1-3]|sd[1-3]|[0-3])\.(?:jpg|webp)$/;

/** The upright cover the Shorts player shows. Which of the two a Short has varies, and the other is missing. */
const DISPLAY_COVER = /^(?:oar|sar)default\.(?:jpg|webp)$/;

/**
 * Poster URLs to try for a Short, best first. The caller keeps the first file
 * whose pixels are taller than they are wide, so landscape composites such as
 * a watch page's `maxresdefault.jpg` or a bare `hq720.jpg` fall through.
 *
 * 1. Covers the Capture recorded from the Shorts player, with an
 *    `oardefault` or `sardefault` cover upgraded to its unsigned full-size
 *    file. A signed portrait crop, such as some `hq720.jpg` covers, is kept
 *    as recorded, since its bare file is the landscape composite.
 * 2. The unsigned `oardefault.jpg` and `sardefault.jpg` display covers.
 * 3. `oar2.jpg`, an upright frame YouTube picked from the video.
 * 4. `fallbackUrl`, kept when nothing upright exists.
 * 5. `frame0.jpg`, the small first frame.
 */
export function youtubeShortPosterPlan(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
): YoutubeShortPosterPlan | null {
  const urls = collectUrls(rawJson, fallbackUrl);
  const videoId = urls
    .map(youtubeVideoIdFromUrl)
    .find((id): id is string => id !== null);
  if (!videoId || !isShortCandidate(urls, durationOf(rawJson))) {
    return null;
  }
  const fallback =
    fallbackUrl && fallbackUrl.length > 0
      ? fallbackUrl
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const thumb = (name: string) => `https://i.ytimg.com/vi/${videoId}/${name}`;
  return {
    fallbackUrl: fallback,
    attempts: dedupe([
      ...recordedCovers(rawJson, fallbackUrl, videoId),
      thumb("oardefault.jpg"),
      thumb("sardefault.jpg"),
      thumb("oar2.jpg"),
      fallback,
      thumb("frame0.jpg"),
    ]),
  };
}

/** True for a poster saved from a frame YouTube picked, which a display cover should replace. */
export function isYoutubeAutomaticFrame(
  url: string | null | undefined,
): boolean {
  const thumb = ytimgThumb(url);
  return thumb !== null && AUTOMATIC_FRAME.test(thumb.file);
}

function recordedCovers(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
  videoId: string,
): Array<string> {
  const recorded: Array<string | null | undefined> = [];
  for (const media of rawJson?.capture?.media ?? []) {
    if (media.type === "video") recorded.push(media.posterUrl);
  }
  recorded.push(fallbackUrl, rawJson?.ytdlp?.thumbnail);
  const covers: Array<string> = [];
  for (const url of recorded) {
    const thumb = ytimgThumb(url);
    if (!url || !thumb || thumb.videoId !== videoId) continue;
    if (AUTOMATIC_FRAME.test(thumb.file)) continue;
    if (DISPLAY_COVER.test(thumb.file)) {
      covers.push(
        `https://i.ytimg.com/vi/${videoId}/${thumb.file.replace(/\.webp$/, ".jpg")}`,
      );
    }
    covers.push(url);
  }
  return covers;
}

function ytimgThumb(
  url: string | null | undefined,
): { videoId: string; file: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host !== "ytimg.com" && !host.endsWith(".ytimg.com")) return null;
  const match = /^\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\/([^/]+)$/.exec(
    parsed.pathname,
  );
  if (!match?.[1] || !match[2]) return null;
  return { videoId: match[1], file: match[2] };
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

function isShortCandidate(
  urls: Array<string>,
  durationSec: number | null,
): boolean {
  if (urls.some(isYoutubeShortsUrl)) {
    return true;
  }
  return (
    durationSec !== null &&
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
  if (capture !== undefined && Number.isFinite(capture)) {
    return capture;
  }
  const downloaded = rawJson?.ytdlp?.duration;
  if (downloaded !== undefined && Number.isFinite(downloaded)) {
    return downloaded;
  }
  return null;
}

function collectUrls(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
): Array<string> {
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

function dedupe(urls: Array<string>): Array<string> {
  const seen = new Set<string>();
  const out: Array<string> = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
