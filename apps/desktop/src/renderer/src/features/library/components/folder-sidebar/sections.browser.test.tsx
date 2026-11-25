import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePrefsSection } from "@/shared/state/prefs";
import { createFolderSidebarHarness } from "./test-harness";

describe("folder sidebar sections", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  it("leaves hidden sections out of the sidebar", async () => {
    await savePrefsSection("sidebar", {
      sections: {
        smartFolders: false,
        fish: true,
        canvases: false,
        folders: false,
      },
    });
    await harness.mount();
    await act(async () => {});

    const group = (label: string) =>
      harness.host.querySelector(`[aria-label="${label}"]`);
    expect(group("Smart Folders")).toBeNull();
    expect(group("Canvases")).toBeNull();
    expect(group("Folders")).toBeNull();
    expect(group("Fish")).not.toBeNull();
    expect(harness.button("All")).toBeTruthy();
  });
});
