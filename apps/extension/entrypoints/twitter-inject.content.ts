export default defineContentScript({
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main() {
    const POND_EVENT = "pond:capture";

    function emit(message: unknown) {
      window.postMessage({ type: POND_EVENT, message }, "*");
    }
    function capture(payload: unknown) {
      emit({ kind: "capture", payload });
    }
    function log(level: string, message: string, data?: unknown) {
      emit({ kind: "log", level, message, data });
    }

    function isCapturedEndpoint(url: string) {
      return (
        /\/graphql\/[^/]+\/CreateBookmark(?:$|\?|\/)/.test(url) ||
        /\/graphql\/[^/]+\/FavoriteTweet(?:$|\?|\/)/.test(url) ||
        /\/CreateBookmark(?:$|\?|\/)/.test(url) ||
        /\/FavoriteTweet(?:$|\?|\/)/.test(url)
      );
    }

    function isInterestingGraphql(url: string) {
      return /\/i\/api\/graphql\//.test(url);
    }

    function extractTweetIdFromBody(body: string | null) {
      if (!body) return null;
      try {
        const json = JSON.parse(body);
        const id =
          json?.variables?.tweet_id ??
          json?.variables?.tweetId ??
          json?.variables?.id;
        return id ? String(id) : null;
      } catch {
        const m = body.match(/"tweet_?[Ii]d"\s*:\s*"?(\d+)"?/);
        return m?.[1] ?? null;
      }
    }

    function pickLargestSrcset(srcset: string): string | undefined {
      const parts = srcset
        .split(",")
        .map((p) => p.trim())
        .map((p) => {
          const [u, sz] = p.split(/\s+/);
          return { u, w: sz ? Number.parseInt(sz, 10) : 0 };
        })
        .filter((p) => p.u);
      if (!parts.length) return undefined;
      parts.sort((a, b) => b.w - a.w);
      return parts[0]?.u;
    }

    function upgradeTwimgUrl(url: string): string {
      // pbs.twimg.com media URLs accept a ?name= param. Force `orig` or `large`
      // so we store the highest-res variant available.
      try {
        const u = new URL(url);
        if (u.hostname === "pbs.twimg.com") {
          u.searchParams.set("name", "orig");
          return u.toString();
        }
      } catch {
        /* fall through */
      }
      return url;
    }

    type ScrapedMedia = {
      url: string;
      type?: "image" | "video" | "link";
      poster?: string;
    };
    /**
     * Source-specific metadata we stash on `raw.twitter` so the renderer
     * can draw a tweet-shaped preview (avatar, display name, timestamp,
     * verified tick). None of these map to first-class `Save` columns on
     * purpose — they're embed-chrome, not search fields.
     */
    type ScrapedTweetMeta = {
      authorName?: string;
      authorAvatar?: string;
      publishedAt?: string;
      verified?: boolean;
    };
    type ScrapedTweet = {
      title?: string;
      description?: string;
      author?: string;
      mediaUrl?: string;
      mediaUrls?: ScrapedMedia[];
      mediaType?: "image" | "video" | "link";
      meta?: ScrapedTweetMeta;
    };

    function scrapeTweetDom(id: string): ScrapedTweet {
      const out: ScrapedTweet = {};

      // Tweets are rendered as <article data-testid="tweet"> and contain a
      // <time> wrapped in an <a> whose href is /<handle>/status/<id>.
      const anchor = document.querySelector<HTMLAnchorElement>(
        `a[href*="/status/${id}"]`,
      );
      const article = anchor?.closest("article") ?? null;
      if (!article) return out;

      const textEl = article.querySelector<HTMLElement>(
        '[data-testid="tweetText"]',
      );
      const text = textEl?.textContent?.trim();
      if (text) {
        out.description = text;
        out.title = text.replace(/\s+/g, " ").slice(0, 200);
      }

      // Author handle -- the @-handle <a> inside the User-Name block.
      // Same block also hosts the display name, verified badge, and
      // the published-at <time>. We read them all in one pass so we
      // don't re-scan the DOM for each piece.
      const meta: ScrapedTweetMeta = {};
      const userName = article.querySelector<HTMLElement>(
        '[data-testid="User-Name"]',
      );
      if (userName) {
        const handleLink = Array.from(
          userName.querySelectorAll<HTMLAnchorElement>("a[href]"),
        ).find((a) => {
          try {
            const p = new URL(a.href).pathname;
            return /^\/[A-Za-z0-9_]+\/?$/.test(p) && !p.startsWith("/i/");
          } catch {
            return false;
          }
        });
        if (handleLink) {
          const handle = new URL(handleLink.href).pathname.replace(/\//g, "");
          if (handle) out.author = `@${handle}`;
        }

        // Display name: the first /<handle> link's first span with text.
        // Twitter wraps the name in a couple of decorative spans so we
        // reach for textContent on the link itself (trimmed). The link
        // also contains the verified badge svg; we strip that with a
        // secondary traversal.
        const nameLink = Array.from(
          userName.querySelectorAll<HTMLAnchorElement>("a[href]"),
        ).find((a) => {
          try {
            const p = new URL(a.href).pathname;
            return /^\/[A-Za-z0-9_]+\/?$/.test(p) && !p.startsWith("/i/");
          } catch {
            return false;
          }
        });
        if (nameLink) {
          const raw = nameLink.textContent?.replace(/\s+/g, " ").trim();
          if (raw) meta.authorName = raw;
        }

        // Verified tick: Twitter renders a dedicated svg for each tier
        // (blue / business / gov). Any of them counts.
        meta.verified = !!userName.querySelector(
          'svg[data-testid="icon-verified"], svg[aria-label="Verified account"]',
        );

        // Published timestamp: the <time> inside User-Name has an ISO
        // `datetime` attribute.
        const time = userName.querySelector<HTMLTimeElement>("time[datetime]");
        const dt = time?.getAttribute("datetime");
        if (dt) meta.publishedAt = dt;
      }

      // Avatar: sits in its own container outside User-Name. The
      // testid varies with the handle suffix (e.g.
      // `UserAvatar-Container-vercel`), so match by prefix.
      const avatarImg = article.querySelector<HTMLImageElement>(
        '[data-testid^="UserAvatar-Container"] img',
      );
      const avatarSrc = avatarImg?.currentSrc ?? avatarImg?.src ?? "";
      if (avatarSrc) {
        // Twitter serves `_normal` (48px) avatars by default. Bump the
        // size suffix to `_400x400` so the card has a crisp Retina image.
        meta.authorAvatar = avatarSrc.replace(
          /_normal(\.(?:jpg|jpeg|png|webp))/i,
          "_400x400$1",
        );
      }

      if (Object.keys(meta).length > 0) out.meta = meta;

      const media: ScrapedMedia[] = [];
      const seen = new Set<string>();
      const push = (m: ScrapedMedia | undefined) => {
        if (!m?.url || seen.has(m.url)) return;
        seen.add(m.url);
        media.push(m);
      };

      // Every <video> in the tweet. `currentSrc` is usually a blob: URL
      // for HLS streams so we store the poster (static frame) as the
      // download target; the main mp4 isn't fetchable cross-origin anyway.
      const videos = Array.from(
        article.querySelectorAll<HTMLVideoElement>("video"),
      );
      for (const v of videos) {
        if (v.poster) {
          push({ url: v.poster, type: "video", poster: v.poster });
        }
      }

      // Every photo container in the tweet (multi-image tweets render up to 4).
      const photoImgs = Array.from(
        article.querySelectorAll<HTMLImageElement>(
          '[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]',
        ),
      );
      for (const img of photoImgs) {
        const best = img.srcset ? pickLargestSrcset(img.srcset) : undefined;
        const src = best ?? img.currentSrc ?? img.src;
        if (src) push({ url: upgradeTwimgUrl(src), type: "image" });
      }

      if (media.length > 0) {
        out.mediaUrls = media;
        out.mediaUrl = media[0]?.url;
        out.mediaType = media[0]?.type ?? "image";
      }

      return out;
    }

    function emitTweet(id: string, kind: string) {
      if (!id) return;
      let scraped: ScrapedTweet | undefined;
      try {
        scraped = scrapeTweetDom(id);
      } catch (e) {
        log("warn", "twitter scrapeTweetDom failed", String(e));
      }
      capture({
        source: "twitter",
        sourceId: String(id),
        url: `https://x.com/i/web/status/${id}`,
        title: scraped?.title,
        description: scraped?.description,
        author: scraped?.author,
        mediaUrl: scraped?.mediaUrl,
        mediaUrls: scraped?.mediaUrls,
        mediaType: scraped?.mediaType,
        raw: {
          kind,
          capturedAt: new Date().toISOString(),
          twitter: scraped?.meta,
        },
      });
    }

    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : (input as Request)?.url;
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const body =
        init?.body && typeof init.body === "string" ? init.body : null;

      const res = await origFetch.call(this, input, init);

      try {
        if (method === "POST" && typeof url === "string") {
          if (isCapturedEndpoint(url)) {
            log("info", "twitter capture matched (fetch)", {
              url,
              status: res.status,
            });
            if (res.ok) {
              const id = extractTweetIdFromBody(body);
              if (id) emitTweet(id, "fetch");
              else
                log("warn", "no tweet id in fetch body", {
                  body,
                });
            }
          } else if (isInterestingGraphql(url)) {
            log("info", "twitter graphql POST (no match)", {
              url,
              status: res.status,
            });
          }
        }
      } catch (e) {
        log("warn", "twitter fetch hook error", String(e));
      }

      return res;
    };

    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR(this: XMLHttpRequest) {
      const xhr = new OrigXHR();
      let _url = "";
      let _method = "GET";
      let _body: string | null = null;
      const origOpen = xhr.open;
      const origSend = xhr.send;
      xhr.open = function (method: string, url: string) {
        _method = String(method ?? "GET").toUpperCase();
        _url = String(url ?? "");
        return origOpen.apply(xhr, arguments as any);
      };
      xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
        _body = typeof body === "string" ? body : null;
        xhr.addEventListener("load", () => {
          try {
            if (_method === "POST") {
              if (isCapturedEndpoint(_url)) {
                log("info", "twitter capture matched (xhr)", {
                  url: _url,
                  status: xhr.status,
                });
                if (xhr.status >= 200 && xhr.status < 300) {
                  const id = extractTweetIdFromBody(_body);
                  if (id) emitTweet(id, "xhr");
                  else log("warn", "no tweet id in xhr body", { body: _body });
                }
              } else if (isInterestingGraphql(_url)) {
                log("info", "twitter graphql POST xhr (no match)", {
                  url: _url,
                  status: xhr.status,
                });
              }
            }
          } catch (e) {
            log("warn", "twitter xhr hook error", String(e));
          }
        });
        return origSend.apply(xhr, arguments as any);
      };
      return xhr;
    }
    PatchedXHR.prototype = OrigXHR.prototype;
    (window as any).XMLHttpRequest = PatchedXHR;

    log("info", "twitter inject ready");
  },
});
