import { useReactFlow, useStore, ViewportPortal } from "@xyflow/react";
import { useRef } from "react";
import type { PointerEvent } from "react";
import { turnOf } from "../../lib/edit";
import {
  CORNERS,
  cornerAt,
  cursorFor,
  resizeTurned,
} from "../../lib/transform";
import type { Box, Corner, Size } from "../../lib/transform";
import styles from "./styles.module.css";

interface AffordanceProps {
  frame: Box;
  rotation: number | undefined;
  min: Size;
  onStart: () => void;
  onRotate: (rotation: number | undefined) => void;
  onResize: (frame: Box) => void;
}

type Grab =
  | { kind: "turn"; angle: number; rotation: number }
  | { kind: "size"; corner: Corner; frame: Box };

/** Rotation zones sit past each corner; a turned item also gets corner handles that turn with it. */
export function Affordance({
  frame,
  rotation,
  min,
  onStart,
  onRotate,
  onResize,
}: AffordanceProps) {
  const flow = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const grab = useRef<Grab | null>(null);
  const started = useRef(false);
  const angle = rotation ?? 0;
  const center = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
  const pointAt = (event: PointerEvent) =>
    flow.screenToFlowPosition(
      { x: event.clientX, y: event.clientY },
      { snapToGrid: false },
    );
  const angleAt = (event: PointerEvent) => {
    const point = pointAt(event);
    return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
  };
  const begin = (event: PointerEvent<HTMLElement>, next: Grab) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = next;
    started.current = false;
  };
  const move = (event: PointerEvent) => {
    const current = grab.current;
    if (!current) return;
    if (!started.current) {
      started.current = true;
      onStart();
    }
    if (current.kind === "turn") {
      const turned = current.rotation + angleAt(event) - current.angle;
      onRotate(turnOf(turned, event.shiftKey ? 15 : 1));
      return;
    }
    onResize(
      resizeTurned(
        current.frame,
        angle,
        current.corner,
        pointAt(event),
        min,
        event.shiftKey,
      ),
    );
  };
  const end = () => {
    grab.current = null;
  };
  const pad = 14 / zoom;
  const outward = (corner: Corner) =>
    cornerAt(
      {
        x: frame.x - pad,
        y: frame.y - pad,
        width: frame.width + pad * 2,
        height: frame.height + pad * 2,
      },
      angle,
      corner,
    );
  return (
    <ViewportPortal>
      {CORNERS.map((corner) => {
        const point = outward(corner);
        return (
          <button
            key={`turn-${corner}`}
            type="button"
            className={styles.turn}
            aria-label="Rotate"
            style={{
              transform: `translate(${point.x}px, ${point.y}px) translate(-50%, -50%) scale(${1 / zoom})`,
            }}
            onPointerDown={(event) =>
              begin(event, {
                kind: "turn",
                angle: angleAt(event),
                rotation: angle,
              })
            }
            onPointerMove={move}
            onPointerUp={end}
            onLostPointerCapture={end}
          />
        );
      })}
      {angle
        ? CORNERS.map((corner) => {
            const point = cornerAt(frame, angle, corner);
            return (
              <button
                key={`size-${corner}`}
                type="button"
                className={styles.size}
                aria-label="Resize"
                style={{
                  cursor: cursorFor(corner, angle),
                  transform: `translate(${point.x}px, ${point.y}px) translate(-50%, -50%) scale(${1 / zoom}) rotate(${angle}deg)`,
                }}
                onPointerDown={(event) =>
                  begin(event, { kind: "size", corner, frame })
                }
                onPointerMove={move}
                onPointerUp={end}
                onLostPointerCapture={end}
              />
            );
          })
        : null}
    </ViewportPortal>
  );
}
