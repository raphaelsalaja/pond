import type {
  HealthCountKey,
  HealthFileCheck,
  HealthIntegrityIssue,
  LibraryHealthOverview,
  MediaWarmSnapshot,
} from "@shared/library-health-contracts";
import type { LibraryRepairKind } from "@shared/library-repair-contracts";
import type { DownloadHealthRow } from "@/features/downloads/health";
import type { EnrichmentFailure } from "@/features/enrichment/status";
import { formatBytes, formatNumber, formatPlural } from "@/shared/lib/format";

export type HealthStatus =
  | "healthy"
  | "pending"
  | "processing"
  | "deferred"
  | "blocked"
  | "failed"
  | "terminal"
  | "damaged"
  | "unverified"
  | "unchecked";

export type HealthGroup = "files" | "media" | "downloads";

export type HealthCategoryId =
  | "originals"
  | "previews"
  | "records"
  | "file-names"
  | "index"
  | "posters"
  | "processing"
  | "downloads";

export type HealthResolution = "repair" | "retry" | "wait" | "user";

export interface HealthEntry {
  id: string;
  saveId: string;
  title: string;
  status: HealthStatus;
  resolution: HealthResolution;
  summary: string;
  expected: string;
  found: string;
  reason: string | null;
  originals: "usable" | "unusable" | "none" | "unknown";
  files: readonly HealthFileCheck[];
  attempts: { count: number; max: number | null } | null;
  nextAttemptAt: number | null;
  repair: LibraryRepairKind | null;
  openable: boolean;
}

export interface HealthCategory {
  id: HealthCategoryId;
  group: HealthGroup;
  title: string;
  status: HealthStatus;
  total: number;
  attention: number;
  progress: number;
  entries: readonly HealthEntry[];
  checked: boolean;
}

export interface HealthInput {
  overview: LibraryHealthOverview | null;
  downloads: readonly DownloadHealthRow[];
  enrichment: {
    inflight: number;
    failures: readonly EnrichmentFailure[];
    missingIds: ReadonlySet<string>;
  };
  title: (saveId: string) => string | null;
  device: string;
}

export const STATUS_LABELS = {
  healthy: "Healthy",
  pending: "Pending",
  processing: "Processing",
  deferred: "Deferred",
  blocked: "Blocked",
  failed: "Failed",
  terminal: "Won't Retry",
  damaged: "Needs Repair",
  unverified: "Couldn't Verify",
  unchecked: "Not Checked",
} satisfies Record<HealthStatus, string>;

export const RESOLUTION_LABELS = {
  repair: "Repair it from this page.",
  retry: "Retry it from this page.",
  wait: "Pond tries again on its own.",
  user: "Needs you to fix it outside Pond.",
} satisfies Record<HealthResolution, string>;

/** Worst first, so a category takes the status of its most urgent entry. */
const SEVERITY: readonly HealthStatus[] = [
  "terminal",
  "damaged",
  "failed",
  "blocked",
  "unverified",
  "deferred",
  "processing",
  "pending",
  "healthy",
  "unchecked",
];

const ATTENTION = new Set<HealthStatus>([
  "terminal",
  "damaged",
  "failed",
  "blocked",
  "unverified",
]);

function needsAttention(status: HealthStatus): boolean {
  return ATTENTION.has(status);
}

function worstStatus(statuses: Iterable<HealthStatus>): HealthStatus {
  let worst = SEVERITY.length - 1;
  for (const status of statuses) {
    worst = Math.min(worst, SEVERITY.indexOf(status));
  }
  return SEVERITY[worst] ?? "unchecked";
}

const FINDINGS = {
  ok: "is intact",
  missing: "is missing",
  unsafe: "isn't a regular file",
  empty: "is empty",
  size: "has the wrong size",
  hash: "changed since it was saved",
  error: "couldn't be read",
  undecodable: "can't be opened as an image",
  mismatch: "shows a different image",
  rename: "has a name other computers can't store",
  invalid: "can't be parsed",
  stale: "doesn't match the index",
  unreadable: "couldn't be read",
} satisfies Record<HealthFileCheck["finding"], string>;

function fileName(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(slash + 1);
}

export function describeFinding(file: HealthFileCheck): string {
  return `${fileName(file.path)} ${FINDINGS[file.finding]}`;
}

export function describeSize(size: number | null): string {
  return size == null ? "—" : formatBytes(size);
}

function foundFromFiles(files: readonly HealthFileCheck[]): string {
  const problems = files.filter((file) => file.finding !== "ok");
  if (problems.length === 0) return "Every file checked out.";
  const shown = problems.slice(0, 2).map(describeFinding).join(". ");
  const extra = problems.length - 2;
  if (extra <= 0) return `${shown}.`;
  const more = formatPlural(extra, {
    one: "more file has",
    other: "more files have",
  });
  return `${shown}. ${more} problems.`;
}

