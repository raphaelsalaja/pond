import type { Source } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import log from "electron-log/main.js";
import { markAtRisk } from "../../pipeline/rate-governor";
import { NAV_TIMEOUT_MS } from "./constants";
import {
  looksLikeAuthWall,
  looksLikeChallenge,
  navigateWithTimeout,
} from "./navigation";
import { leaseWindow } from "./pool";
import { sleep } from "./util";

export type PageRunResult =
  | { ok: true; value: JsonValue }
  | { ok: false; reason: "auth_required" | "timeout" | "unknown" };

const TIMED_OUT = "__pond_page_run_timeout__";

/** Loads `url` in the Account's session and evaluates `expression` on it once. */
export async function runOnSourcePage(
  source: Source,
  url: string,
  expression: string,
  opts: { partition: string; timeoutMs?: number },
): Promise<PageRunResult> {
  const lease = await leaseWindow(source, { partition: opts.partition });
  try {
    if (!(await navigateWithTimeout(lease.win, url, NAV_TIMEOUT_MS))) {
      return { ok: false, reason: "timeout" };
    }
    const landed = lease.win.webContents.getURL();
    const challenge = looksLikeChallenge(landed);
    if (challenge) {
      markAtRisk(
        source,
        challenge.kind,
        `page run landed on ${challenge.kind}`,
      );
      return { ok: false, reason: "auth_required" };
    }
    if (looksLikeAuthWall(landed))
      return { ok: false, reason: "auth_required" };
    const value: JsonValue = await Promise.race([
      lease.win.webContents.executeJavaScript(expression, true),
      sleep(opts.timeoutMs ?? 30_000).then(() => TIMED_OUT),
    ]);
    if (value === TIMED_OUT) return { ok: false, reason: "timeout" };
    return { ok: true, value };
  } catch (err) {
    log.warn("[pond page-run]", source, "unexpected error", err);
    return { ok: false, reason: "unknown" };
  } finally {
    lease.release();
  }
}
