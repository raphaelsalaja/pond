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

it("records keys for the unbound ring shortcut and clears it back to unbound", async () => {
  let prefs = DEFAULT_PREFS;
  const saved: Record<string, string>[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", {
    async query(
      name: string,
      input: { shortcuts?: { overrides: Record<string, string> } },
    ) {
      if (name === "settings.getPrefs") return prefs;
      if (name === "settings.globalShortcutStatus")
        return { enabled: true, errors: [] };
      const overrides = input.shortcuts?.overrides ?? {};
      saved.push(overrides);
      prefs = { ...prefs, shortcuts: { ...prefs.shortcuts, overrides } };
      return { prefs };
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const field = () =>
    host.querySelector<HTMLInputElement>(
      'input[aria-label="Change Open File To Ring shortcut"]',
    );
  const clear = () =>
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear Open File To Ring shortcut"]',
    );
  const settle = async () => {
    for (let tick = 0; tick < 5; tick++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };
  try {
    await act(async () => root.render(<ShortcutSettings />));
    expect(
      host.querySelector('[id="setting-shortcuts-app.file-ring"]'),
    ).not.toBeNull();
    expect(field()?.value).toBe("");
    expect(field()?.placeholder).toBe("Record Shortcut");
    expect(clear()).toBeNull();
    await act(async () => field()?.click());
    await act(async () =>
      field()?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F12",
          code: "F12",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
        }),
      ),
    );
    await settle();
    expect(saved).toEqual([{ "app.file-ring": "Control+Alt+F12" }]);
    expect(field()?.value).not.toBe("");
    expect(clear()?.textContent).toBe("Clear");
    expect(
      host.querySelector('button[aria-label="Reset Show Pond shortcut"]'),
    ).toBeNull();
    await act(async () => clear()?.click());
    await settle();
    expect(saved.at(-1)).toEqual({});
    expect(field()?.value).toBe("");
    expect(clear()).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
