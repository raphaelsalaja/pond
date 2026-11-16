import type { ReactNode } from "react";
import type { Viewport } from "../geometry";
import styles from "./styles.module.css";

const GRID = 24;

interface BoardProps {
  viewport: Viewport;
  /** Items in board coordinates. */
  children?: ReactNode;
  /** Floating controls in panel coordinates, such as the tools dock and zoom. */
  chrome?: ReactNode;
}

/** A canvas: the dotted gray board, panned and zoomed by `viewport`. */
export function Board({ viewport, children, chrome }: BoardProps) {
  const gap = GRID * viewport.zoom;
  const dot = 0.75 * viewport.zoom;
  return (
    <div className={styles.board}>
      <div
        className={styles.dots}
        style={{
          backgroundSize: `${gap}px ${gap}px`,
          backgroundPosition: `${viewport.x - gap / 2}px ${viewport.y - gap / 2}px`,
          backgroundImage: `radial-gradient(circle, var(--ds-surface-tertiary) ${dot}px, transparent ${dot + 0.5}px)`,
        }}
      />
      <div
        className={styles.world}
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {children}
      </div>
      {chrome}
    </div>
  );
}
