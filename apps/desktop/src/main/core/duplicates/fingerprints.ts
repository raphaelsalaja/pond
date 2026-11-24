import type Database from "better-sqlite3";
import { z } from "zod";
import type { DuplicateIndexStatus } from "../../../shared/duplicate-contracts";
import {
  AUDIO_PRINT_ALGORITHM,
  AUDIO_PRINT_VERSION,
} from "../../lib/fingerprint/audio-print";
import {
  IMAGE_PRINT_ALGORITHM,
  IMAGE_PRINT_VERSION,
} from "../../lib/fingerprint/image-print";
import {
  VIDEO_PRINT_ALGORITHM,
  VIDEO_PRINT_VERSION,
} from "../../lib/fingerprint/video-print";
import type { AssetMedia, FingerprintSets } from "./types";

export interface FingerprintAlgorithm {
  algorithm: string;
  version: number;
  media: ReadonlyArray<AssetMedia>;
  needsFfmpeg: boolean;
}

export const FINGERPRINT_ALGORITHMS = {
  image: {
    algorithm: IMAGE_PRINT_ALGORITHM,
    version: IMAGE_PRINT_VERSION,
    media: ["image"],
    needsFfmpeg: false,
  },
  video: {
    algorithm: VIDEO_PRINT_ALGORITHM,
    version: VIDEO_PRINT_VERSION,
    media: ["video"],
    needsFfmpeg: true,
  },
  audio: {
    algorithm: AUDIO_PRINT_ALGORITHM,
    version: AUDIO_PRINT_VERSION,
    media: ["video", "audio"],
    needsFfmpeg: true,
  },
} as const satisfies Record<keyof FingerprintSets, FingerprintAlgorithm>;

export type FingerprintStatus =
  | "ok"
  | "failed"
  | "missing"
  | "low-detail"
  | "unsupported";

/** A file that fails three times stays failed until the Library is rebuilt or the algorithm version changes. */
export const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 15 * 60_000;
export const FFMPEG_UNAVAILABLE = "ffmpeg-unavailable";

const LIVE_ASSETS = `
  FROM save_assets a
  JOIN saves s ON s.id = a.save_id AND s.deleted_at IS NULL
  WHERE length(a.sha256) = 64`;

function mediaList(media: ReadonlyArray<AssetMedia>): string {
  return media.map((item) => `'${item}'`).join(", ");
}

const JobRowSchema = z.object({
  sha256: z.string(),
  save_id: z.string(),
  path: z.string(),
  size: z.number(),
  media: z.enum(["image", "video", "audio"]),
});

export interface FingerprintJob {
  sha256: string;
  saveId: string;
  path: string;
  size: number;
  media: AssetMedia;
  algorithm: FingerprintAlgorithm;
}

/** A row is settled when it is current and either final, out of attempts, or still inside its retry backoff. */
export function nextFingerprintJobs(
  sqlite: Database.Database,
  limit: number,
  now = Date.now(),
): Array<FingerprintJob> {
  const jobs: Array<FingerprintJob> = [];
  for (const algorithm of Object.values(FINGERPRINT_ALGORITHMS)) {
    if (jobs.length >= limit) {
      break;
    }
    const rows = z.array(JobRowSchema).parse(
      sqlite
        .prepare(
          `SELECT a.sha256, a.save_id, a.path, a.size, a.media
          ${LIVE_ASSETS}
            AND a.media IN (${mediaList(algorithm.media)})
            AND NOT EXISTS (
              SELECT 1 FROM asset_fingerprints f
              WHERE f.sha256 = a.sha256 AND f.algorithm = @algorithm AND f.version = @version
                AND (f.status NOT IN ('failed', 'missing')
                  OR f.attempts >= ${MAX_ATTEMPTS}
                  OR f.updated_at >= @retryBefore)
            )
          GROUP BY a.sha256
          LIMIT @limit`,
        )
        .all({
          algorithm: algorithm.algorithm,
          version: algorithm.version,
          retryBefore: now - RETRY_AFTER_MS,
          limit: limit - jobs.length,
        }),
    );
    for (const row of rows) {
      jobs.push({
        sha256: row.sha256,
        saveId: row.save_id,
        path: row.path,
        size: row.size,
        media: row.media,
        algorithm,
      });
    }
  }
  return jobs;
}

