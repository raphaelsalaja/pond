import { z } from "zod";
import { QuerySchema } from "./filters/schema";
import { EMPTY_QUERY } from "./filters/types";
import { InboxStateSchema } from "./inbox";

/** Bumped on every change to the HTTP contract: minor for additions, major for breaks. */
export const API_VERSION = "2.2.0";

export const API_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "not_found",
  "save_not_found",
  "no_thumbnail",
  "operation_not_found",
  "folder_not_found",
  "operation_failed",
  "unsupported_url",
  "stale_cursor",
  "library_mismatch",
  "stale_preview",
  "library_unavailable",
  "internal",
] as const;
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** `code` parses as any string so clients built against this version still read codes added later. */
export const ApiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
});

/** `error` stays loose so clients can still read the bare strings Pond sent before 2.1. */
export const ApiErrorSchema = z.object({
  status: z.literal("error"),
  error: z.unknown(),
});

export const ApiJsonSchema = z.json();

export function apiSuccessSchema<Schema extends z.ZodType>(schema: Schema) {
  return z.object({
    status: z.literal("success"),
    data: schema,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

export const ApiAppInfoSchema = z.object({
  name: z.literal("pond"),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  /** Absent before 2.1. */
  apiVersion: z.string().optional(),
  /** Only sent to loopback callers, since the path can reveal the account name. */
  mcp: z.object({ command: z.string(), args: z.array(z.string()) }).optional(),
});

export const API_TOKEN_SCOPES = ["search", "export", "write"] as const;
export const ApiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);
export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>;

export const API_TOKEN_SCOPE_LABELS = {
  search: "Search Saves",
  export: "Export Files",
  write: "Add and Edit Saves",
} satisfies Record<ApiTokenScope, string>;

export const ApiTokenInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(ApiTokenScopeSchema),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
});
export type ApiTokenInfo = z.infer<typeof ApiTokenInfoSchema>;

export const ApiTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(ApiTokenScopeSchema).min(1),
});

export const API_THUMBNAIL_SIZES = [
  "small",
  "medium",
  "large",
  "original",
] as const;

export const ApiCursorSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  id: z.string(),
  /** Pin position of the last row. Absent when it isn't pinned. */
  rank: z.number().int().nonnegative().optional(),
  libraryId: z.string(),
  /** Ignored. Cursors are keyset positions, so writes between pages do not invalidate them. */
  revision: z.number().optional(),
  sortSignature: z.string().optional(),
});

export const KeywordSearchScopeSchema = z.enum([
  "title",
  "description",
  "creator",
  "tags",
  "notes",
  "url",
  "folder",
  "folder-description",
  "extension",
  "annotation",
]);
export type KeywordSearchScope = z.infer<typeof KeywordSearchScopeSchema>;

export const ApiLibraryQueryRequestSchema = z.object({
  libraryId: z.string().optional(),
  query: QuerySchema.default(EMPTY_QUERY),
  keywords: z.string().max(4096).optional(),
  keywordScopes: z.array(KeywordSearchScopeSchema).min(1).optional(),
  scope: z
    .object({
      deletedOnly: z.boolean().optional(),
      source: z.string().optional(),
      untagged: z.boolean().optional(),
      folderIds: z.array(z.string()).optional(),
      uncategorized: z.boolean().optional(),
      inbox: InboxStateSchema.optional(),
      tag: z.string().optional(),
      saveIds: z.array(z.string()).optional(),
      savedSince: z.number().int().nonnegative().optional(),
    })
    .optional(),
  randomSeed: z.string().max(128).optional(),
  orderFolderId: z.string().optional(),
  sortKey: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  cursor: ApiCursorSchema.nullish(),
  /** Hydrate the page in the same request instead of calling `/saves/get` after. */
  include: z.array(z.literal("saves")).optional(),
});

export const API_SAVE_STATUSES = [
  "ingesting",
  "complete",
  "failed",
  "skipped",
] as const;

/** Which extracted text exists. Read it with `/saves/text`. */
export const ApiSaveTextFlagsSchema = z.object({
  caption: z.boolean(),
  ocr: z.boolean(),
  transcript: z.boolean(),
});

