import { win32 } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPathInside,
  isSamePath,
  normalizeLibraryPath,
} from "./path-identity";

const win = { platform: "win32" } as const;
const mac = { platform: "darwin" } as const;

describe("isPathInside", () => {
  const root = "C:\\Users\\A\\Pond.pond\\items";

  it("accepts descendants and rejects sibling prefixes on win32", () => {
    expect(isPathInside(root, `${root}\\abc\\a.png`, win)).toBe(true);
    expect(isPathInside(root, `${root}-old\\abc\\a.png`, win)).toBe(false);
    expect(isPathInside(root, "C:\\Users\\A\\Pond.pond\\items2", win)).toBe(
      false,
    );
  });

  it("ignores case and trailing separators on win32", () => {
    expect(isPathInside(root.toLowerCase(), `${root}\\X.png`, win)).toBe(true);
    expect(isPathInside(`${root}\\`, `${root}\\X.png`, win)).toBe(true);
  });

  it("rejects traversal, other drives and foreign roots", () => {
    expect(isPathInside(root, `${root}\\..\\..\\secret`, win)).toBe(false);
    expect(isPathInside(root, "D:\\items\\a.png", win)).toBe(false);
    expect(isPathInside(root, "\\\\server\\share\\a.png", win)).toBe(false);
  });

  it("accepts names that merely start with two dots", () => {
    expect(isPathInside(root, `${root}\\..foo\\a.png`, win)).toBe(true);
  });

  it("treats the root itself as outside unless asked", () => {
    expect(isPathInside(root, root, win)).toBe(false);
    expect(
      isPathInside(root, root.toUpperCase(), { ...win, includeSame: true }),
    ).toBe(true);
  });

  it("stays case-sensitive on POSIX", () => {
    expect(isPathInside("/lib/items", "/lib/items/a.png", mac)).toBe(true);
    expect(isPathInside("/lib/items", "/lib/items-old/a.png", mac)).toBe(false);
    expect(isPathInside("/lib/items", "/lib/Items/a.png", mac)).toBe(false);
    expect(isPathInside("/lib/items", "/lib/items/../x", mac)).toBe(false);
  });
});

describe("normalizeLibraryPath", () => {
  it("drops trailing separators of either kind on win32", () => {
    expect(normalizeLibraryPath("C:\\Libs\\A.pond\\", "win32")).toBe(
      "C:\\Libs\\A.pond",
    );
    expect(normalizeLibraryPath("C:/Libs/A.pond//", "win32")).toBe(
      "C:\\Libs\\A.pond",
    );
  });

  it("keeps drive and filesystem roots", () => {
    expect(normalizeLibraryPath("C:\\", "win32")).toBe("C:\\");
    expect(normalizeLibraryPath("/", "darwin")).toBe("/");
  });

  it("does not turn a POSIX backslash into a separator", () => {
    expect(normalizeLibraryPath("/Libs/A\\", "darwin")).toBe("/Libs/A\\");
  });

  it("keeps the stored casing", () => {
    expect(normalizeLibraryPath("C:\\Libs\\MiXed.pond\\", "win32")).toBe(
      "C:\\Libs\\MiXed.pond",
    );
  });
});

describe("isSamePath", () => {
  it("matches trailing separators and case on win32", () => {
    expect(isSamePath("C:\\Libs\\A.pond\\", "c:\\libs\\a.POND", "win32")).toBe(
      true,
    );
    expect(isSamePath("C:/Libs/A.pond", "C:\\Libs\\A.pond", "win32")).toBe(
      true,
    );
    expect(isSamePath("C:\\Libs\\A.pond", "C:\\Libs\\B.pond", "win32")).toBe(
      false,
    );
  });

  it("is case-sensitive on POSIX and tolerates trailing slashes", () => {
    expect(isSamePath("/Libs/A.pond/", "/Libs/A.pond", "darwin")).toBe(true);
    expect(isSamePath("/Libs/A.pond", "/libs/a.pond", "darwin")).toBe(false);
  });

  it("does not equate an empty path with a real one", () => {
    expect(isSamePath("", "C:\\", "win32")).toBe(false);
    expect(isSamePath("", "", "win32")).toBe(true);
  });
});

describe("pond:// style targets", () => {
  const savesDir = "C:\\Lib.pond\\items";
  const containedUrlPath = (pathname: string) => {
    const file = decodeURIComponent(pathname.replace(/^\//, ""));
    return isPathInside(
      savesDir,
      win32.resolve(win32.join(savesDir, "abc", file)),
      win,
    );
  };

  it("serves files inside the saves directory", () => {
    expect(containedUrlPath("/photo.png")).toBe(true);
  });

  it.each([
    "/..%2F..%2Fitems-old%2Fx%2Fsecret.png",
    "/..%5C..%5Citems-old%5Cx%5Csecret.png",
    "/..%2F..%2F..%2Fmetadata.json",
    "/..%5C..%5C..%5Cmetadata.json",
  ])("rejects encoded traversal %s", (pathname) => {
    expect(containedUrlPath(pathname)).toBe(false);
  });
});
