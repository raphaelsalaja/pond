import type { CaptureStatus } from "@/utils/outcome";
import {
  type OverlayRequest,
  type OverlayToast,
  sendOverlayMessage,
} from "@/utils/overlay-messaging";
import type { Appearance } from "@/utils/paint-theme";
import { getSettings } from "@/utils/settings";
import { overlayAppearance } from "./library";

const OVERLAY_SCRIPT = "/content-scripts/overlay.js";

export interface OverlayMessage {
  request: OverlayRequest;
  appearance: Appearance;
}

interface OverlayTransportDeps {
  send: (message: OverlayMessage, tabId: number) => Promise<boolean>;
  inject: (tabId: number) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

/**
 * Overlay work is serialized per tab: concurrent captures would otherwise
 * inject the script twice, and the second evaluation invalidates the first.
 */
export function createOverlayTransport(deps: OverlayTransportDeps) {
  const queues = new Map<number, Promise<unknown>>();

  function enqueue<T>(tabId: number, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(tabId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    queues.set(tabId, next);
    void next.finally(() => {
      if (queues.get(tabId) === next) queues.delete(tabId);
    });
    return next;
  }

  async function deliver(tabId: number, message: OverlayMessage) {
    try {
      return await deps.send(message, tabId);
    } catch {
      /** Injecting again would invalidate a live overlay, so only inject when none answered. */
    }
    try {
      await deps.inject(tabId);
    } catch {
      return false;
    }
    /** The script's main runs in a microtask after evaluation, so its listener is never up when the injection resolves; retry until it answers. */
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await deps.send(message, tabId);
      } catch {
        await deps.sleep(50);
      }
    }
    return false;
  }

  return {
    show: (tabId: number, message: OverlayMessage): Promise<boolean> =>
      enqueue(tabId, () => deliver(tabId, message)),
    enqueue,
  };
}

export type OverlayTransport = ReturnType<typeof createOverlayTransport>;

const transport = createOverlayTransport({
  send: (message, tabId) => sendOverlayMessage("show", message, tabId),
  inject: async (tabId) => {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [OVERLAY_SCRIPT],
    });
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

/** Browser pages, store listings, and PDFs refuse scripts, so callers fall back to the toolbar badge. */
export async function showOverlay(
  tabId: number,
  request: OverlayRequest | Promise<OverlayRequest>,
): Promise<boolean> {
  const [resolved, appearance] = await Promise.all([
    request,
    overlayAppearance(),
  ]);
  return transport.show(tabId, { request: resolved, appearance });
}

/** Clears toasts before a screenshot so Pond's own UI isn't in the image. */
export async function hideOverlay(tabId: number): Promise<void> {
  const hidden = await transport.enqueue(tabId, () =>
    sendOverlayMessage(
      "show",
      { request: { view: "clear" }, appearance: { theme: null, mode: null } },
      tabId,
    ).catch(() => false),
  );
  if (hidden) await new Promise((resolve) => setTimeout(resolve, 80));
}

/** The badge is drawn by the browser outside Pond's theme, so it carries its own colors. */
const BADGES = {
  saved: { text: "✓", color: "#1f9d55" },
  duplicate: { text: "✓", color: "#1f9d55" },
  failed: { text: "!", color: "#cc3333" },
  offline: { text: "!", color: "#dd9b00" },
} satisfies Record<
  Exclude<CaptureStatus, "sending">,
  { text: string; color: string }
>;
const BADGE_TEXT = "#ffffff";

export function flashBadge(tabId: number | undefined, status: CaptureStatus) {
  if (!browser.action || status === "sending") return;
  const { text, color } = BADGES[status];
  void browser.action
    .setBadgeBackgroundColor(tabId === undefined ? { color } : { color, tabId })
    .catch(() => {});
  /** Without a text color the browser picks one by contrast and draws the check black on green. */
  void browser.action
    .setBadgeTextColor?.(
      tabId === undefined
        ? { color: BADGE_TEXT }
        : { color: BADGE_TEXT, tabId },
    )
    ?.catch(() => {});
  void browser.action
    .setBadgeText(tabId === undefined ? { text } : { text, tabId })
    .catch(() => {});
  setTimeout(() => {
    void browser.action
      .setBadgeText(tabId === undefined ? { text: "" } : { text: "", tabId })
      .catch(() => {});
  }, 2000);
}

export function clearBadge(): void {
  if (!browser.action) return;
  browser.action.setBadgeText({ text: "" }).catch(() => {});
}

/** Shows the save on the page when confirmations are on, otherwise on the toolbar icon. */
export async function announce(
  tabId: number | undefined,
  toast: OverlayToast,
): Promise<void> {
  const { confirmations } = await getSettings();
  if (
    tabId !== undefined &&
    confirmations &&
    (await showOverlay(tabId, { view: "toast", toast }))
  ) {
    return;
  }
  flashBadge(tabId, toast.status);
}
