import type { Capture, CaptureMedia } from "@pond/schema/raw";
import { z } from "zod";
import type { ListEntry } from "../list-types";

const WWW = "https://www.tumblr.com";
const TEXT_LIMIT = 20_000;

const NpfMediaSchema = z.object({
  url: z.string().min(1),
  width: z.number().optional().catch(undefined),
  height: z.number().optional().catch(undefined),
});

type NpfMedia = z.infer<typeof NpfMediaSchema>;

const NpfBlockSchema = z
  .object({
    type: z.string(),
    subtype: z.string().optional().catch(undefined),
    text: z.string().optional().catch(undefined),
    url: z.string().optional().catch(undefined),
    media: z
      .union([z.array(NpfMediaSchema), NpfMediaSchema])
      .optional()
      .catch(undefined),
    poster: z.array(NpfMediaSchema).optional().catch(undefined),
  })
  .catch({ type: "unknown" });

type NpfBlock = z.infer<typeof NpfBlockSchema>;

export const TumblrPostSchema = z.object({
  idString: z.string().regex(/^\d+$/),
  blogName: z.string().min(1),
  summary: z.string().optional().catch(undefined),
  timestamp: z.number().optional().catch(undefined),
  likedTimestamp: z.number().optional().catch(undefined),
  noteCount: z.number().optional().catch(undefined),
  tags: z.array(z.string()).optional().catch(undefined),
  blog: z
    .object({
      name: z.string(),
      title: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  content: z.array(NpfBlockSchema).catch([]),
  trail: z
    .array(
      z
        .object({ content: z.array(NpfBlockSchema).catch([]) })
        .catch({ content: [] }),
    )
    .catch([]),
});

export type TumblrPost = z.infer<typeof TumblrPostSchema>;

export const LikesPageSchema = z.object({
  response: z.object({
    likedPosts: z.array(z.unknown()).catch([]),
    links: z
      .object({
        next: z
          .object({
            queryParams: z
              .object({ before: z.string().optional().catch(undefined) })
              .catch({}),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  }),
});

export const UserInfoSchema = z.object({
  response: z.object({
    user: z.object({
      name: z.string(),
      blogs: z
        .array(
          z.object({
            name: z.string(),
            primary: z.boolean().optional().catch(undefined),
          }),
        )
        .catch([]),
    }),
  }),
});

export const PermalinkSchema = z.object({
  response: z.object({
    timeline: z.object({ elements: z.array(z.unknown()).catch([]) }),
  }),
});

export function parsePosts(rows: ReadonlyArray<unknown>): Array<TumblrPost> {
  const out: Array<TumblrPost> = [];
  for (const row of rows) {
    const parsed = TumblrPostSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function primaryBlog(
  user: z.infer<typeof UserInfoSchema>["response"]["user"],
): string {
  return (
    (user.blogs.find((b) => b.primary) ?? user.blogs[0])?.name ?? user.name
  );
}

function tumblrPostUrl(
  post: Pick<TumblrPost, "blogName" | "idString">,
): string {
  return `${WWW}/${post.blogName}/${post.idString}`;
}

export function blogFromUrl(url: string): string | null {
  const www =
    /^https?:\/\/(?:www\.)?tumblr\.com\/(?:blog\/view\/)?([a-z0-9-]+)\/\d/i.exec(
      url,
    );
  if (www?.[1]) return www[1].toLowerCase();
  const sub = /^https?:\/\/(?!www\.)([a-z0-9-]+)\.tumblr\.com\//i.exec(url);
  return sub?.[1] ? sub[1].toLowerCase() : null;
}

/** Reblogs carry no blocks of their own; the original's blocks live in the trail. */
function blocksOf(post: TumblrPost): Array<NpfBlock> {
  return post.content.length > 0
    ? post.content
    : post.trail.flatMap((t) => t.content);
}

function largest(media: NpfBlock["media"]): NpfMedia | undefined {
  const list = Array.isArray(media) ? media : media ? [media] : [];
  let best: NpfMedia | undefined;
  for (const m of list) {
    if (!best || (m.width ?? 0) > (best.width ?? 0)) best = m;
  }
  return best;
}

function mediaOf(post: TumblrPost): Array<CaptureMedia> {
  const out: Array<CaptureMedia> = [];
  for (const block of blocksOf(post)) {
    if (block.type === "image") {
      const m = largest(block.media);
      if (!m) continue;
      const media: CaptureMedia = { url: m.url, type: "image" };
      if (m.width) media.width = m.width;
      if (m.height) media.height = m.height;
      out.push(media);
    } else if (block.type === "video") {
      const m = largest(block.media);
      if (m) {
        const media: CaptureMedia = { url: m.url, type: "video" };
        const poster = largest(block.poster);
        if (poster) media.posterUrl = poster.url;
        out.push(media);
      } else if (block.url) {
        out.push({ url: block.url, type: "link" });
      }
    }
  }
  return out;
}

function textOf(post: TumblrPost): string {
  return blocksOf(post)
    .filter((b) => b.type === "text")
    .map((b) => b.text?.trim() ?? "")
    .filter((t) => t.length > 0)
    .join("\n\n");
}

function headingOf(post: TumblrPost): string | undefined {
  const block = blocksOf(post).find((b) => b.type === "text");
  return block?.subtype?.startsWith("heading") ? block.text?.trim() : undefined;
}

function clip(text: string): string {
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
}

function isoFromUnix(seconds: number | undefined): string | undefined {
  return seconds === undefined
    ? undefined
    : new Date(seconds * 1000).toISOString();
}

export function postEntry(post: TumblrPost): ListEntry {
  const entry: ListEntry = {
    sourceId: post.idString,
    url: tumblrPostUrl(post),
    author: post.blogName,
    listKinds: ["liked"],
  };
  const savedAt = isoFromUnix(post.likedTimestamp);
  if (savedAt) entry.savedAt = savedAt;
  const title = headingOf(post);
  const text = textOf(post);
  if (title) entry.title = title;
  if (text) entry.description = clip(text);
  const media = mediaOf(post);
  const [first] = media;
  if (first) {
    entry.mediaUrl = first.url;
    entry.mediaUrls = media.map((m) =>
      m.posterUrl
        ? { url: m.url, type: m.type, poster: m.posterUrl }
        : { url: m.url, type: m.type },
    );
    entry.mediaType = first.type;
  } else {
    entry.mediaType = "text";
  }
  return entry;
}

export function captureFromPost(post: TumblrPost): Capture {
  const capture: Capture = {
    id: post.idString,
    source: "tumblr",
    url: tumblrPostUrl(post),
    media: mediaOf(post),
    author: {
      name: post.blog?.title || post.blogName,
      handle: post.blogName,
      profileUrl: `${WWW}/${post.blogName}`,
    },
  };
  const title = headingOf(post);
  const text = textOf(post);
  if (title) capture.title = title;
  if (text) capture.description = clip(text);
  const publishedAt = isoFromUnix(post.timestamp);
  if (publishedAt) capture.publishedAt = publishedAt;
  /** Notes count likes and reblogs together, so they are reactions rather than likes. */
  if (post.noteCount !== undefined) {
    capture.metrics = { reactions: post.noteCount };
  }
  return capture;
}
