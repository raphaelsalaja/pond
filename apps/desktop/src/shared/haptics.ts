export const HAPTIC_PATTERNS = [
  "generic",
  "alignment",
  "level-change",
] as const;

/** Mirrors AppKit's `NSHapticFeedbackManager.FeedbackPattern`. */
export type HapticPattern = (typeof HAPTIC_PATTERNS)[number];

export function isHapticPattern(value: unknown): value is HapticPattern {
  return (HAPTIC_PATTERNS as readonly unknown[]).includes(value);
}
