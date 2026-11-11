import type { Source } from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import log from "electron-log/main.js";
import { AuthRequiredError } from "./extractors/errors";
import {
  AT_RISK_PARK_MS,
  type AtRiskKind,
  allPaused,
  atRisk,
  BREAKER_THRESHOLD,
  BREAKER_TRIP_MS,
  BREAKER_WINDOW_MS,
  breakerCounters,
  breakerUntil,
  cooldownUntil,
  lastRequestAt,
  loadState,
  MULTIPLIER_DECREASE,
  MULTIPLIER_INCREASE,
  MULTIPLIER_MAX,
  MULTIPLIER_MIN,
  manualPaused,
  multiplier,
  now,
  profile,
  requestLog,
  schedulePersist,
} from "./rate-governor-state";
import { type HeaderBag, parseRateSignal } from "./rate-headers";
import {
  liftSourceAuthStop,
  noteDurableSourceFailure,
  recordSourceRequest,
  transitionSourceGate,
} from "./source-admission";

/**
 * The one pacing authority for every platform request: acquire() blocks until a source is safe to hit, report() adapts to the response; better to sync slowly than to risk a user's account.
 * Cooldowns, at-risk marks, and recent requests persist to userData so a restart cannot re-hammer an account.
 */

export {
  isAllPaused,
  pauseAll,
  resumeAll,
  snapshotSourceGate,
} from "./rate-governor-state";

export function sourcePausedUntil(source: Source): number {
  loadState();
  if (allPaused) return Number.MAX_SAFE_INTEGER;
  if (manualPaused.has(source)) return Number.MAX_SAFE_INTEGER;
  const t = now();
  let until = 0;
  const cd = cooldownUntil.get(source) ?? 0;
  if (cd > until) until = cd;
  const br = breakerUntil.get(source) ?? 0;
  if (br > until) until = br;
  const ar = atRisk.get(source);
  if (ar) {
    const parkUntil = ar.since + AT_RISK_PARK_MS;
    if (parkUntil > until) until = parkUntil;
  }
  const budget = budgetUntil(source);
  if (budget > until) {
    until = budget;
    noteBudgetPark(source, budget);
  }
  return until <= t ? 0 : until;
}

const budgetParkLogged = new Map<Source, number>();

function noteBudgetPark(source: Source, until: number): void {
  if (until <= now() || budgetParkLogged.get(source) === until) return;
  budgetParkLogged.set(source, until);
  const p = profile(source);
  log.warn(
    `[pond governor] ${source} hit its request ceiling (${p.maxPerHour}/h, ${p.maxPerDay}/day); parked for ${Math.ceil((until - now()) / 60_000)}m`,
  );
}

export function setSourceCooldown(source: Source, ms: number): void {
  if (ms <= 0) return;
  loadState();
  const until = now() + ms;
  const prev = cooldownUntil.get(source) ?? 0;
  if (until <= prev) return;
  cooldownUntil.set(source, until);
  log.info("[pond governor] cooldown set", { source, ms });
  void transitionSourceGate({
    source,
    state: "open",
    reason: "rate_limit",
    retryAt: until,
  });
  schedulePersist(true);
}

export function noteTransientFailure(source: Source): void {
  loadState();
  const t = now();
  void noteDurableSourceFailure(source, {
    threshold: BREAKER_THRESHOLD,
    windowMs: BREAKER_WINDOW_MS,
    openMs: BREAKER_TRIP_MS,
  });
  const entry = breakerCounters.get(source);
  if (!entry || t - entry.firstAt > BREAKER_WINDOW_MS) {
    breakerCounters.set(source, { count: 1, firstAt: t });
    return;
  }
  entry.count += 1;
  if (entry.count >= BREAKER_THRESHOLD) {
    breakerCounters.delete(source);
    const until = t + BREAKER_TRIP_MS;
    const prev = breakerUntil.get(source) ?? 0;
    if (until > prev) {
      breakerUntil.set(source, until);
      log.warn("[pond governor] circuit breaker tripped", { source });
      schedulePersist(true);
    }
  }
}

export function noteSuccess(source: Source): void {
  breakerCounters.delete(source);
  const m = multiplier.get(source) ?? MULTIPLIER_MIN;
  if (m > MULTIPLIER_MIN) {
    multiplier.set(source, Math.max(MULTIPLIER_MIN, m - MULTIPLIER_DECREASE));
  }
  if (!manualPaused.has(source) && !atRisk.has(source)) {
    void transitionSourceGate({
      source,
      state: "closed",
      reason: null,
      retryAt: null,
      resetFailures: true,
    });
  }
}

export function markAtRisk(source: Source, kind: AtRiskKind, note = ""): void {
  loadState();
  atRisk.set(source, { source, kind, since: now(), note });
  log.warn("[pond governor] source marked at-risk", { source, kind, note });
  void transitionSourceGate({
    source,
    state: "open",
    reason: "at_risk",
    retryAt: now() + AT_RISK_PARK_MS,
  });
  schedulePersist(true);
}

export function resumeSource(source: Source): void {
  manualPaused.delete(source);
  cooldownUntil.delete(source);
  breakerUntil.delete(source);
  atRisk.delete(source);
  breakerCounters.delete(source);
  multiplier.set(source, MULTIPLIER_MIN);
  void transitionSourceGate({
    source,
    state: "closed",
    reason: null,
    retryAt: null,
    resetFailures: true,
    overrideAuthStop: true,
  });
  void liftSourceAuthStop(source);
  schedulePersist(true);
}

export function pauseSource(source: Source): void {
  manualPaused.add(source);
  void transitionSourceGate({
    source,
    state: "paused",
    reason: "manual",
    retryAt: null,
    overrideAuthStop: true,
  });
  schedulePersist(true);
}

