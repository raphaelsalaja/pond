import type { Source } from "@pond/schema/db";
import type {
  ExtensionCookie,
  SessionImportResponse,
} from "@pond/schema/session";
import { onMessage } from "@/utils/messaging";
import { ensureSettings, getSettings } from "@/utils/settings";
import {
  enqueueUrl,
  type PondSettings,
  type PushSessionResult,
  sessionImportUrl,
  sessionPendingUrl,
} from "@/utils/types";
import { cookieDomainForSource, hostToSource } from "@/utils/url";

const AUTO_PUSH_COOLDOWN_MS = 60_000;

export default defineBackground(() => {
  const recentAutoPush = new Map<Source, number>();
  let autoPushInFlight = false;

  chrome.runtime.onInstalled.addListener(async () => {
    await ensureSettings();
    clearStaleBadge();
  });

  chrome.runtime.onStartup.addListener(clearStaleBadge);

  clearStaleBadge();

  function clearStaleBadge(): void {
    if (!chrome.action) return;
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }

  onMessage("log", ({ data }) => {
    const fn =
      data.level === "error"
        ? console.error
        : data.level === "warn"
          ? console.warn
          : console.info;
    fn("[pond]", data.message, data.data);
  });

  onMessage("capture", ({ data, sender }) =>
    handleCapture(data, sender.tab?.id).catch((err) => {
      console.error("[pond] capture failed", err);
      return false;
    }),
  );

  onMessage("openPond", ({ data }) => openPondTab(data));

  onMessage("pushSession", ({ data }) =>
    pushSession(data).catch((err) => {
      console.error("[pond] pushSession threw", err);
      return {
        ok: false,
        reason: "network",
        detail: String(err),
      } satisfies PushSessionResult;
    }),
  );

  chrome.tabs.onActivated.addListener(() => {
    void maybeAutoPush();
  });

  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.status === "complete" || info.url) void maybeAutoPush();
  });

  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.removed) return;
    void maybeAutoPush();
  });

  async function openPondTab(path: string | undefined): Promise<boolean> {
    const target = path ? `pond://${path}` : "pond://";
    try {
      await chrome.tabs.create({ url: target, active: true });
      return true;
    } catch (err) {
      console.error("[pond] openPond failed", err);
      return false;
    }
  }

  async function fetchPendingSource(
    settings: PondSettings,
  ): Promise<Source | null> {
    try {
      const res = await fetch(sessionPendingUrl(settings.port), {
        headers: { authorization: `Bearer ${settings.apiKey}` },
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        status?: string;
        data?: { source?: Source } | null;
      };
      if (body.status !== "success" || !body.data?.source) return null;
      return body.data.source;
    } catch {
      return null;
    }
  }

  async function maybeAutoPush(): Promise<void> {
    if (autoPushInFlight) return;
    autoPushInFlight = true;
    try {
      const settings = await getSettings();
      if (!settings.apiKey) {
        // #region agent log
        if (
          !(globalThis as { __pondDbgUnpaired?: boolean }).__pondDbgUnpaired
        ) {
          (globalThis as { __pondDbgUnpaired?: boolean }).__pondDbgUnpaired =
            true;
          fetch(
            "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "d09e18",
              },
              body: JSON.stringify({
                sessionId: "d09e18",
                hypothesisId: "H1",
                location: "background.ts:maybeAutoPush",
                message: "auto-push skipped: unpaired",
                data: {},
                timestamp: Date.now(),
              }),
            },
          ).catch(() => {});
        }
        // #endregion
        return;
      }

      const pending = await fetchPendingSource(settings);
      if (!pending || !cookieDomainForSource(pending)) return;

      const last = recentAutoPush.get(pending);
      if (last && Date.now() - last < AUTO_PUSH_COOLDOWN_MS) return;

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.url) return;
      const tabSource = hostToSource(tab.url);
      if (tabSource !== pending) {
        // #region agent log
        fetch(
          "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "d09e18",
            },
            body: JSON.stringify({
              sessionId: "d09e18",
              hypothesisId: "H1",
              location: "background.ts:maybeAutoPush",
              message: "auto-push skipped: tab mismatch",
              data: { pending, tabSource, tabUrl: tab.url.slice(0, 80) },
              timestamp: Date.now(),
            }),
          },
        ).catch(() => {});
        // #endregion
        return;
      }

      recentAutoPush.set(pending, Date.now());
      const result = await pushSession(pending);
      // #region agent log
      fetch(
        "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "d09e18",
          },
          body: JSON.stringify({
            sessionId: "d09e18",
            hypothesisId: "H2",
            location: "background.ts:maybeAutoPush",
            message: "auto-push result",
            data: {
              pending,
              ok: result.ok,
              connected: result.ok ? result.data.connected : null,
              reason: result.ok ? (result.data.reason ?? null) : result.reason,
              importReason: result.ok ? (result.data.reason ?? null) : null,
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      if (result.ok && result.data.connected) {
        flashBadge(tab.id, "ok", "#1f9d55");
        return;
      }
      recentAutoPush.delete(pending);
      if (result.ok) return;
      if (result.reason === "network") {
        console.warn("[pond] auto-push failed", result.detail);
      }
    } finally {
      autoPushInFlight = false;
    }
  }

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
    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "384c19",
      },
      body: JSON.stringify({
        sessionId: "384c19",
        hypothesisId: "C",
        location: "background.ts:handleCapture",
        message: "capture received",
        data: {
          url: payload.url,
          trigger: payload.trigger ?? null,
          paired: Boolean(settings.apiKey),
          port: settings.port,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!settings.apiKey) {
      console.warn("[pond] missing apiKey; pair the extension via the toolbar");
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
      // #region agent log
      fetch(
        "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "384c19",
          },
          body: JSON.stringify({
            sessionId: "384c19",
            hypothesisId: "E",
            location: "background.ts:handleCapture",
            message: "enqueue fetch failed",
            data: {
              url: payload.url,
              detail: err instanceof Error ? err.message : String(err),
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      console.error("[pond] enqueue fetch failed", err);
      flashBadge(tabId, "x", "#cc3333");
      return false;
    }

    if (!res.ok) {
      const bodyText = await res.text();
      // #region agent log
      fetch(
        "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "384c19",
          },
          body: JSON.stringify({
            sessionId: "384c19",
            hypothesisId: "E",
            location: "background.ts:handleCapture",
            message: "enqueue rejected",
            data: {
              url: payload.url,
              status: res.status,
              body: bodyText.slice(0, 300),
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      console.warn("[pond] enqueue rejected", res.status, bodyText);
      flashBadge(tabId, "x", "#cc3333");
      return false;
    }
    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "384c19",
      },
      body: JSON.stringify({
        sessionId: "384c19",
        hypothesisId: "A",
        location: "background.ts:handleCapture",
        message: "enqueue accepted",
        data: { url: payload.url, trigger: payload.trigger ?? null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
