import type { Capture } from "@pond/schema/raw";

const HARVEST_FRESH_MS = 24 * 60 * 60 * 1000;

interface HarvestedRawJson {
  capture?: Partial<Capture>;
  extractedAt?: string;
}

export function isFreshHarvest(
  rawJson: HarvestedRawJson | null,
  now = Date.now(),
): boolean {
  if (!rawJson?.extractedAt || !rawJson.capture) return false;
  const ms = Date.parse(rawJson.extractedAt);
  if (!Number.isFinite(ms)) return false;
  return now - ms < HARVEST_FRESH_MS;
}
