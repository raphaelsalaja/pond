import { hostToSource } from "@pond/schema/source-ids";
import type { ExternalSource } from "@pond/schema/sources";
import { isLikeTrigger } from "@/sources";
import type { PondCapturePayload, PondSettings } from "./types";

/** The capture schema's limits, so a page can't make Pond reject the whole save. */
const MAX_COLLECTIONS = 100;
const MAX_COLLECTION_ID_LENGTH = 100;

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
  const accepted: PondCapturePayload = { url: payload.url, trigger };
  const collectionIds = payload.collectionIds?.filter(
    (id) => id.length > 0 && id.length <= MAX_COLLECTION_ID_LENGTH,
  );
  if (collectionIds?.length) {
    accepted.collectionIds = collectionIds.slice(0, MAX_COLLECTIONS);
  }
  return accepted;
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
  const recent: Array<number> = [];
  return (now) => {
    while (recent.length > 0 && now - (recent[0] ?? 0) >= windowMs) {
      recent.shift();
    }
    if (recent.length >= limit) return false;
    recent.push(now);
    return true;
  };
}
