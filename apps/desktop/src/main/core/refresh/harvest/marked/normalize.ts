/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import type { BrowserValidators, MarkedRef } from "../lib/browser-validation";
import type { ListEntry } from "../list-types";

export interface MarkedRefPage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" | "video"; poster?: string }>;
  meta: {
    authorName?: string;
    authorAvatar?: string;
    authorUrl?: string;
    verified?: boolean;
    publishedAt?: string;
    upstreamUrl?: string;
  };
}

/** Runs inside the page, so the library walk and the item harvest read one ref shape the same way. */
export function inPageMarkedNormalize(validators: BrowserValidators) {
  /** Seeded media and avatars come back as paths on marked.dev. */
  function absolute(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url, "https://marked.dev").href;
    } catch {
      return undefined;
    }
  }

  function parseRef(raw: JsonValue): MarkedRef | null {
    const ref = validators.markedRef.safeParse(raw);
    return ref.success ? ref.data : null;
  }

  function parseRefs(raw: JsonValue): MarkedRef[] | null {
    const refs = validators.markedRefs.safeParse(raw);
    if (!refs.success) return null;
    return refs.data.flatMap((ref) => (ref ? [ref] : []));
  }

  function refMedia(ref: MarkedRef): MarkedRefPage["mediaUrls"] {
    const media: MarkedRefPage["mediaUrls"] = [];
    for (const item of ref.media) {
      const url = absolute(item?.url);
      if (!item || !url) continue;
      const poster = absolute(item.posterUrl);
      const type = item.kind === "video" ? "video" : "image";
      media.push(
        poster && type === "video" ? { url, type, poster } : { url, type },
      );
    }
    return media;
  }

  function refPage(ref: MarkedRef): MarkedRefPage {
    const page: MarkedRefPage = { mediaUrls: refMedia(ref), meta: {} };
    const title = ref.title || ref.text;
    if (title) page.title = title;
    const description = ref.description || ref.aiDescription || ref.text;
    if (description) page.description = description;
    const author = ref.author;
    if (author?.handle) page.author = `@${author.handle}`;
    else if (author?.name) page.author = author.name;
    if (author?.name) page.meta.authorName = author.name;
    const avatar = absolute(author?.avatarUrl);
    if (avatar) page.meta.authorAvatar = avatar;
    if (author?.profileUrl) page.meta.authorUrl = author.profileUrl;
    if (author?.verified) page.meta.verified = true;
    const publishedAt = ref.publishedAt || ref.createdAt;
    if (publishedAt) page.meta.publishedAt = publishedAt;
    if (ref.sourceUrl) page.meta.upstreamUrl = ref.sourceUrl;
    return page;
  }

  function refEntry(ref: MarkedRef): ListEntry {
    const page = refPage(ref);
    const entry: ListEntry = {
      sourceId: ref.id,
      url: `https://marked.dev/ref/${ref.id}`,
      listKinds: ["saved"],
    };
    if (ref.save?.createdAt) entry.savedAt = ref.save.createdAt;
    if (page.title) entry.title = page.title;
    if (page.description) entry.description = page.description;
    if (page.meta.authorName) entry.author = page.meta.authorName;
    const [first] = page.mediaUrls;
    if (first) {
      entry.mediaUrl = first.url;
      entry.mediaUrls = page.mediaUrls;
      entry.mediaType = first.type;
    }
    return entry;
  }

  return { parseRef, parseRefs, refPage, refEntry };
}
