import type { Platform } from "./platform";

/** Keep in sync with apps/desktop and apps/extension package versions on each release. */
export const POND_VERSION = "2.0.0";

/** The tap lives in this repository's `Casks/` folder, so it needs the explicit URL. */
export const HOMEBREW_COMMAND = [
  "brew tap raphaelsalaja/pond https://github.com/raphaelsalaja/pond",
  "brew install --cask raphaelsalaja/pond/pond",
].join("\n");

export const REQUIREMENTS = {
  mac: "macOS 13 or later, Apple Silicon or Intel",
  windows: "64-bit Windows 10 or 11",
} as const;

const RELEASES_BASE =
  "https://github.com/raphaelsalaja/pond/releases/latest/download";

export function dmgUrl(arch: "arm64" | "x64"): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-${arch}.dmg`;
}

export function windowsInstallerUrl(): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-x64.exe`;
}

/** Hardcoded because importing `CHROME_WEB_STORE_ID` from `@pond/schema/native` would pull zod into this client bundle. */
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/ghigndnldiagchoaifgndleogpkendbc";
export const FIREFOX_ADDONS_URL =
  "https://addons.mozilla.org/firefox/addon/desktop%40pond.so/";

interface Download {
  label: string;
  href: string;
}

/** The download offered first, matched to the visitor's system. */
export function primaryDownload(platform: Platform): Download {
  return platform === "windows"
    ? { label: "Download for Windows", href: windowsInstallerUrl() }
    : { label: "Download for Mac", href: dmgUrl("arm64") };
}