function effectiveDelay(source: Source, firstSync: boolean): number {
  const p = profile(source);
  const m = multiplier.get(source) ?? MULTIPLIER_MIN;
  const base = p.minDelayMs * m * (firstSync ? p.firstSyncSlowdown : 1);
  const jitter = base * p.jitterFraction * Math.random();
  return Math.round(base + jitter);
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

function pruneLog(source: Source): number[] {
  const cutoff = now() - DAY_MS;
  const log_ = (requestLog.get(source) ?? []).filter((ts) => ts >= cutoff);
  requestLog.set(source, log_);
  return log_;
}

function recentCount(log_: number[], windowMs: number): number {
  const cutoff = now() - windowMs;
  let count = 0;
  for (let i = log_.length - 1; i >= 0; i--) {
    const ts = log_[i];
    if (ts === undefined || ts < cutoff) break;
    count += 1;
  }
  return count;
}

function budgetUntil(source: Source): number {
  const p = profile(source);
  const log_ = pruneLog(source);
  let until = 0;
  for (const [windowMs, max] of [
    [HOUR_MS, p.maxPerHour],
    [DAY_MS, p.maxPerDay],
  ] as const) {
    if (recentCount(log_, windowMs) < max) continue;
    const oldest = log_[Math.max(0, log_.length - max)] ?? now();
    const free = oldest + windowMs;
    if (free > until) until = free;
  }
  return until;
}

interface AcquireOptions {
  signal?: AbortSignal;
  firstSync?: boolean;
  maxWaitMs?: number;
}

class GovernorAbortError extends Error {
  constructor() {
    super("rate governor wait aborted");
    this.name = "GovernorAbortError";
  }
}

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new GovernorAbortError());
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(id);
      reject(new GovernorAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function acquire(
  source: Source,
  opts: AcquireOptions = {},
): Promise<void> {
  loadState();
  const deadline =
    opts.maxWaitMs != null ? now() + opts.maxWaitMs : Number.MAX_SAFE_INTEGER;

  for (;;) {
    if (opts.signal?.aborted) throw new GovernorAbortError();
    const until = sourcePausedUntil(source);
    if (until === 0) break;
    if (until >= Number.MAX_SAFE_INTEGER) {
      const slice = Math.min(2_000, deadline - now());
      if (slice <= 0) throw new GovernorAbortError();
      await wait(slice, opts.signal);
      continue;
    }
    const sleepMs = Math.min(until - now(), deadline - now());
    if (sleepMs <= 0) throw new GovernorAbortError();
    await wait(Math.min(sleepMs, 5_000), opts.signal);
  }

  const p = profile(source);
  for (;;) {
    const log_ = pruneLog(source);
    const inWindow = recentCount(log_, p.windowMs);
    if (inWindow < p.maxPerWindow) break;
    const oldest = log_[log_.length - inWindow] ?? now();
    const waitMs = Math.min(oldest + p.windowMs - now(), deadline - now());
    if (waitMs <= 0 && deadline <= now()) throw new GovernorAbortError();
    await wait(Math.max(50, Math.min(waitMs, 5_000)), opts.signal);
  }

  const last = lastRequestAt.get(source) ?? 0;
  const gap = effectiveDelay(source, opts.firstSync ?? false);
  const spacingWait = last + gap - now();
  if (spacingWait > 0) {
    if (now() + spacingWait > deadline) throw new GovernorAbortError();
    await wait(spacingWait, opts.signal);
  }

  for (;;) {
    const admission = await recordSourceRequest(source);
    if (admission.admitted) break;
    if (admission.reason === "auth_required") {
      throw new AuthRequiredError(
        `Connect ${sourceLabel(source)} with the Pond extension`,
        source,
      );
    }
    const remaining = deadline - now();
    if (remaining <= 0) throw new GovernorAbortError();
    const gateWait =
      admission.nextRunAt >= Number.MAX_SAFE_INTEGER
        ? Math.min(2_000, remaining)
        : Math.min(Math.max(50, admission.nextRunAt - now()), 5_000, remaining);
    await wait(gateWait, opts.signal);
  }

  const t = now();
  lastRequestAt.set(source, t);
  const log_ = requestLog.get(source) ?? [];
  log_.push(t);
  requestLog.set(source, log_);
  schedulePersist();
}

interface ReportInput {
  ok: boolean;
  status?: number;
  headers?: HeaderBag;
  rateLimited?: boolean;
  retryAfterSec?: number;
}

interface ReportResult {
  cooldownMs: number;
}

export function report(source: Source, input: ReportInput): ReportResult {
  loadState();
  const signal = input.headers ? parseRateSignal(input.headers) : null;
  const is429 = input.status === 429;
  const rateLimited = input.rateLimited === true || is429;

  if (rateLimited) {
    const sec =
      input.retryAfterSec ??
      signal?.retryAfterSec ??
      Math.min(900, 60 * (multiplier.get(source) ?? 1));
    bumpMultiplier(source);
    const ms = Math.max(1_000, sec * 1000);
    setSourceCooldown(source, ms);
    return { cooldownMs: ms };
  }

  if (
    signal?.remaining != null &&
    signal.remaining <= 2 &&
    signal.retryAfterSec != null &&
    signal.retryAfterSec > 0
  ) {
    const ms = signal.retryAfterSec * 1000;
    setSourceCooldown(source, ms);
    return { cooldownMs: ms };
  }

  if (input.ok) noteSuccess(source);
  return { cooldownMs: 0 };
}

function bumpMultiplier(source: Source): void {
  const m = multiplier.get(source) ?? MULTIPLIER_MIN;
  multiplier.set(source, Math.min(MULTIPLIER_MAX, m * MULTIPLIER_INCREASE));
}

export function flushGovernor(): void {
  schedulePersist(true);
}
