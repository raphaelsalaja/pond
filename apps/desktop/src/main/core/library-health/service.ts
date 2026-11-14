import { randomUUID } from "node:crypto";
import type { Save } from "@pond/schema/db";
import { isVideoFile } from "@shared/media-index";
import {
  HEALTH_COUNT_KEYS,
  type HealthCountKey,
  type HealthIndexCheck,
  type HealthIntegrityIssue,
  type HealthPosterGap,
  type HealthUnverifiedSave,
  type LibraryHealthCheck,
  type LibraryHealthJob,
  type LibraryHealthOverview,
  type MediaWarmSnapshot,
} from "../../../shared/library-health-contracts";
import { LibraryRepairKindSchema } from "../../../shared/library-repair-contracts";
import {
  type IntegritySave,
  inspectSaveIntegrity,
  type LibraryIntegrityRuntime,
  type PayloadInspection,
} from "../library-integrity";
import { mediaWarmCandidates } from "../media-warm/candidates";

export type HealthSave = IntegritySave &
  Pick<Save, "status" | "blurhash" | "coverIndex">;

export interface HealthIndexReport {
  orphans: string[];
  missing: string[];
  errors: Record<string, string>;
}

export interface LibraryHealthDependencies {
  now(): number;
  libraryId(): string;
  integrityRuntime: LibraryIntegrityRuntime;
  listSaves(): Promise<HealthSave[]>;
  getSave(id: string): Promise<HealthSave | null>;
  verifyIndex(): Promise<HealthIndexReport>;
  readCheck(libraryId: string): Promise<LibraryHealthCheck | null>;
  writeCheck(libraryId: string, check: LibraryHealthCheck): Promise<void>;
  media(): Promise<MediaWarmSnapshot>;
}

/** Bounds the stored file and IPC payload; counts stay exact past the cap. */
const LIST_LIMIT = 2_000;
const LIBRARY_ERROR_KEY = "library";

interface JobRecord {
  libraryId: string;
  controller: AbortController;
  job: LibraryHealthJob;
}

interface Findings {
  counts: Record<HealthCountKey, number>;
  issues: HealthIntegrityIssue[];
  posters: HealthPosterGap[];
  unverified: HealthUnverifiedSave[];
}

