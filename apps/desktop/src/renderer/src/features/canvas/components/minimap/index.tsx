import {
  useReactFlow,
  useStore,
  useViewport,
  type XYPosition,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { type PointerEvent, useRef, useState } from "react";
import {
  boardBounds,
  fitFrame,
  grabOffset,
  type MinimapFrame,
  toMap,
  viewportAt,
  visibleArea,
} from "../../lib/minimap";
import type { Box } from "../../lib/transform";
import styles from "./styles.module.css";

const MAP = { width: 200, height: 136 };
const PADDING = 8;
const NAVIGATE_MS = 200;

export interface MinimapItem extends Box {
  id: string;
  kind: "item" | "section";
  selected: boolean;
}

interface MinimapProps {
  items: readonly MinimapItem[];
  shown: boolean;
}

function pointIn(event: PointerEvent<SVGSVGElement>): XYPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) * MAP.width) / (bounds.width || 1),
    y: ((event.clientY - bounds.top) * MAP.height) / (bounds.height || 1),
  };
}

export function Minimap({ items, shown }: MinimapProps) {
  const flow = useReactFlow();
  const viewport = useViewport();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const reduceMotion = useReducedMotion();
  const drag = useRef<{ grab: XYPosition; frame: MinimapFrame } | null>(null);
  /** The frame holds still while dragging, or the map would rescale under the pointer as the view nears its edge. */
  const [held, setHeld] = useState<MinimapFrame | null>(null);

  const screen = { width, height };
  const visible = visibleArea(viewport, screen);
  const frame = held ?? fitFrame(boardBounds(items, visible), MAP, PADDING);
  const view = toMap(visible, frame);

  const release = () => {
    drag.current = null;
    setHeld(null);
  };

  return (
    <div
      className={styles.minimap}
      data-shown={shown || undefined}
      inert={!shown}
    >
      <svg
        className={styles.map}
        width={MAP.width}
        height={MAP.height}
        viewBox={`0 0 ${MAP.width} ${MAP.height}`}
        role="img"
        aria-label="Minimap"
        data-dragging={held ? "" : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || !width || !height) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = pointIn(event);
          const grip = grabOffset(point, view);
          drag.current = { grab: grip ?? { x: 0, y: 0 }, frame };
          setHeld(frame);
          if (grip) return;
          void flow.setViewport(
            viewportAt(point, { x: 0, y: 0 }, frame, viewport.zoom, screen),
            { duration: reduceMotion ? 0 : NAVIGATE_MS },
          );
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          void flow.setViewport(
            viewportAt(
              pointIn(event),
              current.grab,
              current.frame,
              flow.getZoom(),
              screen,
            ),
          );
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        {items.map((item) => {
          const box = toMap(item, frame);
          return (
            <rect
              key={item.id}
              className={styles.item}
              data-kind={item.kind}
              data-selected={item.selected || undefined}
              x={box.x}
              y={box.y}
              width={Math.max(box.width, 1)}
              height={Math.max(box.height, 1)}
              rx={1}
            />
          );
        })}
        <rect
          className={styles.view}
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          rx={2}
        />
      </svg>
    </div>
  );
}
