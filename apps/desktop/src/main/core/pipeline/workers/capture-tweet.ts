import log from "electron-log/main.js";
import {
  screenshotTweet,
  type TweetScreenshotResult,
} from "../../refresh/scrape-window";
import { applySavePatch, readSave } from "./apply";

// Distinct from `cover`/`media`/`video` so the renderer can show the
// screenshot as a tweet's primary thumbnail while keeping the actual
// extracted media available in the detail carousel. The light/dark
// variants are the live targets; `TWEET_SCREENSHOT_KIND` is the
// pre-dual-theme kind kept around as a fallback when re-capture for an
// existing save hasn't run yet.
export const TWEET_SCREENSHOT_KIND = "tweet_screenshot";
export const TWEET_SCREENSHOT_LIGHT_KIND = "tweet_screenshot_light";
export const TWEET_SCREENSHOT_DARK_KIND = "tweet_screenshot_dark";

// runCaptureTweet — runs for every twitter save, regardless of whether
// the extractor pulled real media off the tweet. The screenshot is the
// canonical visual identity for a tweet in the grid / preview pane; the
// extracted media stays addressable via `fetch_blobs` for the detail
// carousel.
//
// Captures a light + dark variant per tweet so the renderer can pick
// the one that matches the current app theme. Either variant being
// already on disk is enough to skip its capture, so this is idempotent
// across re-runs and partial failures.
//
// Returns silently on every failure mode (auth wall, no article,
// network) so a screenshot miss never marks the save as failed — the
// placeholder gradient is a fine interim state until the next refresh
// tries again.
export async function runCaptureTweet(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;
  if (save.source !== "twitter") return;
  if (!save.sourceId) return;

  const files = save.files ?? [];
  const hasLight = files.some((f) => f.kind === TWEET_SCREENSHOT_LIGHT_KIND);
  const hasDark = files.some((f) => f.kind === TWEET_SCREENSHOT_DARK_KIND);
  if (hasLight && hasDark) {
    log.debug(
      "[pond pipeline:capture-tweet] both variants present, skipping",
      saveId,
    );
    return;
  }

  const targets: Array<{
    scheme: "light" | "dark";
    kind: string;
    filename: string;
  }> = [];
  if (!hasLight) {
    targets.push({
      scheme: "light",
      kind: TWEET_SCREENSHOT_LIGHT_KIND,
      filename: "tweet-light.png",
    });
  }
  if (!hasDark) {
    targets.push({
      scheme: "dark",
      kind: TWEET_SCREENSHOT_DARK_KIND,
      filename: "tweet-dark.png",
    });
  }

  for (const target of targets) {
    const result: TweetScreenshotResult = await screenshotTweet({
      url: save.url,
      sourceId: save.sourceId,
      colorScheme: target.scheme,
    });
    if (!result.ok || !result.png) {
      log.info(
        "[pond pipeline:capture-tweet] no screenshot",
        saveId,
        target.scheme,
        result.reason,
      );
      continue;
    }
    await applySavePatch(
      saveId,
      {},
      {
        actorReason: `pipeline:capture-tweet:${target.scheme}`,
        newFiles: [
          {
            kind: target.kind,
            filename: target.filename,
            bytes: result.png.bytes,
            mimeType: "image/png",
            width: result.png.width,
            height: result.png.height,
          },
        ],
      },
    );
    log.info(
      "[pond pipeline:capture-tweet] wrote",
      saveId,
      target.scheme,
      `${result.png.width}x${result.png.height}`,
    );
  }
}
