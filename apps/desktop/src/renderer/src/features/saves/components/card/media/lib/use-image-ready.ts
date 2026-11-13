import { useCallback, useEffect, useRef, useState } from "react";

/** Reports a decoded image once per src, including images already in Chromium's memory cache. */
export function useImageReady(
  src: string | null,
  onReady?: (image: HTMLImageElement) => void,
  onBroken?: () => void,
) {
  const ref = useRef<HTMLImageElement>(null);
  const settledSrc = useRef<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const markReady = useCallback(
    (image: HTMLImageElement) => {
      if (!src || image.naturalWidth <= 0 || settledSrc.current === src) {
        return;
      }
      settledSrc.current = src;
      setLoadedSrc(src);
      onReady?.(image);
    },
    [onReady, src],
  );

  const markBroken = useCallback(() => {
    if (!src || settledSrc.current === src) return;
    settledSrc.current = src;
    onBroken?.();
  }, [onBroken, src]);

  useEffect(() => {
    const image = ref.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0) markReady(image);
    else markBroken();
  }, [markBroken, markReady]);

  return {
    ref,
    loaded: src !== null && loadedSrc === src,
    onLoad: useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        markReady(event.currentTarget);
      },
      [markReady],
    ),
    onError: markBroken,
  };
}
