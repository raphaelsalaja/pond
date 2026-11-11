import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CUSTOM_ICON_FILE = "Icon\r";

export interface BundleHost {
  platform: NodeJS.Platform;
  packaged: boolean;
  exePath: string;
}

export function appBundlePath(host: BundleHost): string | null {
  if (host.platform !== "darwin" || !host.packaged) return null;
  return posix.resolve(host.exePath, "../../..");
}

export function hasCustomBundleIcon(bundle: string): boolean {
  return existsSync(join(bundle, CUSTOM_ICON_FILE));
}

const FINDER_INFO = "com.apple.FinderInfo";
const FINDER_FLAGS_OFFSET = 8;
const HAS_BUNDLE = 0x2000;

export function withoutBundleFlag(finderInfo: Buffer): Buffer | null {
  if (finderInfo.length < FINDER_FLAGS_OFFSET + 2) return null;
  const flags = finderInfo.readUInt16BE(FINDER_FLAGS_OFFSET);
  if ((flags & HAS_BUNDLE) === 0) return null;
  const cleared = Buffer.from(finderInfo);
  cleared.writeUInt16BE(flags & ~HAS_BUNDLE, FINDER_FLAGS_OFFSET);
  return cleared;
}

/** Finder shows any folder with the bundle flag as a package; iCloud Drive sets it on folders it synced as packages. */
export async function clearBundleFlag(folder: string): Promise<void> {
  const read = await execFileAsync("/usr/bin/xattr", [
    "-px",
    FINDER_INFO,
    folder,
  ]).catch(() => null);
  if (read == null) return;
  const cleared = withoutBundleFlag(
    Buffer.from(read.stdout.replace(/\s/g, ""), "hex"),
  );
  if (cleared == null) return;
  await execFileAsync("/usr/bin/xattr", [
    "-wx",
    FINDER_INFO,
    cleared.toString("hex"),
    folder,
  ]);
}

export async function setBundleIcon(
  bundle: string,
  imagePath: string | null,
): Promise<void> {
  if (imagePath == null && !hasCustomBundleIcon(bundle)) return;
  const image =
    imagePath == null
      ? "undefined"
      : `$.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(imagePath)})`;
  const script = `ObjC.import("AppKit");
const workspace = $.NSWorkspace.sharedWorkspace;
const bundle = ${JSON.stringify(bundle)};
if (!workspace.setIconForFileOptions(${image}, bundle, 0)) throw new Error("setIcon failed");
workspace.noteFileSystemChanged(bundle);`;
  await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", script],
    {
      timeout: 8000,
    },
  );
}
