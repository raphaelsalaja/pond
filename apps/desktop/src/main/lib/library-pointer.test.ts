import { describe, expect, it } from "vitest";
import { isPathInside } from "./library-pointer";

describe("isPathInside", () => {
  it("recognizes Windows children without confusing sibling prefixes", () => {
    const root = "C:\\Users\\A Person\\AppData\\Roaming\\Pond";
    expect(isPathInside(root, `${root}\\libraries\\Mine.pond`, "win32")).toBe(
      true,
    );
    expect(
      isPathInside(
        root,
        "C:\\Users\\A Person\\AppData\\Roaming\\Pond Library",
        "win32",
      ),
    ).toBe(false);
  });

  it("retains POSIX containment behavior", () => {
    expect(
      isPathInside(
        "/Users/person/Library/Application Support/Pond",
        "/Users/person/Library/Application Support/Pond/libraries/Mine.pond",
        "darwin",
      ),
    ).toBe(true);
  });
});
