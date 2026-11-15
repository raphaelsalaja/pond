import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandMenu } from "@/features/library/state/command-menu";
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

  it("opens the command menu from Search Pond", async () => {
    const open = vi.spyOn(commandMenu, "open");
    await harness.mount();
    const search = harness.button("Search Pond");
    expect(search.querySelector("kbd")).not.toBeNull();
    await act(async () => search.click());
    expect(open).toHaveBeenCalledOnce();
    open.mockRestore();
    commandMenu.close();
  });
});
