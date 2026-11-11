import { syncConfigFor } from "@pond/schema/sources";
import { describe, expect, it } from "vitest";
import { summarizeSourceGates } from "./source-gate-summary";

const twitter = syncConfigFor("twitter").rate;
const instagram = syncConfigFor("instagram").rate;

describe("summarizeSourceGates", () => {
  it("reports an open gate with its remaining budget and caps", () => {
    expect(
      summarizeSourceGates(
        [
          {
            source: "twitter",
            state: "open",
            reason: "transient_failures",
            retryAt: 5_000,
            probeLeaseToken: null,
          },
        ],
        [{ source: "twitter", hourly: 10, daily: 30 }],
      ),
    ).toEqual([
      {
        source: "twitter",
        state: "open",
        reason: "transient_failures",
        retryAt: 5_000,
        remainingHourly: twitter.maxPerHour - 10,
        remainingDaily: twitter.maxPerDay - 30,
        maxPerHour: twitter.maxPerHour,
        maxPerDay: twitter.maxPerDay,
        recoveryProbe: false,
      },
    ]);
  });

  it("lists a closed source once it spends its hourly or daily budget", () => {
    const gates = summarizeSourceGates(
      [],
      [
        { source: "twitter", hourly: twitter.maxPerHour, daily: 0 },
        { source: "instagram", hourly: 0, daily: instagram.maxPerDay },
        { source: "web", hourly: 3, daily: 3 },
      ],
    );
    expect(gates.map((gate) => [gate.source, gate.state])).toEqual([
      ["twitter", "closed"],
      ["instagram", "closed"],
    ]);
    expect(gates[0]?.remainingHourly).toBe(0);
    expect(gates[1]?.remainingDaily).toBe(0);
  });

  it("marks a half-open gate with a probe lease as a recovery probe", () => {
    const [gate] = summarizeSourceGates(
      [
        {
          source: "youtube",
          state: "half_open",
          reason: "transient_failures",
          retryAt: null,
          probeLeaseToken: "lease",
        },
      ],
      [],
    );
    expect(gate?.recoveryProbe).toBe(true);
    expect(gate?.remainingHourly).toBe(gate?.maxPerHour);
  });
});
