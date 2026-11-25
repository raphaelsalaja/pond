import type { Capture, CaptureMedia } from "@pond/schema/raw";
import { z } from "zod";
import type { ListEntry } from "../list-types";

const ItemSchema = z.object({
  shortID: z.string().min(1),
  url: z.string().optional().catch(undefined),
  createdAt: z.string().optional().catch(undefined),
  name: z.string().nullish().catch(undefined),
  pageURL: z.string().nullish().catch(undefined),
  user: z
    .object({
      username: z.string(),
      name: z.string().nullish().catch(undefined),
      url: z.string().nullish().catch(undefined),
      avatarURL: z.string().nullish().catch(undefined),
    })
    .nullish()
    .catch(undefined),
  asset: z
    .object({
      type: z.string().nullish().catch(undefined),
      image: z
        .object({
          original: z.string().nullish().catch(undefined),
          thumbnail: z.string().nullish().catch(undefined),
          width: z.number().nullish().catch(undefined),
          height: z.number().nullish().catch(undefined),
        })
        .nullish()
        .catch(undefined),
    })
    .nullish()
    .catch(undefined),
});

export type SaveeItem = z.infer<typeof ItemSchema>;

export const ViewerSchema = z.object({
  auth: z
    .object({
      user: z.object({ _id: z.string(), username: z.string() }).nullish(),
    })
    .nullish(),
});

export const UserItemsSchema = z.object({
  userByUsername: z
    .object({
      items: z.object({
        items: z.array(z.unknown()).catch([]),
        pageInfo: z
          .object({
            nextCursor: z.string().nullish().catch(null),
            isLimited: z.boolean().nullish().catch(null),
          })
          .catch({ nextCursor: null, isLimited: null }),
      }),
    })
    .nullish(),
});

export const ItemByIdSchema = z.object({
  itemByShortID: ItemSchema.nullable().catch(null),
});

export function parseItems(rows: ReadonlyArray<unknown>): Array<SaveeItem> {
  return rows.flatMap((row) => {
    const parsed = ItemSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

function itemUrl(item: SaveeItem): string {
  return `https://savee.com/i/${item.shortID}/`;
}

/** Savee has no video field; a video asset keeps its mp4 in `image.original`. */
function mediaOf(item: SaveeItem): CaptureMedia | null {
  const image = item.asset?.image;
  const url = image?.original;
  if (!url) return null;
  const video = item.asset?.type === "video" || /\.mp4(?:\?|$)/i.test(url);
  const media: CaptureMedia = { url, type: video ? "video" : "image" };
  if (image?.width) media.width = image.width;
  if (image?.height) media.height = image.height;
  if (video && image?.thumbnail) media.posterUrl = image.thumbnail;
  return media;
}

export function itemEntry(item: SaveeItem): ListEntry {
  const entry: ListEntry = { sourceId: item.shortID, url: itemUrl(item) };
  if (item.createdAt) entry.savedAt = item.createdAt;
  if (item.name) entry.title = item.name;
  const media = mediaOf(item);
  if (media) {
    entry.mediaUrl = media.url;
    entry.mediaUrls = [
      media.posterUrl
        ? { url: media.url, type: media.type, poster: media.posterUrl }
        : { url: media.url, type: media.type },
    ];
    entry.mediaType = media.type;
  } else {
    entry.mediaType = "link";
  }
  return entry;
}

export function captureFromItem(item: SaveeItem): Capture {
  const media = mediaOf(item);
  const capture: Capture = {
    id: item.shortID,
    source: "savee",
    url: itemUrl(item),
    media: media ? [media] : [],
  };
  if (item.name) capture.title = item.name;
  if (item.user) {
    capture.author = {
      handle: item.user.username,
      profileUrl: item.user.url ?? `https://savee.com/${item.user.username}/`,
    };
    if (item.user.name) capture.author.name = item.user.name;
    if (item.user.avatarURL) capture.author.avatarUrl = item.user.avatarURL;
  }
  if (item.pageURL) {
    try {
      capture.upstream = {
        url: item.pageURL,
        host: new URL(item.pageURL).hostname,
      };
    } catch {
      /** An unparseable page URL leaves the capture without an upstream. */
    }
  }
  return capture;
}
