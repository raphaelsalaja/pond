import type { Source } from "@pond/schema/db";

const TIMEOUT_MS = 30 * 60 * 1000;

let pending: { source: Source; setAt: number } | null = null;

export function setPendingSessionSource(source: Source): void {
  pending = { source, setAt: Date.now() };
}

export function getPendingSessionSource(): Source | null {
  if (!pending) return null;
  if (Date.now() - pending.setAt > TIMEOUT_MS) {
    pending = null;
    return null;
  }
  return pending.source;
}

export function clearPendingSessionSource(source?: Source): void {
  if (!pending) return;
  if (source === undefined || pending.source === source) {
    pending = null;
  }
}