export function recordFingerprint(
  sqlite: Database.Database,
  record: {
    sha256: string;
    algorithm: FingerprintAlgorithm;
    status: FingerprintStatus;
    value?: Uint8Array | null;
    error?: string | null;
    now?: number;
  },
): void {
  const failing = record.status === "failed" || record.status === "missing";
  sqlite
    .prepare(
      `INSERT INTO asset_fingerprints (sha256, algorithm, version, status, value, attempts, error, updated_at)
      VALUES (@sha256, @algorithm, @version, @status, @value, @attempts, @error, @now)
      ON CONFLICT(sha256, algorithm) DO UPDATE SET
        attempts = CASE WHEN @failing = 1
          THEN (CASE WHEN asset_fingerprints.version = excluded.version THEN asset_fingerprints.attempts ELSE 0 END) + 1
          ELSE 0 END,
        version = excluded.version,
        status = excluded.status,
        value = excluded.value,
        error = excluded.error,
        updated_at = excluded.updated_at`,
    )
    .run({
      sha256: record.sha256,
      algorithm: record.algorithm.algorithm,
      version: record.algorithm.version,
      status: record.status,
      value: record.value ? Buffer.from(record.value) : null,
      attempts: failing ? 1 : 0,
      failing: failing ? 1 : 0,
      error: record.error ?? null,
      now: record.now ?? Date.now(),
    });
}

const PrintRowSchema = z.object({
  sha256: z.string(),
  value: z.instanceof(Uint8Array),
});

export function loadFingerprints(sqlite: Database.Database): FingerprintSets {
  const select = sqlite.prepare(
    `SELECT f.sha256, f.value FROM asset_fingerprints f
    WHERE f.algorithm = ? AND f.version = ? AND f.status = 'ok' AND f.value IS NOT NULL
      AND EXISTS (SELECT 1 FROM save_assets a WHERE a.sha256 = f.sha256)`,
  );
  const load = (algorithm: FingerprintAlgorithm) =>
    new Map(
      z
        .array(PrintRowSchema)
        .parse(select.all(algorithm.algorithm, algorithm.version))
        .map((row) => [row.sha256, new Uint8Array(row.value)]),
    );
  return {
    image: load(FINGERPRINT_ALGORITHMS.image),
    video: load(FINGERPRINT_ALGORITHMS.video),
    audio: load(FINGERPRINT_ALGORITHMS.audio),
  };
}

const StatusRowSchema = z.object({
  assets: z.number(),
  pending: z.number().nullable(),
  failed: z.number().nullable(),
});

export function fingerprintIndexStatus(
  sqlite: Database.Database,
): DuplicateIndexStatus {
  const jobs = Object.values(FINGERPRINT_ALGORITHMS)
    .map(
      (algorithm) =>
        `SELECT m.sha256, '${algorithm.algorithm}' AS algorithm, ${algorithm.version} AS version
        FROM media m WHERE m.media IN (${mediaList(algorithm.media)})`,
    )
    .join(" UNION ALL ");
  const row = StatusRowSchema.parse(
    sqlite
      .prepare(
        `WITH media AS (
          SELECT DISTINCT a.sha256, a.media ${LIVE_ASSETS}
            AND (a.media IS NULL OR a.media IN ('image', 'video', 'audio'))
        ),
        jobs AS (${jobs}),
        state AS (
          SELECT m.sha256,
            MAX(CASE WHEN m.media IS NULL OR f.sha256 IS NULL OR f.version <> j.version
              OR (f.status IN ('failed', 'missing') AND f.attempts < ${MAX_ATTEMPTS}) THEN 1 ELSE 0 END) AS pending,
            MAX(CASE WHEN f.version = j.version AND f.status IN ('failed', 'missing')
              AND f.attempts >= ${MAX_ATTEMPTS} THEN 1 ELSE 0 END) AS failed
          FROM media m
          LEFT JOIN jobs j ON j.sha256 = m.sha256
          LEFT JOIN asset_fingerprints f ON f.sha256 = j.sha256 AND f.algorithm = j.algorithm
          GROUP BY m.sha256
        )
        SELECT COUNT(*) AS assets,
          SUM(pending) AS pending,
          SUM(CASE WHEN pending = 0 AND failed = 1 THEN 1 ELSE 0 END) AS failed
        FROM state`,
      )
      .get(),
  );
  const pending = row.pending ?? 0;
  const failed = row.failed ?? 0;
  return {
    assets: row.assets,
    fingerprinted: Math.max(0, row.assets - pending - failed),
    pending,
    failed,
  };
}

/** Prints are keyed by content, so a file restored from Trash or re-imported reuses them; only content no Save holds is dropped. */
export function deleteOrphanFingerprints(sqlite: Database.Database): number {
  return sqlite
    .prepare(
      `DELETE FROM asset_fingerprints
      WHERE NOT EXISTS (SELECT 1 FROM save_assets a WHERE a.sha256 = asset_fingerprints.sha256)`,
    )
    .run().changes;
}

/** Video and audio prints recorded while FFmpeg was missing are retried once it is back. */
export function clearUnavailableFingerprints(sqlite: Database.Database): void {
  sqlite
    .prepare(
      "DELETE FROM asset_fingerprints WHERE status = 'unsupported' AND error = ?",
    )
    .run(FFMPEG_UNAVAILABLE);
}

export function clearFingerprints(sqlite: Database.Database): void {
  sqlite.exec("DELETE FROM asset_fingerprints");
}
