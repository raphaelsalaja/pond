import { decode } from "blurhash";
import { useLayoutEffect, useRef } from "react";
import styles from "./styles.module.css";

/** Hashes carry 4×3 components, so 16 px holds every detail once the canvas is smoothed up to card size. */
const SIZE = 16;
const CACHE_LIMIT = 500;

/** Virtualized cards remount while scrolling, so decoded hashes outlive the card. */
const decoded = new Map<string, ImageData | null>();

function decodeHash(hash: string): ImageData | null {
  if (decoded.has(hash)) return decoded.get(hash) ?? null;
  let image: ImageData | null;
  try {
    image = new ImageData(SIZE, SIZE);
    image.data.set(decode(hash, SIZE, SIZE));
  } catch {
    image = null;
  }
  if (decoded.size >= CACHE_LIMIT) {
    const oldest = decoded.keys().next().value;
    if (oldest !== undefined) decoded.delete(oldest);
  }
  decoded.set(hash, image);
  return image;
}

export function BlurHash({ hash }: { hash: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const image = decodeHash(hash);
    if (image) ctx.putImageData(image, 0, 0);
    else ctx.clearRect(0, 0, SIZE, SIZE);
  }, [hash]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      className={styles.hash}
      aria-hidden
    />
  );
}
