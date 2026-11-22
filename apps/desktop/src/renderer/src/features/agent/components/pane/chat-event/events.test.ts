import { describe, expect, it } from "vitest";
import { routineEventText } from "./events";

describe("routineEventText", () => {
  it("says who started the routine and what it looked at", () => {
    expect(routineEventText("Koi", { trigger: "manual" })).toBe(
      "You ran Koi's routine",
    );
    expect(routineEventText("Koi", { trigger: "schedule" })).toBe(
      "Koi ran its scheduled routine",
    );
    expect(routineEventText("Koi", { trigger: "newSaves", saves: 1 })).toBe(
      "Koi looked at 1 new Save",
    );
    expect(routineEventText("Koi", { trigger: "newSaves", saves: 4 })).toBe(
      "Koi looked at 4 new Saves",
    );
  });

  it("names the routine when the run carries one", () => {
    expect(
      routineEventText("Koi", { trigger: "manual", name: "Morning Digest" }),
    ).toBe('You ran "Morning Digest"');
    expect(
      routineEventText("Koi", { trigger: "schedule", name: "Morning Digest" }),
    ).toBe('Koi ran "Morning Digest"');
  });
});
