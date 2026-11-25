import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import { DEFAULT_LIBRARY_NAME } from "../../shared/constants";
import { libraryFilename } from "../../shared/file-format";
import { readOrCreateLibraryId } from "../lib/library-id";
import { checkPointerSafety, readLibraryPointer } from "../lib/library-pointer";
import { normalizeLibraryPath } from "../lib/path-identity";
import { invalidatePaths, resolvePaths } from "../paths";
import { commitLibraryPointer } from "./recent-libraries";

export type CreatePondResult =
  | { ok: true; path: string }
  | {
      ok: false;
      reason:
        | "no_path"
        | "inside_user_data"
        | "not_writable"
        | "not_a_directory"
        | "unknown_error";
    };

export function createPondBundle(
  parentDir: string,
  name: string = DEFAULT_LIBRARY_NAME,
): CreatePondResult {
  const trimmedParent = parentDir.trim();
  if (!trimmedParent) return { ok: false, reason: "no_path" };

  const safeName = name.trim() || DEFAULT_LIBRARY_NAME;
  /** Windows rejects `:`, device names and trailing dots in a folder name; the library keeps its display name. */
  const folderName =
    process.platform === "win32"
      ? libraryFilename(safeName, DEFAULT_LIBRARY_NAME)
      : safeName;
  const bundlePath = ensurePondSuffix(join(trimmedParent, folderName));
  const safety = checkPointerSafety(bundlePath);
  if (!safety.ok) {
    return { ok: false, reason: safety.reason ?? "unknown_error" };
  }

  mkdirSync(join(bundlePath, "items"), { recursive: true });
  mkdirSync(join(bundlePath, "trash"), { recursive: true });
  readOrCreateLibraryId(bundlePath, safeName);

  commitLibraryPointer(bundlePath);
  invalidatePaths();
  resolvePaths(bundlePath);

  log.info("[pond library-ops] created new pond at", bundlePath);
  return { ok: true, path: bundlePath };
}

export function ensureDefaultLibrary(): void {
  if (readLibraryPointer()) return;

  const parentDir = join(app.getPath("home"), "Pond");
  const defaultRoot = join(parentDir, `${DEFAULT_LIBRARY_NAME}.pond`);

  if (existsSync(defaultRoot)) {
    commitLibraryPointer(defaultRoot);
    invalidatePaths();
    resolvePaths(defaultRoot);
    log.info("[pond library-ops] adopted existing default pond", defaultRoot);
    return;
  }

  const result = createPondBundle(parentDir, DEFAULT_LIBRARY_NAME);
  if (!result.ok) {
    log.error(
      "[pond library-ops] failed to create default pond",
      result.reason,
    );
  }
}

function ensurePondSuffix(path: string): string {
  const trimmed = normalizeLibraryPath(path);
  return trimmed.endsWith(".pond") ? trimmed : `${trimmed}.pond`;
}
