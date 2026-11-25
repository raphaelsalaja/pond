export type LibrarySurface = "grid" | "rail" | "page";

export type MemoryPressure = "normal" | "warning" | "critical";

export interface DecodedImageHold {
  surface: LibrarySurface;
  viewerOpen: boolean;
  memoryPressure: MemoryPressure;
}

/** Decoded images stay while the grid and an open Save are still on screen. */
export function shouldReleaseDecodedImages(
  previous: DecodedImageHold | null,
  next: DecodedImageHold,
): boolean {
  if (!previous) return false;
  const leftGrid = previous.surface === "grid" && next.surface !== "grid";
  const closedViewer = previous.viewerOpen && !next.viewerOpen;
  const pressureRose =
    next.memoryPressure !== "normal" &&
    next.memoryPressure !== previous.memoryPressure;
  return leftGrid || closedViewer || pressureRose;
}
