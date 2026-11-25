import { useEffect, useLayoutEffect, useRef } from "react";

/** Esc unwinds in-progress viewer actions, newest first, before it closes the save. */
const layers: Array<() => void> = [];

export const viewerEscape = {
  cancel(): boolean {
    const cancel = layers.pop();
    if (!cancel) return false;
    cancel();
    return true;
  },
};

export function useViewerEscapeLayer(
  enabled: boolean,
  cancel: () => void,
): void {
  const latest = useRef(cancel);
  useLayoutEffect(() => {
    latest.current = cancel;
  });
  useEffect(() => {
    if (!enabled) return;
    const layer = () => latest.current();
    layers.push(layer);
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
    };
  }, [enabled]);
}
