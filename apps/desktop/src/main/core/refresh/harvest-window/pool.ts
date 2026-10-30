import { SOURCES, type Source } from "@pond/schema/db";
import type { ReportDownloadActivity } from "@shared/download-activity";
import { BrowserWindow, session } from "electron";
import { resolvePreload } from "../../../lib/resolve-preload";
import { acquire, sourcePausedUntil } from "../../pipeline/rate-governor";
import { browserUserAgent, PARTITION } from "./constants";

export const GLOBAL_POOL_CAP = 3;

/** Idle windows keep a heavy SPA resident in a full renderer process; blank on release and tear down after this grace so a finished sync doesn't pin CPU/memory. */
const IDLE_EVICT_MS = 60_000;

const PER_SOURCE_CAP = {
  twitter: 3,
  instagram: 2,
  tiktok: 2,
  youtube: 2,
  cosmos: 2,
  pinterest: 2,
  arena: 2,
  reddit: 2,
  threads: 2,
  github: 2,
  substack: 2,
  tumblr: 2,
  savee: 2,
  behance: 1,
  vimeo: 1,
  dribbble: 1,
  unsplash: 1,
  bluesky: 1,
  marked: 1,
  web: 2,
  local: 0,
} satisfies Record<Source, number>;

interface PoolSlot {
  win: BrowserWindow;
  /** Session partition the window was created on; immutable per window, so serving another account means replacing the window. */
  partition: string;
  busy: boolean;
  source: Source | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
}

interface Waiter {
  partition: string;
  resolve: (slot: PoolSlot) => void;
}

const pool: PoolSlot[] = [];
const busyBySource = {
  twitter: 0,
  instagram: 0,
  tiktok: 0,
  youtube: 0,
  cosmos: 0,
  pinterest: 0,
  arena: 0,
  reddit: 0,
  threads: 0,
  github: 0,
  substack: 0,
  tumblr: 0,
  savee: 0,
  behance: 0,
  vimeo: 0,
  dribbble: 0,
  unsplash: 0,
  bluesky: 0,
  marked: 0,
  web: 0,
  local: 0,
} satisfies Record<Source, number>;
const waitQueues = new Map<Source, Waiter[]>();
let roundRobinCursor = 0;

function queueFor(source: Source): Waiter[] {
  const existing = waitQueues.get(source);
  if (existing) return existing;
  const created: Waiter[] = [];
  waitQueues.set(source, created);
  return created;
}

function createHiddenWindow(partition: string): BrowserWindow {
  const persistent = session.fromPartition(partition);
  persistent.setUserAgent(browserUserAgent());

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1024,
    webPreferences: {
      session: persistent,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolvePreload("scrape.cjs"),
      plugins: false,
      webgl: false,
      autoplayPolicy: "document-user-activation-required",
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.setAudioMuted(true);
  win.on("closed", () => {
    const idx = pool.findIndex((s) => s.win === win);
    if (idx !== -1) pool.splice(idx, 1);
  });
  return win;
}

interface Lease {
  win: BrowserWindow;
  release: () => void;
}

function cancelEviction(slot: PoolSlot): void {
  if (slot.evictTimer) {
    clearTimeout(slot.evictTimer);
    slot.evictTimer = null;
  }
}

function blankAndScheduleEviction(slot: PoolSlot): void {
  cancelEviction(slot);
  if (slot.win.isDestroyed()) return;
  void slot.win.loadURL("about:blank").catch(() => {});
  slot.evictTimer = setTimeout(() => {
    slot.evictTimer = null;
    if (!slot.busy && !slot.win.isDestroyed()) slot.win.destroy();
  }, IDLE_EVICT_MS);
  slot.evictTimer.unref?.();
}

function claimSlot(slot: PoolSlot, source: Source): Lease {
  cancelEviction(slot);
  slot.busy = true;
  slot.source = source;
  busyBySource[source] += 1;
  let released = false;
  return {
    win: slot.win,
    release: () => {
      if (released) return;
      released = true;
      slot.busy = false;
      slot.source = null;
      busyBySource[source] = Math.max(0, busyBySource[source] - 1);
      drainQueues();
      if (!slot.busy) blankAndScheduleEviction(slot);
    },
  };
}

interface LeaseOptions {
  firstSync?: boolean;
  signal?: AbortSignal;
  partition?: string;
  reportActivity?: ReportDownloadActivity;
}

function retargetSlot(slot: PoolSlot, partition: string): void {
  if (slot.partition === partition) return;
  const old = slot.win;
  slot.win = createHiddenWindow(partition);
  slot.partition = partition;
  if (!old.isDestroyed()) old.destroy();
}

function enqueueWaiter(
  source: Source,
  partition: string,
  signal: AbortSignal | undefined,
): Promise<Lease> {
  return new Promise<Lease>((resolve, reject) => {
    const waiter: Waiter = {
      partition,
      resolve: (slot) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(claimSlot(slot, source));
      },
    };
    const onAbort = (): void => {
      const queue = queueFor(source);
      const idx = queue.indexOf(waiter);
      if (idx !== -1) queue.splice(idx, 1);
      reject(new Error("window lease wait aborted"));
    };
    if (signal?.aborted) {
      reject(new Error("window lease wait aborted"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    queueFor(source).push(waiter);
  });
}

export async function leaseWindow(
  source: Source,
  opts: LeaseOptions = {},
): Promise<Lease> {
  const partition = opts.partition ?? PARTITION;
  if (opts.reportActivity && sourcePausedUntil(source) > 0) {
    opts.reportActivity({ phase: "waiting" });
  }
  await acquire(source, { firstSync: opts.firstSync, signal: opts.signal });
  if (busyBySource[source] >= PER_SOURCE_CAP[source]) {
    return enqueueWaiter(source, partition, opts.signal);
  }
  const idle =
    pool.find(
      (s) => !s.busy && !s.win.isDestroyed() && s.partition === partition,
    ) ?? pool.find((s) => !s.busy && !s.win.isDestroyed());
  if (idle) {
    retargetSlot(idle, partition);
    return claimSlot(idle, source);
  }
  if (pool.length < GLOBAL_POOL_CAP) {
    const win = createHiddenWindow(partition);
    const slot: PoolSlot = {
      win,
      partition,
      busy: false,
      source: null,
      evictTimer: null,
    };
    pool.push(slot);
    return claimSlot(slot, source);
  }
  return enqueueWaiter(source, partition, opts.signal);
}

function drainQueues(): void {
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < SOURCES.length; i += 1) {
      const source = SOURCES[(roundRobinCursor + i) % SOURCES.length];
      if (!source) continue;
      const queue = queueFor(source);
      if (queue.length === 0) continue;
      if (busyBySource[source] >= PER_SOURCE_CAP[source]) continue;
      const next = queue[0];
      if (!next) continue;
      const idle =
        pool.find(
          (s) =>
            !s.busy && !s.win.isDestroyed() && s.partition === next.partition,
        ) ?? pool.find((s) => !s.busy && !s.win.isDestroyed());
      if (!idle) return;
      queue.shift();
      retargetSlot(idle, next.partition);
      next.resolve(idle);
      roundRobinCursor = (SOURCES.indexOf(source) + 1) % SOURCES.length;
      progress = true;
    }
  }
}

export function disposeHiddenWindow(): void {
  for (const slot of pool) {
    cancelEviction(slot);
    if (!slot.win.isDestroyed()) slot.win.destroy();
  }
  pool.length = 0;
  for (const source of SOURCES) {
    queueFor(source).length = 0;
    busyBySource[source] = 0;
  }
}
