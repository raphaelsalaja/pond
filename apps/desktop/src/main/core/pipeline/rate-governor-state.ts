import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SOURCES, type Source } from "@pond/schema/db";
import { type RateProfile, syncConfigFor } from "@pond/schema/sources";
import { app } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { getDb } from "../../db";

type PausedReason = "cooldown" | "breaker" | "at_risk" | "manual";

export interface PausedState {
  source: Source;
  until: number;
  reason: PausedReason;
}

const AT_RISK_KINDS = [
  "challenge",
  "checkpoint",
  "captcha",
  "login",
  "rate_limit",
] as const;

export type AtRiskKind = (typeof AT_RISK_KINDS)[number];

const AtRiskStateSchema = z.object({
  source: z.enum(SOURCES),
  kind: z.enum(AT_RISK_KINDS),
  since: z.number(),
  note: z.string(),
});

export type AtRiskState = z.infer<typeof AtRiskStateSchema>;

export const BREAKER_WINDOW_MS = 60_000;
export const BREAKER_THRESHOLD = 3;
export const BREAKER_TRIP_MS = 10 * 60_000;

export const MULTIPLIER_MIN = 1;
export const MULTIPLIER_MAX = 8;
export const MULTIPLIER_INCREASE = 2;
export const MULTIPLIER_DECREASE = 0.1;

export const AT_RISK_PARK_MS = 30 * 60_000;

const PERSIST_DEBOUNCE_MS = 3_000;

const PersistedStateSchema = z.object({
  cooldownUntil: z.record(z.string(), z.number()).catch({}),
  breakerUntil: z.record(z.string(), z.number()).catch({}),
  atRisk: z.record(z.string(), AtRiskStateSchema).catch({}),
  requestLog: z.record(z.string(), z.array(z.number())).catch({}),
  allPausedUntil: z.number().catch(0),
});

interface PersistedState {
  schemaVersion: 1;
  cooldownUntil: Partial<Record<Source, number>>;
  breakerUntil: Partial<Record<Source, number>>;
  atRisk: Partial<Record<Source, AtRiskState>>;
  requestLog: Partial<Record<Source, number[]>>;
  allPausedUntil: number;
}

function toSource(key: string): Source | undefined {
  return SOURCES.find((source) => source === key);
}

export const cooldownUntil = new Map<Source, number>();
export const breakerUntil = new Map<Source, number>();
export const breakerCounters = new Map<
  Source,
  { count: number; firstAt: number }
>();
export const atRisk = new Map<Source, AtRiskState>();
export const requestLog = new Map<Source, number[]>();
export const lastRequestAt = new Map<Source, number>();
export const multiplier = new Map<Source, number>();
export const manualPaused = new Set<Source>();
export let allPaused = false;
let loaded = false;
let persistTimer: NodeJS.Timeout | null = null;

export function profile(source: Source): RateProfile {
  return syncConfigFor(source).rate;
}

export function now(): number {
  return Date.now();
}

function statePath(): string {
  return join(app.getPath("userData"), "rate-governor.json");
}

export function loadState(): void {
  if (loaded) return;
  loaded = true;
  let parsed: z.infer<typeof PersistedStateSchema>;
  try {
    parsed = PersistedStateSchema.parse(
      JSON.parse(readFileSync(statePath(), "utf-8")),
    );
  } catch {
    return;
  }

  const t = now();
  for (const [key, until] of Object.entries(parsed.cooldownUntil)) {
    const source = toSource(key);
    if (source && until > t) cooldownUntil.set(source, until);
  }
  for (const [key, until] of Object.entries(parsed.breakerUntil)) {
    const source = toSource(key);
    if (source && until > t) breakerUntil.set(source, until);
  }
  for (const [key, state] of Object.entries(parsed.atRisk)) {
    const source = toSource(key);
    if (source) atRisk.set(source, state);
  }
  for (const [key, entries] of Object.entries(parsed.requestLog)) {
    const source = toSource(key);
    if (source) requestLog.set(source, entries.slice(-500));
  }
  if (parsed.allPausedUntil > t) allPaused = true;

  log.info("[pond governor] loaded persisted state", {
    cooldowns: cooldownUntil.size,
    atRisk: atRisk.size,
  });
}

export function schedulePersist(immediate = false): void {
  if (immediate) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    writeState();
    return;
  }
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeState();
  }, PERSIST_DEBOUNCE_MS);
}

function writeState(): void {
  try {
    const body: PersistedState = {
      schemaVersion: 1,
      cooldownUntil: Object.fromEntries(cooldownUntil),
      breakerUntil: Object.fromEntries(breakerUntil),
      atRisk: Object.fromEntries(atRisk),
      requestLog: Object.fromEntries(requestLog),
      allPausedUntil: allPaused ? now() + 365 * 24 * 60 * 60_000 : 0,
    };
    const file = statePath();
    if (!existsSync(dirname(file)))
      mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  } catch (err) {
    log.warn("[pond governor] failed to persist state", err);
  }
}

export function pauseAll(): void {
  allPaused = true;
  const at = now();
  void getDb().then((db) => {
    const upsert = db.$raw.prepare(
      `INSERT INTO source_gates (
        source, state, reason, version, updated_at
      ) VALUES (?, 'paused', 'global_pause', 1, ?)
      ON CONFLICT(source) DO UPDATE SET
        state = 'paused',
        reason = 'global_pause',
        retry_at = NULL,
        probe_lease_token = NULL,
        probe_lease_expires_at = NULL,
        version = source_gates.version + 1,
        updated_at = excluded.updated_at
      WHERE NOT (
        source_gates.state = 'open'
        AND source_gates.reason = 'auth_required'
        AND COALESCE(source_gates.retry_at, 0) > excluded.updated_at
      )`,
    );
    db.$raw
      .transaction(() => {
        for (const source of SOURCES) upsert.run(source, at);
      })
      .immediate();
  });
  schedulePersist(true);
}

export function resumeAll(): void {
  allPaused = false;
  void getDb().then((db) => {
    const at = now();
    db.$raw
      .prepare(
        `UPDATE source_gates
        SET
          state = 'closed',
          reason = NULL,
          version = version + 1,
          updated_at = ?
        WHERE state = 'paused' AND reason = 'global_pause'`,
      )
      .run(at);
    db.$raw
      .prepare(
        `UPDATE tasks
        SET
          status = 'pending',
          deferred_reason = NULL,
          next_run_at = ?,
          updated_at = ?
        WHERE status = 'deferred' AND deferred_reason = 'queue_paused'`,
      )
      .run(at, at);
  });
  schedulePersist(true);
}

export function isAllPaused(): boolean {
  loadState();
  return allPaused;
}

export function snapshotSourceGate(): PausedState[] {
  loadState();
  const t = now();
  const out = new Map<Source, PausedState>();
  const consider = (
    source: Source,
    until: number,
    reason: PausedReason,
  ): void => {
    if (until <= t) return;
    const prev = out.get(source);
    if (!prev || until > prev.until) out.set(source, { source, until, reason });
  };
  for (const [s, until] of cooldownUntil) consider(s, until, "cooldown");
  for (const [s, until] of breakerUntil) consider(s, until, "breaker");
  for (const [s, st] of atRisk)
    consider(s, st.since + AT_RISK_PARK_MS, "at_risk");
  for (const s of manualPaused) consider(s, Number.MAX_SAFE_INTEGER, "manual");
  return [...out.values()];
}
