import { useCallback, useEffect, useRef, useState } from "react";

/** Reports a decoded image once per src, including images already in Chromium's memory cache. */
export function useImageReady(
  src: string | null,
  onReady?: (image: HTMLImageElement) => void,
) {
  const ref = useRef<HTMLImageElement>(null);
  const reportedSrc = useRef<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const markReady = useCallback(
    (image: HTMLImageElement) => {
      if (!src || image.naturalWidth <= 0 || reportedSrc.current === src) {
        return;
      }
      reportedSrc.current = src;
      setLoadedSrc(src);
      onReady?.(image);
    },
    [onReady, src],
  );

  useEffect(() => {
    const image = ref.current;
    if (image?.complete) markReady(image);
  }, [markReady]);

  return {
    ref,
    loaded: src !== null && loadedSrc === src,
    onLoad: useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        markReady(event.currentTarget);
      },
      [markReady],
    ),
  };
}
