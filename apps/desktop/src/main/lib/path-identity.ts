import { posix, win32 } from "node:path";

type Flavor = typeof posix;

function flavor(platform: NodeJS.Platform): Flavor {
  return platform === "win32" ? win32 : posix;
}

/**
 * Directory-aware containment: true when `target` is a descendant of `root`
 * (or `root` itself when `includeSame`). Compares path segments, so sibling
 * prefixes such as `Pond` and `Pond Library` never match. Case-insensitive on
 * win32 only, because that is how `path.win32.relative` compares.
 */
export function isPathInside(
  root: string,
  target: string,
  options: { platform?: NodeJS.Platform; includeSame?: boolean } = {},
): boolean {
  const path = flavor(options.platform ?? process.platform);
  const child = path.relative(root, target);
  if (child === "") return options.includeSame ?? false;
  return (
    child !== ".." &&
    !child.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(child)
  );
}

/** Resolves a library path and drops trailing separators (drive and filesystem roots stay). */
export function normalizeLibraryPath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return path === "" ? "" : flavor(platform).resolve(path);
}

/** Path identity for comparisons only; never store the result, case is kept for display. */
export function isSamePath(
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (a === "" || b === "") return a === b;
  const path = flavor(platform);
  return platform === "win32"
    ? path.relative(a, b) === ""
    : path.resolve(a) === path.resolve(b);
}