const INTEGRITY = {
  "invalid-content": {
    category: "originals",
    expected: "Original files that match their saved size and checksum.",
  },
  thumbnails: {
    category: "previews",
    expected: "A thumbnail made from the Save's original file.",
  },
  "save-metadata": {
    category: "records",
    expected: "A stored record that matches the library index.",
  },
  "physical-file-names": {
    category: "file-names",
    expected: "File names that every computer can store.",
  },
} satisfies Record<
  LibraryRepairKind,
  { category: HealthCategoryId; expected: string }
>;

function integrityEntry(issue: HealthIntegrityIssue): HealthEntry {
  const userFix = issue.kind === "invalid-content";
  return {
    id: `${issue.kind}:${issue.saveId}`,
    saveId: issue.saveId,
    title: issue.title?.trim() || issue.saveId,
    status: "damaged",
    resolution: "repair",
    summary: issue.summary,
    expected: INTEGRITY[issue.kind].expected,
    found: foundFromFiles(issue.files),
    reason: userFix
      ? `${issue.detail} Repair moves it to Trash. Restore the files from a backup first to keep it.`
      : issue.detail,
    originals: issue.originals,
    files: issue.files,
    attempts: null,
    nextAttemptAt: null,
    repair: issue.kind,
    openable: true,
  };
}

function checkCategory(
  id: HealthCategoryId,
  title: string,
  overview: LibraryHealthOverview | null,
  entries: readonly HealthEntry[],
  total: number,
): HealthCategory {
  const checked = overview?.check != null;
  return {
    id,
    group: "files",
    title,
    status: !checked
      ? "unchecked"
      : entries.length === 0 && total === 0
        ? "healthy"
        : worstStatus(entries.map((entry) => entry.status)),
    total,
    attention: total,
    progress: 0,
    entries,
    checked,
  };
}

function fileCategories(input: HealthInput): HealthCategory[] {
  const check = input.overview?.check ?? null;
  const issues = (kind: LibraryRepairKind) =>
    (check?.issues ?? [])
      .filter((issue) => issue.kind === kind)
      .map(integrityEntry);
  const count = (key: HealthCountKey) => check?.counts[key] ?? 0;
  const unverified: HealthEntry[] = (check?.unverified ?? []).map((save) => ({
    id: `unverified:${save.saveId}`,
    saveId: save.saveId,
    title: save.title?.trim() || save.saveId,
    status: "unverified",
    resolution: "user",
    summary: "Pond couldn't check this Save",
    expected: "Files Pond can read.",
    found: save.reason,
    reason: "Check that the library folder is reachable, then recheck it.",
    originals: "unknown",
    files: [],
    attempts: null,
    nextAttemptAt: null,
    repair: null,
    openable: true,
  }));
  return [
    checkCategory(
      "originals",
      "Original Files",
      input.overview,
      [...issues("invalid-content"), ...unverified],
      count("invalid-content") + count("unverified"),
    ),
    checkCategory(
      "previews",
      "Thumbnails",
      input.overview,
      issues("thumbnails"),
      count("thumbnails"),
    ),
    checkCategory(
      "records",
      "Save Records",
      input.overview,
      issues("save-metadata"),
      count("save-metadata"),
    ),
    checkCategory(
      "file-names",
      "File Names",
      input.overview,
      issues("physical-file-names"),
      count("physical-file-names"),
    ),
    indexCategory(input),
  ];
}

function indexCategory(input: HealthInput): HealthCategory {
  const check = input.overview?.check ?? null;
  const index = check?.index ?? null;
  const entry = (
    saveId: string,
    kind: "orphan" | "missing" | "unreadable",
  ): HealthEntry => ({
    id: `index-${kind}:${saveId}`,
    saveId,
    title: input.title(saveId) ?? saveId,
    status: "damaged",
    resolution: kind === "orphan" ? "repair" : "user",
    summary:
      kind === "orphan"
        ? "Folder isn't in the library index"
        : kind === "missing"
          ? "Save folder is gone from disk"
          : "Stored record can't be read",
    expected:
      kind === "orphan"
        ? "Every Save folder listed in the library index."
        : kind === "missing"
          ? "This Save's folder in the library."
          : "A stored record Pond can read.",
    found:
      kind === "orphan"
        ? "This folder isn't in the index."
        : kind === "missing"
          ? "The folder is gone."
          : "The record couldn't be read.",
    reason:
      kind === "missing"
        ? "Restore the folder from a backup, or move the Save to Trash."
        : kind === "unreadable"
          ? "Restore the folder's info.json from a backup, then rescan the library."
          : "Rescan Library adds the folder back to the index.",
    originals: kind === "missing" ? "none" : "unknown",
    files: [],
    attempts: null,
    nextAttemptAt: null,
    repair: null,
    openable: kind === "missing",
  });
  const entries = index
    ? [
        ...index.missing.map((id) => entry(id, "missing")),
        ...index.unreadable.map((id) => entry(id, "unreadable")),
        ...index.orphans.map((id) => entry(id, "orphan")),
      ]
    : [];
  const unverified =
    check != null && (index == null || check.indexError != null);
  return {
    id: "index",
    group: "files",
    title: "Library Index",
    status:
      check == null
        ? "unchecked"
        : unverified
          ? "unverified"
          : entries.length === 0
            ? "healthy"
            : "damaged",
    total: entries.length,
    attention: unverified ? Math.max(1, entries.length) : entries.length,
    progress: 0,
    entries,
    checked: check != null,
  };
}

