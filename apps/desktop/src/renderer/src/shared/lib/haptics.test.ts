import type { HapticPattern } from "@shared/haptics";
import { describe, expect, it } from "vitest";
import { createDragHaptics } from "./haptics";

function setup() {
  const played: Array<HapticPattern> = [];
  return { played, haptics: createDragHaptics((p) => played.push(p)) };
}

describe("createDragHaptics", () => {
  it("plays once for pickup, each new target, and the drop", () => {
    const { played, haptics } = setup();
    haptics.start(false);
    haptics.target({ id: "a", kind: "before" });
    haptics.target({ id: "a", kind: "before" });
    haptics.target({ id: "a", kind: "into" });
    haptics.target({ id: "b", kind: "after" });
    haptics.drop(true);
    expect(played).toEqual([
      "generic",
      "alignment",
      "level-change",
      "alignment",
      "generic",
    ]);
  });

  it("plays again when the drag comes back to a target after leaving it", () => {
    const { played, haptics } = setup();
    haptics.start(false);
    haptics.target({ id: "a", kind: "before" });
    haptics.target(null);
    haptics.target({ id: "a", kind: "before" });
    expect(played).toEqual(["generic", "alignment", "alignment"]);
  });

  it("stays silent for keyboard drags", () => {
    const { played, haptics } = setup();
    haptics.start(true);
    haptics.target({ id: "a", kind: "after" });
    haptics.drop(true);
    expect(played).toEqual([]);
  });

  it("does not confirm a canceled or invalid drop", () => {
    const { played, haptics } = setup();
    haptics.start(false);
    haptics.drop(false);
    haptics.start(false);
    haptics.cancel();
    haptics.drop(true);
    expect(played).toEqual(["generic", "generic"]);
  });
});
