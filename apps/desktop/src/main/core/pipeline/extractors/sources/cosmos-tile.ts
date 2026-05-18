import { TerminalError } from "../errors";
import { fetchHtmlInWindow } from "../helpers";
import type {
  Capture,
  ExtractInput,
  Extractor,
  MediaCandidate,
} from "../types";
import { COSMOS_PATTERNS } from "../url-patterns";

export class CosmosTileExtractor implements Extractor {
  readonly id = "cosmos-tile";
  readonly source = "cosmos" as const;
  readonly validUrl = COSMOS_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const canonical = input.url.href;
    const sourceId = input.url.pathname.replace(/\/$/, "").replace(/^\//, "");
    if (!sourceId) throw new TerminalError("could not parse cosmos id");

    const result = await fetchHtmlInWindow(canonical, "cosmos", sourceId);
    const meta = (result.meta ?? {}) as Record<string, unknown>;

    const media: MediaCandidate[] = (result.mediaUrls ?? []).map((m) => ({
      url: m.url,
      type: m.type === "video" ? "video" : "image",
      ...(m.poster ? { posterUrl: m.poster } : {}),
    }));

    const author = {
      ...(typeof result.author === "string"
        ? { name: result.author, handle: result.author.replace(/^@/, "") }
        : {}),
      ...(typeof meta.authorAvatar === "string"
        ? { avatarUrl: meta.authorAvatar }
        : {}),
      ...(typeof meta.authorUrl === "string"
        ? { profileUrl: meta.authorUrl }
        : {}),
    };

    const upstreamUrl =
      typeof meta.upstreamUrl === "string"
        ? meta.upstreamUrl
        : typeof meta.sourceUrl === "string"
          ? meta.sourceUrl
          : undefined;
    const upstream = (() => {
      if (!upstreamUrl) return undefined;
      try {
        return { url: upstreamUrl, host: new URL(upstreamUrl).host };
      } catch {
        return undefined;
      }
    })();

    // Cosmos tiles often wrap iframe embeds (YouTube/Vimeo) — the DOM
    // normalizer picks up the poster image but not the underlying video.
    // If we have an upstream URL, synthesize a video candidate so the
    // fetch_video_ytdlp gate fires.
    if (upstream && !media.some((m) => m.type === "video")) {
      media.push({
        url: upstream.url,
        type: "video",
        ...(media[0]?.url ? { posterUrl: media[0].url } : {}),
      });
    }

    return {
      id: sourceId,
      source: "cosmos",
      url: canonical,
      title: result.title,
      description: result.description,
      ...(Object.keys(author).length > 0 ? { author } : {}),
      ...(typeof meta.publishedAt === "string"
        ? { publishedAt: meta.publishedAt }
        : {}),
      ...(typeof result.lang === "string" ? { lang: result.lang } : {}),
      media,
      ...(upstream ? { upstream } : {}),
      ...(meta.tileType || meta.clusters
        ? {
            extras: {
              ...(typeof meta.tileType === "string"
                ? { tileType: meta.tileType }
                : {}),
              ...(meta.clusters ? { clusters: meta.clusters } : {}),
            },
          }
        : {}),
    };
  }
}
