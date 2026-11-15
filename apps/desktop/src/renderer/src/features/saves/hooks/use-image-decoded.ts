import { type RefObject, useEffect, useState } from "react";

/** Chromium paints large originals in bands while decoding, so the image stays hidden until `decode()` settles. */
export function useImageDecoded(
  image: RefObject<HTMLImageElement | null>,
  src: string,
): boolean {
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);

  useEffect(() => {
    const element = image.current;
    if (!element || !("decode" in element)) return;
    let current = true;
    const reveal = () => {
      if (current) setDecodedSrc(src);
    };
    element.decode().then(reveal, () => {
      if (element.complete && element.naturalWidth > 0) reveal();
      else element.addEventListener("load", reveal, { once: true });
    });
    return () => {
      current = false;
      element.removeEventListener("load", reveal);
    };
  }, [image, src]);

  return decodedSrc === src;
}
