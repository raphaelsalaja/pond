/** Chromium pinch-zooms the page unless visual zoom is locked to 1. */
export function lockRendererZoom(contents: {
  isDestroyed(): boolean;
  setVisualZoomLevelLimits(min: number, max: number): Promise<void>;
}): void {
  if (contents.isDestroyed()) return;
  void contents.setVisualZoomLevelLimits(1, 1);
}
