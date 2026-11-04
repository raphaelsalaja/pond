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

  it("keeps the macOS launcher", () => {
    expect(pondLaunchCommand("darwin").file).toBe("open");
  });

  it("launches the fixed deb executable on Linux", () => {
    expect(
      pondLaunchCommand(
        "linux",
        {},
        () => null,
        (path) => path === "/opt/Pond/pond",
      ),
    ).toEqual({ file: "/opt/Pond/pond", args: [] });
  });

  it("opens the pond:// handler when no deb is installed", () => {
    expect(
      pondLaunchCommand(
        "linux",
        {},
        () => null,
        () => false,
      ),
    ).toEqual({ file: "xdg-open", args: ["pond://library"] });
  });
});
