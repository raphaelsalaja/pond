import { statSync } from "node:fs";

/**
 * Finder metadata and AppleDouble files macOS writes beside library files.
 * @remarks copyFile rewrites AppleDouble sidecars on exFAT, so their bytes change during a copy.
 */
export function isLibrarySidecar(name: string): boolean {
  return name === ".DS_Store" || name.startsWith("._");
}

export function isSaveFolderName(name: string): boolean {
  return name.endsWith(".info") && !isLibrarySidecar(name);
}

export function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
