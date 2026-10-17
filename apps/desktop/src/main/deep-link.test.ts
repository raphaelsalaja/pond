import { describe, expect, it, vi } from "vitest";
import {
  deepLinkArg,
  handleSecondInstance,
  shouldOpenInitialWindow,
} from "./deep-link";

describe("deepLinkArg", () => {
  it("finds a Windows protocol launch argument", () => {
    expect(
      deepLinkArg([
        "C:\\Program Files\\Pond\\Pond.exe",
        "pond://settings/general",
      ]),
    ).toBe("pond://settings/general");
  });

  it("ignores unrelated command-line arguments", () => {
    expect(deepLinkArg(["Pond.exe", "--mcp"])).toBeNull();
  });

  it("opens a cold protocol launch even when startup is configured hidden", () => {
    expect(shouldOpenInitialWindow(true, "library")).toBe(true);
    expect(shouldOpenInitialWindow(true, undefined)).toBe(false);
    expect(shouldOpenInitialWindow(false, undefined)).toBe(true);
  });
});

describe("handleSecondInstance", () => {
  it("shows the library window when a second launch has no link", () => {
    const deps = {
      handleDeepLink: vi.fn(),
      getMainWindow: () => null,
      openLibraryWindow: vi.fn(),
    };
    handleSecondInstance(["Pond.exe"], deps);
    expect(deps.handleDeepLink).not.toHaveBeenCalled();
    expect(deps.openLibraryWindow).toHaveBeenCalledTimes(1);
  });

  it("routes a link once and opens the window once", () => {
    const deps = {
      handleDeepLink: vi.fn(() => "library" as const),
      getMainWindow: () => null,
      openLibraryWindow: vi.fn(),
    };
    handleSecondInstance(["Pond.exe", "pond://settings/general"], deps);
    expect(deps.handleDeepLink).toHaveBeenCalledTimes(1);
    expect(deps.handleDeepLink).toHaveBeenCalledWith(
      "pond://settings/general",
      null,
    );
    expect(deps.openLibraryWindow).toHaveBeenCalledTimes(1);
  });

  it("does not open a window for a link that was ignored", () => {
    const deps = {
      handleDeepLink: vi.fn(() => undefined),
      getMainWindow: () => null,
      openLibraryWindow: vi.fn(),
    };
    handleSecondInstance(["Pond.exe", "pond://nonsense"], deps);
    expect(deps.openLibraryWindow).not.toHaveBeenCalled();
  });
});
