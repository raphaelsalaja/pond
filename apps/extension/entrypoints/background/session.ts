import {
  type ExtensionCookie,
  ROTATING_SESSIONS,
  sessionImportResponseSchema,
  sessionRefreshResponseSchema,
} from "@pond/schema/session";
import { SOURCES, type Source } from "@pond/schema/source-ids";
import { z } from "zod";
import { isUnreachable, nativeCall } from "@/utils/native";
import { createSingleFlightTrigger } from "@/utils/single-flight";
import type { PushSessionResult } from "@/utils/types";
import {
  cookieDomainsForSource,
  isCookieSourceUrl,
  rotatedSessionSource,
} from "@/utils/url";

const AUTO_PUSH_COOLDOWN_MS = 60_000;
const ACTIVE_PROBE_MS = 30_000;
const IDLE_PROBE_MS = 5 * 60_000;
const SESSION_ALARM = "pond-session";
const SCHEDULER_STORAGE_KEY = "sessionPushScheduler";
/** A rotation reissues several cookies at once; forward them together. */
const ROTATION_SETTLE_MS = 5_000;
const FOLLOW_STORAGE_KEY = "sessionFollow";

const followStateSchema = z.object({
  /** Rotations Pond missed while it was closed, retried on the session alarm. */
  missed: z.array(z.enum(SOURCES)).catch([]),
  /** Sources with no Account in Pond, skipped until you connect one. */
  untracked: z.array(z.enum(SOURCES)).catch([]),
});

type FollowState = z.infer<typeof followStateSchema>;

const pendingSessionSchema = z.object({ source: z.enum(SOURCES) });
const schedulerStateSchema = z.object({
  nextProbeAt: z.number().catch(0),
  failures: z.number().int().nonnegative().catch(0),
  pending: z.boolean().catch(false),
  lastPushAt: z.number().catch(0),
  lastPushSource: z.enum(SOURCES).nullable().catch(null),
});

type SchedulerState = z.infer<typeof schedulerStateSchema>;
type PendingProbe =
  | { kind: "pending"; source: Source }
  | { kind: "idle" }
  | { kind: "offline" };

const DEFAULT_SCHEDULER_STATE: SchedulerState = {
  nextProbeAt: 0,
  failures: 0,
  pending: false,
  lastPushAt: 0,
  lastPushSource: null,
};

function cookieFromBrowser(c: chrome.cookies.Cookie): ExtensionCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: normaliseSameSite(c.sameSite),
    expirationDate: c.expirationDate ?? null,
    hostOnly: c.hostOnly,
  };
}

function normaliseSameSite(
  s: chrome.cookies.Cookie["sameSite"],
): ExtensionCookie["sameSite"] {
  if (s === "no_restriction" || s === "lax" || s === "strict") return s;
  return "unspecified";
}

