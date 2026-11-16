// Reads the macOS icon style (Default, Dark, Clear, Tinted) through the pond-icon-style helper.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { app, systemPreferences } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import type { AppIconStyle } from "../../shared/app-icons";

const HELPER = "pond-icon-style";
/** Icon styles arrived in macOS 26. */
const MIN_MACOS_MAJOR = 26;

const helperLineSchema = z.object({ theme: z.string(), interface: z.string() });

/**
 * The Default style leaves `AppleIconAppearanceTheme` unset. Dark writes
 * `RegularDark`, Clear and Tinted write `Clear…` and `Tinted…`, and an
 * `…Automatic` style follows the system light or dark appearance.
 */
export function classifyIconStyle(input: {
  theme: string;
  interface: string;
}): AppIconStyle {
  if (input.theme.startsWith("Clear") || input.theme.startsWith("Tinted"))
    return "monochrome";
  if (input.theme.endsWith("Dark")) return "dark";
  if (input.theme.endsWith("Automatic") && input.interface === "Dark")
    return "dark";
  return "light";
}

export function parseIconStyleLine(line: string): AppIconStyle | null {
  try {
    return classifyIconStyle(helperLineSchema.parse(JSON.parse(line)));
  } catch {
    return null;
  }
}

export function supportsIconStyles(
  platform: NodeJS.Platform,
  systemVersion: string,
): boolean {
  return (
    platform === "darwin" &&
    Number.parseInt(systemVersion, 10) >= MIN_MACOS_MAJOR
  );
}

/** The running macOS major version, or null on other platforms. */
export function macosMajor(
  platform: NodeJS.Platform,
  systemVersion: string,
): number | null {
  if (platform !== "darwin") return null;
  const major = Number.parseInt(systemVersion, 10);
  return Number.isNaN(major) ? null : major;
}

/** Reads the current icon style once, for showing previews that match it. */
export function readIconStyle(): AppIconStyle | null {
  if (!supportsIconStyles(process.platform, process.getSystemVersion()))
    return null;
  return classifyIconStyle({
    theme: systemPreferences.getUserDefault(
      "AppleIconAppearanceTheme",
      "string",
    ),
    interface: systemPreferences.getUserDefault(
      "AppleInterfaceStyle",
      "string",
    ),
  });
}

function helperPath(): string | null {
  if (
    !app.isPackaged ||
    !supportsIconStyles(process.platform, process.getSystemVersion())
  )
    return null;
  const path = join(process.resourcesPath, "bin", HELPER);
  return existsSync(path) ? path : null;
}

export interface IconStyleWatch {
  stop(): void;
}

/** Calls `onStyle` with the current icon style and after each change, or returns null where styles are unavailable. */
export function watchIconStyle(
  onStyle: (style: AppIconStyle) => void,
): IconStyleWatch | null {
  const path = helperPath();
  if (!path) return null;
  const child = spawn(path, [], { stdio: ["pipe", "pipe", "ignore"] });
  child.on("error", (err) => log.warn("[pond] icon style helper failed", err));
  if (child.stdout) {
    createInterface({ input: child.stdout }).on("line", (line) => {
      const style = parseIconStyleLine(line);
      if (style) onStyle(style);
    });
  }
  return {
    stop() {
      child.stdin?.end();
    },
  };
}
