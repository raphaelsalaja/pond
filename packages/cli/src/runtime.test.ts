import { describe, expect, it } from "vitest";
import { pondLaunchCommand } from "./runtime";

describe("pondLaunchCommand", () => {
  it("starts the registered Windows install, wherever it lives", () => {
    const command = pondLaunchCommand(
      "win32",
      { LOCALAPPDATA: "C:/Users/a/AppData/Local" },
      () => "D:/Apps/Pond/Pond.exe",
    );
    expect(command).toEqual({ file: "D:/Apps/Pond/Pond.exe", args: [] });
  });

  it("asks Windows to open the pond:// link when no install is found", () => {
    expect(pondLaunchCommand("win32", {}, () => null)).toEqual({
      file: "explorer.exe",
      args: ["pond://library"],
    });
  });

  it("keeps the macOS and Linux launchers", () => {
    expect(pondLaunchCommand("darwin").file).toBe("open");
    expect(pondLaunchCommand("linux").file).toBe("gtk-launch");
  });
});
