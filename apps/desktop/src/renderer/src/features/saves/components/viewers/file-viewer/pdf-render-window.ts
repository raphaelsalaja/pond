export function addPdfRenderWindow(
  current: ReadonlySet<number>,
  pageNumber: number,
  pageCount: number,
  overscan = 1,
): Set<number> {
  const next = new Set(current);
  const start = Math.max(1, pageNumber - overscan);
  const end = Math.min(pageCount, pageNumber + overscan);
  for (let page = start; page <= end; page += 1) next.add(page);
  return next;
}

const PDF_ZOOM_MIN = 0.5;
const PDF_ZOOM_MAX = 2.5;
const PDF_ZOOM_STEP = 0.1;

export function clampPdfZoom(value: number): number {
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, value));
}

export function stepPdfZoom(value: number, direction: -1 | 1): number {
  return clampPdfZoom(
    Math.round((value + direction * PDF_ZOOM_STEP) * 10) / 10,
  );
}

export function pdfPageWidth({
  containerWidth,
  containerHeight,
  pageAspectRatio,
  thumbnailsOpen,
  fitMode,
  zoom,
}: {
  containerWidth: number;
  containerHeight: number;
  pageAspectRatio: number;
  thumbnailsOpen: boolean;
  fitMode: "width" | "page" | null;
  zoom: number;
}): number {
  const sidebarWidth = thumbnailsOpen ? 132 : 0;
  const fitWidth = Math.max(160, containerWidth - sidebarWidth - 48);
  if (fitMode === "page") {
    const heightBound = Math.max(160, containerHeight - 48) * pageAspectRatio;
    return Math.round(Math.min(fitWidth, heightBound));
  }
  if (fitMode === "width") return Math.round(fitWidth);
  return Math.round(fitWidth * clampPdfZoom(zoom));
}
