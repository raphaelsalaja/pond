import type { Source } from "@pond/schema/db";
import {
  DEFAULT_SETTINGS,
  POND_EVENT,
  type PondMessage,
  type PondSettings,
} from "./types";

/**
 * Bridges window.postMessage events from MAIN-world inject scripts into
 * the extension messaging system. Called by each ISOLATED-world content script.
 */
export function bridge(source: Source) {
  chrome.storage.local.get("settings").then((stored) => {
    const settings: PondSettings = {
      ...DEFAULT_SETTINGS,
      ...(stored.settings ?? {}),
    };
    if (!settings.enabled[source]) return;

    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { type?: string; message?: PondMessage };
      if (!data || data.type !== POND_EVENT || !data.message) return;
      chrome.runtime.sendMessage(data.message).catch(() => {});
    });
  });
}
