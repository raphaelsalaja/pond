import { describe, expect, it } from "vitest";
import { resolveShortcuts, SHORTCUT_PLATFORM } from "../../shared/shortcuts";
import { menuAccelerator } from "./menu-accelerator";

describe("native menu shortcut presentation", () => {
  it("uses effective overrides for native-owned commands", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: {
        "view.layout-cycle": "Control+Shift+J",
        "view.inspector": "Alt+I",
        "view.zoom-in": "Mod+ArrowUp",
        "nav.back": "Alt+ArrowLeft",
        "app.summon": "Control+Alt+F12",
      },
    });
    expect(menuAccelerator(bindings["view.layout-cycle"])).toBe(
      SHORTCUT_PLATFORM === "mac"
        ? "Control+Shift+J"
        : "CommandOrControl+Shift+J",
    );
    expect(menuAccelerator(bindings["view.inspector"])).toBe("Alt+I");
    expect(menuAccelerator(bindings["view.zoom-in"])).toBe(
      "CommandOrControl+Up",
    );
    expect(menuAccelerator(bindings["nav.back"])).toBe("Alt+Left");
    expect(menuAccelerator(bindings["app.summon"])).toBe(
      SHORTCUT_PLATFORM === "mac"
        ? "Control+Alt+F12"
        : "CommandOrControl+Alt+F12",
    );
  });
  it("tracks Eagle profile changes and restores defaults after resetting overrides", () => {
    const eagle = resolveShortcuts({ profile: "eagle", overrides: {} });
    expect(menuAccelerator(eagle["save.add-tag"])).toBe("T");
    expect(menuAccelerator(eagle["save.reveal"])).toBe("CommandOrControl+R");
    expect(menuAccelerator(eagle["view.layout-grid"])).toBe("Alt+2");
    const pond = resolveShortcuts({ profile: "pond", overrides: {} });
    expect(menuAccelerator(pond["view.layout-cycle"])).toBe(
      "CommandOrControl+Shift+L",
    );
    expect(menuAccelerator(pond["view.grayscale"])).toBe(
      "CommandOrControl+Alt+G",
    );
    expect(menuAccelerator(pond["nav.library"])).toBe("G L");
    expect(menuAccelerator(pond["save.reveal"])).toBe("F");
  });
});
