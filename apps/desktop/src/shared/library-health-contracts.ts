import { z } from "zod";
import { LibraryRepairKindSchema } from "./library-repair-contracts";
import type { MediaIndexStatus } from "./media-index";
import type { EmptyInput } from "./query-contracts-shared";

export const HealthFileFindingSchema = z.enum([
  "ok",
  "missing",
  "unsafe",
  "empty",
  "size",
  "hash",
  "error",
  "undecodable",
  "mismatch",
  "rename",
  "invalid",
  "stale",
  "unreadable",
]);
export type HealthFileFinding = z.infer<typeof HealthFileFindingSchema>;

export const HealthFileCheckSchema = z.object({
  path: z.string(),
  kind: z.string(),
  expectedSize: z.number().nullable(),
  foundSize: z.number().nullable(),
  finding: HealthFileFindingSchema,
  renameTo: z.string().optional(),
});
export type HealthFileCheck = z.infer<typeof HealthFileCheckSchema>;

export const HealthOriginalsSchema = z.enum(["usable", "unusable", "none"]);
export type HealthOriginals = z.infer<typeof HealthOriginalsSchema>;

const HealthIntegrityIssueSchema = z.object({
  kind: LibraryRepairKindSchema,
  saveId: z.string(),
  title: z.string().nullable(),
  summary: z.string(),
  detail: z.string(),
  originals: HealthOriginalsSchema,
  files: z.array(HealthFileCheckSchema),
});
export type HealthIntegrityIssue = z.infer<typeof HealthIntegrityIssueSchema>;

const HealthPosterGapSchema = z.object({
  saveId: z.string(),
  title: z.string().nullable(),
  videos: z.number(),
  posters: z.number(),
});
export type HealthPosterGap = z.infer<typeof HealthPosterGapSchema>;

const HealthUnverifiedSaveSchema = z.object({
  saveId: z.string(),
  title: z.string().nullable(),
  reason: z.string(),
});
export type HealthUnverifiedSave = z.infer<typeof HealthUnverifiedSaveSchema>;

const HealthIndexCheckSchema = z.object({
  /** Save folders on disk that the index doesn't list. */
  orphans: z.array(z.string()),
  /** Indexed Saves whose folder is gone from disk. */
  missing: z.array(z.string()),
  /** Save folders whose stored record can't be read. */
  unreadable: z.array(z.string()),
  backupError: z.string().nullable(),
});
export type HealthIndexCheck = z.infer<typeof HealthIndexCheckSchema>;

export const HEALTH_COUNT_KEYS = [
  ...LibraryRepairKindSchema.options,
  "posters",
  "unverified",
] as const;
export type HealthCountKey = (typeof HEALTH_COUNT_KEYS)[number];

export const LibraryHealthCheckSchema = z.object({
  checkedAt: z.number(),
  durationMs: z.number(),
  saves: z.number(),
  counts: z.record(z.enum(HEALTH_COUNT_KEYS), z.number()),
  issues: z.array(HealthIntegrityIssueSchema),
  posters: z.array(HealthPosterGapSchema),
  unverified: z.array(HealthUnverifiedSaveSchema),
  index: HealthIndexCheckSchema.nullable(),
  indexError: z.string().nullable(),
});
export type LibraryHealthCheck = z.infer<typeof LibraryHealthCheckSchema>;

export interface LibraryHealthJob {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  processed: number;
  total: number;
  startedAt: number;
  error: string | null;
}

export type MediaWarmKind = "poster" | "blurhash";

export interface MediaWarmFailure {
  saveId: string;
  title: string;
  kind: MediaWarmKind;
  error: string;
  at: number;
}

export interface MediaWarmSnapshot extends MediaIndexStatus {
  pendingPosters: number;
  activeSaveIds: string[];
  discovering: boolean;
  failures: MediaWarmFailure[];
}

export interface LibraryHealthOverview {
  check: LibraryHealthCheck | null;
  job: LibraryHealthJob | null;
  media: MediaWarmSnapshot;
}

export const LibraryHealthSaveIdsSchema = z.object({
  saveIds: z.array(z.string().trim().min(1).max(500)).min(1).max(500),
});

export interface LibraryHealthQueryInputs {
  "libraryHealth.overview": EmptyInput;
  "libraryHealth.check": EmptyInput;
  "libraryHealth.cancel": EmptyInput;
  "libraryHealth.recheck": z.infer<typeof LibraryHealthSaveIdsSchema>;
  "libraryHealth.retryPosters": z.infer<typeof LibraryHealthSaveIdsSchema>;
}

export interface LibraryHealthQueryResults {
  "libraryHealth.overview": LibraryHealthOverview;
  "libraryHealth.check": LibraryHealthJob;
  "libraryHealth.cancel": LibraryHealthJob | null;
  "libraryHealth.recheck": LibraryHealthCheck | null;
  "libraryHealth.retryPosters": { queued: number };
}
