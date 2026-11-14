import { DEFAULT_PREFS } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import { ShortcutSettings } from "./";

it("shows editable shortcuts without profile controls or explanatory copy", async () => {
  const writes: string[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", {
    async query(name: string) {
      if (name === "settings.getPrefs") return DEFAULT_PREFS;
      if (name === "settings.globalShortcutStatus")
        return { enabled: true, errors: ["Show Pond is unavailable."] };
      writes.push(name);
      throw new Error(
        "Show Pond is unavailable. Your shortcuts were not changed.",
      );
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ShortcutSettings />));
    expect(host.textContent).not.toContain("Eagle uses");
    expect(host.textContent).not.toContain("Global shortcuts work");
    expect(host.querySelector('[aria-label="Shortcut Profile"]')).toBeNull();
    expect(host.textContent).toContain("Show Pond is unavailable.");
    const globalHeading = [...host.querySelectorAll("h2")].find((heading) =>
      heading.textContent?.includes("Global (2)"),
    );
    expect(globalHeading?.parentElement?.textContent).toContain("Show Pond");
    expect(host.textContent).toContain("Navigate (");
    const control = host.querySelector<HTMLInputElement>(
      'input[aria-label="Change Show Pond shortcut"]',
    );
    if (!control) throw Error("Missing summon shortcut control");
    await act(async () => control.click());
    await act(async () =>
      control.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F12",
          code: "F12",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
        }),
      ),
    );
    expect(writes).toEqual(["settings.setPrefs"]);
    expect(host.textContent).toContain("Your previous shortcut is unchanged.");
    expect(control.value).toBe("Press keys");
    expect(
      getPrefsSnapshot()?.shortcuts.overrides["app.summon"],
    ).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
