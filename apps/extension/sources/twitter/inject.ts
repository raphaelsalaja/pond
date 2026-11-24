import { capture, installInterceptor } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import { at, isJsonValue } from "@/utils/json";

const CAPTURED = [
  /\/graphql\/[^/]+\/CreateBookmark(?:$|\?|\/)/,
  /\/graphql\/[^/]+\/FavoriteTweet(?:$|\?|\/)/,
  /\/CreateBookmark(?:$|\?|\/)/,
  /\/FavoriteTweet(?:$|\?|\/)/,
];

function isCapturedEndpoint(url: string): boolean {
  return CAPTURED.some((re) => re.test(url));
}

function triggerForUrl(url: string): "twitter:like" | "twitter:bookmark" {
  return /FavoriteTweet/.test(url) ? "twitter:like" : "twitter:bookmark";
}

function extractTweetId(body: string | null): string | null {
  if (!body) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    const json = isJsonValue(parsed) ? parsed : null;
    const id =
      at(json, "variables", "tweet_id") ??
      at(json, "variables", "tweetId") ??
      at(json, "variables", "id");
    return id ? String(id) : null;
  } catch {
    const m = body.match(/"tweet_?[Ii]d"\s*:\s*"?(\d+)"?/);
    return m?.[1] ?? null;
  }
}

export function inject(): void {
  installInterceptor({
    id: "twitter",
    match: (req: RequestLens) =>
      req.method === "POST" && isCapturedEndpoint(req.url),
    async onResponse(req, res) {
      if (!res.ok) {
        return;
      }
      const id = extractTweetId(await req.readBody());
      if (id) {
        capture(`https://x.com/i/web/status/${id}`, triggerForUrl(req.url));
      }
    },
  });
}
