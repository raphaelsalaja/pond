import { DEFAULT_SETTINGS, type PondMessage, type PondSettings } from "./shared/types";
import { scrapeFnFor, type ScrapedSave } from "./shared/scrape";
import { urlToSource, sourceLabel } from "./shared/url";
import type { Source } from "@pond/schema/db";

async function getSettings(): Promise<PondSettings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

const MENU_PAGE = "pond:save-page";
const MENU_LINK = "pond:save-link";

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  registerContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
});

function registerContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: "Save this page to pond",
      contexts: ["page", "image", "video"],
    });
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: "Save this link to pond",
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) await captureUrl(tab.url, tab.id);
});

chrome.runtime.onMessage.addListener((msg: PondMessage, sender, sendResponse) => {
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
  return false;
});

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

  // The DOM scraper only makes sense if the user is currently *on* that page
  // (so we have authenticated, fully-rendered HTML to read). For context-menu
  // 'save link' we'll be on a different host — bail out then.
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

async function handleCapture(payload: unknown, tabId?: number): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.endpoint || !settings.apiKey) {
    console.warn(
      "[pond] missing endpoint or apiKey; configure in the extension popup",
    );
    flashBadge(tabId, "!", "#dd9b00");
    return false;
  }

  console.info("[pond] sending capture", { endpoint: settings.endpoint, payload });

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
