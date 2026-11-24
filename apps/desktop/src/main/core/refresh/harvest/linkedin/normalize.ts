/// <reference lib="dom" />

import type { ListEntry } from "../list-types";

/** Voyager is LinkedIn's private API, so every field here is optional and read defensively. */
interface VoyagerText {
  text?: string;
}

interface VoyagerVectorImage {
  rootUrl?: string;
  artifacts?: Array<{
    width?: number;
    fileIdentifyingUrlPathSegment?: string;
  }>;
}

interface VoyagerImage {
  attributes?: Array<{
    detailData?: {
      vectorImage?: VoyagerVectorImage;
      nonEntityProfilePicture?: { vectorImage?: VoyagerVectorImage };
      imageUrl?: { url?: string };
    };
  }>;
}

export interface VoyagerEntityResult {
  $type?: string;
  entityUrn?: string;
  trackingUrn?: string;
  navigationUrl?: string;
  actorNavigationUrl?: string;
  title?: VoyagerText;
  primarySubtitle?: VoyagerText;
  summary?: VoyagerText;
  image?: VoyagerImage;
  entityEmbeddedObject?: {
    image?: VoyagerImage;
    title?: VoyagerText;
    navigationUrl?: string;
  };
}

interface VoyagerClusterCollection {
  elements?: Array<{
    items?: Array<{
      item?: {
        "*entityResult"?: string;
        entityResult?: VoyagerEntityResult;
      };
    }>;
  }>;
  paging?: { start?: number; count?: number; total?: number };
}

export interface VoyagerClusterReply {
  data?: {
    data?: { searchDashClustersByAll?: VoyagerClusterCollection };
    searchDashClustersByAll?: VoyagerClusterCollection;
  };
  included?: Array<VoyagerEntityResult>;
}

export interface LinkedInClusterPage {
  entries: Array<ListEntry>;
  /** Counts unreadable results too, so the walk still advances past a post it could not parse. */
  count: number;
  total?: number;
}

export interface LinkedInPostPage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: {
    authorName?: string;
    authorAvatar?: string;
    authorUrl?: string;
    publishedAt?: string;
    upstreamUrl?: string;
  };
}

interface PostRef {
  kind: "activity" | "ugcPost" | "share";
  id: string;
}

