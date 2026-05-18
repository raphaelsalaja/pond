import { TerminalError } from "../errors";
import { fetchHtmlInWindow } from "../helpers";
import type {
  Capture,
  ExtractInput,
  Extractor,
  MediaCandidate,
} from "../types";
import { firstMatch, TWITTER_PATTERNS } from "../url-patterns";

export class TwitterTweetExtractor implements Extractor {
  readonly id = "twitter-tweet";
  readonly source = "twitter" as const;
  readonly validUrl = TWITTER_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const tweetId = match?.[1] ?? null;
    if (!tweetId) throw new TerminalError("could not parse tweet id");

    const canonical = `https://x.com/i/web/status/${tweetId}`;
    const result = await fetchHtmlInWindow(canonical, "twitter", tweetId);
    const meta = (result.meta ?? {}) as Record<string, unknown>;

    const media: MediaCandidate[] = (result.mediaUrls ?? []).map((m) => ({
      url: m.url,
      type: m.type === "video" ? "video" : "image",
      ...(m.poster ? { posterUrl: m.poster } : {}),
    }));

    const author = {
      ...(typeof meta.authorName === "string" ? { name: meta.authorName } : {}),
      ...(typeof result.author === "string"
        ? { handle: result.author.replace(/^@/, "") }
        : {}),
      ...(typeof meta.authorAvatar === "string"
        ? { avatarUrl: meta.authorAvatar }
        : {}),
      ...(typeof meta.authorUrl === "string"
        ? { profileUrl: meta.authorUrl }
        : {}),
      ...(meta.verified === true ? { verified: true } : {}),
    };

    const metricsRaw = (meta.metrics ?? {}) as Record<string, unknown>;
    const metrics = pickNumbers(metricsRaw, [
      "likes",
      "retweets",
      "replies",
      "quotes",
      "views",
      "bookmarks",
    ]);

    return {
      id: tweetId,
      source: "twitter",
      url: canonical,
      title: result.title,
      description: result.description,
      ...(Object.keys(author).length > 0 ? { author } : {}),
      ...(typeof meta.publishedAt === "string"
        ? { publishedAt: meta.publishedAt }
        : {}),
      ...(typeof result.lang === "string" ? { lang: result.lang } : {}),
      media,
      ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
      ...(typeof meta.conversationId === "string"
        ? { extras: { conversationId: meta.conversationId } }
        : {}),
    };
  }
}

function pickNumbers<K extends string>(
  obj: Record<string, unknown>,
  keys: readonly K[],
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}
