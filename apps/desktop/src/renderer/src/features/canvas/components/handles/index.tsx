import { IconArrowRight } from "@pond/icons";
import type { CanvasSide } from "@shared/canvas-contracts";
import { Handle, Position } from "@xyflow/react";
import styles from "./styles.module.css";

const SIDES: ReadonlyArray<[CanvasSide, Position]> = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
];

interface HandlesProps {
  /** A click adds a connected copy on that side; a drag still draws a connector. */
  onCreate?: (side: CanvasSide) => void;
}

/** Every side is a source; the board connects in loose mode so any side can link to any other. */
export function Handles({ onCreate }: HandlesProps) {
  return SIDES.map(([id, position]) => (
    <Handle
      key={id}
      id={id}
      type="source"
      position={position}
      className={styles.handle}
      data-creates={onCreate ? true : undefined}
      onClick={
        onCreate
          ? (event) => {
              event.stopPropagation();
              onCreate(id);
            }
          : undefined
      }
    >
      {onCreate ? <IconArrowRight size={12} className={styles.arrow} /> : null}
    </Handle>
  ));
}
