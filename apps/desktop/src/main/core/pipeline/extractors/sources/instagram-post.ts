import { TerminalError } from "../errors";
import { fetchHtmlInWindow } from "../helpers";
import type {
  Capture,
  ExtractInput,
  Extractor,
  MediaCandidate,
} from "../types";
import { firstMatch, INSTAGRAM_PATTERNS } from "../url-patterns";

export class InstagramPostExtractor implements Extractor {
  readonly id = "instagram-post";
  readonly source = "instagram" as const;
  readonly validUrl = INSTAGRAM_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const code = match?.[1] ?? null;
    if (!code) throw new TerminalError("could not parse instagram code");

    const segment = /\/reel\//i.test(input.url.href)
      ? "reel"
      : /\/tv\//i.test(input.url.href)
        ? "tv"
        : "p";
    const canonical = `https://www.instagram.com/${segment}/${code}/`;

    const result = await fetchHtmlInWindow(canonical, "instagram", code);
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
    };

    const metricsRaw = (meta.metrics ?? {}) as Record<string, unknown>;
    const metrics = pickNumbers(metricsRaw, ["likes", "comments", "plays"]);

    return {
      id: code,
      source: "instagram",
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