export const ApiSaveSchema = z.object({
  id: z.string(),
  libraryId: z.string(),
  source: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  siteName: z.string().nullable(),
  tags: z.array(z.string()),
  folderIds: z.array(z.string()),
  note: z.string().nullable(),
  rating: z.number().int().nullable(),
  /** One of image, video, audio, document, font, file, link or text. */
  kind: z.string().nullable(),
  status: z.enum(API_SAVE_STATUSES),
  savedAt: z.number(),
  publishedAt: z.number().nullable(),
  deletedAt: z.number().nullable(),
  media: z.object({
    files: z.number().int(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    /** Seconds. */
    duration: z.number().nullable(),
    bytes: z.number().nullable(),
  }),
  thumbnail: z.boolean(),
  text: ApiSaveTextFlagsSchema,
});

export const ApiQueryPageSchema = z.object({
  ids: z.array(z.string()),
  /** Present when the request asked for `include: ["saves"]`. */
  saves: z.array(ApiSaveSchema).optional(),
  total: z.number(),
  nextCursor: ApiCursorSchema.nullable(),
  libraryId: z.string(),
  revision: z.number(),
});

export const ApiSavesGetParamsSchema = z
  .object({
    libraryId: z.string().optional().catch(undefined),
    limit: z.union([z.string(), z.number()]).optional().catch(undefined),
    offset: z.union([z.string(), z.number()]).optional().catch(undefined),
    includeDeleted: z
      .union([z.string(), z.boolean()])
      .optional()
      .catch(undefined),
    ids: z
      .union([z.array(z.coerce.string()), z.string()])
      .optional()
      .catch(undefined),
    source: z.string().optional().catch(undefined),
  })
  .catch({});

export const ApiSaveTextSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  description: z.string(),
  note: z.string(),
  caption: z.string(),
  ocr: z.string(),
  transcript: z.string(),
});

export const ApiSaveStateSchema = z.object({
  id: z.string(),
  status: z.enum(API_SAVE_STATUSES),
  deleted: z.boolean(),
  /** Capture tasks still queued or running. Zero once the save is fully captured. */
  pendingTasks: z.number().int(),
  failedTasks: z.number().int(),
  thumbnail: z.boolean(),
  text: ApiSaveTextFlagsSchema,
});

export const ApiTagSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  starred: z.boolean(),
});

export const ApiFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  color: z.string().nullable(),
  /** Saves directly in this folder, not counting subfolders. */
  count: z.number().int(),
});

export const ApiViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `saved_view`, `smart_folder` or `group`. */
  kind: z.string(),
  parentId: z.string().nullable(),
  query: QuerySchema,
  sortKey: z.string(),
  sortDir: z.enum(["asc", "desc"]),
});

export const ApiSourceSchema = z.object({
  source: z.string(),
  count: z.number().int(),
});

export const ApiLibraryInfoSchema = z.object({
  libraryId: z.string(),
  path: z.string(),
  name: z.string(),
  counts: z.object({
    active: z.number().int(),
    trashed: z.number().int(),
    ingesting: z.number().int(),
    failed: z.number().int(),
  }),
  queue: z.object({ pending: z.number().int(), running: z.number().int() }),
});

