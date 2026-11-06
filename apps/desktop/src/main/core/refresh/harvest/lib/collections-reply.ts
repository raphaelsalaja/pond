import type { JsonValue } from "@pond/schema/json";
import type { ImportCollectionOption } from "@shared/import-scope";
import { z } from "zod";

const COLLECTION_FAILURES = [
  "auth_required",
  "checkpoint",
  "rate_limited",
  "unknown",
] as const;

export type CollectionFailureReason = (typeof COLLECTION_FAILURES)[number];

/** What an in-page collection listing returns across the page boundary. */
export type CollectionsReply =
  | {
      ok: true;
      collections: Array<{ id: string; name: string; count: number | null }>;
    }
  | {
      ok: false;
      reason: CollectionFailureReason;
      detail?: string;
      /** The signed-in username, so a retry can open a page of your own. */
      viewer?: string;
    };

export type CollectionsResult =
  | { ok: true; collections: ImportCollectionOption[] }
  | {
      ok: false;
      reason: CollectionFailureReason;
      detail?: string;
      viewer?: string;
    };

/** Long enough for every host and query an Instagram listing tries. */
const DETAIL_LIMIT = 600;

const ReplySchema = z
  .union([
    z.object({
      ok: z.literal(true),
      collections: z
        .array(
          z.object({
            id: z.string().min(1),
            name: z.string().catch(""),
            count: z.number().nullable().catch(null),
          }),
        )
        .catch([]),
    }),
    z.object({
      ok: z.literal(false),
      reason: z.enum(COLLECTION_FAILURES).catch("unknown"),
      detail: z
        .string()
        .transform((detail) => detail.slice(0, DETAIL_LIMIT))
        .optional()
        .catch(undefined),
      viewer: z
        .string()
        .regex(/^[A-Za-z0-9._]{1,30}$/)
        .optional()
        .catch(undefined),
    }),
  ])
  .catch({ ok: false, reason: "unknown", detail: "malformed reply" });

export function readCollectionsReply(value: JsonValue): CollectionsResult {
  const reply = ReplySchema.parse(value);
  if (!reply.ok) {
    const failure: Extract<CollectionsResult, { ok: false }> = {
      ok: false,
      reason: reply.reason,
    };
    if (reply.detail) failure.detail = reply.detail;
    if (reply.viewer) failure.viewer = reply.viewer;
    return failure;
  }
  return {
    ok: true,
    collections: reply.collections.map((collection) => ({
      id: collection.id,
      name: collection.name || collection.id,
      itemCount: collection.count,
    })),
  };
}