export function createLibraryHealthService(deps: LibraryHealthDependencies) {
  let latest: { libraryId: string; check: LibraryHealthCheck | null } | null =
    null;
  let record: JobRecord | null = null;

  async function current(): Promise<LibraryHealthCheck | null> {
    const libraryId = deps.libraryId();
    if (latest?.libraryId === libraryId) return latest.check;
    const check = await deps.readCheck(libraryId);
    if (libraryId === deps.libraryId()) latest = { libraryId, check };
    return check;
  }

  function currentJob(): LibraryHealthJob | null {
    if (!record || record.libraryId !== deps.libraryId()) return null;
    return { ...record.job };
  }

  async function overview(): Promise<LibraryHealthOverview> {
    const [check, media] = await Promise.all([current(), deps.media()]);
    return { check, job: currentJob(), media };
  }

  function start(): LibraryHealthJob {
    const libraryId = deps.libraryId();
    if (record?.job.status === "running") {
      if (record.libraryId === libraryId) return { ...record.job };
      record.controller.abort();
    }
    const next: JobRecord = {
      libraryId,
      controller: new AbortController(),
      job: {
        id: randomUUID(),
        status: "running",
        processed: 0,
        total: 0,
        startedAt: deps.now(),
        error: null,
      },
    };
    record = next;
    void run(next);
    return { ...next.job };
  }

  function cancel(): LibraryHealthJob | null {
    if (!record || record.libraryId !== deps.libraryId()) return null;
    if (record.job.status === "running") {
      record.controller.abort();
      record.job.status = "cancelled";
    }
    return { ...record.job };
  }

  async function run(job: JobRecord): Promise<void> {
    const { signal } = job.controller;
    try {
      const rows = await deps.listSaves();
      job.job.total = rows.length;
      const findings = emptyFindings();
      for (const [index, row] of rows.entries()) {
        throwIfAborted(signal);
        await inspectInto(findings, row);
        job.job.processed = index + 1;
      }
      throwIfAborted(signal);
      let index: HealthIndexCheck | null = null;
      let indexError: string | null = null;
      try {
        index = indexCheck(await deps.verifyIndex());
      } catch (error) {
        indexError = messageOf(error, "Pond couldn't compare the index.");
      }
      throwIfAborted(signal);
      if (job.libraryId !== deps.libraryId())
        throw new Error("The active Library changed. Check the Library again.");
      const check: LibraryHealthCheck = {
        checkedAt: deps.now(),
        durationMs: Math.max(0, deps.now() - job.job.startedAt),
        saves: rows.length,
        ...findings,
        index,
        indexError,
      };
      await deps.writeCheck(job.libraryId, check);
      latest = { libraryId: job.libraryId, check };
      if (!signal.aborted) job.job.status = "completed";
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        job.job.status = "cancelled";
        return;
      }
      job.job.status = "failed";
      job.job.error = messageOf(error, "Pond couldn't check your Library.");
    }
  }

  async function inspectInto(findings: Findings, row: HealthSave) {
    /** Files of a Save still ingesting are in flight; Downloads reports that work. */
    if (row.status === "ingesting") return;
    const runtime = memoizedRuntime(deps.integrityRuntime);
    try {
      for (const kind of LibraryRepairKindSchema.options) {
        const found = await inspectSaveIntegrity({ kind, row, runtime });
        if (!found) continue;
        add(findings, kind, findings.issues, {
          kind,
          saveId: found.saveId,
          title: found.title,
          summary: found.summary,
          detail: found.detail,
          originals: found.evidence.originals,
          files: found.evidence.files,
        });
      }
    } catch (error) {
      add(findings, "unverified", findings.unverified, {
        saveId: row.id,
        title: row.title,
        reason: messageOf(error, "Pond couldn't read this Save's files."),
      });
    }
    const gap = posterGap(row);
    if (gap) add(findings, "posters", findings.posters, gap);
  }

  async function recheck(
    saveIds: readonly string[],
  ): Promise<LibraryHealthCheck | null> {
    const libraryId = deps.libraryId();
    const check = await current();
    if (!check) return null;
    const ids = new Set(saveIds);
    const removed = zeroCounts();
    const keep = <T extends { saveId: string }>(
      list: readonly T[],
      key: (item: T) => HealthCountKey,
    ) =>
      list.filter((item) => {
        if (!ids.has(item.saveId)) return true;
        removed[key(item)] += 1;
        return false;
      });
    const issues = keep(check.issues, (issue) => issue.kind);
    const posters = keep(check.posters, () => "posters");
    const unverified = keep(check.unverified, () => "unverified");
    const fresh = emptyFindings();
    for (const id of ids) {
      const row = await deps.getSave(id);
      if (row) await inspectInto(fresh, row);
    }
    if (libraryId !== deps.libraryId()) return null;
    const counts = zeroCounts();
    for (const key of HEALTH_COUNT_KEYS)
      counts[key] = Math.max(
        0,
        check.counts[key] - removed[key] + fresh.counts[key],
      );
    const next: LibraryHealthCheck = {
      ...check,
      counts,
      issues: [...issues, ...fresh.issues],
      posters: [...posters, ...fresh.posters],
      unverified: [...unverified, ...fresh.unverified],
      index: check.index && {
        ...check.index,
        missing: check.index.missing.filter((id) => !ids.has(id)),
        unreadable: check.index.unreadable.filter((id) => !ids.has(id)),
      },
    };
    await deps.writeCheck(libraryId, next);
    latest = { libraryId, check: next };
    return next;
  }

  return { overview, start, cancel, recheck };
}

function memoizedRuntime(
  runtime: LibraryIntegrityRuntime,
): LibraryIntegrityRuntime {
  const payloads = new Map<string, Promise<PayloadInspection>>();
  const renders = new Map<string, Promise<boolean>>();
  return {
    ...runtime,
    inspectPayload(path, expected) {
      const key = JSON.stringify([path, expected.size, expected.sha256]);
      const cached = payloads.get(key);
      if (cached) return cached;
      const pending = runtime.inspectPayload(path, expected);
      payloads.set(key, pending);
      return pending;
    },
    canRenderThumbnail(path) {
      const cached = renders.get(path);
      if (cached) return cached;
      const pending = runtime.canRenderThumbnail(path);
      renders.set(path, pending);
      return pending;
    },
  };
}

function posterGap(row: HealthSave): HealthPosterGap | null {
  if (!mediaWarmCandidates(row).some((c) => c.kind === "poster")) return null;
  return {
    saveId: row.id,
    title: row.title,
    videos: row.files.filter(isVideoFile).length,
    posters: row.files.filter((file) => file.kind === "poster").length,
  };
}

function indexCheck(report: HealthIndexReport): HealthIndexCheck {
  const { [LIBRARY_ERROR_KEY]: backupError, ...unreadable } = report.errors;
  return {
    orphans: report.orphans,
    missing: report.missing,
    unreadable: Object.keys(unreadable),
    backupError: backupError ?? null,
  };
}

function zeroCounts(): LibraryHealthCheck["counts"] {
  return {
    thumbnails: 0,
    "physical-file-names": 0,
    "invalid-content": 0,
    "save-metadata": 0,
    posters: 0,
    unverified: 0,
  };
}

function emptyFindings(): Findings {
  return { counts: zeroCounts(), issues: [], posters: [], unverified: [] };
}

function add<T>(
  findings: Findings,
  key: HealthCountKey,
  list: T[],
  item: T,
): void {
  findings.counts[key] += 1;
  if (findings.counts[key] <= LIST_LIMIT) list.push(item);
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw new DOMException("Library check canceled.", "AbortError");
}
