import { z } from "zod";

/**
 * The manifest a Share Page carries inside its `index.html`. Every exported page, and later
 * every Share Link, keeps its own copy of the viewer, so a reader of this version must keep
 * working for as long as one of those pages exists. Add fields as optional; never repurpose one.
 */
export const SHARE_PAGE_VERSION = 1;

/** The element id of the JSON block in `index.html` that holds the manifest. */
export const SHARE_PAGE_MANIFEST_ID = "pond-share-page";

/** A file next to `index.html`. Only plain names under `media/`, so a manifest can't point outside its page. */
export const SharePageFilePathSchema = z
  .string()
  .regex(
    /^media\/[A-Za-z0-9_-]+\.(?:webp|jpg|jpeg|png|gif|svg|mp4|webm|mov|m4v)$/,
  );

/** Links leave the page, so only web addresses are allowed: never `javascript:` or `file:`. */
export const SharePageLinkSchema = z
  .string()
  .max(4000)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "Expected an http or https link.");

const DimensionSchema = z.number().int().positive().max(100_000);
const TextSchema = z.string().max(100_000);

export const SharePageImageSchema = z.object({
  src: SharePageFilePathSchema,
  width: DimensionSchema,
  height: DimensionSchema,
});
export type SharePageImage = z.infer<typeof SharePageImageSchema>;

export const SharePageMediaSchema = z.discriminatedUnion("kind", [
  SharePageImageSchema.extend({ kind: z.literal("image") }),
  z.object({
    kind: z.literal("video"),
    src: SharePageFilePathSchema,
    poster: SharePageImageSchema.optional(),
    width: DimensionSchema.optional(),
    height: DimensionSchema.optional(),
  }),
]);
export type SharePageMedia = z.infer<typeof SharePageMediaSchema>;

export const SharePageAuthorSchema = z.object({
  name: z.string().max(400).optional(),
  handle: z.string().max(400).optional(),
  url: SharePageLinkSchema.optional(),
});
export type SharePageAuthor = z.infer<typeof SharePageAuthorSchema>;

export const SharePageSaveSchema = z.object({
  /** Opaque and local to this page. Never a Library id. */
  id: z.string().regex(/^s\d{1,6}$/),
  title: z.string().max(2000).optional(),
  text: TextSchema.optional(),
  url: SharePageLinkSchema.optional(),
  /** The Source's label, such as "Instagram" or "Web". */
  source: z.string().min(1).max(100),
  author: SharePageAuthorSchema.optional(),
  /** ISO 8601. When the Source says the post was published. */
  publishedAt: z.iso.datetime().optional(),
  /** The card image. */
  thumbnail: SharePageImageSchema.optional(),
  media: z.array(SharePageMediaSchema).max(500),
  quote: z
    .object({
      author: SharePageAuthorSchema.optional(),
      text: TextSchema.optional(),
      url: SharePageLinkSchema.optional(),
    })
    .optional(),
  card: z
    .object({
      url: SharePageLinkSchema,
      title: z.string().max(2000).optional(),
      domain: z.string().max(400).optional(),
    })
    .optional(),
  /** Only present when the person exporting chose to include notes. */
  notes: TextSchema.optional(),
  /** Only present when the person exporting chose to include tags. */
  tags: z.array(z.string().max(400)).max(500).optional(),
});
export type SharePageSave = z.infer<typeof SharePageSaveSchema>;

export const SHARE_PAGE_KINDS = ["save", "selection", "folder"] as const;
export type SharePageKind = (typeof SHARE_PAGE_KINDS)[number];

export const SharePageManifestSchema = z.object({
  version: z.literal(SHARE_PAGE_VERSION),
  kind: z.enum(SHARE_PAGE_KINDS),
  title: z.string().min(1).max(400),
  /** ISO 8601. When the page was made; the content is frozen at this moment. */
  createdAt: z.iso.datetime(),
  saves: z.array(SharePageSaveSchema).min(1).max(20_000),
});
export type SharePageManifest = z.infer<typeof SharePageManifestSchema>;
