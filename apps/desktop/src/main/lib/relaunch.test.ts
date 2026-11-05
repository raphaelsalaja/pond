import { describe, expect, it } from "vitest";
import { appRelaunchOptions } from "./relaunch";

describe("appRelaunchOptions", () => {
  it("relaunches Linux AppImages from the stable AppImage path", () => {
    expect(
      appRelaunchOptions("linux", "/home/user/Pond.AppImage", [
        "/tmp/.mount-Pond/pond",
        "--hidden",
      ]),
    ).toEqual({
      execPath: "/home/user/Pond.AppImage",
      args: ["--hidden"],
    });
  });

  it("uses Electron's default executable outside Linux AppImages", () => {
    expect(
      appRelaunchOptions("linux", undefined, ["/usr/bin/pond"]),
    ).toBeUndefined();
    expect(
      appRelaunchOptions("darwin", "/Applications/Pond.app", [
        "/Applications/Pond.app/Contents/MacOS/Pond",
      ]),
    ).toBeUndefined();
  });
});
