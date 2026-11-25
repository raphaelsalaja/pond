import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  appBundlePath,
  clearBundleFlag,
  hasCustomBundleIcon,
  setBundleIcon,
  withoutBundleFlag,
} from "./bundle-icon";

const roots: Array<string> = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fakeBundle(): string {
  const root = mkdtempSync(join(tmpdir(), "pond-bundle-icon-"));
  roots.push(root);
  const bundle = join(root, "Pond.app");
  mkdirSync(join(bundle, "Contents", "MacOS"), { recursive: true });
  return bundle;
}

const ICON = join(
  __dirname,
  "../../../../../packages/icons/brand/tints/strawberry/default.png",
);

describe("appBundlePath", () => {
  it("finds the app bundle from a packaged macOS executable", () => {
    expect(
      appBundlePath({
        platform: "darwin",
        packaged: true,
        exePath: "/Applications/Pond.app/Contents/MacOS/Pond",
      }),
    ).toBe("/Applications/Pond.app");
  });

  it("leaves development and other platforms alone", () => {
    const exePath = "/repo/node_modules/electron/dist/Electron";
    expect(
      appBundlePath({ platform: "darwin", packaged: false, exePath }),
    ).toBeNull();
    expect(
      appBundlePath({ platform: "win32", packaged: true, exePath }),
    ).toBeNull();
  });
});

function finderInfo(flags: number): Buffer {
  const info = Buffer.alloc(32);
  info.writeUInt16BE(flags, 8);
  return info;
}

describe("withoutBundleFlag", () => {
  it("clears the bundle flag and keeps the custom icon flag", () => {
    expect(withoutBundleFlag(finderInfo(0x24_00))).toEqual(finderInfo(0x04_00));
  });

  it("leaves Finder info without the bundle flag alone", () => {
    expect(withoutBundleFlag(finderInfo(0x04_00))).toBeNull();
    expect(withoutBundleFlag(Buffer.alloc(4))).toBeNull();
  });
});

function flagsOf(folder: string): string {
  return execFileSync("/usr/bin/xattr", ["-px", "com.apple.FinderInfo", folder])
    .toString()
    .replaceAll(/\s/g, "")
    .slice(16, 20);
}

describe.skipIf(process.platform !== "darwin")("clearBundleFlag", () => {
  let clearedFlags = "";

  beforeAll(async () => {
    const folder = fakeBundle();
    execFileSync("/usr/bin/xattr", [
      "-wx",
      "com.apple.FinderInfo",
      finderInfo(0x24_00).toString("hex"),
      folder,
    ]);
    await clearBundleFlag(folder);
    clearedFlags = flagsOf(folder);
  });

  it("turns a folder synced as a package back into a folder", () => {
    expect(clearedFlags).toBe("0400");
  });

  it("does nothing to a folder without Finder info", async () => {
    await expect(clearBundleFlag(fakeBundle())).resolves.toBeUndefined();
  });
});

/** Each osascript run may take the full 8s exec timeout under load, so each hook makes one. */
describe.skipIf(process.platform !== "darwin")("setBundleIcon", () => {
  let bundle = "";
  let customAfterSet = false;
  let customAfterReset = true;

  beforeAll(async () => {
    bundle = fakeBundle();
    await setBundleIcon(bundle, ICON);
    customAfterSet = hasCustomBundleIcon(bundle);
  });

  beforeAll(async () => {
    await setBundleIcon(bundle, null);
    customAfterReset = hasCustomBundleIcon(bundle);
  });

  it("keeps the chosen icon on the bundle until it is reset", () => {
    expect(customAfterSet).toBe(true);
    expect(customAfterReset).toBe(false);
  });

  it("does nothing when resetting a bundle that has no custom icon", async () => {
    const empty = fakeBundle();

    await setBundleIcon(empty, null);
    expect(hasCustomBundleIcon(empty)).toBe(false);
  });
});
