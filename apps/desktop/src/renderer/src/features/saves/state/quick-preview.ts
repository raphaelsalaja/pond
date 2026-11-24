interface QuickPreviewOptions {
  /** Opened by a peek click, so a click outside the preview closes it. */
  peek?: boolean;
}

type QuickPreviewListener = (
  saveId: string,
  options: QuickPreviewOptions,
) => void;

const listeners = new Set<QuickPreviewListener>();

export function requestQuickPreview(
  saveId: string,
  options: QuickPreviewOptions = {},
): void {
  for (const listener of listeners) {
    listener(saveId, options);
  }
}

export function onQuickPreviewRequest(
  listener: QuickPreviewListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
