import { describe, expect, it } from "vitest";
import {
  consoleLoggingEnabled,
  protocolRegistration,
  resolveLaunchHidden,
  shouldShowDock,
  shouldStayResident,
} from "./lifecycle";

describe("shouldStayResident", () => {
  it("quits on Windows after the last window closes unless close-to-tray is on", () => {
    expect(
      shouldStayResident({
        platform: "win32",
        closeToTray: false,
        hasTray: true,
      }),
    ).toBe(false);
    expect(
      shouldStayResident({
        platform: "win32",
        closeToTray: true,
        hasTray: true,
      }),
    ).toBe(true);
    expect(
      shouldStayResident({
        platform: "win32",
        closeToTray: true,
        hasTray: false,
      }),
    ).toBe(false);
  });

  it("keeps the existing macOS and Linux behaviour", () => {
    expect(
      shouldStayResident({
        platform: "darwin",
        closeToTray: false,
        hasTray: false,
      }),
    ).toBe(true);
    expect(
      shouldStayResident({
        platform: "linux",
        closeToTray: false,
        hasTray: true,
      }),
    ).toBe(true);
    expect(
      shouldStayResident({
        platform: "linux",
        closeToTray: false,
        hasTray: false,
      }),
    ).toBe(false);
  });
});

describe("shouldShowDock", () => {
  it("hides on Automatic once no window is open", () => {
    expect(shouldShowDock({ visibility: "automatic", openWindows: 0 })).toBe(
      false,
    );
    expect(shouldShowDock({ visibility: "automatic", openWindows: 1 })).toBe(
      true,
    );
  });

  it("keeps the icon on Always Visible with no windows", () => {
    expect(shouldShowDock({ visibility: "always", openWindows: 0 })).toBe(true);
  });
});

describe("protocolRegistration", () => {
  const base = { hasInstanceLock: true, sandboxed: false, defaultApp: false };

  it("skips development builds on Windows only", () => {
    expect(
      protocolRegistration({ ...base, platform: "win32", defaultApp: true }),
    ).toBe("none");
    expect(
      protocolRegistration({ ...base, platform: "darwin", defaultApp: true }),
    ).toBe("development");
    expect(protocolRegistration({ ...base, platform: "win32" })).toBe(
      "packaged",
    );
  });

  it("leaves a losing second Windows instance and sandboxes alone", () => {
    expect(
      protocolRegistration({
        ...base,
        platform: "win32",
        hasInstanceLock: false,
      }),
    ).toBe("none");
    expect(
      protocolRegistration({ ...base, platform: "linux", sandboxed: true }),
    ).toBe("none");
  });
});

describe("resolveLaunchHidden", () => {
  it("opens the window on Windows when there is no tray icon to reopen it", () => {
    expect(
      resolveLaunchHidden({
        platform: "win32",
        requested: true,
        trayEnabled: false,
      }),
    ).toBe(false);
    expect(
      resolveLaunchHidden({
        platform: "win32",
        requested: true,
        trayEnabled: true,
      }),
    ).toBe(true);
    expect(
      resolveLaunchHidden({
        platform: "darwin",
        requested: true,
        trayEnabled: false,
      }),
    ).toBe(true);
  });
});

describe("consoleLoggingEnabled", () => {
  it("keeps stdout clean for the MCP server only", () => {
    expect(consoleLoggingEnabled(["Pond.exe", "--mcp"])).toBe(false);
    expect(consoleLoggingEnabled(["Pond.exe", "pond://library"])).toBe(true);
  });
});
