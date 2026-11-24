import { z } from "zod";

export const ThermalStateSchema = z.enum([
  "unknown",
  "nominal",
  "fair",
  "serious",
  "critical",
]);

export type ThermalState = z.infer<typeof ThermalStateSchema>;

export const MachinePaceWireSchema = z.object({
  thermal: ThermalStateSchema,
  onBattery: z.boolean(),
  memoryPressure: z.enum(["normal", "warning", "critical"]).optional(),
});

export type MachinePaceWire = z.infer<typeof MachinePaceWireSchema>;

export interface MachinePace {
  hidden: boolean;
  focused: boolean;
  onBattery: boolean;
  thermal: ThermalState;
  reliefAt: number | null;
  memoryPressure?: "normal" | "warning" | "critical";
}

/** Keep heavy work paused after the Mac leaves serious or critical heat so it can cool. */
export const THERMAL_RELIEF_MS = 20_000;

const REST_MIN_MS = 400;
const REST_MAX_MS = 3000;
/** Battery, a background window, and fair heat stack, but the rest stays bounded so a backlog still finishes. */
const COOLDOWN_FACTOR_CAP = 4;

function thermalHot(pace: MachinePace, now: number): boolean {
  if (pace.thermal === "serious" || pace.thermal === "critical") {
    return true;
  }
  return pace.reliefAt !== null && now - pace.reliefAt < THERMAL_RELIEF_MS;
}

/** Decorative motion stops while Pond is covered, unfocused, or the Mac is warm. */
export function motionPaused(pace: MachinePace, now: number): boolean {
  return (
    pace.hidden ||
    !pace.focused ||
    pace.thermal === "fair" ||
    thermalHot(pace, now)
  );
}

/** Inference stops while the window is hidden or the Mac is hot. A background window still finishes work, more slowly. */
export function enrichmentSuspended(pace: MachinePace, now: number): boolean {
  return (
    pace.hidden ||
    thermalHot(pace, now) ||
    pace.memoryPressure === "warning" ||
    pace.memoryPressure === "critical"
  );
}

export function enrichmentCooldownFactor(pace: MachinePace): number {
  let factor = 1;
  if (pace.onBattery) {
    factor *= 2.5;
  }
  if (!pace.focused) {
    factor *= 2.5;
  }
  if (pace.thermal === "fair") {
    factor *= 2;
  }
  return Math.min(factor, COOLDOWN_FACTOR_CAP);
}

export function enrichmentRestMs(lastRunMs: number, factor: number): number {
  return Math.min(
    REST_MAX_MS * factor,
    Math.max(REST_MIN_MS * factor, lastRunMs * 0.5 * factor),
  );
}
