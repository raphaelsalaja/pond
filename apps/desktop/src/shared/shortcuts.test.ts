import { describe, expect, it } from "vitest";
import { shortcutPlatformFromName } from "./shortcuts";

describe("shortcut platform detection", () => {
  it("maps navigator and process platform names", () => {
    expect(shortcutPlatformFromName("MacIntel")).toBe("mac");
    expect(shortcutPlatformFromName("darwin")).toBe("mac");
    expect(shortcutPlatformFromName("Win32")).toBe("windows");
    expect(shortcutPlatformFromName("Linux x86_64")).toBe("linux");
  });

  it("keeps macOS behavior when the platform is unknown", () => {
    expect(shortcutPlatformFromName("")).toBe("mac");
  });
});
