import type { HapticPattern } from "@shared/haptics";

type PerformHaptic = (pattern: HapticPattern) => void;

interface DragHapticTarget {
  id: string;
  kind: string;
}

function performNative(pattern: HapticPattern): void {
  globalThis.window?.pond?.performHaptic?.(pattern);
}

/** Plays one haptic per meaningful change in a pointer drag; keyboard drags stay silent. */
export function createDragHaptics(perform: PerformHaptic = performNative) {
  let active = false;
  let last: string | null = null;

  return {
    start(keyboard: boolean): void {
      active = !keyboard;
      last = null;
      if (active) perform("generic");
    },
    /** Call with the drop the indicator shows, or null when there is none. */
    target(target: DragHapticTarget | null): void {
      if (!active) return;
      const key = target ? `${target.id}:${target.kind}` : null;
      if (key === last) return;
      last = key;
      if (target) {
        perform(target.kind === "into" ? "level-change" : "alignment");
      }
    },
    drop(placed: boolean): void {
      if (active && placed) perform("generic");
      active = false;
      last = null;
    },
    cancel(): void {
      active = false;
      last = null;
    },
  };
}
