import { SHARE_PAGE_KINDS } from "@pond/schema/share-page";
import { z } from "zod";
import type { EmptyInput, OkResult } from "./query-contracts-shared";

/** 128 random bits in lowercase base32: unguessable, and safe in a URL path. */
export const ShareLinkIdSchema = z.string().regex(/^[a-z2-7]{26}$/);

export const ShareLinkSchema = z.object({
  id: ShareLinkIdSchema,
  kind: z.enum(SHARE_PAGE_KINDS),
  title: z.string(),
  /** What the link shows: these Saves in this order, named after the Folder when there is one. */
  target: z.object({
    ids: z.array(z.string()).max(20_000),
    folderId: z.string().optional(),
  }),
  url: z.string(),
  /** `uploading` while a job runs; `failed` keeps the link listed so it can be retried or stopped. */
  status: z.enum(["uploading", "live", "failed"]),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Epoch milliseconds; null keeps the link until you stop sharing. */
  expiresAt: z.number().nullable(),
  saves: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  /** Every object this link wrote, so Stop Sharing and updates can remove them. */
  keys: z.array(z.string()),
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;

export const SHARE_HOST_PROVIDER_LABELS = {
  r2: "Cloudflare R2",
  s3: "Amazon S3",
  b2: "Backblaze B2",
  other: "Other S3-Compatible",
} as const;
export type ShareHostProvider = keyof typeof SHARE_HOST_PROVIDER_LABELS;

/** The Share Host as the renderer sees it: never the secret. */
export interface ShareHostSummary {
  provider: ShareHostProvider;
  endpoint: string;
  region: string;
  bucket: string;
  publicUrl: string;
  accessKeyId: string;
  expireAfterDays: number | null;
}

export interface ShareHostInput extends ShareHostSummary {
  /** Empty keeps the saved secret when editing. */
  secretAccessKey: string;
}

export type ShareLinkPublishResult =
  | { ok: true; url: string; updated: boolean }
  | { ok: false; reason: "no_host" | "cancelled" }
  | { ok: false; error: string };

export interface ShareLinkQueryInputs {
  "shareHost.get": EmptyInput;
  "shareHost.save": ShareHostInput;
  "shareHost.remove": EmptyInput;
  "shareLinks.list": EmptyInput;
  "shareLinks.publish": { ids: Array<string>; folderId?: string };
  "shareLinks.update": { id: string };
  "shareLinks.stop": { id: string };
}

export interface ShareLinkQueryResults {
  "shareHost.get": { host: ShareHostSummary | null };
  "shareHost.save": OkResult;
  "shareHost.remove": OkResult;
  "shareLinks.list": Array<ShareLink>;
  "shareLinks.publish": ShareLinkPublishResult;
  "shareLinks.update": ShareLinkPublishResult;
  "shareLinks.stop": OkResult;
}