export const ApiSearchRequestSchema = z.object({
  libraryId: z.string().optional(),
  query: z.string().max(4096),
  source: z.string().optional(),
  folderId: z.string().optional(),
  kinds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const ApiSearchResultSchema = z.object({
  libraryId: z.string(),
  saves: z.array(ApiSaveSchema),
});

const SaveIdsSchema = z.array(z.string().min(1)).min(1).max(1000);

export const ApiEditTagsRequestSchema = z.object({
  libraryId: z.string().optional(),
  ids: SaveIdsSchema,
  add: z.array(z.string().trim().min(1)).default([]),
  remove: z.array(z.string().trim().min(1)).default([]),
});

export const ApiEditFoldersRequestSchema = z.object({
  libraryId: z.string().optional(),
  ids: SaveIdsSchema,
  add: z.array(z.string().min(1)).default([]),
  remove: z.array(z.string().min(1)).default([]),
});

export const ApiSaveIdsRequestSchema = z.object({
  libraryId: z.string().optional(),
  ids: SaveIdsSchema,
});

export const ApiNoteRequestSchema = z.object({
  libraryId: z.string().optional(),
  id: z.string().min(1),
  note: z.string().max(8192).nullable(),
});

export const ApiRatingRequestSchema = z.object({
  libraryId: z.string().optional(),
  ids: SaveIdsSchema,
  rating: z.number().int().min(0).max(5),
});

export const ApiEditResultSchema = z.object({
  changed: z.number().int(),
});

export const ApiLibrarySchema = z.object({
  path: z.string(),
  name: z.string(),
  active: z.boolean(),
  available: z.boolean(),
  lastOpened: z.number(),
  icon: z.string().nullable(),
  accent: z.string().nullable(),
});

export const ApiEnqueueResultSchema = z.object({
  id: z.string(),
  created: z.boolean(),
  /** Absent before 2.1. Poll `/saves/status` until it leaves `ingesting`. */
  status: z.enum(API_SAVE_STATUSES).optional(),
});

export const ApiSwitchResultSchema = z.object({
  ok: z.literal(true),
  path: z.string(),
});

export const ApiSwitchLibraryRequestSchema = z.object({
  path: z.string().trim().min(1),
});

export const ApiOperationSchema = z.object({
  name: z.string(),
  description: z.string(),
  access: z.enum(["read", "review"]),
  inputSchema: z.json(),
});

export const ApiOperationRequestSchema = z.object({
  operation: z.string().min(1),
  arguments: z.record(z.string(), z.json()).default({}),
});

export const ApiOperationPreviewSchema = z.object({
  token: z.string(),
  operation: z.string(),
  libraryId: z.string(),
  expiresAt: z.number(),
});

export const ApiOperationRunSchema = ApiOperationRequestSchema.extend({
  token: z.string().optional(),
});

export type ApiAppInfo = z.infer<typeof ApiAppInfoSchema>;
export type ApiCursor = z.infer<typeof ApiCursorSchema>;
/** What clients send. `query` defaults to matching every Save. */
export type ApiLibraryQueryInput = z.input<typeof ApiLibraryQueryRequestSchema>;
export type ApiLibraryQueryRequest = z.infer<
  typeof ApiLibraryQueryRequestSchema
>;
export type ApiQueryPage = z.infer<typeof ApiQueryPageSchema>;
export type ApiSavesGetParams = z.input<typeof ApiSavesGetParamsSchema>;
export type ApiSave = z.infer<typeof ApiSaveSchema>;
export type ApiSaveText = z.infer<typeof ApiSaveTextSchema>;
export type ApiSaveState = z.infer<typeof ApiSaveStateSchema>;
export type ApiTag = z.infer<typeof ApiTagSchema>;
export type ApiFolder = z.infer<typeof ApiFolderSchema>;
export type ApiView = z.infer<typeof ApiViewSchema>;
export type ApiSource = z.infer<typeof ApiSourceSchema>;
export type ApiLibraryInfo = z.infer<typeof ApiLibraryInfoSchema>;
export type ApiSearchRequest = z.input<typeof ApiSearchRequestSchema>;
export type ApiEditTagsRequest = z.input<typeof ApiEditTagsRequestSchema>;
export type ApiEditFoldersRequest = z.input<typeof ApiEditFoldersRequestSchema>;
export type ApiSaveIdsRequest = z.input<typeof ApiSaveIdsRequestSchema>;
export type ApiNoteRequest = z.input<typeof ApiNoteRequestSchema>;
export type ApiRatingRequest = z.input<typeof ApiRatingRequestSchema>;
export type ApiSwitchLibraryRequest = z.input<
  typeof ApiSwitchLibraryRequestSchema
>;
export type ApiOperationRunRequest = z.input<typeof ApiOperationRunSchema>;
export type ApiLibrary = z.infer<typeof ApiLibrarySchema>;
export type ApiThumbnailSize = (typeof API_THUMBNAIL_SIZES)[number];
