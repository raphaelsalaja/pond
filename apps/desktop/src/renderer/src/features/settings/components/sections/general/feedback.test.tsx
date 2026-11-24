import { DEFAULT_PREFS } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SoundPreferences } from "./feedback";

it("gives every sound switch its own accessible name", async () => {
  vi.stubGlobal("pond", {
    async query(name: string) {
      if (name === "settings.getPrefs") {
        return DEFAULT_PREFS;
      }
      throw new Error(`Unexpected query: ${name}`);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<SoundPreferences />));
    const names = [...host.querySelectorAll('[role="switch"]')].map((control) =>
      control.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      "All Sounds",
      "Interface Sounds",
      "Save Deletion Sounds",
      "Folder Deletion Sounds",
    ]);
    expect(host.textContent).toContain("All Sounds");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
