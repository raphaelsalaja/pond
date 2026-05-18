import { TerminalError } from "../errors";
import { fetchHtmlInWindow } from "../helpers";
import type {
  Capture,
  ExtractInput,
  Extractor,
  MediaCandidate,
} from "../types";
import { firstMatch, YOUTUBE_PATTERNS } from "../url-patterns";

export class YouTubeWatchExtractor implements Extractor {
  readonly id = "youtube-watch";
  readonly source = "youtube" as const;
  readonly validUrl = YOUTUBE_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const videoId = match?.[1] ?? null;
    if (!videoId) throw new TerminalError("could not parse youtube id");
    const canonical = `https://www.youtube.com/watch?v=${videoId}`;

    const dom = await fetchHtmlInWindow(canonical, "youtube", videoId);
    const meta = (dom.meta ?? {}) as Record<string, unknown>;

    // fetch_video_ytdlp gates on `type: "video"` in capture.media, so make
    // sure we always emit one for a watch page. Falls back to the canonical
    // i.ytimg.com thumbnail when the DOM scrape didn't surface a poster.
    const posterUrl =
      typeof dom.mediaUrl === "string" && dom.mediaUrl.length > 0
        ? dom.mediaUrl
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const media: MediaCandidate[] = [
      {
        url: canonical,
        type: "video",
        posterUrl,
      },
    ];

    const author = {
      ...(typeof dom.author === "string" ? { name: dom.author } : {}),
      ...(typeof meta.authorUrl === "string"
        ? { profileUrl: meta.authorUrl }
        : {}),
      ...(typeof meta.authorAvatar === "string"
        ? { avatarUrl: meta.authorAvatar }
        : {}),
    };

    const metrics: Record<string, number> = {};
    if (typeof meta.views === "number") metrics.views = meta.views;
    if (typeof meta.likes === "number") metrics.likes = meta.likes;

    const duration =
      typeof meta.durationSec === "number" ? meta.durationSec : undefined;

    return {
      id: videoId,
      source: "youtube",
      url: canonical,
      title: dom.title,
      description: dom.description,
      ...(Object.keys(author).length > 0 ? { author } : {}),
      ...(typeof meta.publishedAt === "string"
        ? { publishedAt: meta.publishedAt }
        : {}),
      ...(typeof dom.lang === "string" ? { lang: dom.lang } : {}),
      media,
      ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
      ...(duration !== undefined ? { duration } : {}),
    };
  }
}
