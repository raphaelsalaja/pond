import { CANCEL_REASON, SKIP_REASON } from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import type { QueueSourceGate } from "@shared/queue-contracts";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { humanizeError } from "@/features/downloads/lib/status-feed/queue";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { isDownloadStopped } from "./status";

interface DownloadReasonContext {
  paused: boolean;
  gate?: QueueSourceGate | null;
  now: number;
}

type ErrorClass =
  | "auth"
  | "rate_limit"
  | "geo"
  | "unsupported"
  | "terminal"
  | "other";

/** Main records task errors as `${error.name}: ${error.message}`, so the class name is the error's kind. */
function errorClass(raw: string | null | undefined): ErrorClass | null {
  if (!raw) return null;
  switch (/^([A-Za-z]+Error):/.exec(raw)?.[1]) {
    case "AuthRequiredError":
      return "auth";
    case "RateLimitedError":
      return "rate_limit";
    case "GeoRestrictedError":
      return "geo";
    case "UnsupportedError":
      return "unsupported";
    case "TerminalError":
      return "terminal";
    default:
      return "other";
  }
}

const TIMEOUT = /timed? ?out/i;
const NETWORK =
  /network|fetch failed|navigate failed|ECONN|ENOTFOUND|EAI_AGAIN|socket hang up/i;
const SERVER = /\b5\d\d\b/;

const EXPLANATIONS: readonly (readonly [RegExp, string])[] = [
  [/region/i, "This isn't available in your region."],
  [
    /\b(404|410)\b|page not found|no longer exists|was deleted|is gone/i,
    "The page wasn't found. It may have been deleted.",
  ],
  [
    /no data|empty (body|document)/i,
    "The page had nothing to save. It may have been deleted or made private.",
  ],
  [/\b(401|403)\b/, "The site refused access to this page."],
  [/could not parse/i, "Pond couldn't read this link."],
  [/^blocked by failed/i, "An earlier step of this download failed."],
  [TIMEOUT, "The site took too long to respond."],
  [NETWORK, "Pond couldn't reach the site."],
  [SERVER, "The site had a server error."],
];

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function explainError(raw: string): string {
  for (const [pattern, text] of EXPLANATIONS) {
    if (pattern.test(raw)) return text;
  }
  return sentence(humanizeError(raw));
}

function retryCause(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (errorClass(raw) === "rate_limit") return "a rate limit";
  if (TIMEOUT.test(raw)) return "a timeout";
  if (NETWORK.test(raw)) return "a network error";
  if (SERVER.test(raw)) return "a server error";
  return null;
}

