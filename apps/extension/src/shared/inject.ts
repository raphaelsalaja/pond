import { DEFAULT_SETTINGS, POND_EVENT, type PondMessage, type PondSettings } from "./types";
import type { Source } from "@pond/schema/db";

/**
 * Loads the MAIN-world inject script for a site (if enabled), then bridges
 * the window.postMessage events the inject script sends back into the
 * extension messaging system.
 */
export async function bridge(source: Source) {
  const stored = await chrome.storage.local.get("settings");
  const settings: PondSettings = {
    ...DEFAULT_SETTINGS,
    ...(stored.settings ?? {}),
  };
  if (!settings.enabled[source]) return;

  // Instagram, Pinterest, Are.na, and Cosmos inject scripts are loaded by
  // the manifest as MAIN-world content scripts at document_start (so their
  // fetch/XHR hooks attach before the page bundle caches references).
  // Skip the dynamic injection here to avoid double-loading.
  if (
    source !== "instagram" &&
    source !== "pinterest" &&
    source !== "arena" &&
    source !== "cosmos"
  ) {
    const url = chrome.runtime.getURL(`inject/${source}.js`);
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as { type?: string; message?: PondMessage };
    if (!data || data.type !== POND_EVENT || !data.message) return;
    chrome.runtime.sendMessage(data.message).catch(() => {
      /* background may be cold-starting; safe to drop */
    });
  });
}
