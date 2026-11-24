import { isJsonValue } from "@pond/schema/json";
import type { JsonValue } from "@pond/schema/json";
import { z } from "zod";

/** One anonymous GET, so tests can answer for the network. */
export type AtGet = (url: string) => Promise<Response>;

export const APPVIEW = "https://public.api.bsky.app/xrpc";
const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";

const DidDocSchema = z.object({
  service: z
    .array(z.object({ id: z.string(), serviceEndpoint: z.string() }))
    .catch([]),
});

const AspectRatioSchema = z
  .object({ width: z.number(), height: z.number() })
  .optional()
  .catch(undefined);

const ImageViewSchema = z.object({
  fullsize: z.string(),
  aspectRatio: AspectRatioSchema,
});

const MediaEmbedSchema = z.object({
  $type: z.string(),
  images: z.array(ImageViewSchema).optional().catch(undefined),
  items: z.array(ImageViewSchema).optional().catch(undefined),
  playlist: z.string().optional().catch(undefined),
  thumbnail: z.string().optional().catch(undefined),
  aspectRatio: AspectRatioSchema,
  external: z
    .object({
      uri: z.string().optional().catch(undefined),
      title: z.string().optional().catch(undefined),
      description: z.string().optional().catch(undefined),
      thumb: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const AuthorSchema = z.object({
  did: z.string(),
  handle: z.string(),
  displayName: z.string().optional().catch(undefined),
  avatar: z.string().optional().catch(undefined),
  verification: z
    .object({ verifiedStatus: z.string().optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

const FacetSchema = z.object({
  index: z.object({ byteStart: z.number(), byteEnd: z.number() }),
  features: z.array(
    z.object({
      $type: z.string(),
      uri: z.string().optional().catch(undefined),
      did: z.string().optional().catch(undefined),
      tag: z.string().optional().catch(undefined),
    }),
  ),
});

const RecordValueSchema = z
  .object({
    text: z.string().optional().catch(undefined),
    createdAt: z.string().optional().catch(undefined),
    facets: z.array(FacetSchema).optional().catch(undefined),
  })
  .catch({});

/** A quoted post. Blocked, deleted and detached quotes carry no `value` and fail this. */
const ViewRecordSchema = z.object({
  uri: z.string(),
  author: AuthorSchema,
  value: RecordValueSchema,
  embeds: z.array(MediaEmbedSchema).optional().catch(undefined),
});

const EmbedSchema = MediaEmbedSchema.extend({
  media: MediaEmbedSchema.optional().catch(undefined),
  /** `record#view` holds the quote here; `recordWithMedia#view` nests it one level down. */
  record: z
    .union([ViewRecordSchema, z.object({ record: ViewRecordSchema })])
    .optional()
    .catch(undefined),
});

export const PostSchema = z.object({
  uri: z.string(),
  author: AuthorSchema,
  record: RecordValueSchema,
  embed: EmbedSchema.optional().catch(undefined),
  likeCount: z.number().optional().catch(undefined),
  replyCount: z.number().optional().catch(undefined),
  repostCount: z.number().optional().catch(undefined),
  quoteCount: z.number().optional().catch(undefined),
  bookmarkCount: z.number().optional().catch(undefined),
});

export const PostsSchema = z.object({
  posts: z.array(PostSchema.nullable().catch(null)).catch([]),
});

export const LikesSchema = z.object({
  records: z
    .array(
      z
        .object({
          uri: z.string(),
          value: z.object({
            subject: z.object({ uri: z.string() }),
            createdAt: z.string().optional().catch(undefined),
          }),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
  cursor: z.string().optional().catch(undefined),
});

export const ProfileSchema = z.object({
  did: z.string(),
  handle: z.string(),
  displayName: z.string().optional().catch(undefined),
  avatar: z.string().optional().catch(undefined),
});

export type BlueskyPost = z.infer<typeof PostSchema>;
export type BlueskyEmbed = z.infer<typeof MediaEmbedSchema>;
export type BlueskyAuthor = z.infer<typeof AuthorSchema>;
export type BlueskyRecord = z.infer<typeof RecordValueSchema>;
export type BlueskyViewRecord = z.infer<typeof ViewRecordSchema>;

/** A TID packs microseconds since the epoch above a 10-bit clock id, in a sortable base32. */
export function tidToDate(tid: string): string | undefined {
  if (!/^[2-7a-z]{13}$/.test(tid)) {
    return undefined;
  }
  let n = 0n;
  for (const ch of tid) {
    n = n * 32n + BigInt(TID_ALPHABET.indexOf(ch));
  }
  return new Date(Number((n >> 10n) / 1000n)).toISOString();
}

export function rkeyOf(atUri: string): string | undefined {
  return atUri.split("/").pop() || undefined;
}

export async function readJson(
  get: AtGet,
  url: string,
): Promise<{ status: number; body: JsonValue } | null> {
  try {
    const res = await get(url);
    if (!res.ok) {
      return { status: res.status, body: null };
    }
    const body: unknown = await res.json();
    return { status: res.status, body: isJsonValue(body) ? body : null };
  } catch {
    return null;
  }
}

export async function resolveHandle(
  get: AtGet,
  handle: string,
): Promise<string | null> {
  if (handle.startsWith("did:")) {
    return handle;
  }
  const res = await readJson(
    get,
    `${APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  const did = z.object({ did: z.string() }).safeParse(res?.body);
  return did.success ? did.data.did : null;
}

/** Repo reads go to your own PDS from the DID document, never the `bsky.social` entryway. */
export async function pdsFor(get: AtGet, did: string): Promise<string | null> {
  const docUrl = did.startsWith("did:plc:")
    ? `https://plc.directory/${did}`
    : did.startsWith("did:web:")
      ? `https://${did.slice("did:web:".length)}/.well-known/did.json`
      : null;
  if (!docUrl) {
    return null;
  }
  const res = await readJson(get, docUrl);
  const doc = DidDocSchema.safeParse(res?.body);
  const service = doc.success
    ? doc.data.service.find((s) => s.id.endsWith("#atproto_pds"))
    : undefined;
  return service?.serviceEndpoint.replace(/\/+$/, "") ?? null;
}
