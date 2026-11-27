export interface CaptureDocumentTarget {
  /** Included in the query so a new card cannot reuse the previous document. */
  search: string;
  token: string;
}

export function captureDocumentTarget(
  kind: string,
  scheme: string,
  width: number,
  token: string,
): CaptureDocumentTarget {
  return {
    token,
    search: `kind=${kind}&scheme=${scheme}&w=${width}&card=${encodeURIComponent(token)}`,
  };
}

/**
 * The capture page reads its payload once. A shared window must navigate for
 * every card, or it photographs the previous card.
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
