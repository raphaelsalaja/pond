import { expect, it } from "vitest";
import {
  enrichmentCooldownFactor,
  enrichmentRestMs,
  enrichmentSuspended,
  motionPaused,
  playbackPaused,
  THERMAL_RELIEF_MS,
} from "./machine-pace";
import type { MachinePace } from "./machine-pace";

function pace(patch: Partial<MachinePace> = {}): MachinePace {
  return {
    hidden: false,
    focused: true,
    onBattery: false,
    thermal: "nominal",
    reliefAt: null,
    ...patch,
  };
}

const now = 1_000_000;

it("pauses decorative motion while hidden, unfocused, or hot", () => {
  expect(motionPaused(pace(), now)).toBe(false);
  expect(motionPaused(pace({ hidden: true }), now)).toBe(true);
  expect(motionPaused(pace({ focused: false }), now)).toBe(true);
  expect(motionPaused(pace({ thermal: "fair" }), now)).toBe(true);
  expect(motionPaused(pace({ thermal: "serious" }), now)).toBe(true);
  expect(motionPaused(pace({ thermal: "critical" }), now)).toBe(true);
});

it("allows explicit playback under fair heat but not while hidden, unfocused, or seriously hot", () => {
  expect(playbackPaused(pace(), now)).toBe(false);
  expect(playbackPaused(pace({ thermal: "fair" }), now)).toBe(false);
  expect(playbackPaused(pace({ hidden: true }), now)).toBe(true);
  expect(playbackPaused(pace({ focused: false }), now)).toBe(true);
  expect(playbackPaused(pace({ thermal: "serious" }), now)).toBe(true);
  expect(playbackPaused(pace({ thermal: "critical" }), now)).toBe(true);
  expect(
    playbackPaused(pace({ reliefAt: now - THERMAL_RELIEF_MS + 1 }), now),
  ).toBe(true);
  expect(playbackPaused(pace({ reliefAt: now - THERMAL_RELIEF_MS }), now)).toBe(
    false,
  );
});

it("stops enrichment while hidden or hot, and keeps going in a background window", () => {
  expect(enrichmentSuspended(pace(), now)).toBe(false);
  expect(enrichmentSuspended(pace({ focused: false }), now)).toBe(false);
  expect(enrichmentSuspended(pace({ thermal: "fair" }), now)).toBe(false);
  expect(enrichmentSuspended(pace({ hidden: true }), now)).toBe(true);
  expect(enrichmentSuspended(pace({ thermal: "serious" }), now)).toBe(true);
  expect(
    enrichmentSuspended(pace({ reliefAt: now - THERMAL_RELIEF_MS + 1 }), now),
  ).toBe(true);
  expect(
    enrichmentSuspended(pace({ reliefAt: now - THERMAL_RELIEF_MS }), now),
  ).toBe(false);
});

it("rests longer on battery, in the background, and under fair heat", () => {
  expect(enrichmentCooldownFactor(pace())).toBe(1);
  expect(enrichmentCooldownFactor(pace({ onBattery: true }))).toBe(2.5);
  expect(enrichmentCooldownFactor(pace({ focused: false }))).toBe(2.5);
  expect(enrichmentCooldownFactor(pace({ thermal: "fair" }))).toBe(2);
  expect(
    enrichmentCooldownFactor(
      pace({ onBattery: true, focused: false, thermal: "fair" }),
    ),
  ).toBe(4);
});

it("pauses inference under memory pressure and resumes when pressure clears", () => {
  expect(enrichmentSuspended(pace({ memoryPressure: "warning" }), now)).toBe(
    true,
  );
  expect(enrichmentSuspended(pace({ memoryPressure: "critical" }), now)).toBe(
    true,
  );
  expect(enrichmentSuspended(pace({ memoryPressure: "normal" }), now)).toBe(
    false,
  );
});

it("caps the rest between runs so a long inference still yields the CPU", () => {
  expect(enrichmentRestMs(100, 1)).toBe(400);
  expect(enrichmentRestMs(2000, 1)).toBe(1000);
  expect(enrichmentRestMs(20_000, 1)).toBe(3000);
  expect(enrichmentRestMs(20_000, 4)).toBe(12_000);
});
