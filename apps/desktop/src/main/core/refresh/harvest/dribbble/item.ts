/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";

interface DribbbleTextNode {
  text?: string;
  content?: Array<DribbbleTextNode>;
}

interface DribbbleBlock {
  contentType?: string;
  position?: number;
  content?: { isShotDescription?: boolean; text?: DribbbleTextNode };
  userUploadsAttributes?: Array<{ originalUrl?: string }>;
}

interface DribbbleShotData {
  title?: string;
  postedOn?: string;
  likesCount?: number;
  viewsCount?: number;
  commentsCount?: number;
  featureShotUrl?: string;
  shotUser?: {
    name?: string;
    username?: string;
    url?: string;
    avatarUrl?: string;
  };
  contentBlocks?: { results?: Array<DribbbleBlock> };
}

declare global {
  var Dribbble: { JsConfig?: { shotData?: DribbbleShotData } } | undefined;
}

interface DribbbleShotPage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" | "video"; poster?: string }>;
  meta: {
    authorName?: string;
    authorAvatar?: string;
    authorUrl?: string;
    publishedAt?: string;
    likes?: number;
    views?: number;
    comments?: number;
  };
}

export function buildExpression(shotId: string): string {
  return buildItemExpression(() => ({}), inPageDribbbleHarvest, shotId);
}

/** The shot page inlines every content block in `Dribbble.JsConfig.shotData`, with the upload's original file on each. */
async function inPageDribbbleHarvest(): Promise<DribbbleShotPage | null> {
  const deadline = Date.now() + 12_000;
  let shot: DribbbleShotData | undefined;
  while (Date.now() < deadline) {
    shot = globalThis.Dribbble?.JsConfig?.shotData;
    if (shot) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  const meta = (key: string): string =>
    document
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  const original = (src: string): string => {
    try {
      const url = new URL(src, location.origin);
      for (const key of ["resize", "format", "vertical"]) {
        url.searchParams.delete(key);
      }
      return url.toString();
    } catch {
      return src;
    }
  };
  if (!shot) {
    const image = meta("og:image");
    const title = meta("og:title");
    if (!image && !title) {
      return null;
    }
    const fallback: DribbbleShotPage = { mediaUrls: [], meta: {} };
    if (title) {
      fallback.title = title;
    }
    if (image) {
      fallback.mediaUrls.push({ url: original(image), type: "image" });
    }
    return fallback;
  }

  const textOf = (node: DribbbleTextNode | undefined): string =>
    [node?.text ?? "", ...(node?.content ?? []).map(textOf)].join("");
  const blocks = [...(shot.contentBlocks?.results ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const texts = blocks
    .filter((b) => b.contentType === "text")
    .map((b) => ({
      main: b.content?.isShotDescription === true,
      text: (b.content?.text?.content ?? []).map(textOf).join("\n").trim(),
    }))
    .filter((t) => t.text.length > 0);
  const description =
    texts.find((t) => t.main)?.text ?? texts.map((t) => t.text).join("\n\n");

  const poster =
    document.querySelector<HTMLVideoElement>("video[poster]")?.poster ?? "";
  const page: DribbbleShotPage = { mediaUrls: [], meta: {} };
  for (const block of blocks) {
    const url = block.userUploadsAttributes?.[0]?.originalUrl;
    if (!url) {
      continue;
    }
    if (block.contentType === "image") {
      page.mediaUrls.push({ url, type: "image" });
    } else if (block.contentType === "video") {
      page.mediaUrls.push(
        poster ? { url, type: "video", poster } : { url, type: "video" },
      );
    }
  }
  if (page.mediaUrls.length === 0 && shot.featureShotUrl) {
    page.mediaUrls.push({ url: original(shot.featureShotUrl), type: "image" });
  }
  if (shot.title) {
    page.title = shot.title;
  }
  if (description) {
    page.description = description;
  }
  const user = shot.shotUser;
  if (user?.username) {
    page.author = `@${user.username}`;
  } else if (user?.name) {
    page.author = user.name;
  }
  if (user?.name) {
    page.meta.authorName = user.name;
  }
  if (user?.avatarUrl) {
    page.meta.authorAvatar = user.avatarUrl;
  }
  if (user?.url) {
    page.meta.authorUrl = new URL(user.url, location.origin).href;
  }
  const posted = shot.postedOn ? Date.parse(shot.postedOn) : Number.NaN;
  if (Number.isFinite(posted)) {
    page.meta.publishedAt = new Date(posted).toISOString();
  }
  if (shot.likesCount !== undefined) {
    page.meta.likes = shot.likesCount;
  }
  if (shot.viewsCount !== undefined) {
    page.meta.views = shot.viewsCount;
  }
  if (shot.commentsCount !== undefined) {
    page.meta.comments = shot.commentsCount;
  }
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
