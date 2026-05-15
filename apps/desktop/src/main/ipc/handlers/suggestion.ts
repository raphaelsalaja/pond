import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import type {
  SuggestionAction,
  SuggestionPayload,
  SuggestionResult,
} from "../../../shared/suggestion";
import { showNotification } from "../../core/notifications";
import { notifyToast } from "../../core/suggestions";
import { safeHandle } from "../helpers";

export function registerSuggestionHandlers(): void {
  safeHandle(
    IPC.suggestionNotify,
    async (_, raw: unknown): Promise<SuggestionResult> => {
      const payload = parsePayload(raw);
      if (!payload) {
        return { key: "invalid", outcome: "dismissed" };
      }
      try {
        return await notifyToast(payload);
      } catch (err) {
        log.warn("[pond ipc] suggestionNotify failed", err);
        return { key: payload.key, outcome: "dismissed" };
      }
    },
  );

  safeHandle(
    IPC.notificationShow,
    async (
      _,
      raw: unknown,
    ): Promise<{ ok: boolean; reason?: "unsupported" | "invalid" }> => {
      if (!raw || typeof raw !== "object") {
        return { ok: false, reason: "invalid" };
      }
      const obj = raw as Record<string, unknown>;
      if (typeof obj.title !== "string" || !obj.title) {
        return { ok: false, reason: "invalid" };
      }
      const ok = showNotification({
        title: obj.title,
        body: typeof obj.body === "string" ? obj.body : undefined,
        silent: typeof obj.silent === "boolean" ? obj.silent : undefined,
      });
      return ok ? { ok: true } : { ok: false, reason: "unsupported" };
    },
  );
}

function parsePayload(raw: unknown): SuggestionPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.key !== "string" || !obj.key) return null;
  if (typeof obj.title !== "string" || !obj.title) return null;
  const actions = parseActions(obj.actions);
  if (actions.length === 0) return null;
  return {
    key: obj.key,
    title: obj.title,
    body: typeof obj.body === "string" ? obj.body : undefined,
    icons: parseIcons(obj.icons),
    actions,
    autoDismissMs:
      typeof obj.autoDismissMs === "number" ? obj.autoDismissMs : undefined,
    cooldownMs: typeof obj.cooldownMs === "number" ? obj.cooldownMs : undefined,
  };
}

function parseActions(raw: unknown): SuggestionAction[] {
  if (!Array.isArray(raw)) return [];
  const out: SuggestionAction[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.id !== "string" || !obj.id) continue;
    if (typeof obj.label !== "string" || !obj.label) continue;
    const shortcut =
      obj.shortcut === "esc" || obj.shortcut === "enter"
        ? obj.shortcut
        : undefined;
    const variant =
      obj.variant === "primary" ||
      obj.variant === "secondary" ||
      obj.variant === "ghost"
        ? obj.variant
        : undefined;
    out.push({ id: obj.id, label: obj.label, shortcut, variant });
  }
  return out;
}

function parseIcons(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry) continue;
    if (
      !entry.startsWith("https://") &&
      !entry.startsWith("data:") &&
      !entry.startsWith("pond://")
    )
      continue;
    out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}
