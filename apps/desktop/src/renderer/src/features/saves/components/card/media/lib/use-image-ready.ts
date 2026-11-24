import { useCallback, useEffect, useRef, useState } from "react";

export type ImageDecodeState = Pick<
  HTMLImageElement,
  "complete" | "naturalWidth"
>;

function decodeState(image: HTMLImageElement): ImageDecodeState {
  return image;
}

/** Reports a decoded image once per src, including images already in Chromium's memory cache. */
export function useImageReady(
  src: string | null,
  onReady?: (image: HTMLImageElement) => void,
  onBroken?: () => void,
  readState: (image: HTMLImageElement) => ImageDecodeState = decodeState,
) {
  const ref = useRef<HTMLImageElement>(null);
  const settledSrc = useRef<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const markReady = useCallback(
    (image: HTMLImageElement) => {
      if (
        !src ||
        readState(image).naturalWidth <= 0 ||
        settledSrc.current === src
      ) {
        return;
      }
      settledSrc.current = src;
      setLoadedSrc(src);
      onReady?.(image);
    },
    [onReady, readState, src],
  );

  const markBroken = useCallback(() => {
    if (!src || settledSrc.current === src) {
      return;
    }
    settledSrc.current = src;
    onBroken?.();
  }, [onBroken, src]);

  useEffect(() => {
    const image = ref.current;
    if (!image || !readState(image).complete) {
      return;
    }
    if (readState(image).naturalWidth > 0) {
      markReady(image);
    } else {
      markBroken();
    }
  }, [markBroken, markReady, readState]);

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
