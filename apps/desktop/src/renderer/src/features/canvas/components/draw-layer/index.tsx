import type { CanvasColor } from "@shared/canvas-contracts";
import { useReactFlow } from "@xyflow/react";
import { useRef, useState } from "react";
import { INK } from "../../lib/colors";
import type { StrokePoint } from "../../lib/document";
import { strokePath } from "../../lib/stroke";
import styles from "./styles.module.css";

const MAX_POINTS = 10_000;

interface DrawLayerProps {
  color: CanvasColor;
  size: number;
  mode: "marker" | "highlight" | "erase";
  onStroke: (points: Array<StrokePoint>, size: number) => void;
  onErase: (points: Array<StrokePoint>) => void;
}

export function DrawLayer({
  color,
  size,
  mode,
  onStroke,
  onErase,
}: DrawLayerProps) {
  const flow = useReactFlow();
  const screen = useRef<Array<StrokePoint>>([]);
  const client = useRef<Array<StrokePoint>>([]);
  const [preview, setPreview] = useState<string | null>(null);

  const push = (event: React.PointerEvent<HTMLDivElement>) => {
    if (client.current.length >= MAX_POINTS) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pressure = event.pointerType === "pen" ? event.pressure : 0.5;
    screen.current.push([
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      pressure,
    ]);
    client.current.push([event.clientX, event.clientY, pressure]);
    setPreview(strokePath(screen.current, size));
  };

  const finish = () => {
    const points = client.current.map(([x, y, pressure]): StrokePoint => {
      const flowPoint = flow.screenToFlowPosition(
        { x, y },
        { snapToGrid: false },
      );
      return [flowPoint.x, flowPoint.y, pressure];
    });
    screen.current = [];
    client.current = [];
    setPreview(null);
    if (!points.length) return;
    if (mode === "erase") {
      onErase(points);
      return;
    }
    const zoom = flow.getZoom();
    onStroke(points, Math.min(48, Math.max(1, size / zoom)));
  };

  return (
    <div
      className={styles.layer}
      data-erase={mode === "erase" || undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        screen.current = [];
        client.current = [];
        push(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) push(event);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {preview ? (
        <svg className={styles.preview} aria-hidden="true">
          <path
            d={preview}
            fill={mode === "erase" ? "var(--ds-border-strong)" : INK[color]}
            opacity={mode === "highlight" ? 0.45 : undefined}
          />
        </svg>
      ) : null}
    </div>
  );
}
