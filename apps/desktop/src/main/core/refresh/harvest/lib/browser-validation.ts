import * as z from "zod/mini";
import type { InstagramMediaNode } from "../instagram/normalize";

function optional<T extends z.ZodMiniType>(schema: T) {
  return z.catch(z.optional(schema), undefined);
}
const text = optional(z.string());
const number = optional(z.number());
const boolean = optional(z.boolean());
/** TikTok sends some integers as digit strings, such as `createTime: "1564234358"` and `collectCount: "648"`. */
const wholeNumber = optional(
  z.union([
    z.number(),
    z.pipe(z.string().check(z.regex(/^\d+$/)), z.transform(Number)),
  ]),
);
const mediaVersion = z.object({ url: text, width: number, height: number });
const user = z.object({
  username: text,
  full_name: text,
  profile_pic_url: text,
  is_verified: boolean,
});
const instagramNode: z.ZodMiniType<InstagramMediaNode> = z.lazy(() =>
  z.object({
    pk: optional(z.union([z.string(), z.number()])),
    code: text,
    media_type: number,
    taken_at: number,
    like_count: number,
    comment_count: number,
    play_count: number,
    video_duration: number,
    is_paid_partnership: boolean,
    accessibility_caption: text,
    location: optional(z.object({ name: text })),
    caption: z.catch(
      z.nullish(
        z.union([
          z.string(),
          z.pipe(
            z.object({ text }),
            z.transform((value) => value.text ?? ""),
          ),
        ]),
      ),
      null,
    ),
    user: optional(user),
    owner: optional(user),
    image_versions2: optional(
      z.object({ candidates: optional(z.array(mediaVersion)) }),
    ),
    video_versions: optional(z.array(mediaVersion)),
    carousel_media: optional(z.array(instagramNode)),
  }),
);

const tiktokItem = z.object({
  id: text,
  desc: text,
  description: text,
  createTime: wholeNumber,
  author: optional(
    z.object({
      uniqueId: text,
      nickname: text,
      avatarThumb: text,
      verified: boolean,
    }),
  ),
  stats: optional(
    z.object({
      diggCount: wholeNumber,
      commentCount: wholeNumber,
      shareCount: wholeNumber,
      playCount: wholeNumber,
      collectCount: wholeNumber,
    }),
  ),
  music: optional(z.object({ title: text })),
  video: optional(
    z.object({
      downloadAddr: text,
      playAddr: text,
      cover: text,
      originCover: text,
      duration: number,
    }),
  ),
});

const unsplashAsset = z.object({
  id: z.string(),
  description: optional(z.nullable(z.string())),
  alt_description: optional(z.nullable(z.string())),
  created_at: text,
  urls: optional(z.object({ raw: text, full: text })),
  user: optional(
    z.object({
      name: text,
      username: text,
      links: optional(z.object({ html: text })),
      profile_image: optional(z.object({ large: text })),
    }),
  ),
});

export type UnsplashAsset = z.infer<typeof unsplashAsset>;

const unsplashBookmarks = z.object({
  total: number,
  results: z.catch(z.array(z.catch(z.nullable(unsplashAsset), null)), []),
});

const nullableText = optional(z.nullable(z.string()));

const markedRef = z.object({
  id: z.string(),
  sourceUrl: nullableText,
  title: nullableText,
  description: nullableText,
  aiDescription: nullableText,
  text: nullableText,
  author: optional(
    z.object({
      name: nullableText,
      handle: nullableText,
      avatarUrl: nullableText,
      profileUrl: nullableText,
      verified: optional(z.nullable(z.boolean())),
    }),
  ),
  media: z.catch(
    z.array(
      z.catch(
        z.nullable(
          z.object({
            kind: text,
            url: z.string(),
            posterUrl: nullableText,
            width: number,
            height: number,
          }),
        ),
        null,
      ),
    ),
    [],
  ),
  createdAt: text,
  publishedAt: nullableText,
  save: optional(z.nullable(z.object({ createdAt: text }))),
});

export type MarkedRef = z.infer<typeof markedRef>;

export const browserValidators = {
  text: z.string(),
  number: z.number(),
  object: z.looseObject({}),
  instagramNode,
  tiktokItem,
  unsplashAsset,
  unsplashBookmarks,
  markedRef,
  markedRefs: z.array(z.catch(z.nullable(markedRef), null)),
};
export type BrowserValidators = typeof browserValidators;