function pauseReason(media: MediaWarmSnapshot, device: string): string {
  switch (media.pauseReason) {
    case "battery":
      return `Waits until ${device} is plugged in.`;
    case "thermal":
      return `Waits until ${device} cools down.`;
    case "active":
      return `Waits until ${device} is idle.`;
    default:
      return "Pond makes posters in the background.";
  }
}

function posterCategory(input: HealthInput): HealthCategory {
  const media = input.overview?.media ?? null;
  const check = input.overview?.check ?? null;
  const failed = new Map(
    (media?.failures ?? [])
      .filter((failure) => failure.kind === "poster")
      .map((failure) => [failure.saveId, failure]),
  );
  const active = new Set(media?.activeSaveIds ?? []);
  const deferred =
    media?.state === "paused-system" || media?.state === "paused-user";
  const ids = new Set([
    ...failed.keys(),
    ...active,
    ...(check?.posters ?? []).map((gap) => gap.saveId),
  ]);
  const gaps = new Map((check?.posters ?? []).map((gap) => [gap.saveId, gap]));
  const entries: HealthEntry[] = [...ids].map((saveId) => {
    const failure = failed.get(saveId);
    const gap = gaps.get(saveId);
    const status: HealthStatus = failure
      ? "failed"
      : active.has(saveId)
        ? "processing"
        : deferred
          ? "deferred"
          : "pending";
    const title =
      failure?.title?.trim() ||
      gap?.title?.trim() ||
      input.title(saveId) ||
      saveId;
    return {
      id: `poster:${saveId}`,
      saveId,
      title,
      status,
      resolution: failure ? "retry" : "wait",
      summary: failure
        ? "Couldn't make a poster"
        : status === "processing"
          ? "Making a poster"
          : "Waiting for a poster",
      expected: "A poster for each video.",
      found: gap
        ? `${formatNumber(gap.posters)} of ${formatNumber(gap.videos)} posters.`
        : failure
          ? "No poster yet."
          : "Making it now.",
      reason: failure
        ? failure.error
        : status === "deferred" && media
          ? media.state === "paused-user"
            ? "You paused media preparation."
            : pauseReason(media, input.device)
          : status === "pending" && media
            ? pauseReason(media, input.device)
            : null,
      originals: "unknown",
      files: [],
      attempts: null,
      nextAttemptAt: null,
      repair: null,
      openable: true,
    };
  });
  const attention = entries.filter((entry) => entry.status === "failed").length;
  const remaining = check ? check.counts.posters : 0;
  const progress = Math.max(
    entries.length - attention,
    remaining - attention,
    0,
  );
  return {
    id: "posters",
    group: "media",
    title: "Video Posters",
    status:
      entries.length > 0
        ? worstStatus(entries.map((entry) => entry.status))
        : check
          ? "healthy"
          : "unchecked",
    total: attention + progress,
    attention,
    progress,
    entries,
    checked: check != null || entries.length > 0,
  };
}

function processingCategory(input: HealthInput): HealthCategory {
  const failures = input.enrichment.failures.filter(
    (failure) => !input.enrichment.missingIds.has(failure.saveId),
  );
  const entries: HealthEntry[] = failures.map((failure) => ({
    id: `processing:${failure.key}`,
    saveId: failure.saveId,
    title:
      failure.title?.trim() || input.title(failure.saveId) || failure.saveId,
    status: "failed",
    resolution: "retry",
    summary: `${taskLabel(failure.task)} couldn't finish`,
    expected: `${taskLabel(failure.task)} made on ${input.device}.`,
    found: "Processing stopped before it finished.",
    reason: failure.reason.trim() || null,
    originals: "unknown",
    files: [],
    attempts: null,
    nextAttemptAt: null,
    repair: null,
    openable: true,
  }));
  const inflight = input.enrichment.inflight;
  return {
    id: "processing",
    group: "media",
    title: "On-Device Processing",
    status:
      entries.length > 0 ? "failed" : inflight > 0 ? "processing" : "healthy",
    total: entries.length + inflight,
    attention: entries.length,
    progress: inflight,
    entries,
    checked: true,
  };
}

