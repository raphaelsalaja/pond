import { createHash } from "node:crypto";

export interface CaptureDocumentTarget {
  /** Included in the query so a new card cannot reuse the previous document. */
  search: string;
  hash: string;
  token: string;
}

export function captureDocumentTarget(
  kind: string,
  scheme: string,
  width: number,
  payload: string,
): CaptureDocumentTarget {
  const token = createHash("sha256").update(payload).digest("hex").slice(0, 20);
  return {
    token,
    search: `kind=${kind}&scheme=${scheme}&w=${width}&card=${token}`,
    hash: Buffer.from(payload, "utf8").toString("base64"),
  };
}

/**
 * Chromium keeps the current document when only the fragment changes, and the
 * capture page reads that fragment once. A shared window then photographs the
 * previous card.
 */
export function documentReloads(
  current: { search: string } | null,
  next: { search: string },
): boolean {
  return current === null || current.search !== next.search;
}

export function capturedCardToken(
  document: { token: string; ready: boolean } | null,
  requestedToken: string,
): string | null {
  if (!document?.ready || document.token !== requestedToken) return null;
  return document.token;
}
