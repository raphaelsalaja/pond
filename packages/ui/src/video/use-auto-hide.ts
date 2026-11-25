import { useCallback, useEffect, useRef, useState } from "react";

const HIDE_DELAY_MS = 2500;

export interface AutoHideApi {
  controlsVisible: boolean;
  showControls: () => void;
}

export function useAutoHide(opts: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ended?: boolean;
}): AutoHideApi {
  const { rootRef, videoRef, ended } = opts;
  const [controlsVisible, setControlsVisible] = useState(false);
  const timer = useRef<number | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (
        v &&
        !v.paused &&
        !rootRef.current?.contains(document.activeElement)
      ) {
        setControlsVisible(false);
      }
    }, HIDE_DELAY_MS);
  }, [videoRef, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onActivity = () => showControls();
    const onLeave = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (!root.contains(document.activeElement)) setControlsVisible(false);
    };
    root.addEventListener("focusin", onActivity);
    root.addEventListener("keydown", onActivity);
    root.addEventListener("pointermove", onActivity);
    root.addEventListener("pointerenter", onActivity);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("focusin", onActivity);
      root.removeEventListener("keydown", onActivity);
      root.removeEventListener("pointermove", onActivity);
      root.removeEventListener("pointerenter", onActivity);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [rootRef, showControls]);

  const isEnded = Boolean(ended);
  const [shownForEnd, setShownForEnd] = useState(false);
  if (isEnded !== shownForEnd) {
    setShownForEnd(isEnded);
    if (isEnded) {
      setControlsVisible(true);
    }
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { controlsVisible, showControls };
}
