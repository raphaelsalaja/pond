import type { Source } from "@pond/schema/db";
import log from "electron-log/main.js";

// Process-wide, in-memory gate for per-source pacing. Two independent
// reasons a source can be "paused":
//
// 1. Cooldown — set when a worker observes an explicit rate-limit
//    signal (e.g. `RateLimitedError(retryAfterSec)`). Affects every
//    queued task for that source, not just the one that failed.
// 2. Circuit breaker — set when N consecutive transient failures land
//    against a source within a short window. Trips the source off for
//    ~10 minutes so we don't burn the pool on a dead-on-arrival host.
//
// Both reasons are unioned into a single "next allowed" timestamp per
// source. Consumers (scrape-window lease, reconciler `pullDueTasks`)
// check `sourcePausedUntil(s)` and either skip or queue-with-delay.
// Nothing here persists across restarts — by design. Soft-blocks clear
// on their own and the user shouldn't have to wait through them after
// quitting and relaunching.

const cooldownUntil = new Map<Source, number>();
const breakerUntil = new Map<Source, number>();
const breakerCounters = new Map<Source, { count: number; firstAt: number }>();

const BREAKER_WINDOW_MS = 60_000;
const BREAKER_THRESHOLD = 3;
const BREAKER_TRIP_MS = 10 * 60_000;

export type PausedReason = "cooldown" | "breaker";

export interface PausedState {
  source: Source;
  until: number;
  reason: PausedReason;
}

function maxOrNull(a: number | undefined, b: number | undefined): number {
  return Math.max(a ?? 0, b ?? 0);
}

export function sourcePausedUntil(source: Source): number {
  const now = Date.now();
  const cooldown = cooldownUntil.get(source) ?? 0;
  const breaker = breakerUntil.get(source) ?? 0;
  const until = maxOrNull(cooldown, breaker);
  if (until <= now) return 0;
  return until;
}

export function sourcePausedReason(source: Source): PausedReason | null {
  const now = Date.now();
  const cooldown = cooldownUntil.get(source) ?? 0;
  const breaker = breakerUntil.get(source) ?? 0;
  if (breaker > now && breaker >= cooldown) return "breaker";
  if (cooldown > now) return "cooldown";
  return null;
}

export function setSourceCooldown(source: Source, ms: number): void {
  if (ms <= 0) return;
  const until = Date.now() + ms;
  const prev = cooldownUntil.get(source) ?? 0;
  if (until <= prev) return;
  cooldownUntil.set(source, until);
  log.info("[pond pipeline:source-gate] cooldown set", {
    source,
    untilMs: until,
    ms,
  });
}

export function noteTransientFailure(source: Source): void {
  const now = Date.now();
  const entry = breakerCounters.get(source);
  if (!entry || now - entry.firstAt > BREAKER_WINDOW_MS) {
    breakerCounters.set(source, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= BREAKER_THRESHOLD) {
    breakerCounters.delete(source);
    const until = now + BREAKER_TRIP_MS;
    const prev = breakerUntil.get(source) ?? 0;
    if (until > prev) {
      breakerUntil.set(source, until);
      log.warn("[pond pipeline:source-gate] circuit breaker tripped", {
        source,
        untilMs: until,
        windowMs: BREAKER_WINDOW_MS,
      });
    }
  }
}

export function noteSuccess(source: Source): void {
  // A success closes the breaker window — the host is healthy again.
  // Cooldowns set by explicit RateLimitedError signals stay because
  // the host is asking us to wait regardless of whether the last call
  // happened to slip through.
  breakerCounters.delete(source);
}

export function clearSourceGate(source: Source): void {
  cooldownUntil.delete(source);
  breakerUntil.delete(source);
  breakerCounters.delete(source);
}

export function snapshotSourceGate(): PausedState[] {
  const now = Date.now();
  const out: PausedState[] = [];
  const seen = new Set<Source>();
  for (const [source, until] of cooldownUntil) {
    if (until <= now) continue;
    seen.add(source);
    out.push({ source, until, reason: "cooldown" });
  }
  for (const [source, until] of breakerUntil) {
    if (until <= now) continue;
    if (seen.has(source)) {
      // Replace with whichever is later — show the longest wait.
      const idx = out.findIndex((e) => e.source === source);
      const existing = idx !== -1 ? out[idx] : null;
      if (existing && until > existing.until) {
        out[idx] = { source, until, reason: "breaker" };
      }
      continue;
    }
    out.push({ source, until, reason: "breaker" });
  }
  return out;
}
