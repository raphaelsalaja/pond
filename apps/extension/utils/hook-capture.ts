import { hostToSource } from "@pond/schema/source-ids";
import type { ExternalSource } from "@pond/schema/sources";
import { isLikeTrigger } from "@/sources";
import type { PondCapturePayload, PondSettings } from "./types";

/** Any script on the page can post the hook message, so only same-site item URLs with this site's triggers pass. */
export function acceptHookCapture(
  source: ExternalSource,
  payload: PondCapturePayload,
  settings: PondSettings,
): PondCapturePayload | null {
  if (!settings.enabled[source]) return null;
  const trigger = payload.trigger ?? "";
  if (!trigger.startsWith(`${source}:`)) return null;
  if (isLikeTrigger(source, trigger) && !settings.likes[source]) return null;
  if (!/^https:\/\//i.test(payload.url)) return null;
  if (hostToSource(payload.url) !== source) return null;
  return { url: payload.url, trigger };
}

/** A like is saved only while that source's likes setting is on. Other captures still go through. */
export function allowsSiteCapture(
  url: string,
  trigger: string | undefined,
  settings: PondSettings,
): boolean {
  const source = hostToSource(url);
  if (!source || source === "web" || source === "local" || !trigger) {
    return true;
  }
  return !isLikeTrigger(source, trigger) || settings.likes[source];
}

export function createRateLimit(
  limit: number,
  windowMs: number,
): (now: number) => boolean {
  const recent: number[] = [];
  return (now) => {
    while (recent.length > 0 && now - (recent[0] ?? 0) >= windowMs) {
      recent.shift();
    }
    if (recent.length >= limit) return false;
    recent.push(now);
    return true;
  };
}
