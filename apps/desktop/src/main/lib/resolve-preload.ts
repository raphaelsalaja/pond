import { existsSync } from "node:fs";
import { basename, join } from "node:path";

function mainOutDir(): string {
  return basename(__dirname) === "chunks" ? join(__dirname, "..") : __dirname;
}

/**
 * electron-vite emits preload to `out/preload/` while main code may run from
 * `out/main/` or `out/main/chunks/`; pick the path that exists.
 */
export function resolvePreload(
  name:
    | "index.cjs"
    | "combine-images.cjs"
    | "file-ring.cjs"
    | "preview.cjs"
    | "settings.cjs"
    | "scrape.cjs",
): string {
  const path = join(mainOutDir(), "../preload", name);
  if (!existsSync(path)) {
    const fallback = join(__dirname, "../preload", name);
    return existsSync(fallback) ? fallback : path;
  }
  return path;
}

export function resolveMainOut(...parts: string[]): string {
  return join(mainOutDir(), ...parts);
}
