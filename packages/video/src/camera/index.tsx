import type { ReactNode } from "react";
import { keyed } from "../motion";
import type { Key } from "../motion";
import { WIDTH } from "../video";
import styles from "./styles.module.css";

/** A stage-space crop; height follows from the 16:9 frame. */
export interface Crop {
  x: number;
  y: number;
  width: number;
}

export const WHOLE: Crop = { x: 0, y: 0, width: WIDTH };

interface CameraProps {
  t: number;
  keys: ReadonlyArray<Key<Crop>>;
  opacity?: number;
  children: ReactNode;
}

/** Eases between crops of the stage, so a scene can push in on a detail and pull back out. */
export function Camera({ t, keys, opacity = 1, children }: CameraProps) {
  const crop = keyed(t, keys);
  return (
    <div
      className={styles.camera}
      style={{
        transform: `scale(${WIDTH / crop.width}) translate(${-crop.x}px, ${-crop.y}px)`,
        opacity,
        visibility: opacity <= 0.002 ? "hidden" : undefined,
      }}
    >
      {children}
    </div>
  );
}