/** Live-tab cookies for explicit saves; archive_page writes them into a throwaway partition then drops them. */
export async function cookiesForUrl(url: string): Promise<ExtensionCookie[]> {
  try {
    const page = new URL(url);
    if (page.protocol !== "http:" && page.protocol !== "https:") return [];
    const [byUrl, byDomain] = await Promise.all([
      browser.cookies.getAll({ url }),
      browser.cookies.getAll({ domain: page.hostname }),
    ]);
    const seen = new Set<string>();
    const out: ExtensionCookie[] = [];
    for (const c of [...byUrl, ...byDomain]) {
      const key = `${c.name}\0${c.domain}\0${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cookieFromBrowser(c));
      if (out.length >= 500) break;
    }
    return out;
  } catch (err) {
    console.warn("[pond] cookiesForUrl failed", err);
    return [];
  }
}

async function pushSession(source: Source): Promise<PushSessionResult> {
  const domains = cookieDomainsForSource(source);
  if (domains.length === 0) {
    return { ok: false, reason: "no_cookies", detail: "source is public" };
  }

  const raw: chrome.cookies.Cookie[] = [];
  try {
    const batches = await Promise.all(
      domains.map((domain) => browser.cookies.getAll({ domain })),
    );
    const seen = new Set<string>();
    for (const cookie of batches.flat()) {
      const key = `${cookie.name}\0${cookie.domain}\0${cookie.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push(cookie);
    }
  } catch (err) {
    return {
      ok: false,
      reason: "no_cookies",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const result = await nativeCall({
    type: "session.import",
    source,
    cookies: raw.map(cookieFromBrowser),
  });
  if (!result.ok) {
    return { ok: false, reason: "network", detail: result.error };
  }
  const imported = sessionImportResponseSchema.safeParse(result.data);
  if (!imported.success) {
    return { ok: false, reason: "network", detail: "bad response shape" };
  }
  if (imported.data.connected) {
    await queueSessionFollow(async () => {
      const follow = await readFollowState();
      await writeFollowState({
        ...follow,
        untracked: follow.untracked.filter((s) => s !== source),
      });
    });
  }
  return { ok: true, data: imported.data };
}

async function readFollowState(): Promise<FollowState> {
  const stored = await browser.storage.session.get(FOLLOW_STORAGE_KEY);
  return followStateSchema
    .catch({ missed: [], untracked: [] })
    .parse(stored[FOLLOW_STORAGE_KEY]);
}

async function writeFollowState(state: FollowState): Promise<void> {
  await browser.storage.session.set({ [FOLLOW_STORAGE_KEY]: state });
}

let followUpdates = Promise.resolve();

function queueSessionFollow(run: () => Promise<void>): Promise<void> {
  const next = followUpdates.then(run);
  followUpdates = next.catch(() => {});
  return next;
}

function forwardRotation(source: Source): Promise<void> {
  return queueSessionFollow(() => refreshSession(source));
}

async function refreshSession(source: Source): Promise<void> {
  const session = ROTATING_SESSIONS.get(source);
  const state = await readFollowState();
  if (!session || state.untracked.includes(source)) return;

  const cookies = await browser.cookies.getAll({ domain: session.domain });
  const result = await nativeCall({
    type: "session.refresh",
    source,
    cookies: cookies.slice(0, 500).map(cookieFromBrowser),
  });
  const missed = state.missed.filter((s) => s !== source);
  const next: FollowState = { ...state, missed };
  if (!result.ok) {
    if (isUnreachable(result.error)) next.missed = [...missed, source];
  } else {
    const refresh = sessionRefreshResponseSchema.safeParse(result.data);
    if (refresh.success && !refresh.data.tracked) {
      next.untracked = [...state.untracked, source];
    }
  }
  await writeFollowState(next);
}

/** Forwards each session your browser rotates, so Pond's copy of it stays signed in. */
export function startSessionFollow(): void {
  const settling = new Map<Source, ReturnType<typeof setTimeout>>();
  void (async () => {
    for (const source of ROTATING_SESSIONS.keys()) {
      try {
        await forwardRotation(source);
      } catch (err) {
        console.warn("[pond] session refresh failed", source, err);
      }
    }
  })();
  browser.cookies.onChanged?.addListener(({ cookie, removed }) => {
    if (removed) return;
    const source = rotatedSessionSource(cookie);
    if (!source) return;
    clearTimeout(settling.get(source));
    settling.set(
      source,
      setTimeout(() => {
        settling.delete(source);
        void forwardRotation(source).catch((err) =>
          console.warn("[pond] session refresh failed", source, err),
        );
      }, ROTATION_SETTLE_MS),
    );
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SESSION_ALARM) return;
    void readFollowState().then(({ missed }) => {
      for (const source of missed) void forwardRotation(source);
    });
  });
}

async function fetchPendingSource(): Promise<PendingProbe> {
  const result = await nativeCall({ type: "session.pending" });
  if (!result.ok) return { kind: "offline" };
  const pending = pendingSessionSchema.safeParse(result.data);
  return pending.success
    ? { kind: "pending", source: pending.data.source }
    : { kind: "idle" };
}

async function readSchedulerState(): Promise<SchedulerState> {
  const stored = await browser.storage.session.get(SCHEDULER_STORAGE_KEY);
  return schedulerStateSchema
    .catch(DEFAULT_SCHEDULER_STATE)
    .parse(stored[SCHEDULER_STORAGE_KEY]);
}

async function writeSchedulerState(state: SchedulerState): Promise<void> {
  await browser.storage.session.set({ [SCHEDULER_STORAGE_KEY]: state });
}

function scheduleSessionAlarm(pending: boolean): void {
  browser.alarms.create(SESSION_ALARM, {
    periodInMinutes: pending ? 0.5 : 5,
  });
}

async function markSchedulerIdle(): Promise<void> {
  await writeSchedulerState({
    ...DEFAULT_SCHEDULER_STATE,
    nextProbeAt: Date.now() + IDLE_PROBE_MS,
  });
  scheduleSessionAlarm(false);
}

/** Hands signed-in cookies to Pond whenever it is waiting to connect a source. */
export function startSessionConnect(onConnected: () => void): void {
  const maybeAutoPush = createSingleFlightTrigger(async (force) => {
    const now = Date.now();
    const state = await readSchedulerState();
    if (!force && now < state.nextProbeAt) return;

    const probeResult = await fetchPendingSource();
    if (probeResult.kind === "idle") {
      await markSchedulerIdle();
      return;
    }
    if (probeResult.kind === "offline") {
      const failures = state.failures + 1;
      const delay = Math.min(
        IDLE_PROBE_MS,
        ACTIVE_PROBE_MS * 2 ** Math.min(failures - 1, 4),
      );
      await writeSchedulerState({
        ...state,
        failures,
        nextProbeAt: now + delay,
      });
      scheduleSessionAlarm(state.pending);
      return;
    }

    const pending = probeResult.source;
    if (cookieDomainsForSource(pending).length === 0) {
      await markSchedulerIdle();
      return;
    }

    const nextState: SchedulerState = {
      ...state,
      failures: 0,
      pending: true,
      nextProbeAt: now + ACTIVE_PROBE_MS,
    };
    scheduleSessionAlarm(true);
    if (
      state.lastPushSource === pending &&
      now - state.lastPushAt < AUTO_PUSH_COOLDOWN_MS
    ) {
      await writeSchedulerState(nextState);
      return;
    }

    nextState.lastPushSource = pending;
    nextState.lastPushAt = now;
    await writeSchedulerState(nextState);
    const result = await pushSession(pending);
    if (result.ok && result.data.connected) {
      await markSchedulerIdle();
      onConnected();
      return;
    }
    if (result.ok) return;
    if (result.reason === "network") {
      console.warn("[pond] auto-push failed", result.detail);
    }
  });

  browser.tabs.onActivated.addListener((info) => {
    void browser.tabs
      .get(info.tabId)
      .then((tab) => {
        void maybeAutoPush(Boolean(tab.url && isCookieSourceUrl(tab.url)));
      })
      .catch(() => {
        void maybeAutoPush();
      });
  });

  browser.tabs.onUpdated.addListener((_id, change, tab) => {
    if (change.status !== "complete" || !tab.url) return;
    if (!isCookieSourceUrl(tab.url)) return;
    void maybeAutoPush(true);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SESSION_ALARM) void maybeAutoPush();
  });

  void readSchedulerState()
    .then((state) => scheduleSessionAlarm(state.pending))
    .catch(() => scheduleSessionAlarm(false))
    .finally(() => maybeAutoPush(true));
}
