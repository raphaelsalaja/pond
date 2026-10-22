import { type RefObject, useEffect, useRef } from "react";

const INTENT_DISTANCE = 5;
const INTENT_MS = 500;

/** True from any key press until the pointer travels 5px or keeps moving for 500ms, so a nudged or resting cursor keeps the keyboard's row. */
export function useKeyboardMode(): RefObject<boolean> {
  const keyboard = useRef(true);
  useEffect(() => {
    let origin: { x: number; y: number; time: number } | null = null;
    const onKeyDown = () => {
      keyboard.current = true;
      origin = null;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!keyboard.current) return;
      if (event.movementX === 0 && event.movementY === 0) return;
      const time = event.timeStamp;
      if (!origin) {
        origin = { x: event.clientX, y: event.clientY, time };
        return;
      }
      const distance = Math.hypot(
        event.clientX - origin.x,
        event.clientY - origin.y,
      );
      if (distance >= INTENT_DISTANCE || time - origin.time >= INTENT_MS) {
        keyboard.current = false;
        origin = null;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
    };
  }, []);
  return keyboard;
}
