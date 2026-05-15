import { app, ipcMain } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import type {
  SuggestionPayload,
  SuggestionResult,
} from "../../../shared/suggestion";
import {
  destroySuggestionWindow,
  getOrCreateSuggestionWindow,
  getSuggestionWindow,
  hideSuggestionWindow,
  showSuggestionWindow,
} from "./window";

interface QueuedSuggestion {
  payload: SuggestionPayload;
  resolve: (result: SuggestionResult) => void;
}

interface ActiveSuggestion {
  payload: SuggestionPayload;
  resolve: (result: SuggestionResult) => void;
  timer: NodeJS.Timeout | null;
}

const DEFAULT_AUTO_DISMISS_MS = 12_000;
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

const queue: QueuedSuggestion[] = [];
const cooldown = new Map<string, number>();
let active: ActiveSuggestion | null = null;
let initialized = false;

export function initSuggestions(): void {
  if (initialized) return;
  initialized = true;

  ipcMain.on(IPC.suggestionReady, (event) => {
    if (!isFromSuggestionWindow(event.sender)) return;
    if (!active) return;
    sendActiveToRenderer();
  });

  ipcMain.on(IPC.suggestionDismiss, (event) => {
    if (!isFromSuggestionWindow(event.sender)) return;
    finishActive("dismissed");
  });

  ipcMain.on(IPC.suggestionAct, (event, actionId: unknown) => {
    if (!isFromSuggestionWindow(event.sender)) return;
    if (typeof actionId !== "string") return;
    finishActive(actionId);
  });

  app.on("before-quit", () => {
    drainQueue();
    destroySuggestionWindow();
  });
}

export function notifyToast(
  payload: SuggestionPayload,
): Promise<SuggestionResult> {
  if (!initialized) initSuggestions();

  if (!payload || typeof payload.key !== "string" || !payload.key) {
    return Promise.reject(new Error("notifyToast: payload.key is required"));
  }

  const now = Date.now();
  const cooldownUntil = cooldown.get(payload.key);
  if (cooldownUntil && cooldownUntil > now) {
    return Promise.resolve({ key: payload.key, outcome: "dismissed" });
  }

  // If this exact key is already active or queued, fold the call into the existing one
  // rather than letting duplicates pile up.
  if (active?.payload.key === payload.key) {
    return Promise.resolve({ key: payload.key, outcome: "dismissed" });
  }
  const queued = queue.find((q) => q.payload.key === payload.key);
  if (queued) {
    return Promise.resolve({ key: payload.key, outcome: "dismissed" });
  }

  return new Promise<SuggestionResult>((resolve) => {
    queue.push({ payload, resolve });
    pump();
  });
}

function pump(): void {
  if (active) return;
  const next = queue.shift();
  if (!next) return;

  active = { payload: next.payload, resolve: next.resolve, timer: null };

  const win = getOrCreateSuggestionWindow();
  showSuggestionWindow();

  // Renderer signals readiness via suggestionReady; if it already loaded,
  // we can push the payload immediately.
  if (!win.webContents.isLoading()) {
    sendActiveToRenderer();
  }
}

function sendActiveToRenderer(): void {
  if (!active) return;
  const win = getSuggestionWindow();
  if (!win) return;
  win.webContents.send(IPC.suggestionShow, active.payload);

  if (active.timer) clearTimeout(active.timer);
  const ms = active.payload.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS;
  if (ms > 0) {
    active.timer = setTimeout(() => finishActive("timed_out"), ms);
  }
}

function finishActive(outcome: string): void {
  if (!active) return;
  if (active.timer) clearTimeout(active.timer);
  const { payload, resolve } = active;
  const cooldownMs = payload.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  active = null;
  cooldown.set(payload.key, Date.now() + cooldownMs);
  hideSuggestionWindow();
  try {
    resolve({ key: payload.key, outcome });
  } catch (err) {
    log.warn("[pond suggestions] resolve threw", err);
  }
  setTimeout(pump, 200);
}

function drainQueue(): void {
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    try {
      item.resolve({ key: item.payload.key, outcome: "dismissed" });
    } catch {
      /* ignore */
    }
  }
  if (active) {
    if (active.timer) clearTimeout(active.timer);
    try {
      active.resolve({ key: active.payload.key, outcome: "dismissed" });
    } catch {
      /* ignore */
    }
    active = null;
  }
}

function isFromSuggestionWindow(
  sender: Electron.WebContents | null | undefined,
): boolean {
  const win = getSuggestionWindow();
  if (!win || !sender) return false;
  return sender.id === win.webContents.id;
}
