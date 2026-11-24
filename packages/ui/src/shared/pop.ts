import { prefersReducedMotion } from "./reduced-motion";

const POP_ID = "pond-pop";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const POP_FRAMES: Array<Keyframe> = [
  { scale: 1, easing: EASE_OUT },
  { scale: 0.92, offset: 0.3, easing: EASE_OUT },
  { scale: 1 },
];

export function pop(element: Element | null | undefined): void {
  if (!element || !("animate" in element) || prefersReducedMotion()) {
    return;
  }
  for (const animation of element.getAnimations()) {
    if (animation.id === POP_ID) {
      animation.cancel();
    }
  }
  element.animate(POP_FRAMES, { duration: 200, id: POP_ID });
}
