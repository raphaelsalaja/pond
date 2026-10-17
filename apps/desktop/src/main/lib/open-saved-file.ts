import { extname } from "node:path";

/**
 * Files Windows runs, rather than displays, when opened with the shell. Saved
 * originals carry no Mark-of-the-Web, so SmartScreen would not prompt.
 */
const WINDOWS_LAUNCHABLE_EXTENSIONS = new Set([
  ".exe",
  ".com",
  ".scr",
  ".pif",
  ".msi",
  ".msp",
  ".bat",
  ".cmd",
  ".ps1",
  ".psm1",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".wsf",
  ".wsh",
  ".hta",
  ".lnk",
  ".url",
  ".reg",
  ".cpl",
  ".msc",
  ".jar",
  ".application",
  ".appref-ms",
  ".gadget",
  ".inf",
  ".scf",
]);

export const LAUNCHABLE_FILE_MESSAGE =
  "Windows could run this file, so Pond shows it in File Explorer instead of opening it.";

interface OpenPathShell {
  openPath: (path: string) => Promise<string>;
  showItemInFolder: (path: string) => void;
}

function isWindowsLaunchable(path: string): boolean {
  /** Windows ignores trailing dots and spaces, so `payload.exe.` is still an executable. */
  const name = path.replace(/[. ]+$/, "");
  return WINDOWS_LAUNCHABLE_EXTENSIONS.has(extname(name).toLowerCase());
}

/** Opens a saved original; returns the shell's error text, or "" on success. */
export async function openSavedFile(
  path: string,
  shell: OpenPathShell,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  if (platform === "win32" && isWindowsLaunchable(path)) {
    shell.showItemInFolder(path);
    return LAUNCHABLE_FILE_MESSAGE;
  }
  return shell.openPath(path);
}
