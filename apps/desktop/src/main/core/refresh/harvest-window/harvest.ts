import { setTimeout as sleep } from "node:timers/promises";
import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { sourceLabel } from "@pond/schema/sources";
import type { ReportDownloadActivity } from "@shared/download-activity";
import log from "electron-log/main.js";
import { partitionForIngest } from "../../sync/accounts";
import { harvesterFor } from "../harvest";
import { HARVEST_TIMEOUT_MS, NAV_TIMEOUT_MS } from "./constants";
import {
  looksLikeAuthWall,
  navigateWithTimeout,
  waitPastInterstitial,
} from "./navigation";
import { leaseWindow } from "./pool";

export {
  harvestTwitterBookmarkFolder,
  harvestTwitterBookmarks,
  harvestTwitterLikes,
} from "./harvest-bookmarks";
export {
  collectionsNeedHandle,
  harvestInstagramLikedList,
  harvestSourceCollections,
  harvestSourceList,
  harvestYoutubeLikedList,
  listSourceCollections,
} from "./harvest-list";
export { harvestThreadsList } from "./harvest-saved";

export interface HarvestArgs {
  url: string;
  source: Source;
  sourceId?: string;
  accountId?: string | null;
  reportActivity?: ReportDownloadActivity;
  isSignedIn?: (source: Source, partition: string) => Promise<boolean>;
}

export interface HarvestResult {
  ok: boolean;
  capture?: Capture;
  sourceId?: string;
  reason?: "navigate_failed" | "harvest_failed" | "auth_required" | "timeout";
}

export async function harvestUrl(args: HarvestArgs): Promise<HarvestResult> {
  const partition = await partitionForIngest(args.source, args.accountId);
  const harv = harvesterFor(args.source);
  const sourceId = args.sourceId ?? harv.sourceIdFromUrl(args.url) ?? "";

  if (args.source === "reddit" && sourceId) {
    const { fetchRedditPostCapture } = await import("../harvest/reddit/api");
    const capture = await fetchRedditPostCapture(sourceId, partition);
    if (capture) {
      return { ok: true, sourceId, capture };
    }
  }

  const lease = await leaseWindow(args.source, {
    partition,
    reportActivity: args.reportActivity,
  });
  args.reportActivity?.({ phase: "harvesting" });

  try {
    const navOk = await navigateWithTimeout(
      lease.win,
      args.url,
      NAV_TIMEOUT_MS,
    );
    if (!navOk) {
      log.warn("[pond refresh:window] navigate failed", args.url);
      return { ok: false, reason: "navigate_failed", sourceId };
    }
    if (!(await waitPastInterstitial(lease.win, 20_000))) {
      return { ok: false, reason: "timeout", sourceId };
    }

    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      log.info(
        "[pond refresh:window] auth wall detected",
        lease.win.webContents.getURL(),
      );
      return { ok: false, reason: "auth_required", sourceId };
    }

    const expr = harv.buildExpression(sourceId);
    const raw = await Promise.race([
      lease.win.webContents.executeJavaScript(expr, true),
      sleep(HARVEST_TIMEOUT_MS).then(() => "__pond_harvest_timeout__"),
    ]);
    if (raw === "__pond_harvest_timeout__") {
      log.warn("[pond refresh:window] harvest timed out", args.url);
      return { ok: false, reason: "timeout", sourceId };
    }

    const capture = harv.adapt(raw, {
      source: args.source,
      url: args.url,
      sourceId,
    });
    if (!capture) {
      if (args.isSignedIn && !(await args.isSignedIn(args.source, partition))) {
        const label = sourceLabel(args.source);
        log.warn("[pond refresh:window] empty harvest while signed out", {
          source: args.source,
          url: args.url,
          fix: `Pond is not signed in to ${label}. Install the Pond browser extension in Chrome, Brave, Edge, or Arc, sign in to ${label} in that browser, then in Pond choose New → Sources → New Source → ${label} and retry the download.`,
        });
        return { ok: false, reason: "auth_required", sourceId };
      }
      return { ok: false, reason: "harvest_failed", sourceId };
    }
    return { ok: true, capture, sourceId };
  } catch (err) {
    log.warn("[pond refresh:window] unexpected error", args.url, err);
    return { ok: false, reason: "harvest_failed", sourceId };
  } finally {
    lease.release();
  }
}
