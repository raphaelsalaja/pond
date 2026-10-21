import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { sourceLabel } from "@pond/schema/sources";
import type { ReportDownloadActivity } from "@shared/download-activity";
import {
  AuthRequiredError,
  TerminalError,
  TransientError,
} from "../../pipeline/extractors/errors";
import { harvestUrl } from "../harvest-window/harvest";

interface CaptureArgs {
  url: string;
  source: Source;
  sourceId?: string;
  accountId?: string | null;
  reportActivity?: ReportDownloadActivity;
  isSignedIn?: (source: Source, partition: string) => Promise<boolean>;
}

export async function captureFromSource(args: CaptureArgs): Promise<Capture> {
  if (args.source === "web" || args.source === "local") {
    throw new TerminalError(
      `${args.source} does not harvest via captureFromSource`,
    );
  }

  let removedAtSource = false;
  if (args.source === "pinterest" && args.sourceId) {
    const { fetchPinterestCapture } = await import("./pinterest/api");
    const result = await fetchPinterestCapture({ sourceId: args.sourceId });
    if (result.ok) return result.capture;
    removedAtSource = result.reason === "not_found";
  }

  if (args.source === "arena" && args.sourceId) {
    const { fetchArenaCapture } = await import("./arena/api");
    const result = await fetchArenaCapture({ sourceId: args.sourceId });
    if (result.ok) return result.capture;
  }

  const result = await harvestUrl(args);
  /** A signed-in session can still open a secret-board pin, but an empty page shell means the pin is gone. */
  if (removedAtSource && (result.capture?.media.length ?? 0) === 0) {
    throw new TerminalError(`${args.source} item no longer exists`);
  }
  if (result.ok && result.capture) return result.capture;
  switch (result.reason) {
    case "auth_required":
      throw new AuthRequiredError(
        `Connect ${sourceLabel(args.source)} to Pond in Sources, then retry`,
        args.source,
      );
    case "navigate_failed":
      throw new TransientError("navigate failed");
    case "timeout":
      throw new TransientError("scrape timeout");
    default:
      throw new TerminalError("scrape returned no data");
  }
}
