import { describe, expect, it } from "vitest";
import { mediaWarmPauseReason } from "./policy";

const ready = {
  idleSeconds: 20,
  onBattery: false,
  thermal: "nominal" as const,
  manual: false,
};

describe("mediaWarmPauseReason", () => {
  it("waits until the system has been idle for ten seconds", () => {
    expect(mediaWarmPauseReason(ready)).toBeNull();
    expect(mediaWarmPauseReason({ ...ready, idleSeconds: 9 })).toBe("active");
  });

  it("pauses automatic work on battery or under thermal pressure", () => {
    expect(mediaWarmPauseReason({ ...ready, onBattery: true })).toBe("battery");
    expect(mediaWarmPauseReason({ ...ready, thermal: "serious" })).toBe(
      "thermal",
    );
  });

  it("lets a manual run bypass idle and battery, but not thermal pressure", () => {
    expect(
      mediaWarmPauseReason({
        ...ready,
        idleSeconds: 0,
        onBattery: true,
        manual: true,
      }),
    ).toBeNull();
    expect(
      mediaWarmPauseReason({ ...ready, thermal: "critical", manual: true }),
    ).toBe("thermal");
  });
});
