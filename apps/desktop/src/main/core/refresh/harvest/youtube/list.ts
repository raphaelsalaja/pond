/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import { buildScrollListExpression } from "../lib/expression";
import type { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageYoutubeNormalize } from "./normalize";

export const YOUTUBE_LIST_URLS = [
  "https://www.youtube.com/playlist?list=WL",
  "https://www.youtube.com/playlist?list=LL",
] as const;

export function youtubePlaylistUrl(listId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
}

export function buildYoutubeListExpression(args: ListHarvestArgs): string {
  return buildScrollListExpression(
    inPageYoutubeNormalize,
    inPageYoutubeList,
    args,
  );
}

async function inPageYoutubeList(
  args: ListHarvestArgs,
  scroll: ReturnType<typeof inPageScrollCollect>,
  norm: ReturnType<typeof inPageYoutubeNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/signin") ||
    location.hostname.includes("accounts.google.com")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  function collectFn() {
    const out: Array<{
      sourceId: string;
      url: string;
      title?: string;
      author?: string;
      mediaUrl?: string;
      mediaType?: MediaType;
    }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a#thumbnail[href*="/watch?v="], a[href*="/watch?v="]',
      ),
    );
    for (const a of links) {
      const id = norm.extractVideoId(a.href);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const renderer = a.closest(
        "yt-lockup-view-model, ytd-playlist-video-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer",
      );
      const title =
        renderer
          ?.querySelector<HTMLElement>(
            "#video-title, .ytLockupMetadataViewModelTitle",
          )
          ?.textContent?.trim() || undefined;
      const author =
        renderer
          ?.querySelector<HTMLElement>(
            "#channel-name yt-formatted-string, .ytd-channel-name yt-formatted-string, #text.ytd-channel-name, .ytContentMetadataViewModelMetadataRow a",
          )
          ?.textContent?.trim() || undefined;
      const thumb =
        renderer?.querySelector<HTMLImageElement>("img")?.src ?? undefined;
      const mediaUrl = thumb && !thumb.startsWith("data:") ? thumb : undefined;

      out.push({
        sourceId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title,
        author,
        mediaUrl,
        mediaType: "video",
      });
    }
    return out;
  }

  return scroll({
    collectFn,
    knownIds: args.knownIds,
    hydrateSelector: 'a[href*="/watch?v="]',
  });
}
