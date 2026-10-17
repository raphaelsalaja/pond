import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import type { ReportDownloadActivity } from "@shared/download-activity";
import log from "electron-log/main.js";
import { partitionForIngest } from "../../sync/accounts";
import { harvesterFor } from "../harvest";
import { HARVEST_TIMEOUT_MS, NAV_TIMEOUT_MS } from "./constants";
import { looksLikeAuthWall, navigateWithTimeout } from "./navigation";
import { leaseWindow } from "./pool";
import { sleep } from "./util";

export {
  harvestTwitterBookmarkFolder,
  harvestTwitterBookmarks,
  harvestTwitterLikes,
} from "./harvest-bookmarks";
export {
  harvestInstagramLikedList,
  harvestSourceCollections,
  harvestSourceList,
  harvestYoutubeLikedList,
  listSourceCollections,
} from "./harvest-list";
export { harvestThreadsLikes, harvestThreadsSaved } from "./harvest-saved";

interface HarvestArgs {
  url: string;
  source: Source;
  sourceId?: string;
  accountId?: string | null;
  reportActivity?: ReportDownloadActivity;
}

interface HarvestResult {
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
