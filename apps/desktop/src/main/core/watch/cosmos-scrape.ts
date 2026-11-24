import log from "electron-log/main.js";
import { z } from "zod";
import { sourceIdFromUrl } from "../pipeline/url";
import {
  NAV_TIMEOUT_MS,
  PUBLIC_PARTITION,
} from "../refresh/harvest-window/constants";
import { navigateWithTimeout } from "../refresh/harvest-window/navigation";
import { leaseWindow } from "../refresh/harvest-window/pool";
import type { WatchEntry, WatchHarvestResult } from "./types";

const COLLECT_TIMEOUT_MS = 60_000;

function pageUrl(handle: string): string {
  const segs = handle
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `https://www.cosmos.so/${segs}`;
}

const COLLECTOR = `
  (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (/\\/(login|sign-in|signup|auth)/.test(location.pathname)) {
      return { authWall: true, links: [] };
    }
    /** Missing profiles/clusters render an error page in place (no redirect). */
    if (/content not found/i.test(document.title)) {
      return { notFound: true, links: [] };
    }
    const seen = new Set();
    const links = [];
    const push = (id) => {
      const clean = "https://www.cosmos.so/e/" + id;
      if (seen.has(clean)) return;
      seen.add(clean);
      links.push(clean);
    };
    const collect = () => {
      /** Element ids live in the GraphQL bodies the preload hook captured; regex keeps this resilient to operation/shape changes. */
      for (const cap of globalThis.__pondCosmosCaptures ?? []) {
        for (const m of String(cap.body ?? "").matchAll(
          /cosmos\\.so\\\\?\\/e\\\\?\\/(\\d+)/g,
        )) {
          push(m[1]);
        }
      }
      for (const a of document.querySelectorAll('a[href*="/e/"]')) {
        const url = new URL(a.getAttribute("href"), location.origin);
        const m = /^\\/e\\/(\\w+)/.exec(url.pathname);
        if (m) push(m[1]);
      }
    };
    await sleep(3000);
    collect();
    for (let i = 0; i < 4; i += 1) {
      window.scrollBy(0, window.innerHeight * 2);
      await sleep(1500);
      collect();
    }
    return { links };
  })()
`;

const CosmosPageSchema = z.object({
  authWall: z.boolean().optional().catch(undefined),
  notFound: z.boolean().optional().catch(undefined),
  links: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => z.string().safeParse(item).data ?? []),
    ),
});

export async function listCosmosWatch(
  handle: string,
): Promise<WatchHarvestResult> {
  const target = pageUrl(handle);
  const lease = await leaseWindow("cosmos", { partition: PUBLIC_PARTITION });
  try {
    const navOk = await navigateWithTimeout(lease.win, target, NAV_TIMEOUT_MS);
    if (!navOk) {
      return { ok: false, reason: "timeout" };
    }
    const landed = new URL(lease.win.webContents.getURL());
    const landedFirst = landed.pathname.split("/").filter(Boolean)[0] ?? "";
    const wantedFirst = handle.split("/")[0] ?? handle;
    if (landedFirst.toLowerCase() !== wantedFirst.toLowerCase()) {
      return { ok: false, reason: "not_found" };
    }
    const raw = await Promise.race<unknown>([
      lease.win.webContents.executeJavaScript(COLLECTOR, true),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("__pond_watch_timeout__"), COLLECT_TIMEOUT_MS);
      }),
    ]);
    if (raw === "__pond_watch_timeout__") {
      return { ok: false, reason: "timeout" };
    }
    const page = CosmosPageSchema.safeParse(raw);
    if (!page.success) {
      return { ok: false, reason: "unknown" };
    }
    if (page.data.authWall) {
      return { ok: false, reason: "auth_required" };
    }
    if (page.data.notFound) {
      return { ok: false, reason: "not_found" };
    }
    const entries: Array<WatchEntry> = [];
    const seen = new Set<string>();
    for (const link of page.data.links) {
      const sourceId = sourceIdFromUrl("cosmos", link);
      if (!sourceId || seen.has(sourceId)) {
        continue;
      }
      seen.add(sourceId);
      entries.push({ url: link, sourceId });
    }
    return { ok: true, entries };
  } catch (error) {
    log.warn("[pond watch:cosmos]", handle, "unexpected error", error);
    return { ok: false, reason: "unknown" };
  } finally {
    lease.release();
  }
}
