import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { NAV_TIMEOUT_MS } from "./harvest-window/constants";
import { navigateWithTimeout } from "./harvest-window/navigation";
import { leaseWindow } from "./harvest-window/pool";

export { browserUserAgent } from "./harvest-window/constants";

const RENDER_SETTLE_MS = 1500;
const RENDER_READ_TIMEOUT_MS = 10_000;
const RenderedHtmlSchema = z.string().trim().min(1);

export type RenderPageResult =
  | { ok: true; html: string; status: number }
  | { ok: false; reason: "navigation" | "read-timeout" | "empty" };

export async function renderPageHtml(
  url: string,
  signal?: AbortSignal,
): Promise<RenderPageResult> {
  const lease = await leaseWindow("web", { signal });
  try {
    const webContents = lease.win.webContents;
    let status = 0;
    const onNavigate = (_event: Electron.Event, _url: string, code: number) => {
      status = code;
    };
    webContents.on("did-navigate", onNavigate);
    let loaded: boolean;
    try {
      loaded = await navigateWithTimeout(lease.win, url, NAV_TIMEOUT_MS);
    } finally {
      webContents.off("did-navigate", onNavigate);
    }
    if (!loaded) {
      return { ok: false, reason: "navigation" };
    }
    await sleep(RENDER_SETTLE_MS);
    const html: unknown = await Promise.race([
      webContents.executeJavaScript("document.documentElement.outerHTML", true),
      sleep(RENDER_READ_TIMEOUT_MS).then(() => null),
    ]);
    if (html === null) {
      return { ok: false, reason: "read-timeout" };
    }
    const rendered = RenderedHtmlSchema.safeParse(html);
    return rendered.success
      ? { ok: true, html: rendered.data, status }
      : { ok: false, reason: "empty" };
  } finally {
    lease.release();
  }
}