function until(at: number | null | undefined, now: number): string | null {
  if (at == null || at >= Number.MAX_SAFE_INTEGER) return null;
  const seconds = Math.ceil((at - now) / 1_000);
  if (seconds <= 0) return "shortly";
  if (seconds < 60) return `in ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return `in ${formatPlural(hours, { one: "hour", other: "hours" })}`;
}

function withResume(
  text: string,
  at: number | null | undefined,
  now: number,
): string {
  const when = until(at, now);
  return when ? `${text} Resumes ${when}.` : text;
}

function nextAttempt(row: DownloadRow): string | null {
  const task = row.task;
  if (!task || task.attempts <= 0 || task.attempts >= task.maxAttempts) {
    return null;
  }
  return `Attempt ${task.attempts + 1} of ${task.maxAttempts}.`;
}

function joined(...parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

function runningReason(row: DownloadRow): string | null {
  if (!row.stage) return null;
  return joined(sentence(row.stage), nextAttempt(row));
}

function retryingReason(row: DownloadRow, now: number): string {
  const when = until(row.nextRunAt, now) ?? "shortly";
  const cause = retryCause(row.lastError);
  const detail = row.lastError ? explainError(row.lastError) : null;
  const lead = cause
    ? `Retrying ${when} after ${cause}.`
    : joined(`Retrying ${when}.`, detail);
  return joined(lead, nextAttempt(row));
}

function budgetReason(
  row: DownloadRow,
  source: string,
  gate: QueueSourceGate | null | undefined,
  now: number,
): string {
  if (gate?.remainingDaily === 0) {
    return withResume(
      `Daily download limit reached (${formatNumber(gate.maxPerDay)}/day).`,
      row.nextRunAt,
      now,
    );
  }
  if (gate?.remainingHourly === 0) {
    return withResume(
      `Hourly download limit reached (${formatNumber(gate.maxPerHour)}/hour).`,
      row.nextRunAt,
      now,
    );
  }
  if (errorClass(row.lastError) === "rate_limit") {
    return withResume(`${source} is limiting requests.`, row.nextRunAt, now);
  }
  return withResume(`${source} download limit reached.`, row.nextRunAt, now);
}

function breakerReason(
  row: DownloadRow,
  source: string,
  gate: QueueSourceGate | null | undefined,
  now: number,
): string {
  if (gate?.state === "half_open") {
    return `Pond is testing ${source} with one download before resuming the rest.`;
  }
  if (gate?.reason === "auth_required") {
    return `${source} needs you to sign in again. Reconnect it in Sources to resume.`;
  }
  const resumeAt = gate?.retryAt ?? row.nextRunAt;
  if (gate?.reason === "rate_limit") {
    return withResume(`${source} is limiting requests.`, resumeAt, now);
  }
  if (gate?.reason === "at_risk") {
    return withResume(
      `Paused to protect your ${source} account.`,
      resumeAt,
      now,
    );
  }
  return withResume(
    `Paused after repeated errors from ${source}.`,
    resumeAt,
    now,
  );
}

function parkedReason(
  row: DownloadRow,
  source: string,
  context: DownloadReasonContext,
): string {
  switch (row.task?.deferredReason) {
    case "auth_required":
      return `${source} needs you to sign in again. Reconnect it in Sources to resume.`;
    case "source_budget":
      return budgetReason(row, source, context.gate, context.now);
    case "breaker_open":
      return breakerReason(row, source, context.gate, context.now);
    case "source_paused":
      return context.gate?.reason === "global_pause"
        ? "Requests to every source are paused."
        : `${source} downloads are paused.`;
    case "queue_paused":
      return "This retry batch is paused.";
    case "worker_capacity":
      return "Waiting for a free download slot.";
    default:
      return withResume(`Waiting for ${source}.`, row.nextRunAt, context.now);
  }
}

function blockedReason(row: DownloadRow, source: string): string {
  if (errorClass(row.lastError) === "auth") {
    return `${source} needs you to sign in again. Reconnect it in Sources to resume.`;
  }
  return row.lastError ? explainError(row.lastError) : `Waiting on ${source}.`;
}

function deadReason(row: DownloadRow): string {
  const raw = row.lastError;
  if (!raw) return "Pond couldn't finish this save.";
  switch (errorClass(raw)) {
    case "geo":
      return "This isn't available in your region.";
    case "unsupported":
      return "Pond can't download this link.";
    case "other": {
      const attempts = row.task?.attempts ?? row.attempts;
      if (attempts <= 1) return explainError(raw);
      const tries = formatPlural(attempts, {
        one: "attempt",
        other: "attempts",
      });
      return `${explainError(raw)} Gave up after ${tries}.`;
    }
    default:
      return explainError(raw);
  }
}

function skippedReason(row: DownloadRow): string {
  if (row.lastError === SKIP_REASON) return "You skipped this download.";
  if (row.lastError?.includes("import filter")) {
    return "Your import settings for this account leave it out.";
  }
  return "Pond skipped this download.";
}

export function downloadStatusReason(
  row: DownloadRow,
  context: DownloadReasonContext,
): string | null {
  if (isDownloadStopped(row, context.paused)) {
    return "Background downloads are paused. Resume them from the toolbar.";
  }
  const source = sourceLabel(row.source);
  switch (row.status) {
    case "running":
      return runningReason(row);
    case "waiting":
      return "Queued. Starts when a download slot opens.";
    case "retrying":
      return retryingReason(row, context.now);
    case "parked":
      return parkedReason(row, source, context);
    case "blocked":
      return blockedReason(row, source);
    case "dead":
      return deadReason(row);
    case "failed":
      return row.lastError
        ? explainError(row.lastError)
        : "Pond couldn't finish this save.";
    case "cancelled":
      return row.lastError === CANCEL_REASON
        ? "You canceled this download."
        : "Canceled before it finished.";
    case "skipped":
      return skippedReason(row);
    case "complete":
      return null;
  }
}
