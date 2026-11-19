import { z } from "zod";

/** Mirrors AppKit's `NSHapticFeedbackManager.FeedbackPattern`. */
export const HapticPatternSchema = z.enum([
  "generic",
  "alignment",
  "level-change",
]);

export type HapticPattern = z.infer<typeof HapticPatternSchema>;
