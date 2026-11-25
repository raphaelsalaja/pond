import { useReactFlow } from "@xyflow/react";
import { useRef, useState } from "react";
import styles from "./styles.module.css";

interface FlowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlaceLayerProps {
  onPlace: (rect: FlowRect | null, point: { x: number; y: number }) => void;
}

const CLICK = 6;

/** Click drops the default size. A drag becomes the item's rectangle. */
export function PlaceLayer({ onPlace }: PlaceLayerProps) {
  const flow = useReactFlow();
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<FlowRect | null>(null);

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    origin.current = null;
    setDraft(null);
    if (!start) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const corner = (x: number, y: number) =>
      flow.screenToFlowPosition(
        { x: bounds.left + x, y: bounds.top + y },
        { snapToGrid: false },
      );
    const end = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    if (Math.hypot(end.x - start.x, end.y - start.y) < CLICK) {
      onPlace(null, corner(end.x, end.y));
      return;
    }
    const a = corner(start.x, start.y);
    const b = corner(end.x, end.y);
    onPlace(
      { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
      corner(end.x, end.y),
    );
  };

  return (
    <div
      className={styles.layer}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };
      }}
      onPointerMove={(event) => {
        const start = origin.current;
        if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        setDraft({
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          width: Math.abs(x - start.x),
          height: Math.abs(y - start.y),
        });
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {draft && (draft.width > CLICK || draft.height > CLICK) ? (
        <div
          className={styles.preview}
          style={{
            left: draft.x,
            top: draft.y,
            width: draft.width,
            height: draft.height,
          }}
        />
      ) : null}
    </div>
  );
}
