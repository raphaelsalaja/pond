import type { Source } from "@pond/schema/db";
import type {
  ExtensionCookie,
  SessionImportResponse,
} from "@pond/schema/session";
import {
  DEFAULT_SETTINGS,
  enqueueUrl,
  normalizeStoredSettings,
  type PondMessage,
  type PondSettings,
  type PushSessionResult,
  sessionImportUrl,
} from "@/utils/types";
import { cookieDomainForSource } from "@/utils/url";

export default defineBackground(() => {
  async function getSettings(): Promise<PondSettings> {
    const stored = await chrome.storage.local.get("settings");
    return normalizeStoredSettings(stored.settings);
  }

  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.local.get("settings");
    if (!existing.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    clearStaleBadge();
  });

  chrome.runtime.onStartup.addListener(() => {
    clearStaleBadge();
  });

  clearStaleBadge();

  function clearStaleBadge(): void {
    if (!chrome.action) return;
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener(
    (msg: PondMessage, sender, sendResponse) => {
      if (msg.kind === "log") {
        const fn =
          msg.level === "error"
            ? console.error
            : msg.level === "warn"
              ? console.warn
              : console.info;
        fn("[pond]", msg.message, msg.data);
        return false;
      }

      if (msg.kind === "capture") {
        handleCapture(msg.payload, sender.tab?.id)
          .then((ok) => sendResponse({ ok }))
          .catch((err) => {
            console.error("[pond] capture failed", err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      if (msg.kind === "pushSession") {
        pushSession(msg.source)
          .then((result) => sendResponse(result))
          .catch((err) => {
            console.error("[pond] pushSession threw", err);
            sendResponse({
              ok: false,
              reason: "network",
              detail: String(err),
            } satisfies PushSessionResult);
          });
        return true;
      }
      return false;
    },
  );

  async function pushSession(source: Source): Promise<PushSessionResult> {
    const settings = await getSettings();
    if (!settings.apiKey) {
      return { ok: false, reason: "unpaired" };
    }
    const domain = cookieDomainForSource(source);
    if (!domain) {
      return { ok: false, reason: "no_cookies", detail: "source is public" };
    }

    let raw: chrome.cookies.Cookie[];
    try {
      raw = await chrome.cookies.getAll({ domain });
    } catch (err) {
      return {
        ok: false,
        reason: "no_cookies",
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    if (raw.length === 0) {
      return { ok: false, reason: "no_cookies" };
    }

    const cookies: ExtensionCookie[] = raw.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: normaliseSameSite(c.sameSite),
      expirationDate:
        typeof c.expirationDate === "number" ? c.expirationDate : null,
      hostOnly: c.hostOnly,
    }));

    let res: Response;
    try {
      res = await fetch(sessionImportUrl(settings.port), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({ source, cookies }),
      });
    } catch (err) {
      return {
        ok: false,
        reason: "network",
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: "network", detail };
    }

    const body = (await res.json()) as {
      status?: string;
      data?: SessionImportResponse;
    };
    if (body.status !== "success" || !body.data) {
      return { ok: false, reason: "network", detail: "bad response shape" };
    }
    return { ok: true, data: body.data };
  }

  function normaliseSameSite(s: unknown): ExtensionCookie["sameSite"] {
    if (s === "no_restriction" || s === "lax" || s === "strict") return s;
    return "unspecified";
  }

  async function handleCapture(
    payload: { url: string; trigger?: string },
    tabId?: number,
  ): Promise<boolean> {
    if (!payload || typeof payload.url !== "string") return false;
    const settings = await getSettings();
    if (!settings.apiKey) {
      console.warn("[pond] missing apiKey; pair the extension via the popup");
      flashBadge(tabId, "!", "#dd9b00");
      return false;
    }

    let res: Response;
    try {
      res = await fetch(enqueueUrl(settings.port), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          url: payload.url,
          ...(payload.trigger ? { trigger: payload.trigger } : {}),
        }),
      });
    } catch (err) {
      console.error("[pond] enqueue fetch failed", err);
      flashBadge(tabId, "x", "#cc3333");
      return false;
    }

    if (!res.ok) {
      console.warn("[pond] enqueue rejected", res.status, await res.text());
      flashBadge(tabId, "x", "#cc3333");
      return false;
    }
    flashBadge(tabId, "ok", "#1f9d55");
    return true;
  }

  function flashBadge(tabId: number | undefined, text: string, color: string) {
    if (!chrome.action) return;
    const opts: { text: string; tabId?: number } = { text };
    const colorOpts: { color: string; tabId?: number } = { color };
    if (typeof tabId === "number") {
      opts.tabId = tabId;
      colorOpts.tabId = tabId;
    }
    chrome.action.setBadgeBackgroundColor(colorOpts);
    chrome.action.setBadgeText(opts);
    setTimeout(() => {
      const clear: { text: string; tabId?: number } = { text: "" };
      if (typeof tabId === "number") clear.tabId = tabId;
      chrome.action.setBadgeText(clear);
    }, 1500);
  }
});
