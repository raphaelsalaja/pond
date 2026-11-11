import {
  CANCEL_REASON,
  SKIP_REASON,
  type TaskDeferredReason,
} from "@pond/schema/db";
import type { QueueSourceGate } from "@shared/queue-contracts";
import { describe, expect, it } from "vitest";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { downloadStatusReason } from "./status-reason";

const NOW = 1_000_000;
const MINUTE = 60_000;

function row(
  status: DownloadRow["status"],
  extras: Partial<DownloadRow> = {},
): DownloadRow {
  return {
    id: status,
    saveId: status,
    name: status,
    url: "https://x.com/pond/status/1",
    source: "twitter",
    status,
    stage: null,
    op: null,
    progress: null,
    attempts: 0,
    error: null,
    ts: 0,
    durationMs: null,
    live: true,
    ...extras,
  };
}

function gate(extras: Partial<QueueSourceGate> = {}): QueueSourceGate {
  return {
    source: "twitter",
    state: "closed",
    reason: null,
    retryAt: null,
    remainingHourly: 10,
    remainingDaily: 100,
    maxPerHour: 40,
    maxPerDay: 600,
    recoveryProbe: false,
    ...extras,
  };
}

function reason(input: DownloadRow, source?: QueueSourceGate) {
  return downloadStatusReason(input, { paused: false, gate: source, now: NOW });
}

function parked(
  deferredReason: TaskDeferredReason,
  extras: Partial<DownloadRow> = {},
) {
  return row("parked", {
    task: { deferredReason, attempts: 0, maxAttempts: 5 },
    nextRunAt: NOW + 12 * MINUTE,
    ...extras,
  });
}

function retrying(lastError: string) {
  return row("retrying", {
    lastError,
    nextRunAt: NOW + 2 * MINUTE,
    task: { deferredReason: "retry_backoff", attempts: 2, maxAttempts: 5 },
  });
}

function dead(lastError: string, attempts = 1) {
  return row("dead", {
    lastError,
    attempts,
    task: { deferredReason: null, attempts, maxAttempts: 5 },
  });
}

describe("downloadStatusReason", () => {
  it("names the hourly and daily limits and when they reset", () => {
    const hourly = gate({ remainingHourly: 0 });
    expect(reason(parked("source_budget"), hourly)).toBe(
      "Hourly download limit reached (40/hour). Resumes in 12 min.",
    );

    const daily = gate({ remainingHourly: 0, remainingDaily: 0 });
    const later = parked("source_budget", { nextRunAt: NOW + 180 * MINUTE });
    expect(reason(later, daily)).toBe(
      "Daily download limit reached (600/day). Resumes in 3 hours.",
    );

    expect(reason(parked("source_budget"))).toBe(
      "Twitter download limit reached. Resumes in 12 min.",
    );
  });

  it("explains a rate limit from the source", () => {
    const limited = parked("source_budget", {
      lastError: "RateLimitedError: rate limited",
    });
    expect(reason(limited)).toBe(
      "Twitter is limiting requests. Resumes in 12 min.",
    );

    const cooldown = gate({
      state: "open",
      reason: "rate_limit",
      retryAt: NOW + 45_000,
    });
    expect(reason(parked("breaker_open"), cooldown)).toBe(
      "Twitter is limiting requests. Resumes in 45s.",
    );
  });

  it("explains a paused source breaker", () => {
    const failing = gate({ state: "open", reason: "transient_failures" });
    expect(reason(parked("breaker_open"), failing)).toBe(
      "Paused after repeated errors from Twitter. Resumes in 12 min.",
    );

    const risky = gate({ state: "open", reason: "at_risk" });
    expect(reason(parked("breaker_open"), risky)).toBe(
      "Paused to protect your Twitter account. Resumes in 12 min.",
    );

    const probing = gate({ state: "half_open", recoveryProbe: true });
    expect(reason(parked("breaker_open"), probing)).toBe(
      "Pond is testing Twitter with one download before resuming the rest.",
    );
  });

  it("explains other waits", () => {
    expect(reason(parked("source_paused"))).toBe(
      "Twitter downloads are paused.",
    );
    expect(reason(parked("worker_capacity"))).toBe(
      "Waiting for a free download slot.",
    );
    expect(reason(row("waiting"))).toBe(
      "Queued. Starts when a download slot opens.",
    );
    expect(
      downloadStatusReason(row("waiting"), { paused: true, now: NOW }),
    ).toBe("Background downloads are paused. Resume them from the toolbar.");
  });

  it("asks you to sign in again when the source needs it", () => {
    const blocked = row("blocked", {
      lastError: "AuthRequiredError: Connect Twitter with the Pond extension",
    });
    expect(reason(blocked)).toBe(
      "Twitter needs you to sign in again. Reconnect it in Sources to resume.",
    );
  });

  it("says when and why a download retries", () => {
    expect(reason(retrying("TransientError: navigate failed"))).toBe(
      "Retrying in 2 min after a network error. Attempt 3 of 5.",
    );
    expect(reason(retrying("TransientError: scrape timeout"))).toBe(
      "Retrying in 2 min after a timeout. Attempt 3 of 5.",
    );
    expect(reason(retrying("TransientError: web render 503"))).toBe(
      "Retrying in 2 min after a server error. Attempt 3 of 5.",
    );
    expect(reason(retrying("finalize: files are still missing"))).toBe(
      "Retrying in 2 min. Files are still missing. Attempt 3 of 5.",
    );
  });

  it("says what went wrong instead of counting attempts", () => {
    expect(reason(dead("TerminalError: scrape returned no data"))).toBe(
      "The page had nothing to save. It may have been deleted or made private.",
    );
    expect(reason(dead("TerminalError: web fetch 404"))).toBe(
      "The page wasn't found. It may have been deleted.",
    );
    expect(reason(dead("GeoRestrictedError: geo restricted"))).toBe(
      "This isn't available in your region.",
    );
    expect(reason(dead("UnsupportedError: no extractor"))).toBe(
      "Pond can't download this link.",
    );
    expect(reason(dead("TransientError: navigate failed", 5))).toBe(
      "Pond couldn't reach the site. Gave up after 5 attempts.",
    );
    expect(reason(row("dead"))).toBe("Pond couldn't finish this save.");
  });

  it("says who stopped a download", () => {
    expect(reason(row("cancelled", { lastError: CANCEL_REASON }))).toBe(
      "You canceled this download.",
    );
    expect(reason(row("skipped", { lastError: SKIP_REASON }))).toBe(
      "You skipped this download.",
    );
    const filtered = row("skipped", { lastError: "skipped by import filter" });
    expect(reason(filtered)).toBe(
      "Your import settings for this account leave it out.",
    );
  });

  it("describes running work and stays quiet once complete", () => {
    const running = row("running", {
      stage: "Downloading media",
      task: { deferredReason: null, attempts: 1, maxAttempts: 5 },
    });
    expect(reason(running)).toBe("Downloading media. Attempt 2 of 5.");
    expect(reason(row("complete"))).toBeNull();
  });
});
