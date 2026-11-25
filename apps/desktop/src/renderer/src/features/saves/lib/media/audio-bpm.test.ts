import { expect, it } from "vitest";
import { estimateBpm } from "./audio-bpm";

it("estimates a 120 bpm pulse", () => {
  const sampleRate = 44_100;
  const seconds = 8;
  const samples = new Float32Array(sampleRate * seconds);
  const interval = Math.round(sampleRate * (60 / 120));
  for (let i = 0; i < samples.length; i += interval) samples[i] = 1;
  const bpm = estimateBpm(samples, sampleRate);
  expect(bpm).toBeGreaterThanOrEqual(118);
  expect(bpm).toBeLessThanOrEqual(122);
});

it("returns null for silence", () => {
  expect(estimateBpm(new Float32Array(44_100), 44_100)).toBeNull();
});
