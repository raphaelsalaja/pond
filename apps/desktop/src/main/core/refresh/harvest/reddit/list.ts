/// <reference lib="dom" />

/**
 * Reddit saved-list collector. Uses old.reddit's click-next pagination
 * via the shared scroll scaffold with `scrollBehavior: "click-next"`.
 */

import type { MediaType } from "@pond/schema/db";
import { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageRedditNormalize } from "./normalize";

export function redditSavedUrl(handle: string): string {
  return `https://old.reddit.com/user/${encodeURIComponent(handle)}/saved/`;
}

export function buildRedditListExpression(args: ListHarvestArgs): string {
  const scrollSrc = `(${inPageScrollCollect.toString()})()`;
  const normSrc = `(${inPageRedditNormalize.toString()})()`;
  const fnSrc = `(${inPageRedditList.toString()})`;
  return `(async () => {
    const scroll = ${scrollSrc};
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, scroll, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageRedditList(
  args: ListHarvestArgs,
  scroll: ReturnType<typeof inPageScrollCollect>,
  _norm: ReturnType<typeof inPageRedditNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/account/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  function collectFn() {
    const out: Array<{
      sourceId: string;
      url: string;
      savedAt?: string;
      title?: string;
      author?: string;
      description?: string;
      mediaUrl?: string;
      mediaType?: MediaType;
    }> = [];
    const seen = new Set<string>();
    const things = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".thing[data-fullname], div[data-fullname]",
      ),
    );
    for (const node of things) {
      const fullname = node.getAttribute("data-fullname");
      if (!fullname || seen.has(fullname)) continue;
      seen.add(fullname);

      const permalink =
        node.getAttribute("data-permalink") ||
        node
          .querySelector<HTMLAnchorElement>("a.bylink, a.comments")
          ?.getAttribute("href") ||
        null;
      if (!permalink) continue;

      const url = permalink.startsWith("http")
        ? permalink
        : `https://www.reddit.com${permalink}`;
      const time = node.querySelector<HTMLTimeElement>("time[datetime]");
      const savedAt = time?.getAttribute("datetime") ?? undefined;
      const titleEl = node.querySelector<HTMLAnchorElement>("a.title");
      const title = titleEl?.textContent?.trim() || undefined;
      const authorEl = node.querySelector<HTMLAnchorElement>("a.author");
      const author = authorEl?.textContent?.trim() || undefined;
      const subreddit = node.getAttribute("data-subreddit") || undefined;
      const description = subreddit ? `r/${subreddit}` : undefined;
      const thumb = node.getAttribute("data-url") || undefined;
      const thumbImg = node.querySelector<HTMLImageElement>("a.thumbnail img");
      const thumbSrc = thumbImg?.src ?? undefined;
      const mediaUrl =
        thumb && /\.(jpg|jpeg|png|gif|webp)/i.test(thumb)
          ? thumb
          : thumbSrc &&
              !thumbSrc.includes("self") &&
              !thumbSrc.startsWith("data:")
            ? thumbSrc
            : undefined;

      out.push({
        sourceId: fullname,
        url,
        ...(savedAt ? { savedAt } : {}),
        title,
        author,
        description,
        mediaUrl,
        mediaType: mediaUrl ? "image" : undefined,
      });
    }
    return out;
  }

  return scroll({
    collectFn,
    knownIds: args.knownIds,
    maxItems: args.maxItems,
    hydrateSelector: ".thing[data-fullname]",
    scrollBehavior: "click-next",
    nextSelector: "span.next-button > a[rel~='nofollow next'], a[rel*='next']",
    nextDelayMs: 1500,
  });
}
