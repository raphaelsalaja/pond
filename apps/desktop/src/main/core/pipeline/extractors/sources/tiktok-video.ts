import { TerminalError } from "../errors";
import { fetchHtmlInWindow } from "../helpers";
import type {
  Capture,
  ExtractInput,
  Extractor,
  MediaCandidate,
} from "../types";
import { firstMatch, TIKTOK_PATTERNS } from "../url-patterns";

export class TikTokVideoExtractor implements Extractor {
  readonly id = "tiktok-video";
  readonly source = "tiktok" as const;
  readonly validUrl = TIKTOK_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const canonical = input.url.href;
    const match = firstMatch(input.url, this.validUrl);
    const tiktokId = match?.[1] ?? canonical;
    if (!tiktokId) throw new TerminalError("could not parse tiktok id");

    const dom = await fetchHtmlInWindow(canonical, "tiktok", tiktokId);
    const meta = (dom.meta ?? {}) as Record<string, unknown>;

    const media: MediaCandidate[] = [];
    for (const m of dom.mediaUrls ?? []) {
      media.push({
        url: m.url,
        type: m.type === "video" ? "video" : "image",
        ...(m.poster ? { posterUrl: m.poster } : {}),
      });
    }

    const author = {
      ...(typeof meta.authorName === "string"
        ? { name: String(meta.authorName) }
        : {}),
      ...(typeof dom.author === "string"
        ? { handle: dom.author.replace(/^@/, "") }
        : {}),
      ...(typeof meta.authorUrl === "string"
        ? { profileUrl: meta.authorUrl }
        : {}),
      ...(typeof meta.authorAvatar === "string"
        ? { avatarUrl: meta.authorAvatar }
        : {}),
      ...(meta.verified === true ? { verified: true } : {}),
    };

    const metricsRaw = (meta.metrics ?? {}) as Record<string, unknown>;
    const metrics: Record<string, number> = {};
    if (typeof metricsRaw.likes === "number") metrics.likes = metricsRaw.likes;
    if (typeof metricsRaw.comments === "number") {
      metrics.comments = metricsRaw.comments;
    }
    if (typeof metricsRaw.shares === "number") {
      metrics.shares = metricsRaw.shares;
    }
    // TikTok shows this number labeled "Plays" — keep the same semantic key
    // so the UI mirrors what the app shows.
    if (typeof metricsRaw.plays === "number") metrics.plays = metricsRaw.plays;
    if (typeof metricsRaw.bookmarks === "number") {
      metrics.bookmarks = metricsRaw.bookmarks;
    }

    const duration =
      typeof meta.durationSec === "number" ? meta.durationSec : undefined;

    return {
      id: tiktokId,
      source: "tiktok",
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
