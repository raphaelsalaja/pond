import type { Source, WatchKind } from "@pond/schema/db";
import log from "electron-log/main.js";
import { z } from "zod";
import { markAtRisk } from "../pipeline/rate-governor";
import { sourceIdFromUrl } from "../pipeline/url";
import { NAV_TIMEOUT_MS } from "../refresh/harvest-window/constants";
import {
  looksLikeAuthWall,
  looksLikeChallenge,
  navigateWithTimeout,
} from "../refresh/harvest-window/navigation";
import { leaseWindow } from "../refresh/harvest-window/pool";
import type { WatchEntry, WatchHarvestResult } from "./types";

/** Instagram/Twitter watch listing scrolls the profile in a hidden window on a connected account's partition; both platforms auth-wall logged-out visitors. */

const COLLECT_TIMEOUT_MS = 60_000;

function profileUrl(
  source: Source,
  handle: string,
  kind?: WatchKind,
): string | null {
  const h = encodeURIComponent(handle);
  if (source === "instagram") {
    return `https://www.instagram.com/${h}/`;
  }
  if (source === "twitter") {
    return kind === "list"
      ? `https://x.com/i/lists/${h}`
      : `https://x.com/${h}`;
  }
  return null;
}

function buildCollectorExpression(source: Source): string {
  const pattern =
    source === "instagram"
      ? String.raw`/^\/(?:[^/]+\/)?(?:p|reel)\/[A-Za-z0-9_-]+/`
      : String.raw`/^\/[A-Za-z0-9_]+\/status\/\d+$/`;
  return `
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const seen = new Set();
      const links = [];
      const collect = () => {
        for (const a of document.querySelectorAll("a[href]")) {
          const href = a.getAttribute("href") ?? "";
          const path = href.startsWith("http") ? new URL(href).pathname : href;
          if (!${pattern}.test(path)) continue;
          const url = new URL(href, location.origin).href.split("?")[0];
          if (seen.has(url)) continue;
          seen.add(url);
          links.push(url);
        }
      };
      await sleep(3000);
      collect();
      for (let i = 0; i < 4; i += 1) {
        window.scrollBy(0, window.innerHeight * 2);
        await sleep(1800);
        collect();
      }
      return { links };
    })()
  `;
}

const LinksPageSchema = z.object({
  links: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => z.string().safeParse(item).data ?? []),
    ),
});

export async function listProfileWatch(
  source: Source,
  handle: string,
  partition: string,
  kind?: WatchKind,
): Promise<WatchHarvestResult> {
  const target = profileUrl(source, handle, kind);
  if (!target) {
    return { ok: false, reason: "unknown" };
  }
  const lease = await leaseWindow(source, { partition });
  try {
    const navOk = await navigateWithTimeout(lease.win, target, NAV_TIMEOUT_MS);
    if (!navOk) {
      return { ok: false, reason: "timeout" };
    }
    const landedUrl = lease.win.webContents.getURL();
    const challenge = looksLikeChallenge(landedUrl);
    if (challenge) {
      markAtRisk(source, challenge.kind, `watch landed on ${challenge.kind}`);
      return { ok: false, reason: "auth_required" };
    }
    if (looksLikeAuthWall(landedUrl)) {
      return { ok: false, reason: "auth_required" };
    }
    const raw = await Promise.race<unknown>([
      lease.win.webContents.executeJavaScript(
        buildCollectorExpression(source),
        true,
      ),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("__pond_watch_timeout__"), COLLECT_TIMEOUT_MS);
      }),
    ]);
    if (raw === "__pond_watch_timeout__") {
      return { ok: false, reason: "timeout" };
    }
    const page = LinksPageSchema.safeParse(raw);
    if (!page.success) {
      return { ok: false, reason: "unknown" };
    }
    const entries: Array<WatchEntry> = [];
    const seen = new Set<string>();
    for (const link of page.data.links) {
      const sourceId = sourceIdFromUrl(source, link);
      if (!sourceId || seen.has(sourceId)) {
        continue;
      }
      seen.add(sourceId);
      entries.push({ url: link, sourceId });
    }
    return { ok: true, entries };
  } catch (error) {
    log.warn("[pond watch:scrape]", source, handle, "unexpected error", error);
    return { ok: false, reason: "unknown" };
  } finally {
    lease.release();
  }
}
