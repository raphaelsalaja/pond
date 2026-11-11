import { describe, expect, it } from "vitest";
import { resolveShortcuts } from "@/shared/lib/shortcuts";
import { type PreviewStepBinding, previewStepRuns } from "./preview-step";

const defaults = resolveShortcuts({ profile: "pond", overrides: {} });

function press(key: string, shiftKey = false): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, shiftKey });
}

function runs(
  binding: PreviewStepBinding,
  event: KeyboardEvent,
  videoShown: boolean,
  bindings = defaults,
): boolean {
  return previewStepRuns({ event, binding, bindings, videoShown });
}

describe("preview arrow keys", () => {
  it("steps between images and saves with plain arrows when no video is shown", () => {
    expect(runs("step", press("ArrowLeft"), false)).toBe(true);
    expect(runs("step", press("ArrowRight"), false)).toBe(true);
  });

  it("leaves plain arrows to seeking while a video is shown", () => {
    expect(runs("step", press("ArrowLeft"), true)).toBe(false);
    expect(runs("step", press("ArrowRight"), true)).toBe(false);
  });

  it("steps with Shift and the arrows only while a video is shown", () => {
    expect(runs("video-step", press("ArrowLeft", true), true)).toBe(true);
    expect(runs("video-step", press("ArrowRight", true), true)).toBe(true);
    expect(runs("video-step", press("ArrowLeft", true), false)).toBe(false);
  });

  it("keeps plain arrows stepping when seeking is rebound", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: { "viewer.seek-back": "J", "viewer.seek-forward": "L" },
    });

    expect(runs("step", press("ArrowLeft"), true, bindings)).toBe(true);
  });

  it("steps once when the video binding matches the plain step binding", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: {
        "viewer.seek-back": "J",
        "viewer.video-step-prev": "ArrowLeft",
      },
    });
    const event = press("ArrowLeft");

    expect(runs("step", event, true, bindings)).toBe(true);
    expect(runs("video-step", event, true, bindings)).toBe(false);
  });

  it("seeks instead of stepping when the video step binding is the seek binding", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: { "viewer.video-step-prev": "ArrowLeft" },
    });

    expect(runs("video-step", press("ArrowLeft"), true, bindings)).toBe(false);
  });
});
