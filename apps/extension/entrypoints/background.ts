import type { Source } from "@pond/schema/db";
import type {
  ExtensionCookie,
  SessionImportResponse,
} from "@pond/schema/session";
import { type ScrapedSave, scrapeFnFor } from "@/utils/scrape";
import {
  DEFAULT_SETTINGS,
  type PondMessage,
  type PondSettings,
  type PushSessionResult,
  SESSION_IMPORT_URL,
} from "@/utils/types";
import { cookieDomainForSource, sourceLabel, urlToSource } from "@/utils/url";

export default defineBackground(() => {
  const MENU_PAGE = "pond:save-page";
  const MENU_LINK = "pond:save-link";

  async function getSettings(): Promise<PondSettings> {
    const stored = await chrome.storage.local.get("settings");
    return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
  }

  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.local.get("settings");
    if (!existing.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    registerContextMenus();
    clearStaleBadge();
  });

  chrome.runtime.onStartup.addListener(() => {
    registerContextMenus();
    clearStaleBadge();
  });

  clearStaleBadge();

  function clearStaleBadge(): void {
    if (!chrome.action) return;
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }

  function registerContextMenus() {
    if (!chrome.contextMenus) return;
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_PAGE,
        title: "Save this page to Pond",
        contexts: ["page", "image", "video"],
      });
      chrome.contextMenus.create({
        id: MENU_LINK,
        title: "Save this link to Pond",
        contexts: ["link"],
      });
    });
  }

  chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_LINK && info.linkUrl) {
      await captureUrl(info.linkUrl, tab?.id);
      return;
    }
    if (info.menuItemId === MENU_PAGE) {
      const url = info.pageUrl ?? tab?.url;
      if (url) await captureUrl(url, tab?.id);
    }
  });

  chrome.commands?.onCommand.addListener(async (command) => {
    if (command !== "save-current-page") return;
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.url) await captureUrl(tab.url, tab.id);
  });

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

      if (msg.kind === "manualCapture") {
        captureUrl(msg.url, sender.tab?.id)
          .then((ok) => sendResponse({ ok }))
          .catch((err) => {
            console.error("[pond] manual capture failed", err);
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
    if (!settings.endpoint || !settings.apiKey) {
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
      res = await fetch(SESSION_IMPORT_URL, {
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

  async function captureUrl(rawUrl: string, tabId?: number): Promise<boolean> {
    const resolved = urlToSource(rawUrl);
    if (!resolved) {
      console.warn("[pond] manual capture: unsupported URL", rawUrl);
      flashBadge(tabId, "?", "#dd9b00");
      return false;
    }
    console.info(
      "[pond] manual capture",
      sourceLabel(resolved.source),
      resolved.sourceId,
    );

    const scraped = await scrapeActiveTab(resolved.source, tabId, rawUrl);
    if (scraped) {
      console.info("[pond] scraped page metadata", scraped);
    }

    const raw: Record<string, unknown> = {
      via: "manual",
      capturedAt: new Date().toISOString(),
    };
    if (scraped?.videoUrl) raw.videoUrl = scraped.videoUrl;

    return handleCapture(
      {
        source: resolved.source,
        sourceId: resolved.sourceId,
        url: resolved.url,
        title: scraped?.title,
        description: scraped?.description,
        author: scraped?.author,
        mediaUrl: scraped?.mediaUrl,
        mediaUrls: scraped?.mediaUrls?.map((m) => ({
          url: m.url,
          type: m.type,
          poster: m.poster,
          width: m.width,
          height: m.height,
        })),
        mediaType: scraped?.mediaType,
        raw,
      },
      tabId,
    );
  }

  async function scrapeActiveTab(
    source: Source,
    tabId: number | undefined,
    rawUrl: string,
  ): Promise<ScrapedSave | null> {
    const fn = scrapeFnFor(source);
    if (!fn) return null;

    let target = tabId;
    if (target === undefined) {
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      target = active?.id;
    }
    if (target === undefined) return null;

    try {
      const tab = await chrome.tabs.get(target);
      const tabUrl = tab.url ?? "";
      if (!sameHost(tabUrl, rawUrl)) return null;

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: target },
        world: "MAIN",
        func: fn,
      });
      return (result?.result as ScrapedSave | undefined) ?? null;
    } catch (err) {
      console.warn("[pond] scrapeActiveTab failed", err);
      return null;
    }
  }

  function sameHost(a: string, b: string): boolean {
    try {
      return new URL(a).hostname === new URL(b).hostname;
    } catch {
      return false;
    }
  }

  async function handleCapture(
    payload: unknown,
    tabId?: number,
  ): Promise<boolean> {
    const settings = await getSettings();
    if (!settings.endpoint || !settings.apiKey) {
      console.warn(
        "[pond] missing endpoint or apiKey; configure in the extension popup",
      );
      flashBadge(tabId, "!", "#dd9b00");
      return false;
    }

    console.info("[pond] sending capture", {
      endpoint: settings.endpoint,
      payload,
    });

    let res: Response;
    try {
      res = await fetch(settings.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[pond] ingest fetch failed", err);
      flashBadge(tabId, "x", "#cc3333");
      return false;
    }

    if (!res.ok) {
      console.warn("[pond] ingest rejected", res.status, await res.text());
      flashBadge(tabId, "x", "#cc3333");
      return false;
    }
    console.info("[pond] ingest ok", await res.json());
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
