import type { Source } from "@pond/schema/db";
import { harvestUrl } from "../../../refresh/scrape-window";
import { AuthRequiredError, TerminalError, TransientError } from "../errors";

export interface InWindowResult {
  ok: true;
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{ url: string; type?: string; poster?: string }>;
  mediaType?: string;
  meta?: Record<string, unknown>;
  sourceId?: string;
}

// fetchHtmlInWindow — wraps the existing scrape-window pool so extractors can
// get fully-rendered DOM data (Twitter/Instagram/YouTube/etc. don't ship usable
// SSR HTML). Maps the harvest result's `reason` onto our error taxonomy so the
// retry policy knows what to do.
export async function fetchHtmlInWindow(
  url: string,
  source: Source,
  sourceId?: string,
): Promise<InWindowResult> {
  const result = await harvestUrl({ url, source, sourceId });
  if (result.ok) {
    return { ...result.harvest, ok: true, sourceId: result.sourceId };
  }
  switch (result.reason) {
    case "auth_required":
      throw new AuthRequiredError(`${source} session required`, source);
    case "navigate_failed":
      throw new TransientError("navigate failed");
    case "timeout":
      throw new TransientError("scrape timeout");
    default:
      throw new TerminalError("scrape returned no data");
  }
}
