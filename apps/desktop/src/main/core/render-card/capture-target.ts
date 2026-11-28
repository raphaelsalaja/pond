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
