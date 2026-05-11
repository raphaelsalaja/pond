/// <reference lib="dom" />

/**
 * Shared Reddit (old.reddit) extraction helpers. Serializable via
 * `.toString()`.
 */
export function inPageRedditNormalize() {
  function extractFullname(el: HTMLElement): string | null {
    return el.getAttribute("data-fullname") ?? null;
  }

  function extractPostPageMeta(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    const titleEl = document.querySelector<HTMLElement>(
      "a.title, [data-click-id='body'] h1, h1",
    );
    const title = titleEl?.textContent?.trim();
    if (title) out.title = title;

    const thing = document.querySelector<HTMLElement>(
      ".thing[data-fullname], [data-fullname]",
    );

    const subreddit =
      thing?.getAttribute("data-subreddit") ??
      document
        .querySelector<HTMLAnchorElement>("a[href*='/r/']")
        ?.href.match(/\/r\/([^/]+)/)?.[1] ??
      undefined;
    if (subreddit) meta.subreddit = subreddit;

    const authorEl = document.querySelector<HTMLAnchorElement>(
      "a.author, [data-click-id='user']",
    );
    if (authorEl?.textContent?.trim()) {
      out.author = `u/${authorEl.textContent.trim()}`;
      meta.authorUrl = authorEl.href?.startsWith("http")
        ? authorEl.href
        : undefined;
    }

    const selftext = document.querySelector<HTMLElement>(
      ".usertext-body .md, [data-click-id='text']",
    );
    const desc = selftext?.textContent?.trim();
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
    } else if (subreddit) {
      out.description = `r/${subreddit}`;
    }

    const score = thing?.getAttribute("data-score");
    if (score) {
      const n = Number.parseInt(score, 10);
      if (Number.isFinite(n)) meta.score = n;
    }

    const commentLink = document.querySelector<HTMLAnchorElement>(
      "a.comments, [data-click-id='comments']",
    );
    const commentText = commentLink?.textContent?.trim() ?? "";
    const commentMatch = commentText.match(/(\d+)\s*comment/i);
    if (commentMatch?.[1]) {
      meta.commentCount = Number.parseInt(commentMatch[1], 10);
    }

    const flair = thing?.querySelector<HTMLElement>(".linkflairlabel, .flair");
    if (flair?.textContent?.trim()) meta.flair = flair.textContent.trim();

    const time = document.querySelector<HTMLTimeElement>("time[datetime]");
    if (time?.dateTime) meta.publishedAt = time.dateTime;

    const galleryItems = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        "a[href*='preview.redd.it'], a[href*='i.redd.it']",
      ),
    );
    const mediaUrls: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const a of galleryItems) {
      const href = a.href;
      if (!href || seen.has(href)) continue;
      seen.add(href);
      mediaUrls.push({ url: href, type: "image" });
    }

    const thumb = thing?.getAttribute("data-url");
    if (thumb && /\.(jpg|jpeg|png|gif|webp)/i.test(thumb) && !seen.has(thumb)) {
      seen.add(thumb);
      mediaUrls.unshift({ url: thumb, type: "image" });
    }

    const thumbImg = thing?.querySelector<HTMLImageElement>("a.thumbnail img");
    const thumbSrc = thumbImg?.src;
    if (
      thumbSrc &&
      !thumbSrc.includes("self") &&
      !thumbSrc.startsWith("data:") &&
      !seen.has(thumbSrc)
    ) {
      seen.add(thumbSrc);
      mediaUrls.push({ url: thumbSrc, type: "image" });
    }

    const video = document.querySelector<HTMLVideoElement>(
      "video[src], video source[src]",
    );
    const videoSrc = video?.src ?? video?.querySelector("source")?.src;
    if (videoSrc && !seen.has(videoSrc)) {
      seen.add(videoSrc);
      const poster = (video as HTMLVideoElement)?.poster || undefined;
      mediaUrls.unshift({
        url: videoSrc,
        type: "video",
        ...(poster ? { poster } : {}),
      });
    }

    if (mediaUrls.length > 0) {
      out.mediaUrls = mediaUrls;
      out.mediaUrl = (mediaUrls[0] as Record<string, unknown>).url;
      out.mediaType = (mediaUrls[0] as Record<string, unknown>).type ?? "image";
    }

    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    if (!out.title && !out.description && !out.mediaUrl) return null;
    return out;
  }

  return { extractFullname, extractPostPageMeta };
}
