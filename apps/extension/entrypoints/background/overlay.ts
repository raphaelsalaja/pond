import type { CaptureStatus } from "@/utils/outcome";
import {
  type OverlayRequest,
  type OverlayToast,
  sendOverlayMessage,
} from "@/utils/overlay-messaging";
import { getSettings } from "@/utils/settings";
import { overlayAppearance } from "./library";

const OVERLAY_SCRIPT = "/content-scripts/overlay.js";

/** Browser pages, store listings, and PDFs refuse scripts, so callers fall back to the toolbar badge. */
export async function showOverlay(
  tabId: number,
  request: OverlayRequest,
): Promise<boolean> {
  const message = { request, appearance: await overlayAppearance() };
  try {
    return await sendOverlayMessage("show", message, tabId);
  } catch {
    /** Injecting again would invalidate a live overlay, so only inject when none answered. */
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [OVERLAY_SCRIPT],
    });
    return await sendOverlayMessage("show", message, tabId);
  } catch {
    return false;
  }
}

/** Clears toasts before a screenshot so Pond's own UI isn't in the image. */
export async function hideOverlay(tabId: number): Promise<void> {
  const hidden = await sendOverlayMessage(
    "show",
    { request: { view: "clear" }, appearance: { theme: null, mode: null } },
    tabId,
  ).catch(() => false);
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
