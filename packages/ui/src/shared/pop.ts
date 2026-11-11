import { prefersReducedMotion } from "./reduced-motion";

const POP_ID = "pond-pop";
const SWING = "cubic-bezier(0.37, 0, 0.63, 1)";

const POP_FRAMES: Keyframe[] = [
  { scale: 1, easing: SWING },
  { scale: 0.82, offset: 0.2, easing: SWING },
  { scale: 1.14, offset: 0.5, easing: SWING },
  { scale: 0.96, offset: 0.72, easing: SWING },
  { scale: 1.02, offset: 0.88, easing: SWING },
  { scale: 1 },
];

export function pop(element: Element | null | undefined): void {
  if (!element || !("animate" in element) || prefersReducedMotion()) {
    return;
  }
  for (const animation of element.getAnimations()) {
    if (animation.id === POP_ID) animation.cancel();
  }
  element.animate(POP_FRAMES, { duration: 480, id: POP_ID });
}