/** Runs inside the page, so the list walk, its DOM fallback and the item harvest read posts the same way. */
export function inPageLinkedInNormalize() {
  const POST_URN =
    /urn(?::|%3A)li(?::|%3A)(activity|ugcPost|share)(?::|%3A)(\d{10,25})/i;
  const POST_SLUG = /-(activity|ugcPost|share)-(\d{10,25})(?=[-/?#]|$)/i;
  const PROFILE_PATH = /^\/(?:in|company|school|showcase)\/[^/]+/;
  const TITLE_CAP = 90;

  const RESULT = "[data-chameleon-result-urn]";
  const RESULT_SUMMARY =
    ".entity-result__content-summary, [class*='content-summary']";
  const RESULT_AUTHOR =
    ".entity-result__title-text span[aria-hidden='true'], .entity-result__content-actor span[aria-hidden='true']";
  const RESULT_IMAGE =
    ".entity-result__embedded-object img, [class*='embedded-object'] img";
  const ACTOR_LINK =
    ".update-components-actor__meta-link, .update-components-actor__container a[href*='/in/'], .update-components-actor__container a[href*='/company/']";
  const ACTOR_NAME =
    ".update-components-actor__title span[aria-hidden='true'], .update-components-actor__name span[aria-hidden='true']";
  const ACTOR_AVATAR =
    ".update-components-actor__avatar-image, .update-components-actor__image img";
  const COMMENTARY =
    ".update-components-update-v2__commentary, .feed-shared-update-v2__description, .update-components-text";
  const IMAGES =
    ".update-components-image img, .update-components-carousel img";
  const VIDEO = ".update-components-linkedin-video video";
  const DOCUMENT_COVER =
    ".update-components-document__container img, .document-s-container img";
  const DOCUMENT_FRAME =
    ".update-components-document__container iframe, .document-s-container iframe";
  const ARTICLE_LINK =
    ".update-components-article a[href], .update-components-article__meta a[href]";
  const ARTICLE_IMAGE = ".update-components-article img";
  const ARTICLE_TITLE = ".update-components-article__title";
  const HIDDEN_CONTROLS = "button, .visually-hidden, [aria-hidden='true'] svg";

  function postRef(
    candidates: Array<string | null | undefined>,
  ): PostRef | null {
    for (const value of candidates) {
      if (!value) {
        continue;
      }
      const match = POST_URN.exec(value) ?? POST_SLUG.exec(value);
      const kind = match?.[1]?.toLowerCase();
      const id = match?.[2];
      if (!kind || !id) {
        continue;
      }
      if (kind === "ugcpost") {
        return { kind: "ugcPost", id };
      }
      return { kind: kind === "share" ? "share" : "activity", id };
    }
    return null;
  }

  function postUrl(ref: PostRef): string {
    return `https://www.linkedin.com/feed/update/urn:li:${ref.kind}:${ref.id}/`;
  }

  function profileUrl(href: string | null | undefined): string | undefined {
    if (!href) {
      return undefined;
    }
    try {
      const url = new URL(href, "https://www.linkedin.com");
      if (!/(?:^|\.)linkedin\.com$/.test(url.hostname)) {
        return undefined;
      }
      const path = PROFILE_PATH.exec(url.pathname)?.[0];
      return path ? `https://www.linkedin.com${path}/` : undefined;
    } catch {
      return undefined;
    }
  }

  function vanityOf(profile: string | undefined): string | undefined {
    const raw = profile ? /\/in\/([^/]+)\/$/.exec(profile)?.[1] : undefined;
    if (!raw) {
      return undefined;
    }
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function clean(text: string | null | undefined): string {
    if (!text) {
      return "";
    }
    return String(text)
      .replaceAll("\u00A0", " ")
      .split("\n")
      .map((line) => line.replaceAll(/\s+/g, " ").trim())
      .join("\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim();
  }

  function titleFrom(text: string): string | undefined {
    const line = text.split("\n")[0]?.trim();
    if (!line) {
      return undefined;
    }
    if (line.length <= TITLE_CAP) {
      return line;
    }
    return `${line.slice(0, TITLE_CAP - 1).trimEnd()}…`;
  }

  /** Activity ids carry their creation time in milliseconds above the low 22 bits. */
  function publishedAtFromId(id: string): string | undefined {
    try {
      const ms = Number(BigInt(id) >> BigInt(22));
      if (ms < Date.UTC(2003, 0, 1) || ms > Date.now() + 86_400_000) {
        return undefined;
      }
      return new Date(ms).toISOString();
    } catch {
      return undefined;
    }
  }

  function largestImage(vector: VoyagerVectorImage | undefined): string {
    const root = vector?.rootUrl;
    const artifacts = vector?.artifacts ?? [];
    if (!root || artifacts.length === 0) {
      return "";
    }
    let best = artifacts[0];
    for (const artifact of artifacts) {
      if ((artifact?.width ?? 0) > (best?.width ?? 0)) {
        best = artifact;
      }
    }
    const segment = best?.fileIdentifyingUrlPathSegment;
    return segment ? `${root}${segment}` : "";
  }

  function imageOf(image: VoyagerImage | undefined): string {
    for (const attribute of image?.attributes ?? []) {
      const detail = attribute?.detailData;
      const url =
        largestImage(detail?.vectorImage) ||
        largestImage(detail?.nonEntityProfilePicture?.vectorImage) ||
        detail?.imageUrl?.url;
      if (url) {
        return url;
      }
    }
    return "";
  }

  function withImage(entry: ListEntry, media: string): ListEntry {
    if (media) {
      entry.mediaUrl = media;
      entry.mediaUrls = [{ url: media, type: "image" }];
      entry.mediaType = "image";
    } else {
      entry.mediaType = "text";
    }
    return entry;
  }

  function entryFromResult(result: VoyagerEntityResult): ListEntry | null {
    const ref = postRef([
      result.trackingUrn,
      result.entityUrn,
      result.navigationUrl,
    ]);
    if (!ref) {
      return null;
    }
    const entry: ListEntry = {
      sourceId: ref.id,
      url: postUrl(ref),
      listKinds: ["saved"],
    };
    const text = clean(result.summary?.text);
    const title =
      titleFrom(text) ?? clean(result.entityEmbeddedObject?.title?.text);
    if (title) {
      entry.title = title;
    }
    if (text) {
      entry.description = text;
    }
    const author = clean(result.title?.text);
    if (author) {
      entry.author = author;
    }
    return withImage(entry, imageOf(result.entityEmbeddedObject?.image));
  }

  /** Orders results by the cluster's own item list, since `included` carries no order guarantee. */
  function clusterPage(reply: VoyagerClusterReply): LinkedInClusterPage {
    const collection =
      reply.data?.data?.searchDashClustersByAll ??
      reply.data?.searchDashClustersByAll;
    const included = (reply.included ?? []).filter(
      (item) => item?.$type?.includes("EntityResult") || item?.navigationUrl,
    );
    const byUrn = new Map<string, VoyagerEntityResult>();
    for (const item of included) {
      if (item.entityUrn) {
        byUrn.set(item.entityUrn, item);
      }
    }
    const ordered: Array<VoyagerEntityResult> = [];
    const placed = new Set<VoyagerEntityResult>();
    let slots = 0;
    for (const cluster of collection?.elements ?? []) {
      for (const slot of cluster?.items ?? []) {
        const inline = slot?.item?.entityResult;
        const urn = slot?.item?.["*entityResult"];
        if (!inline && !urn) {
          continue;
        }
        slots += 1;
        const result = inline ?? (urn ? byUrn.get(urn) : undefined);
        if (result && !placed.has(result)) {
          placed.add(result);
          ordered.push(result);
        }
      }
    }
    for (const item of included) {
      if (placed.has(item)) {
        continue;
      }
      placed.add(item);
      ordered.push(item);
    }
    const entries: Array<ListEntry> = [];
    const seen = new Set<string>();
    for (const result of ordered) {
      const entry = entryFromResult(result);
      if (!entry || seen.has(entry.sourceId)) {
        continue;
      }
      seen.add(entry.sourceId);
      entries.push(entry);
    }
    const page: LinkedInClusterPage = {
      entries,
      count: Math.max(slots, ordered.length),
    };
    const total = collection?.paging?.total;
    if (total !== undefined && Number.isFinite(total)) {
      page.total = total;
    }
    return page;
  }

  /** Reads `<br>` as a line break and drops LinkedIn's inline "see more" controls. */
  function textOf(el: Element | null | undefined): string {
    if (!el) {
      return "";
    }
    const copy = el.ownerDocument.createElement("div");
    copy.append(el.cloneNode(true));
    for (const br of Array.from(copy.querySelectorAll("br"))) {
      br.replaceWith("\n");
    }
    for (const control of Array.from(copy.querySelectorAll(HIDDEN_CONTROLS))) {
      control.remove();
    }
    return clean(copy.textContent);
  }

  function srcOf(img: Element | null | undefined): string {
    const src =
      img?.getAttribute("src") || img?.getAttribute("data-delayed-url") || "";
    return src.startsWith("http") ? src : "";
  }

  /** The My items page renders saved posts as search results tagged with the post URN. */
  function renderedEntries(root: ParentNode): Array<ListEntry> {
    const entries: Array<ListEntry> = [];
    const seen = new Set<string>();
    for (const el of Array.from(root.querySelectorAll(RESULT))) {
      const postLink = el.querySelector("a[href*='/feed/update/']");
      const ref = postRef([
        el.getAttribute("data-chameleon-result-urn"),
        postLink?.getAttribute("href"),
      ]);
      if (!ref || seen.has(ref.id)) {
        continue;
      }
      seen.add(ref.id);
      const entry: ListEntry = {
        sourceId: ref.id,
        url: postUrl(ref),
        listKinds: ["saved"],
      };
      const text = textOf(el.querySelector(RESULT_SUMMARY));
      const title = titleFrom(text);
      if (title) {
        entry.title = title;
      }
      if (text) {
        entry.description = text;
      }
      const author = clean(el.querySelector(RESULT_AUTHOR)?.textContent);
      if (author) {
        entry.author = author;
      }
      entries.push(withImage(entry, srcOf(el.querySelector(RESULT_IMAGE))));
    }
    return entries;
  }

  function addImage(page: LinkedInPostPage, url: string): void {
    if (url && !page.mediaUrls.some((m) => m.url === url)) {
      page.mediaUrls.push({ url, type: "image" });
    }
  }

  /** Reads one feed update as rendered on its own page; videos and documents keep their cover image. */
  function postPage(root: Element, id: string): LinkedInPostPage {
    const page: LinkedInPostPage = { mediaUrls: [], meta: {} };
    const actorHref = root.querySelector(ACTOR_LINK)?.getAttribute("href");
    const authorUrl = profileUrl(actorHref);
    const name = clean(root.querySelector(ACTOR_NAME)?.textContent);
    const vanity = vanityOf(authorUrl);
    if (vanity) {
      page.author = vanity;
    } else if (name) {
      page.author = name;
    }
    if (name && vanity) {
      page.meta.authorName = name;
    }
    if (authorUrl) {
      page.meta.authorUrl = authorUrl;
    }
    const avatar = srcOf(root.querySelector(ACTOR_AVATAR));
    if (avatar) {
      page.meta.authorAvatar = avatar;
    }

    const text = textOf(root.querySelector(COMMENTARY));
    if (text) {
      page.description = text;
    }

    for (const img of Array.from(root.querySelectorAll(IMAGES))) {
      addImage(page, srcOf(img));
    }
    const poster = root.querySelector(VIDEO)?.getAttribute("poster") ?? "";
    if (poster.startsWith("http")) {
      addImage(page, poster);
    }
    addImage(page, srcOf(root.querySelector(DOCUMENT_COVER)));
    const documentTitle = clean(
      root.querySelector(DOCUMENT_FRAME)?.getAttribute("title"),
    );

    const articleUrl = root.querySelector(ARTICLE_LINK)?.getAttribute("href");
    if (articleUrl?.startsWith("http")) {
      page.meta.upstreamUrl = articleUrl;
    }
    addImage(page, srcOf(root.querySelector(ARTICLE_IMAGE)));
    const articleTitle = clean(root.querySelector(ARTICLE_TITLE)?.textContent);

    const title = titleFrom(text) || documentTitle || articleTitle;
    if (title) {
      page.title = title;
    }
    const publishedAt = publishedAtFromId(id);
    if (publishedAt) {
      page.meta.publishedAt = publishedAt;
    }
    return page;
  }

  return {
    postRef,
    postUrl,
    clean,
    titleFrom,
    publishedAtFromId,
    clusterPage,
    renderedEntries,
    postPage,
  };
}