const TASK_LABELS = new Map<string, string>([
  ["caption", "Image Captions"],
  ["ocr", "Text in Images"],
  ["transcript", "Transcription"],
  ["clip", "Visual Similarity"],
  ["aesthetic", "Style Labels"],
  ["sensitive-content", "Sensitive Content"],
  ["autoTitle", "Generated Titles"],
  ["suggestedTags", "Suggested Tags"],
  ["textEmbedding", "Semantic Search"],
]);

function taskLabel(task: string): string {
  return TASK_LABELS.get(task) ?? task;
}

const USER_DEFERRALS = new Set([
  "auth_required",
  "source_paused",
  "queue_paused",
]);

function downloadStatus(item: DownloadHealthRow): HealthStatus | null {
  const { row } = item;
  switch (row.status) {
    case "running":
      return "processing";
    case "waiting":
      return "pending";
    case "retrying":
      return "failed";
    case "parked":
      return USER_DEFERRALS.has(row.task?.deferredReason ?? "") ||
        item.gate?.reason === "auth_required"
        ? "blocked"
        : "deferred";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "dead":
      return "terminal";
    case "cancelled":
    case "skipped":
    case "complete":
      return null;
  }
}

function downloadResolution(
  item: DownloadHealthRow,
  status: HealthStatus,
): HealthResolution {
  if (item.row.status === "failed" || item.row.status === "dead") {
    return "retry";
  }
  if (status === "blocked") return "user";
  return "wait";
}

function downloadsCategory(input: HealthInput): HealthCategory {
  const entries: HealthEntry[] = [];
  for (const item of input.downloads) {
    const status = downloadStatus(item);
    if (!status) continue;
    const { row } = item;
    const attempts = row.task?.attempts ?? row.attempts;
    entries.push({
      id: `download:${row.id}`,
      saveId: row.saveId,
      title: row.name || input.title(row.saveId) || row.saveId,
      status,
      resolution: downloadResolution(item, status),
      summary: row.error ?? row.stage ?? STATUS_LABELS[status],
      expected: "Every file downloaded and saved.",
      found:
        row.status === "running" && row.progress != null
          ? `${Math.round(row.progress * 100)}% downloaded.`
          : row.stage
            ? `Stopped at ${row.stage.toLowerCase()}.`
            : "Not finished.",
      reason: item.reason,
      originals: "unknown",
      files: [],
      attempts:
        attempts > 0
          ? { count: attempts, max: row.task?.maxAttempts ?? null }
          : null,
      nextAttemptAt: row.nextRunAt ?? null,
      repair: null,
      openable: true,
    });
  }
  const attention = entries.filter((entry) =>
    needsAttention(entry.status),
  ).length;
  return {
    id: "downloads",
    group: "downloads",
    title: "Downloads",
    status:
      entries.length === 0
        ? "healthy"
        : worstStatus(entries.map((entry) => entry.status)),
    total: entries.length,
    attention,
    progress: entries.length - attention,
    entries,
    checked: true,
  };
}

export function categoryFact(id: HealthCategoryId, device: string): string {
  switch (id) {
    case "originals":
      return "Compares each original file with its saved size and checksum.";
    case "previews":
      return "Looks for thumbnails that are missing, damaged, or out of date.";
    case "records":
      return "Compares the record in each Save folder with the library index.";
    case "file-names":
      return "Finds file names that other computers can't store.";
    case "index":
      return "Matches the Save folders on disk with the library index.";
    case "posters":
      return `Pond makes a poster for each video while ${device} is idle.`;
    case "processing":
      return `Captions, text, and transcripts made on ${device}.`;
    case "downloads":
      return "Saves that are still downloading, waiting, or stopped.";
  }
}

export function statusBreakdown(
  entries: readonly HealthEntry[],
): [HealthStatus, number][] {
  const counts = new Map<HealthStatus, number>();
  for (const entry of entries) {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  }
  return SEVERITY.flatMap((status) => {
    const count = counts.get(status);
    return count ? [[status, count]] : [];
  });
}

export function buildHealthCategories(input: HealthInput): HealthCategory[] {
  return [
    ...fileCategories(input),
    posterCategory(input),
    processingCategory(input),
    downloadsCategory(input),
  ];
}

export function healthTotals(categories: readonly HealthCategory[]) {
  let attention = 0;
  let progress = 0;
  for (const category of categories) {
    attention += category.attention;
    progress += category.progress;
  }
  return { attention, progress };
}
