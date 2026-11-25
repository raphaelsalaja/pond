import { Button } from "@pond/ui/button";
import { Popover } from "@pond/ui/popover";
import { Toolbar } from "@pond/ui/toolbar";
import { useEffect, useEffectEvent, useState } from "react";
import type { PointerEvent } from "react";
import type { OverlayResult } from "@/utils/messaging";
import {
  clampPoint,
  clipRect,
  HANDLES,
  moveRect,
  rectBetween,
  resizeRect,
  viewportRegion,
} from "../geometry";
import type { Handle, Point, Rect } from "../geometry";
import { Hint } from "../hint";
import { useEscape } from "../use-escape";
import styles from "./styles.module.css";

/** Under this many pixels a press counts as a click that snaps to the element. */
const DRAG_THRESHOLD = 4;

type Gesture =
  | { kind: "draw"; start: Point; moved: boolean }
  | { kind: "move" | Handle; start: Point; from: Rect };

/** The overlay covers the page, so look underneath it for the element you're pointing at. */
function elementRect(point: Point): Rect | null {
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    if (element.closest("pond-overlay")) continue;
    if (element === document.documentElement) return null;
    const box = element.getBoundingClientRect();
    return clipRect({
      x: box.left,
      y: box.top,
      width: box.width,
      height: box.height,
    });
  }
  return null;
}

function eventPoint(event: PointerEvent) {
  return clampPoint(event.clientX, event.clientY);
}

function boxStyle(rect: Rect) {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

interface RegionPickerProps {
  container: HTMLElement;
  onFinish: (result: OverlayResult | null) => void;
}

export function RegionPicker({ container, onFinish }: RegionPickerProps) {
  const [hover, setHover] = useState<Rect | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  useEscape(() => onFinish(null));

  const save = () => {
    const region = box && viewportRegion(box);
    if (region) onFinish({ kind: "region", region });
  };

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Enter" || !box) return;
    event.preventDefault();
    event.stopPropagation();
    save();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  const begin = (event: PointerEvent, next: Gesture) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture(next);
  };

  const onMove = (event: PointerEvent) => {
    const at = eventPoint(event);
    if (!gesture) {
      if (!box) setHover(elementRect(at));
      return;
    }
    const dx = at.x - gesture.start.x;
    const dy = at.y - gesture.start.y;
    if (gesture.kind === "draw") {
      const moved = gesture.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD;
      if (!moved) return;
      if (!gesture.moved) setGesture({ ...gesture, moved });
      setHover(null);
      setBox(rectBetween(gesture.start, at));
      return;
    }
    setBox(
      gesture.kind === "move"
        ? moveRect(gesture.from, dx, dy)
        : resizeRect(gesture.from, gesture.kind, dx, dy),
    );
  };

  const onUp = () => {
    if (gesture?.kind === "draw") {
      if (!gesture.moved) setBox(hover);
      else setBox((current) => (current ? clipRect(current) : null));
      setHover(null);
    }
    setGesture(null);
  };

  const adjusting = box && gesture?.kind !== "draw";

  return (
    <div
      className={styles.surface}
      data-picking={!box || undefined}
      onPointerDown={(event) =>
        begin(event, { kind: "draw", start: eventPoint(event), moved: false })
      }
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setGesture(null)}
      onPointerLeave={() => {
        if (!gesture) setHover(null);
      }}
    >
      {hover && !box ? (
        <div className={styles.highlight} style={boxStyle(hover)} />
      ) : null}
      {box ? (
        <div
          ref={setAnchor}
          className={styles.box}
          style={boxStyle(box)}
          data-drawing={gesture?.kind === "draw" || undefined}
          onPointerDown={(event) =>
            begin(event, { kind: "move", start: eventPoint(event), from: box })
          }
        >
          <span className={styles.size}>
            {Math.round(box.width)} × {Math.round(box.height)}
          </span>
          {adjusting
            ? HANDLES.map((handle) => (
                <span
                  key={handle}
                  className={styles.handle}
                  data-handle={handle}
                  onPointerDown={(event) =>
                    begin(event, {
                      kind: handle,
                      start: eventPoint(event),
                      from: box,
                    })
                  }
                />
              ))
            : null}
        </div>
      ) : (
        <Hint>Click an element or drag to select. Press Esc to cancel.</Hint>
      )}
      <Popover.Root open={Boolean(adjusting && !gesture && anchor)}>
        <Popover.Portal container={container}>
          <Popover.Positioner anchor={anchor} side="bottom" align="end">
            <Popover.Popup
              className={styles.actions}
              initialFocus={false}
              finalFocus={false}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Toolbar.Root className={styles.toolbar} aria-label="Region">
                <Toolbar.Button
                  render={<Button size="sm" variant="secondary" />}
                  onClick={() => onFinish(null)}
                >
                  Cancel
                </Toolbar.Button>
                <Toolbar.Button
                  render={<Button size="sm" variant="primary" />}
                  onClick={save}
                >
                  Save
                </Toolbar.Button>
              </Toolbar.Root>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
