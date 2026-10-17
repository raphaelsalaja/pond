import { describe, expect, it } from "vitest";
import { executableFromCommand, findPondExecutable } from "./windows-install";

const registered = '"D:\\Apps\\Pond\\Pond.exe" "%1"';

describe("executableFromCommand", () => {
  it("reads quoted and unquoted handler commands", () => {
    expect(executableFromCommand(registered)).toBe("D:\\Apps\\Pond\\Pond.exe");
    expect(executableFromCommand("C:\\Pond\\Pond.exe %1")).toBe(
      "C:\\Pond\\Pond.exe",
    );
    expect(executableFromCommand("")).toBeNull();
  });
});

describe("findPondExecutable", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" };

  it("prefers the registered handler, so a non-default install directory works", () => {
    expect(
      findPondExecutable(
        env,
        () => registered,
        (path) => path === "D:\\Apps\\Pond\\Pond.exe",
      ),
    ).toBe("D:\\Apps\\Pond\\Pond.exe");
  });

  it("falls back to the default per-user directory", () => {
    const found = findPondExecutable(
      env,
      () => null,
      () => true,
    );
    expect(found).toMatch(/Programs[\\/]Pond[\\/]Pond\.exe$/);
  });

  it("ignores a stale registration and a missing default install", () => {
    expect(
      findPondExecutable(
        env,
        () => registered,
        () => false,
      ),
    ).toBeNull();
    expect(
      findPondExecutable(
        {},
        () => null,
        () => true,
      ),
    ).toBeNull();
  });
});
