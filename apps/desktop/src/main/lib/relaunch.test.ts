import { describe, expect, it } from "vitest";
import { appRelaunchOptions, RELAUNCH_ARG } from "./relaunch";

describe("appRelaunchOptions", () => {
  it("relaunches Linux AppImages from the stable AppImage path", () => {
    expect(
      appRelaunchOptions("linux", "/home/user/Pond.AppImage", [
        "/tmp/.mount-Pond/pond",
        "--hidden",
      ]),
    ).toEqual({
      execPath: "/home/user/Pond.AppImage",
      args: ["--hidden", RELAUNCH_ARG],
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

  it("does not duplicate the relaunch marker", () => {
    expect(
      appRelaunchOptions("linux", "/home/user/Pond.AppImage", [
        "/tmp/.mount-Pond/pond",
        RELAUNCH_ARG,
      ]),
    ).toEqual({
      execPath: "/home/user/Pond.AppImage",
      args: [RELAUNCH_ARG],
    });
  });
});
