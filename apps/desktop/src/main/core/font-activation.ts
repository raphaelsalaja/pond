import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { OkResult } from "@shared/query-contracts-shared";
import type Database from "better-sqlite3";
import { readBundleJson, writeBundleJson } from "../lib/library-config";
import { saveDir } from "../paths";

const execFileAsync = promisify(execFile);

const WINDOWS_FONTS_KEY =
  "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";

type FontPlatformDeps = {
  platform?: NodeJS.Platform;
  /** Runs reg.exe; injected so tests never touch the real registry. */
  runRegistry?: (args: string[]) => Promise<void>;
};

/** An absolute path keeps a planted reg.exe earlier on PATH from running. */
function regExecutable(): string {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
}

async function runRegistry(args: string[]): Promise<void> {
  await execFileAsync(regExecutable(), args, {
    windowsHide: true,
    timeout: 10_000,
  });
}

/** Windows lists per-user fonts by registry value; the name only has to be unique. */
function windowsFontValueName(installedPath: string): string {
  const extension = extname(installedPath);
  const kind = extension.toLowerCase() === ".otf" ? "OpenType" : "TrueType";
  return `Pond ${basename(installedPath, extension)} (${kind})`;
}

export async function activateFont(
  input: {
    sourcePath: string;
    saveId: string;
    fontsDir: string;
  } & FontPlatformDeps,
): Promise<OkResult<{ path: string; requiresSignIn?: boolean }>> {
  const { platform = process.platform, runRegistry: reg = runRegistry } = input;
  // Per-user Windows fonts are only enumerated from the Fonts root.
  const pondDir =
    platform === "win32" ? input.fontsDir : join(input.fontsDir, "Pond");
  const extension = extname(input.sourcePath) || ".ttf";
  const dest = join(pondDir, `${input.saveId}${extension}`);
  try {
    await mkdir(pondDir, { recursive: true });
    await copyFile(input.sourcePath, dest);
    if (platform === "win32") {
      try {
        await reg([
          "add",
          WINDOWS_FONTS_KEY,
          "/v",
          windowsFontValueName(dest),
          "/t",
          "REG_SZ",
          "/d",
          dest,
          "/f",
        ]);
      } catch (error) {
        await rm(dest, { force: true });
        throw error;
      }
    }
    // Windows loads per-user fonts at sign-in, so other apps see the font after that.
    return platform === "win32"
      ? { ok: true, path: dest, requiresSignIn: true }
      : { ok: true, path: dest };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "activate_failed",
    };
  }
}

export async function deactivateFont(
  input: {
    installedPath: string;
    fontsDir: string;
  } & FontPlatformDeps,
): Promise<OkResult> {
  const { platform = process.platform, runRegistry: reg = runRegistry } = input;
  // Windows paths are case-insensitive.
  const normalize = (path: string) =>
    platform === "win32" ? path.toLowerCase() : path;
  const target = resolve(input.installedPath);
  if (platform === "win32") {
    if (normalize(dirname(target)) !== normalize(resolve(input.fontsDir)))
      return { ok: false, error: "outside_pond_fonts" };
  } else {
    const pondDir = resolve(join(input.fontsDir, "Pond"));
    if (target === pondDir || !target.startsWith(`${pondDir}${sep}`))
      return { ok: false, error: "outside_pond_fonts" };
  }
  try {
    // Remove the file first: if an app holds it, the registration stays intact.
    await rm(target, { force: true });
    if (platform === "win32") {
      // A missing value only means the font was never registered.
      await reg([
        "delete",
        WINDOWS_FONTS_KEY,
        "/v",
        windowsFontValueName(target),
        "/f",
      ]).catch(() => {});
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "deactivate_failed",
    };
  }
}

export function pondFontsDir(
  home: string,
  platform = process.platform,
  localAppData = process.env.LOCALAPPDATA,
): string {
  if (platform === "darwin") return join(home, "Library", "Fonts");
  if (platform === "win32")
    return join(
      localAppData || join(home, "AppData", "Local"),
      "Microsoft",
      "Windows",
      "Fonts",
    );
  return join(home, ".local", "share", "fonts");
}

function sidecarPath(id: string): string {
  return join(saveDir(id), "font-activation.json");
}

export function readFontActivation(id: string): string | null {
  return readBundleJson<{ path: string }>(sidecarPath(id))?.data.path ?? null;
}

export function writeFontActivation(id: string, path: string): void {
  writeBundleJson(sidecarPath(id), { path });
}

export function clearFontActivation(id: string): void {
  if (existsSync(sidecarPath(id))) rmSync(sidecarPath(id), { force: true });
}

export function backfillFontActivationIndex(
  db: Database.Database,
  activationFor: (id: string) => string | null = readFontActivation,
): number {
  const rows = db
    .prepare<[], { id: string }>(
      "SELECT id FROM saves WHERE media_type = 'font' AND COALESCE(font_activated, 0) = 0",
    )
    .all();
  const update = db.prepare("UPDATE saves SET font_activated = 1 WHERE id = ?");
  let updated = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (!activationFor(row.id)) continue;
      updated += update.run(row.id).changes;
    }
  })();
  return updated;
}
